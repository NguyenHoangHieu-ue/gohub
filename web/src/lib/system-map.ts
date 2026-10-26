import type { AgentEvent, AgentId } from "./agent-events"

// "Bản đồ vận hành": sơ đồ Bé Gấu · Gấu Pro · Phòng Argon (kiểu LangGraph). Phần THUẦN (không I/O): nhóm công cụ, dựng đồ thị từ danh sách công cụ THẬT của từng trợ lý
// (nên không lệch khi code đổi), và tính nút/cạnh nào đang "sáng" từ luồng sự kiện chạy. Giao diện React Flow ở trang /analytics/creator/argon/ban-do.
export const AGENTS: { id: AgentId; label: string; sub: string; color: string }[] = [
  { id: "be-gau", label: "Bé Gấu", sub: "Trợ lý cho nhân viên (mọi vai trò)", color: "#0ea5e9" },
  { id: "gau-pro", label: "Gấu Pro", sub: "Trợ lý agent của Creator", color: "#f59e0b" },
  { id: "argon", label: "Argon", sub: "Tham mưu, Kho, sứ mệnh (Creator)", color: "#7c3aed" },
]

export interface ToolGroup { id: string; label: string; stores: string[]; tools: string[] }
export const TOOL_GROUPS: ToolGroup[] = [
  { id: "data", label: "Số liệu và SQL", stores: ["s-dw"], tools: ["executeSQL", "sql", "layDuLieuHeThong", "queryProduct", "buildReport", "b2bCustomerCm1", "trackSKUWinRate", "verifyReportNumbers"] },
  { id: "supabase", label: "Cơ sở dữ liệu và tri thức", stores: ["s-supabase"], tools: ["querySupabase", "listSupabaseTables", "searchKnowledgeBase", "readKnowledgeBase", "writeKnowledgeBase", "reviewPendingLearning", "approveLearning", "rejectLearning", "compareVendorQuotes"] },
  { id: "lark", label: "Lark (việc, tài liệu, tin nhắn)", stores: ["s-lark"], tools: ["listLarkTasks", "listLarkTasklists", "getLarkTask", "createLarkTask", "updateLarkTask", "queryLarkBase", "larkDocs", "larkWorkspace", "sendLarkMessage"] },
  { id: "browser", label: "Trình duyệt và portal", stores: ["s-browser"], tools: ["browseWeb", "readMyBrowser", "controlMyBrowser", "browsePortal", "managePortalCredentials"] },
  { id: "web", label: "Web, GA4, xu hướng", stores: ["s-web"], tools: ["webSearch", "deepResearch", "queryGA4", "queryGSC", "getTrendSnapshots"] },
  { id: "code", label: "Chạy code (Sandbox)", stores: ["s-sandbox"], tools: ["run_code"] },
  { id: "sources", label: "Kho và workspace", stores: ["s-supabase", "s-turso"], tools: ["lietKeNguon", "timTrongNguon", "docNguon", "docFile", "ghiFile", "lietKeFile", "taoThuMuc", "chuyenNguon", "capNhatNguon", "luuGhiChu"] },
  { id: "facts", label: "Sổ sự việc có hạn", stores: ["s-supabase"], tools: ["traSuViec", "ghiSuViec", "capNhatSuViec", "traMail"] },
  { id: "memory", label: "Trí nhớ, kỹ năng, kế hoạch", stores: ["s-supabase"], tools: ["assistantMemory", "searchPastConversations", "learnSkill", "loadSkill", "updatePlan"] },
  { id: "media", label: "Ảnh và video", stores: ["s-gemini"], tools: ["generateImage", "generateVideo", "checkVideoStatus"] },
  { id: "files", label: "File và Google", stores: ["s-lark"], tools: ["localFiles", "googleWorkspace"] },
  { id: "ops", label: "Việc, hỏi, đề xuất sửa", stores: ["s-github"], tools: ["devTicket", "deXuatSuaCode", "scheduleTask", "hoiHieu", "ghiDuDoan", "chamDuDoan"] },
  { id: "other", label: "Khác", stores: [], tools: [] },
]

