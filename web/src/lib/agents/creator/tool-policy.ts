// Cổng duyệt hành động Gấu Pro (G0 — docs/plans/gau-pro-assistant.md). Chạy TRONG CODE, không dựa lời dặn prompt.
// Mức đã chốt (Hiếu giao tự đề xuất, 2026-10-05):
//   - tool chỉ đọc → chạy luôn;
//   - gửi Lark vào group/người khác → LUÔN hỏi;
//   - mọi tool ghi/gửi ra ngoài khác → chạy luôn, NHƯNG phải hỏi khi lượt đã đọc nội dung không tin cậy ("nhiễm"):
//     web, browser, portal, file tải lên, tài liệu Lark/Google do người khác viết. Lý do: chống prompt injection
//     ("lethal trifecta" — dữ liệu riêng + nội dung ngoài + kênh gửi ra ngoài trong cùng 1 lượt).

export interface TurnSafety {
  tainted: boolean
  taintSources: string[]
  knownText: string          // văn bản người dùng + kết quả tool đã thấy — URL hợp lệ cho browseWeb phải xuất hiện ở đây
}

const KNOWN_TEXT_CAP = 200_000

export function newTurnSafety(userText: string, hasFiles: boolean): TurnSafety {
  return {
    tainted: hasFiles,
    taintSources: hasFiles ? ["file tải lên"] : [],
    knownText: userText.slice(0, KNOWN_TEXT_CAP),
  }
}

// P2: gắn theo CUỘC CHAT (`conv`, ghi ở bước cuối của trace gp_runs): bất kỳ lượt nào của cuộc chat đó từng nhiễm là đủ (không phụ thuộc lượt gần nhất,
// chat cuộc khác xen giữa không xoá được). Không có `conv` (kênh cũ) → chỉ xét lượt gần nhất (rows xếp mới → cũ).
export function taintFromRuns(rows: { steps: unknown }[], conv?: string): string[] | null {
  const lastStep = (r: { steps: unknown }) => (Array.isArray(r.steps) ? (r.steps as any[]).at(-1) : null)
  const pool = conv ? rows.filter(r => lastStep(r)?.conv === conv) : rows.slice(0, 1)
  const hit = pool.map(lastStep).find(s => s?.tainted)
  return hit ? (Array.isArray(hit.taintSources) ? hit.taintSources.map(String) : ["nội dung ngoài"]) : null
}

const READ_ACTIONS = new Set(["search", "read", "list", "list_tabs", "read_tab"])

// Tool đưa nội dung KHÔNG tin cậy vào ngữ cảnh model.
function isTaintSource(name: string, args: any): boolean {
  switch (name) {
    case "webSearch": case "browseWeb": case "browsePortal": case "queryLarkBase": case "getTrendSnapshots":
    case "traCuuKho":   // Kho chứa mail/thread/tài liệu do người ngoài viết → nội dung không tin cậy (chống prompt injection)
      return true
    case "readMyBrowser":
      return args?.action === "read_tab" || args?.action === "snapshot" || args?.action === "screenshot"
    case "larkDocs": case "googleWorkspace":
      return args?.action === "read"
    default:
      return false
  }
}

export function recordToolResult(state: TurnSafety, call: { name: string; args: any }, response: unknown): void {
  if (isTaintSource(call.name, call.args)) {
    state.tainted = true
    if (!state.taintSources.includes(call.name)) state.taintSources.push(call.name)
  }
  if (state.knownText.length < KNOWN_TEXT_CAP) {
    let s = ""
    try { s = typeof response === "string" ? response : JSON.stringify(response) } catch { /* bỏ qua */ }
    state.knownText += "\n" + s.slice(0, KNOWN_TEXT_CAP - state.knownText.length)
  }
}

type Rule = "always" | "when_tainted" | "never"

// Thao tác trên tab của người dùng không đổi dữ liệu / không đi đâu xa: luôn chạy luôn.
const BROWSER_FREE_ACTIONS = new Set(["scroll", "scroll_to", "hover", "wait_for", "activate_tab"])

function ruleFor(name: string, args: any): Rule {
  const action = String(args?.action ?? "")
  switch (name) {
    case "sendLarkMessage":
      return args?.chat_id === "me" && !args?.lark_id ? "when_tainted" : "always"
    case "devTicket":
      return action === "create" ? "always" : action === "answer" || action === "cancel" ? "when_tainted" : "never"
    case "learnSkill":
      return action === "list" ? "never" : "always"
    case "createLarkTask": case "updateLarkTask":
    case "writeKnowledgeBase": case "approveLearning": case "rejectLearning":
    case "generateImage": case "generateVideo":
      return "when_tainted"
    case "assistantMemory": case "managePortalCredentials": case "scheduleTask":
      return action === "list" ? "never" : "when_tainted"
    case "controlMyBrowser":
      return BROWSER_FREE_ACTIONS.has(action) ? "never" : "when_tainted"
    case "localFiles": case "googleWorkspace": case "larkDocs":
      return READ_ACTIONS.has(action) ? "never" : "when_tainted"
    default:
      return "never"
  }
}

function browseUrls(args: any): string[] {
  const list = Array.isArray(args?.urls) ? args.urls : []
  return [args?.url, ...list].filter((u): u is string => typeof u === "string" && u.length > 0)
}

