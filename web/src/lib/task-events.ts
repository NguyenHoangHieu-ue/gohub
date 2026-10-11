// Đọc sự kiện chat `app_usage_events` của 1 khoảng ngày THEO TRANG — Supabase trả tối đa 1.000 dòng/lần,
// đọc 1 lần thì quý > 1.000 câu bị đếm thiếu. Dùng chung cho thẻ KPI "Tasks via Bé Gấu", danh sách hội thoại
// được tính và Insights để cả 3 cùng 1 tập dòng.
import { supabaseAdmin } from "@/lib/supabase"

export const MIN_TASK_RESPONSE_LEN = 15

const PAGE = 1000

export type Row = Record<string, any>

export async function loadChatEvents(
  select: string,
  start: string,
  end: string,
  opts: { onlyDbTool?: boolean; ascending?: boolean } = {},
): Promise<{ rows: Row[]; error?: string }> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabaseAdmin
      .from("app_usage_events")
      .select(select)
      .eq("event_type", "chat")
      .not("ai_response", "is", null)
      .gte("created_at", `${start}T00:00:00.000Z`)
      .lte("created_at", `${end}T23:59:59.999Z`)
    if (opts.onlyDbTool) q = q.eq("used_db_tool", true)
    const { data, error } = await q
      .order("created_at", { ascending: opts.ascending ?? false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) return { rows, error: error.message }
    const batch = (data ?? []) as unknown as Row[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return { rows }
}

export type TaskSource = "web" | "lark" | "job" | "live"

// Nguồn của 1 task: chạy nền / trực tiếp phân biệt bằng agent_id (không cần cột mới); còn lại theo user_email `lark:`.
// Gấu Pro (cũ) gộp vào "web" cùng Bé Gấu.
export function taskSource(r: Row): TaskSource {
  if (r.agent_id === "be-gau-job") return "job"
  if (r.agent_id === "be-gau-live") return "live"
  return ((r.user_email as string) ?? "").startsWith("lark:") ? "lark" : "web"
}

export function isCountedTask(r: Row): boolean {
  return !!r.used_db_tool && ((r.ai_response as string) ?? "").trim().length >= MIN_TASK_RESPONSE_LEN
}
