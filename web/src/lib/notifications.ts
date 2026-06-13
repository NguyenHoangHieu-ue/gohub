import { supabaseAdmin } from "./supabase"

export type NotifType = "sync" | "kb_doc" | "wiki" | "price_change"
export type Visibility = "all" | "admin_manager"

export async function createNotification(
  type: NotifType,
  title: string,
  body: string | null,
  data: Record<string, any> = {},
  visibility: Visibility = "all",
) {
  await (supabaseAdmin
    .from("notifications")
    .insert({ type, title, body, data, visibility }) as any)
    .catch(() => {})
}
