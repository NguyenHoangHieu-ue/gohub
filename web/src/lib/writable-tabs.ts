import { supabaseAdmin } from "@/lib/supabase"
import { getDbRole } from "@/lib/db-role"

const CONFIG_KEY = "permissions.writable_tabs"

// Trả về true nếu user có quyền ghi vào tab đó:
//  - role nằm trong baseRoles (cứng theo role)
//  - HOẶC creator đã grant writable_tabs[tabKey] per-user
export async function canWriteTab(
  username: string,
  tabKey: string,
  baseRoles: string[],
): Promise<boolean> {
  const dbRole = await getDbRole(username)
  if (baseRoles.includes(dbRole)) return true

  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle()

  if (!data?.value) return false
  try {
    const cfg = JSON.parse(data.value) as Record<string, string[]>
    return (cfg[username] ?? []).includes(tabKey)
  } catch {
    return false
  }
}

// Fast-path bằng role JWT (session) trước — tránh round-trip DB cho case thường. JWT có thể CŨ (user
// vừa được cấp quyền, chưa re-login trong JWT maxAge 1 ngày) → fallback canWriteTab (đọc role TƯƠI từ
// DB) khi fast-path fail, tránh 403 oan cho admin/creator hợp lệ. Dùng cho MỌI API ghi (POST/PATCH/
// DELETE) trong analytics — KHÔNG check `session.user.role` một mình, luôn qua hàm này.
export async function canWrite(
  session: { user: { username: string; role?: string | null } },
  tabKey: string,
  baseRoles: string[],
): Promise<boolean> {
  const sessionRole = session.user.role ?? ""
  if (baseRoles.includes(sessionRole)) return true
  return canWriteTab(session.user.username, tabKey, baseRoles)
}
