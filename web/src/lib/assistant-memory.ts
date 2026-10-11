import { supabaseAdmin } from "@/lib/supabase"

// Trí nhớ dài hạn của trợ lý (bảng assistant_memory, migration v63). Riêng từng username, chỉ server đọc/ghi.
// Nạp vào system prompt Gấu Pro MỖI lượt (nhỏ, có trần) để trợ lý luôn biết bối cảnh người dùng — không phải
// creator_kb (kiến thức nghiệp vụ dùng chung mọi role).
export const MEMORY_KINDS = ["profile", "preference", "project", "person", "decision", "other"] as const
export type MemoryKind = typeof MEMORY_KINDS[number]

const MAX_INJECT_CHARS = 8000   // s223: 4.000 sắp đầy (13 mục ~3.400) → mục cũ bị bỏ không báo; nâng gấp đôi
const MAX_CONTENT = 500
const KIND_LABEL: Record<MemoryKind, string> = {
  profile: "Hồ sơ", preference: "Sở thích/cách làm việc", project: "Dự án/việc đang theo",
  person: "Người liên quan", decision: "Quyết định đã chốt", other: "Khác",
}

const missingTable = (msg?: string) => !!msg && /assistant_memory/.test(msg) && /(does not exist|schema cache|Could not find)/i.test(msg)
const MIGRATION_HINT = "Chưa có bảng assistant_memory — Hiếu cần chạy migration web/db/migrations/v63_assistant_memory.sql trên Supabase rồi Reload schema."

// v72: giá trị cũ bị thay được giữ lại (tối đa MAX_HISTORY bản gần nhất) để trả lời "trước đây/ban đầu là gì".
const MAX_HISTORY = 5
interface HistoryEntry { c: string; at: string }
interface Row { id: number; kind: MemoryKind; content: string; pinned: boolean; updated_at: string; history?: HistoryEntry[] | null }

const missingHistoryCol = (msg?: string) => !!msg && /history/.test(msg) && /(does not exist|schema cache|Could not find)/i.test(msg)
type QueryResult = { data: any; error: { message: string } | null }

/** Đọc kèm cột history; chưa chạy v72 thì đọc lại không có cột đó (không làm hỏng chat). */
async function selectCompat(build: (cols: string) => PromiseLike<QueryResult>, cols: string): Promise<QueryResult> {
  const r = await build(`${cols},history`)
  return r.error && missingHistoryCol(r.error.message) ? build(cols) : r
}

const histNote = (h?: HistoryEntry[] | null) => {
  const last = (h ?? []).slice(-2).reverse()
  return last.length ? ` ⟲ trước đây: ${last.map(e => `"${e.c.slice(0, 120)}" (đến ${String(e.at).slice(0, 10)})`).join("; ")}` : ""
}

// Khối nạp vào system prompt. "" khi chưa có trí nhớ / chưa chạy migration (không làm hỏng chat).
export async function buildMemoryBlock(username: string): Promise<string> {
  if (!username) return ""
  const { data, error } = await selectCompat(cols => supabaseAdmin.from("assistant_memory")
    .select(cols)
    .eq("username", username).eq("archived", false)
    .order("pinned", { ascending: false }).order("updated_at", { ascending: false })
    .limit(200), "id,kind,content,pinned,updated_at")
  if (error) { if (!missingTable(error.message)) console.error("[assistant-memory]", error.message); return "" }

  const rows = (data ?? []) as Row[]
  const lines: string[] = []
  let used = 0, dropped = 0
  for (const r of rows) {
    const line = `- [#${r.id}${r.pinned ? " 📌" : ""}] (${KIND_LABEL[r.kind] ?? r.kind}) ${r.content}${histNote(r.history)}`
    if (used + line.length > MAX_INJECT_CHARS) { dropped++; continue }
    lines.push(line); used += line.length + 1
  }
  const header = `\n\n━━━ TRÍ NHỚ DÀI HẠN VỀ NGƯỜI DÙNG (tool assistantMemory) ━━━
Dùng các điều dưới đây làm bối cảnh (không đọc lại nguyên văn trừ khi được hỏi). Khi người dùng nói điều ĐÁNG NHỚ LÂU
DÀI — hồ sơ/vai trò, sở thích cách làm việc, dự án đang theo, người liên quan (ai là ai, phụ trách gì), quyết định đã
chốt — thì gọi assistantMemory action=save (1 ý/lần, ngắn gọn, kèm mốc thời gian nếu có). Điều đã nhớ thay đổi →
action=update với id, content chỉ ghi trạng thái HIỆN TẠI (giá trị cũ hệ thống tự giữ, hiện ở "⟲ trước đây"; hỏi về quá khứ thì
dựa vào đó hoặc action=list). Sai/lỗi thời → action=forget. KHÔNG lưu: số liệu tra lại được từ DB, chuyện chỉ dùng trong lượt
này, mật khẩu/token/thông tin nhạy cảm. Lưu xong nói ngắn "đã nhớ".`
  if (!lines.length) return `${header}\n(Chưa có gì.)`
  return `${header}\n${lines.join("\n")}${dropped ? `\n(…còn ${dropped} mục cũ hơn không nạp — gọi action=list để xem)` : ""}`
}

