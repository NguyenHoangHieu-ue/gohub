import { supabaseAdmin } from "@/lib/supabase"

// Trí nhớ dài hạn của trợ lý (bảng assistant_memory, migration v63). Riêng từng username, chỉ server đọc/ghi.
// Nạp vào system prompt Gấu Pro MỖI lượt (nhỏ, có trần) để trợ lý luôn biết bối cảnh người dùng — không phải
// creator_kb (kiến thức nghiệp vụ dùng chung mọi role).
export const MEMORY_KINDS = ["profile", "preference", "project", "person", "decision", "other"] as const
export type MemoryKind = typeof MEMORY_KINDS[number]

const MAX_INJECT_CHARS = 4000
const MAX_CONTENT = 500
const KIND_LABEL: Record<MemoryKind, string> = {
  profile: "Hồ sơ", preference: "Sở thích/cách làm việc", project: "Dự án/việc đang theo",
  person: "Người liên quan", decision: "Quyết định đã chốt", other: "Khác",
}

const missingTable = (msg?: string) => !!msg && /assistant_memory/.test(msg) && /(does not exist|schema cache|Could not find)/i.test(msg)
const MIGRATION_HINT = "Chưa có bảng assistant_memory — Hiếu cần chạy migration web/db/migrations/v63_assistant_memory.sql trên Supabase rồi Reload schema."

interface Row { id: number; kind: MemoryKind; content: string; pinned: boolean; updated_at: string }

// Khối nạp vào system prompt. "" khi chưa có trí nhớ / chưa chạy migration (không làm hỏng chat).
export async function buildMemoryBlock(username: string): Promise<string> {
  if (!username) return ""
  const { data, error } = await supabaseAdmin.from("assistant_memory")
    .select("id,kind,content,pinned,updated_at")
    .eq("username", username).eq("archived", false)
    .order("pinned", { ascending: false }).order("updated_at", { ascending: false })
    .limit(200)
  if (error) { if (!missingTable(error.message)) console.error("[assistant-memory]", error.message); return "" }

  const rows = (data ?? []) as Row[]
  const lines: string[] = []
  let used = 0, dropped = 0
  for (const r of rows) {
    const line = `- [#${r.id}${r.pinned ? " 📌" : ""}] (${KIND_LABEL[r.kind] ?? r.kind}) ${r.content}`
    if (used + line.length > MAX_INJECT_CHARS) { dropped++; continue }
    lines.push(line); used += line.length + 1
  }
  const header = `\n\n━━━ TRÍ NHỚ DÀI HẠN VỀ NGƯỜI DÙNG (tool assistantMemory) ━━━
Dùng các điều dưới đây làm bối cảnh (không đọc lại nguyên văn trừ khi được hỏi). Khi người dùng nói điều ĐÁNG NHỚ LÂU
DÀI — hồ sơ/vai trò, sở thích cách làm việc, dự án đang theo, người liên quan (ai là ai, phụ trách gì), quyết định đã
chốt — thì gọi assistantMemory action=save (1 ý/lần, ngắn gọn, kèm mốc thời gian nếu có). Điều đã nhớ thay đổi →
action=update với id. Sai/lỗi thời → action=forget. KHÔNG lưu: số liệu tra lại được từ DB, chuyện chỉ dùng trong lượt
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
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (content) patch.content = content
      if (args.kind) patch.kind = kind
      if (typeof args.pinned === "boolean") patch.pinned = args.pinned
      const { data, error } = await table().update(patch).eq("id", args.id).eq("username", username).select("id")
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
      let q = table().select("id,kind,content,pinned,source,updated_at")
        .eq("username", username).eq("archived", false)
        .order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(300)
      if (args.kind) q = q.eq("kind", kind)
      if (args.query) q = q.ilike("content", `%${args.query.replace(/[%_]/g, "")}%`)
      const { data, error } = await q
      return error ? fail(error.message) : { result: { count: data?.length ?? 0, memories: data ?? [] } }
    }
    default:
      return { error: "action phải là save | update | forget | list." }
  }
}
