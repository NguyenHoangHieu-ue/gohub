import { supabaseAdmin } from "./supabase"

export type NotifType = "sync" | "kb_doc" | "wiki" | "price_change" | "error" | "success"
export type Visibility = "all" | "admin_manager"

export async function createNotification(
  type: NotifType,
  title: string,
  body: string | null,
  data: Record<string, any> = {},
  visibility: Visibility = "all",
) {
  // Builder của supabase-js chỉ có .then (không có .catch) → gọi .catch làm TypeError sau khi việc chính đã xong (vd upload bảng giá BC lưu được nhưng trả 500).
  try { await supabaseAdmin.from("notifications").insert({ type, title, body, data, visibility }) } catch { /* thông báo là phụ, không làm hỏng việc chính */ }
}
