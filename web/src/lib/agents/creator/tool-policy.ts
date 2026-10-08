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

const READ_ACTIONS = new Set(["search", "read", "list", "list_tabs", "read_tab"])

// Tool đưa nội dung KHÔNG tin cậy vào ngữ cảnh model.
function isTaintSource(name: string, args: any): boolean {
  switch (name) {
    case "webSearch": case "browseWeb": case "browsePortal": case "queryLarkBase": case "getTrendSnapshots":
      return true
    case "readMyBrowser":
      return args?.action === "read_tab"
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

function ruleFor(name: string, args: any): Rule {
  const action = String(args?.action ?? "")
  switch (name) {
    case "sendLarkMessage":
      return args?.chat_id === "me" ? "when_tainted" : "always"
    case "createLarkTask": case "updateLarkTask":
    case "writeKnowledgeBase": case "approveLearning": case "rejectLearning":
    case "generateImage": case "generateVideo":
      return "when_tainted"
    case "assistantMemory": case "managePortalCredentials": case "scheduleTask":
      return action === "list" ? "never" : "when_tainted"
    case "controlMyBrowser":
      return action === "scroll" ? "never" : "when_tainted"
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
export function approvalReason(call: { name: string; args: any }, state: TurnSafety): string | null {
  // browseWeb vừa đọc vừa có thể làm kênh rò (nhét dữ liệu vào URL). Sau khi nhiễm, chỉ mở URL đã xuất hiện nguyên văn.
  if (call.name === "browseWeb") {
    if (!state.tainted) return null
    const unknown = browseUrls(call.args).filter(u => !state.knownText.includes(u))
    return unknown.length
      ? `Mở URL chưa từng xuất hiện trong hội thoại sau khi đã đọc nội dung bên ngoài (${state.taintSources.join(", ")}).`
      : null
  }
  const rule = ruleFor(call.name, call.args)
  if (rule === "always") return "Gửi tin nhắn Lark tới người/nhóm khác luôn cần duyệt."
  if (rule === "when_tainted" && state.tainted)
    return `Lượt này đã đọc nội dung bên ngoài (${state.taintSources.join(", ")}) — hành động ghi/gửi cần duyệt để chống bị điều khiển ngầm.`
  return null
}

/** Mô tả ngắn hành động cho thẻ duyệt — đủ để người dùng biết sẽ xảy ra gì. */
export function describeAction(call: { name: string; args: any }): string {
  const a = call.args ?? {}
  const cut = (s: unknown, n = 160) => String(s ?? "").replace(/\s+/g, " ").slice(0, n)
  switch (call.name) {
    case "sendLarkMessage": return `Gửi Lark tới ${a.chat_id === "me" ? "chính bạn" : a.chat_id}: "${cut(a.title ? `${a.title} — ${a.content}` : a.content)}"`
    case "createLarkTask": return `Tạo task Lark: "${cut(a.summary)}"${a.due ? ` (hạn ${a.due})` : ""}`
    case "updateLarkTask": return `Sửa task Lark ${cut(a.task_guid, 40)}${a.complete ? " → hoàn thành" : ""}${a.due ? ` (hạn ${a.due})` : ""}`
    case "managePortalCredentials": return `Portal: ${a.action} "${cut(a.name, 60)}"${a.url ? ` ${cut(a.url, 80)}` : ""}`
    case "controlMyBrowser": return `Trình duyệt: ${a.action} ${cut(a.selector ?? a.url ?? "", 80)}${a.value ? ` = "${cut(a.value, 60)}"` : ""}`
    case "localFiles": return `File máy: ${a.action} ${cut(a.path, 120)}`
    case "browseWeb": return `Mở trang: ${browseUrls(a).map(u => cut(u, 120)).join(", ")}`
    case "writeKnowledgeBase": return `Ghi KB: ${cut(a.title ?? a.key ?? a.content)}`
    case "assistantMemory": return `Trí nhớ: ${a.action} ${cut(a.content ?? a.id ?? "")}`
    default: return `${call.name}${a.action ? ` (${a.action})` : ""}: ${cut(JSON.stringify(a), 160)}`
  }
}
