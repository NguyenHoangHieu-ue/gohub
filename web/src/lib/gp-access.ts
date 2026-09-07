import { supabaseAdmin } from "@/lib/supabase"

export async function loadGpAllowed(): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "gp_allowed_users").maybeSingle()
    return data?.value ? JSON.parse(data.value) : []
  } catch { return [] }
}

export async function hasGpAccess(role: string | undefined, username: string | undefined): Promise<boolean> {
  if (role === "creator") return true
  if (!username) return false
  const allowed = await loadGpAllowed()
  return allowed.includes(username)
}
