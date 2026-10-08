import { supabaseAdmin } from "@/lib/supabase"

// U5 (plan be-gau-upgrade.md, 2026-10-08): Gấu Pro chỉ còn Creator — mọi tính năng đã chuyển sang Bé Gấu.
// Danh sách gp_allowed_users giữ lại để biết ai từng dùng (hiện màn hình "đã chuyển sang Bé Gấu"), không còn cấp quyền.
export const GP_CREATOR_ONLY = true

export async function loadGpListed(): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "gp_allowed_users").maybeSingle()
    return data?.value ? JSON.parse(data.value) : []
  } catch { return [] }
}

export async function loadGpAllowed(): Promise<string[]> {
  return GP_CREATOR_ONLY ? [] : loadGpListed()
}

export async function hasGpAccess(role: string | undefined, username: string | undefined): Promise<boolean> {
  if (role === "creator") return true
  if (!username) return false
  const allowed = await loadGpAllowed()
  return allowed.includes(username)
}