export async function runAssistantMemory(
  args: { action: string; id?: number; kind?: string; content?: string; pinned?: boolean; query?: string },
  username: string,
  source: string,
): Promise<{ result?: any; error?: string }> {
  if (!username) return { error: "Thiếu username." }
  const kind = MEMORY_KINDS.includes(args.kind as MemoryKind) ? args.kind as MemoryKind : "other"
  const content = args.content?.trim().slice(0, MAX_CONTENT)
  const table = () => supabaseAdmin.from("assistant_memory")
  const fail = (msg: string) => ({ error: missingTable(msg) ? MIGRATION_HINT : msg })

  switch (args.action) {
    case "save": {
      if (!content) return { error: "save cần content." }
      const { data, error } = await table()
        .insert({ username, kind, content, source, pinned: !!args.pinned })
        .select("id").single()
      return error ? fail(error.message) : { result: { saved: data.id, kind, content } }
    }
    case "update": {
      if (!args.id) return { error: "update cần id (số trong [#id] ở khối trí nhớ)." }
      const now = new Date().toISOString()
      const patch: Record<string, unknown> = { updated_at: now }
      if (content) patch.content = content
      if (args.kind) patch.kind = kind
      if (typeof args.pinned === "boolean") patch.pinned = args.pinned
      let withHistory = false
      if (content) {
        const cur = await selectCompat(cols => table().select(cols).eq("id", args.id).eq("username", username).limit(1), "content")
        const old = (cur.data?.[0] ?? null) as { content: string; history?: HistoryEntry[] | null } | null
        if (old && old.content.trim() !== content) {
          patch.history = [...(old.history ?? []), { c: old.content.slice(0, 300), at: now }].slice(-MAX_HISTORY)
          withHistory = true
        }
      }
      let { data, error } = await table().update(patch).eq("id", args.id).eq("username", username).select("id")
      if (error && withHistory && missingHistoryCol(error.message)) {
        delete patch.history
        ;({ data, error } = await table().update(patch).eq("id", args.id).eq("username", username).select("id"))
      }
      if (error) return fail(error.message)
      return data?.length ? { result: { updated: args.id } } : { error: `Không thấy trí nhớ #${args.id}.` }
    }
    case "forget": {
      if (!args.id) return { error: "forget cần id." }
      const { data, error } = await table().update({ archived: true, updated_at: new Date().toISOString() })
        .eq("id", args.id).eq("username", username).select("id")
      if (error) return fail(error.message)
      return data?.length ? { result: { forgotten: args.id } } : { error: `Không thấy trí nhớ #${args.id}.` }
    }
    case "list": {
      const { data, error } = await selectCompat(cols => {
        let q = table().select(cols)
          .eq("username", username).eq("archived", false)
          .order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(300)
        if (args.kind) q = q.eq("kind", kind)
        if (args.query) q = q.ilike("content", `%${args.query.replace(/[%_]/g, "")}%`)
        return q
      }, "id,kind,content,pinned,source,updated_at")
      return error ? fail(error.message) : { result: { count: data?.length ?? 0, memories: data ?? [] } }
    }
    default:
      return { error: "action phải là save | update | forget | list." }
  }
}

// ── Chọn mục liên quan (plan personal-agent.md P1b) ──────────────────────────────────────────────────────────────
// Bộ rút trí nhớ trước đây chỉ nhìn 120 mục đầu → vượt 120 thì không thấy mục cũ để update/khử trùng (eval stress 150: 629 mục cho 150 khách).
// Xếp hạng theo từ khoá hiếm (IDF) giữa tin nhắn và nội dung từng mục — không gọi thêm model, 1 truy vấn/lượt.
const foldVi = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()
const tokensOf = (t: string) => new Set(foldVi(t).split(/[^a-z0-9]+/).filter(w => w.length >= 2))

export interface MemoryRow { id: number; kind: string; content: string }

/** Top `limit` mục có từ khoá chung với `message` (điểm = Σ idf), kèm `recent` mục mới nhất làm ngữ cảnh nền. rows nên xếp mới → cũ. */
export function rankMemories(message: string, rows: MemoryRow[], limit = 40, recent = 10): MemoryRow[] {
  if (!rows.length) return []
  const q = tokensOf(message)
  const rowTokens = rows.map(r => tokensOf(r.content))
  const df = new Map<string, number>()
  for (const ts of rowTokens) for (const t of ts) if (q.has(t)) df.set(t, (df.get(t) ?? 0) + 1)
  const scored = rows.map((r, i) => {
    let score = 0
    for (const t of rowTokens[i]) if (q.has(t)) score += Math.log(1 + rows.length / (df.get(t) ?? 1))
    return { r, score }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.r)
  const seen = new Set(scored.map(r => r.id))
  return [...scored, ...rows.slice(0, recent).filter(r => !seen.has(r.id))]
}

/** Các mục còn hiệu lực của user liên quan tới tin nhắn (cho bộ rút trí nhớ). Lỗi/chưa có bảng → []. */
export async function findRelevantMemories(username: string, message: string, limit = 40): Promise<MemoryRow[]> {
  if (!username) return []
  const { data, error } = await supabaseAdmin.from("assistant_memory").select("id,kind,content")
    .eq("username", username).eq("archived", false).order("updated_at", { ascending: false }).limit(3000)
  if (error) return []
  return rankMemories(message, (data ?? []) as MemoryRow[], limit)
}
