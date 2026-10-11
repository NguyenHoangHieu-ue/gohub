import { supabaseAdmin } from "@/lib/supabase"

// U5 (plan be-gau-upgrade.md, 2026-10-08) đã khoá Gấu Pro chỉ còn Creator; 2026-10-11 Hiếu thu hồi quyền tất cả (gp_allowed_users = [])
// và mở lại cơ chế cấp quyền: chỉ người được Hiếu cấp từng người ở Creator Settings (gp_allowed_users) mới vào được Gấu Pro.
// Đặt true để khoá lại mọi người trừ Creator (danh sách khi đó chỉ để hiện màn hình "đã chuyển sang Bé Gấu").
export const GP_CREATOR_ONLY = false

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