export const STORES: { id: string; label: string; sub: string }[] = [
  { id: "s-gemini", label: "Gemini", sub: "Mô hình ngôn ngữ" },
  { id: "s-dw", label: "gohub_dw", sub: "Postgres, chỉ đọc" },
  { id: "s-supabase", label: "Supabase", sub: "DB + file" },
  { id: "s-turso", label: "Turso", sub: "Chỉ mục + sự kiện" },
  { id: "s-lark", label: "Lark", sub: "Tin nhắn, việc, tài liệu" },
  { id: "s-web", label: "Web / GA4", sub: "Tìm kiếm, phân tích" },
  { id: "s-browser", label: "Trình duyệt của anh", sub: "Bridge" },
  { id: "s-sandbox", label: "Vercel Sandbox", sub: "Python cô lập" },
  { id: "s-github", label: "GitHub Actions", sub: "Phiếu sửa code" },
]

const byTool = new Map(TOOL_GROUPS.flatMap(g => g.tools.map(t => [t, g.id] as const)))
export const groupOfTool = (name: string) => byTool.get(name) ?? "other"

// ── Đồ thị ────────────────────────────────────────────────────────────────────
export type NodeKind = "entry" | "agent" | "core" | "group" | "store"
export interface MapNode { id: string; kind: NodeKind; label: string; sub?: string; color?: string; count?: number; tools?: string[]; x: number; y: number }
export interface MapEdge { id: string; source: string; target: string; color: string; dashed?: boolean }

const COL = { entry: 0, agent: 250, core: 520, group: 800, store: 1110 }
const ROW = 62

/** Dựng đồ thị từ danh sách công cụ của từng trợ lý. Nhóm công cụ không có agent nào dùng thì ẩn. */
export function buildGraph(agentTools: Partial<Record<AgentId, string[]>>): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes: MapNode[] = [], edges: MapEdge[] = []
  const color = (a: AgentId) => AGENTS.find(x => x.id === a)!.color
  const used = new Map<string, Map<AgentId, string[]>>()   // group → agent → tools
  for (const a of AGENTS) for (const t of agentTools[a.id] ?? []) {
    const g = groupOfTool(t)
    const m = used.get(g) ?? used.set(g, new Map()).get(g)!
    m.set(a.id, [...(m.get(a.id) ?? []), t])
  }
  const groups = TOOL_GROUPS.filter(g => used.has(g.id))

  // Hàng vào / trợ lý / lõi (3 làn)
  const lanes: Record<AgentId, number> = { "be-gau": 60, "gau-pro": 300, argon: 540 }
  nodes.push(
    { id: "e-web", kind: "entry", label: "Chat web", x: COL.entry, y: 20 },
    { id: "e-lark", kind: "entry", label: "Lark DM / nhóm", x: COL.entry, y: 110 },
    { id: "e-cron", kind: "entry", label: "Cron, lịch, việc nền", x: COL.entry, y: 330 },
    { id: "e-argon", kind: "entry", label: "Trang Argon / Kho", x: COL.entry, y: 560 },
  )
  for (const a of AGENTS) nodes.push({ id: `a-${a.id}`, kind: "agent", label: a.label, sub: a.sub, color: a.color, x: COL.agent, y: lanes[a.id] })
  nodes.push(
    { id: "c-gate", kind: "core", label: "Quyền và cổng duyệt", sub: "Guardian, tool-policy", x: COL.core, y: 20 },
    { id: "c-loop", kind: "core", label: "Vòng lặp agent chung", sub: "model ↔ công cụ song song", x: COL.core, y: 180 },
    { id: "c-argon", kind: "core", label: "Vòng chạy Argon", sub: "sứ mệnh, đoạn, việc nền", x: COL.core, y: 540 },
  )
  const entryEdge = (s: string, t: string, a: AgentId) => edges.push({ id: `${s}>${t}`, source: s, target: t, color: color(a) })
  entryEdge("e-web", "a-be-gau", "be-gau"); entryEdge("e-lark", "a-be-gau", "be-gau")
  entryEdge("e-web", "a-gau-pro", "gau-pro"); entryEdge("e-lark", "a-gau-pro", "gau-pro"); entryEdge("e-cron", "a-gau-pro", "gau-pro")
  entryEdge("e-argon", "a-argon", "argon"); entryEdge("e-cron", "a-argon", "argon")
  entryEdge("a-be-gau", "c-gate", "be-gau"); entryEdge("a-gau-pro", "c-gate", "gau-pro")
  entryEdge("a-be-gau", "c-loop", "be-gau"); entryEdge("a-gau-pro", "c-loop", "gau-pro")
  entryEdge("a-argon", "c-argon", "argon")
  entryEdge("c-loop", "s-gemini", "gau-pro"); entryEdge("c-argon", "s-gemini", "argon")

  groups.forEach((g, i) => {
    const m = used.get(g.id)!
    nodes.push({ id: `g-${g.id}`, kind: "group", label: g.label, count: new Set([...m.values()].flat()).size, tools: [...new Set([...m.values()].flat())].sort(), x: COL.group, y: i * ROW })
    for (const [agent, tools] of m) {
      void tools
      edges.push({ id: `${agent === "argon" ? "c-argon" : "c-loop"}>g-${g.id}:${agent}`, source: agent === "argon" ? "c-argon" : "c-loop", target: `g-${g.id}`, color: color(agent) })
    }
    for (const s of g.stores) if (!edges.some(e => e.id === `g-${g.id}>${s}`)) edges.push({ id: `g-${g.id}>${s}`, source: `g-${g.id}`, target: s, color: "#94a3b8", dashed: true })
  })
  const usedStores = new Set(edges.map(e => e.target).filter(t => t.startsWith("s-")))
  STORES.filter(s => usedStores.has(s.id)).forEach((s, i) => nodes.push({ id: s.id, kind: "store", label: s.label, sub: s.sub, x: COL.store, y: i * 78 }))
  return { nodes, edges }
}

