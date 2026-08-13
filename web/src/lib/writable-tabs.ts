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
