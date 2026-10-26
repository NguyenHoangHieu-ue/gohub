// Danh sách loại trùng với MEMORY_KINDS ở assistant-memory.ts (không import để phần thuần test được không cần env Supabase).
const MEMORY_KINDS = ["profile", "preference", "project", "person", "decision", "other"] as const
type MemoryKind = typeof MEMORY_KINDS[number]

// MỘT TRÍ NHỚ (ARGON-X P1): Argon đọc mail/thread của người ngoài nên KHÔNG được ghi thẳng vào trí nhớ dài hạn (assistant_memory, dùng chung với Gấu Pro/Bé Gấu).
// Argon chỉ ĐỀ XUẤT; đề xuất nằm ở hàng đợi này và hiện trong "Việc cần duyệt"; anh bấm Duyệt thì mới được lưu thành trí nhớ (nguồn "argon-proposal").
// Lưu ở app_settings (không cần migration), khoá memory_proposals:<username>. Phần THUẦN ở đầu file (test được không cần env); phần I/O nạp Supabase muộn.
export interface MemProposal { id: string; kind: MemoryKind; content: string; reason: string; at: string }
export const MAX_PROPOSALS = 30
export const MIN_CONTENT = 8
export const MAX_CONTENT = 500

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim()

// Đề xuất sinh từ nội dung ngoài có thể là chỉ dẫn giả (tiêm lệnh). Trí nhớ là SỰ THẬT về người dùng/công việc, không phải mệnh lệnh cho trợ lý → từ chối các mẫu "ra lệnh".
const INJECTION = [
  /bo qua (chi dan|quy tac|cac quy tac|huong dan)/, /khong (can|can phai) (hoi|duyet|xac nhan)/, /tu (duyet|dong duyet|dong gui)/, /(luon|hay) (gui|chuyen|forward|chia se).{0,40}(mat khau|token|khoa|bang gia|du lieu|khach)/,
  /ignore (all|previous|prior|the above)/, /system prompt/, /\b(password|mat khau|api[ _-]?key|secret|token)\b.{0,30}[:=]/, /https?:\/\/\S+.{0,40}(gui|send|upload|post)/,
]
export function suspicious(content: string): string | null {
  const f = fold(content)
  for (const re of INJECTION) if (re.test(f)) return "nội dung giống chỉ dẫn/bí mật, trí nhớ chỉ lưu sự thật về anh và công việc"
  return null
}

export type CleanResult = { ok: true; p: Omit<MemProposal, "id" | "at"> } | { ok: false; error: string }
export function cleanProposal(a: { kind?: unknown; content?: unknown; reason?: unknown }): CleanResult {
  const content = String(a.content ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT)
  if (content.length < MIN_CONTENT) return { ok: false, error: `noiDung quá ngắn (tối thiểu ${MIN_CONTENT} ký tự)` }
  const bad = suspicious(content)
  if (bad) return { ok: false, error: `Từ chối đề xuất: ${bad}` }
  const kind = (MEMORY_KINDS as readonly string[]).includes(String(a.kind)) ? (a.kind as MemoryKind) : "other"
  return { ok: true, p: { kind, content, reason: String(a.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200) } }
}

/** Thêm vào danh sách: bỏ trùng nội dung (không phân biệt hoa thường/dấu), giữ MAX_PROPOSALS mục mới nhất. Thuần. */
export function addTo(list: MemProposal[], p: Omit<MemProposal, "id" | "at">, now = new Date(), id = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`): { list: MemProposal[]; added: boolean } {
  if (list.some(x => fold(x.content) === fold(p.content))) return { list, added: false }
  return { list: [...list, { ...p, id, at: now.toISOString() }].slice(-MAX_PROPOSALS), added: true }
}

const key = (username: string) => `memory_proposals:${username}`
async function db() { return (await import("@/lib/supabase")).supabaseAdmin }

export async function listProposals(username: string): Promise<MemProposal[]> {
  const { data } = await (await db()).from("app_settings").select("value").eq("key", key(username)).maybeSingle()
  try { const v = typeof data?.value === "string" ? JSON.parse(data.value) : data?.value; return Array.isArray(v) ? (v as MemProposal[]) : [] } catch { return [] }
}
async function save(username: string, list: MemProposal[]) {
  await (await db()).from("app_settings").upsert({ key: key(username), value: JSON.stringify(list), category: "assistant", label: "Đề xuất ghi nhớ chờ duyệt", updated_at: new Date().toISOString() }, { onConflict: "key" })
}

export async function proposeMemory(username: string, a: { kind?: unknown; content?: unknown; reason?: unknown }): Promise<{ ok: boolean; message: string }> {
  const c = cleanProposal(a)
  if (!c.ok) return { ok: false, message: c.error }
  const { list, added } = addTo(await listProposals(username), c.p)
  if (!added) return { ok: true, message: "Đã có đề xuất giống hệt đang chờ anh duyệt; không thêm lần nữa." }
  await save(username, list)
  return { ok: true, message: `Đã gửi đề xuất ghi nhớ vào "Việc cần duyệt" (chờ anh duyệt mới được lưu): ${c.p.content}` }
}

/** Duyệt → lưu vào assistant_memory rồi bỏ khỏi hàng đợi; Từ chối → chỉ bỏ. Trả lỗi chữ nếu không thấy / lưu thất bại (đề xuất vẫn còn để thử lại). */
export async function resolveProposal(username: string, id: string, action: "approve" | "reject"): Promise<{ ok: boolean; message: string }> {
  const list = await listProposals(username)
  const p = list.find(x => x.id === id)
  if (!p) return { ok: false, message: "Không thấy đề xuất (có thể đã được xử lý)." }
  if (action === "approve") {
    const { runAssistantMemory } = await import("@/lib/assistant-memory")
    const r = await runAssistantMemory({ action: "save", kind: p.kind, content: p.content }, username, "argon-proposal")
    if (r.error) return { ok: false, message: r.error }
  }
  await save(username, list.filter(x => x.id !== id))
  return { ok: true, message: action === "approve" ? "Đã lưu vào trí nhớ." : "Đã bỏ đề xuất." }
}