// ── Hoạt động (sáng) ─────────────────────────────────────────────────────────
export const PULSE_MS = 2500
const coreOf = (a: AgentId) => (a === "argon" ? "c-argon" : "c-loop")

/** Nút/cạnh cần sáng cho 1 sự kiện. Thuần. */
export function idsForEvent(e: Pick<AgentEvent, "agent" | "kind" | "name">): string[] {
  const a = `a-${e.agent}`, core = coreOf(e.agent)
  if (e.kind === "start") return [a, core, ...(e.agent === "argon" ? ["e-argon"] : ["e-web"]), `${a}>${core}`]
  if (e.kind === "model") return [core, "s-gemini", `${core}>s-gemini`, a]
  if (e.kind === "end") return [a, core]
  const g = groupOfTool(e.name ?? "")
  const grp = TOOL_GROUPS.find(x => x.id === g)
  return [a, core, `g-${g}`, `${core}>g-${g}:${e.agent}`, ...(grp?.stores ?? []).flatMap(s => [s, `g-${g}>${s}`])]
}

export interface ActivityState { until: Record<string, number>; errorUntil: Record<string, number> }
export const emptyActivity = (): ActivityState => ({ until: {}, errorUntil: {} })

/** Cộng một lô sự kiện vào trạng thái sáng: mỗi id sáng PULSE_MS kể từ `now`; tool lỗi thì nút nhóm đỏ. Trả trạng thái mới (không sửa trạng thái cũ). */
export function applyEvents(prev: ActivityState, events: AgentEvent[], now: number): ActivityState {
  const until = { ...prev.until }, errorUntil = { ...prev.errorUntil }
  for (const e of events) {
    for (const id of idsForEvent(e)) until[id] = now + PULSE_MS
    if (e.kind === "tool" && e.ok === false) errorUntil[`g-${groupOfTool(e.name ?? "")}`] = now + PULSE_MS * 2
  }
  return { until, errorUntil }
}
export const isActive = (s: ActivityState, id: string, now: number) => (s.until[id] ?? 0) > now
export const isErrored = (s: ActivityState, id: string, now: number) => (s.errorUntil[id] ?? 0) > now