/** Lý do cần duyệt (tiếng Việt, hiện cho người dùng) hoặc null nếu được chạy luôn. */
// opts.dailyAuto = Creator đã duyệt 1 lần hôm nay (auto-approve.ts): bỏ qua các hành động chỉ cần duyệt vì lượt "nhiễm" (when_tainted).
// VẪN hỏi: gửi Lark tới người/nhóm khác, tạo phiếu sửa code (rule "always") và mở URL chưa từng xuất hiện sau khi nhiễm (kênh rò dữ liệu).
export function approvalReason(call: { name: string; args: any }, state: TurnSafety, opts?: { dailyAuto?: boolean }): string | null {
  // browseWeb vừa đọc vừa có thể làm kênh rò (nhét dữ liệu vào URL). Sau khi nhiễm, chỉ mở URL đã xuất hiện nguyên văn.
  if (call.name === "browseWeb") {
    if (!state.tainted) return null
    const unknown = browseUrls(call.args).filter(u => !state.knownText.includes(u))
    return unknown.length
      ? `Mở URL chưa từng xuất hiện trong hội thoại sau khi đã đọc nội dung bên ngoài (${state.taintSources.join(", ")}).`
      : null
  }
  // Browser (Bridge 1.3.0): trước đây MỌI click/gõ sau khi đọc tab đều đòi duyệt → không dùng được. Nay: nếu nguồn "nhiễm" chỉ là chính
  // tab của người dùng (readMyBrowser) thì click/gõ/phím/chọn chạy luôn (trang nhạy cảm đã bị extension + server chặn cứng); còn nguồn ngoài
  // (web, tài liệu, file…) hoặc điều hướng/mở tab tới URL chưa từng thấy thì vẫn cần duyệt.
  if (call.name === "controlMyBrowser" && state.tainted && !BROWSER_FREE_ACTIONS.has(String(call.args?.action ?? ""))) {
    const act = String(call.args?.action ?? "")
    if ((act === "navigate" || act === "open_tab") && call.args?.url && !state.knownText.includes(String(call.args.url)))
      return `Mở URL chưa từng xuất hiện trong hội thoại sau khi đã đọc nội dung bên ngoài (${state.taintSources.join(", ")}).`
    if (state.taintSources.every(s => s.replace(/ \(lượt trước\)$/, "") === "readMyBrowser")) return null
  }
  const rule = ruleFor(call.name, call.args)
  if (rule === "always") return call.name === "devTicket"
    ? "Phiếu sửa code (Claude Code chạy trên GitHub, mở PR vào staging) luôn cần Hiếu duyệt."
    : call.name === "learnSkill"
      ? "Skill tự học sẽ được nạp vào prompt của Gấu Pro về sau — luôn cần Hiếu đọc và duyệt."
      : "Gửi tin nhắn Lark tới người/nhóm khác luôn cần duyệt."
  if (rule === "when_tainted" && state.tainted && !opts?.dailyAuto)
    return `Lượt này đã đọc nội dung bên ngoài (${state.taintSources.join(", ")}) — hành động ghi/gửi cần duyệt để chống bị điều khiển ngầm.`
  return null
}

/** Mô tả ngắn hành động cho thẻ duyệt — đủ để người dùng biết sẽ xảy ra gì. */
export function describeAction(call: { name: string; args: any }): string {
  const a = call.args ?? {}
  const cut = (s: unknown, n = 160) => String(s ?? "").replace(/\s+/g, " ").slice(0, n)
  switch (call.name) {
    case "sendLarkMessage": return `Gửi Lark tới ${a.lark_id ? `DM ${a.lark_id}` : a.chat_id === "me" ? "chính bạn" : a.chat_id}: "${cut(a.title ? `${a.title} — ${a.content}` : a.content)}"`
    case "createLarkTask": return `Tạo task Lark: "${cut(a.summary)}"${a.due ? ` (hạn ${a.due})` : ""}`
    case "updateLarkTask": return `Sửa task Lark ${cut(a.task_guid, 40)}${a.complete ? " → hoàn thành" : ""}${a.due ? ` (hạn ${a.due})` : ""}`
    case "managePortalCredentials": return `Portal: ${a.action} "${cut(a.name, 60)}"${a.url ? ` ${cut(a.url, 80)}` : ""}`
    case "controlMyBrowser": return `Trình duyệt: ${a.action} ${cut(a.ref ?? a.selector ?? a.url ?? a.keys ?? "", 80)}${a.value ? ` = "${cut(a.value, 60)}"` : ""}`
    case "localFiles": return `File máy: ${a.action} ${cut(a.path, 120)}`
    case "browseWeb": return `Mở trang: ${browseUrls(a).map(u => cut(u, 120)).join(", ")}`
    case "writeKnowledgeBase": return `Ghi KB: ${cut(a.title ?? a.key ?? a.content)}`
    case "devTicket": return a.action === "create"
      ? `Phiếu sửa code: "${cut(a.title, 120)}" — ${cut(a.plan, 600)}`
      : `Phiếu #${a.id}: ${a.action}${a.answer ? ` "${cut(a.answer)}"` : ""}`
    case "learnSkill": return a.action === "create"
      ? `Học skill mới "${cut(a.name, 40)}" — ${cut(a.description, 200)} | Nguồn: ${cut(a.source, 120) || "không ghi"} | Nội dung: ${cut(a.instructions, 1500)}`
      : `Skill tự học: ${a.action} "${cut(a.name, 40)}"`
    case "assistantMemory": return `Trí nhớ: ${a.action} ${cut(a.content ?? a.id ?? "")}`
    default: return `${call.name}${a.action ? ` (${a.action})` : ""}: ${cut(JSON.stringify(a), 160)}`
  }
}
