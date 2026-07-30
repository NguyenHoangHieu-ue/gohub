import { NextResponse }    from "next/server"
import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { supabaseAdmin }    from "@/lib/supabase"

const WRITABLE_TABS_KEY = "permissions.writable_tabs"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.username

  const [userRes, configRes, gpRes] = await Promise.all([
    supabaseAdmin.from("users").select("role, department, allowed_analytics, allowed_tabs").eq("username", username).single(),
    supabaseAdmin.from("app_settings").select("value").eq("key", WRITABLE_TABS_KEY).maybeSingle(),
    supabaseAdmin.from("app_settings").select("value").eq("key", "gp_allowed_users").maybeSingle(),
  ])

  let writableTabs: string[] = []
  if (configRes.data?.value) {
    try {
      const cfg = JSON.parse(configRes.data.value) as Record<string, string[]>
      writableTabs = cfg[username] ?? []
    } catch {}
  }

  let gpEnabled = false
  const data = userRes.data
  if (data?.role === "creator") {
    gpEnabled = true
  } else if (gpRes.data?.value) {
    try {
      const allowed = JSON.parse(gpRes.data.value) as string[]
      gpEnabled = allowed.includes(username)
    } catch {}
  }

  return NextResponse.json({
    role:              data?.role              ?? session.user.role,
    department:        data?.department        ?? "none",
    allowed_analytics: data?.allowed_analytics ?? null,
    allowed_tabs:      data?.allowed_tabs      ?? null,
    writable_tabs:     writableTabs,
    gp_enabled:        gpEnabled,
  })
}
