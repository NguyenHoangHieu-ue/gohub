import { NextResponse }    from "next/server"
import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { supabaseAdmin }    from "@/lib/supabase"
import { memo }             from "@/lib/memo"
import { GP_CREATOR_ONLY }  from "@/lib/gp-access"

const WRITABLE_TABS_KEY = "permissions.writable_tabs"

// Trang nào cũng gọi route này lúc mở; 5 lần đọc Supabase song song vẫn ~0,5-3s từ iad1 (s203) → memo 20s/người dùng.
// Quyền vừa đổi hiện ra sau tối đa 20s (instance khác) — chấp nhận được cho cờ hiển thị menu/nút.
async function loadMe(username: string, sessionRole: string) {

  const [userRes, configRes, gpRes, portalRes, myMetricsRes, marketRes] = await Promise.all([
    supabaseAdmin.from("users").select("role, department, allowed_analytics, allowed_tabs").eq("username", username).single(),
    supabaseAdmin.from("app_settings").select("value").eq("key", WRITABLE_TABS_KEY).maybeSingle(),
    supabaseAdmin.from("app_settings").select("value").eq("key", "gp_allowed_users").maybeSingle(),
    supabaseAdmin.from("app_settings").select("value").eq("key", "portal_access_users").maybeSingle(),
    supabaseAdmin.from("app_settings").select("value").eq("key", "my_metrics_users").maybeSingle(),
    supabaseAdmin.from("app_settings").select("value").eq("key", "market_users").maybeSingle(),
  ])

  let writableTabs: string[] = []
  if (configRes.data?.value) {
    try {
      const cfg = JSON.parse(configRes.data.value) as Record<string, string[]>
      writableTabs = cfg[username] ?? []
    } catch {}
  }

  let gpEnabled = false
  let gpMoved = false   // từng được cấp Gấu Pro, nay đã chuyển sang Bé Gấu (U5)
  const data = userRes.data
  if (data?.role === "creator") {
    gpEnabled = true
  } else if (gpRes.data?.value) {
    try {
      const listed = (JSON.parse(gpRes.data.value) as string[]).includes(username)
      gpEnabled = listed && !GP_CREATOR_ONLY
      gpMoved = listed && GP_CREATOR_ONLY
    } catch {}
  }

  let portalEnabled = false
  if (data?.role === "creator") {
    portalEnabled = true
  } else if (portalRes.data?.value) {
    try {
      const allowed = JSON.parse(portalRes.data.value) as string[]
      portalEnabled = allowed.includes(username)
    } catch {}
  }

  let myMetricsEnabled = false
  if (data?.role === "creator") {
    myMetricsEnabled = true
  } else if (myMetricsRes.data?.value) {
    try {
      const allowed = JSON.parse(myMetricsRes.data.value) as string[]
      myMetricsEnabled = allowed.includes(username)
    } catch {}
  }

  // Tab Thị trường & Báo giá: creator + người creator cấp (s225)
  let marketEnabled = data?.role === "creator"
  if (!marketEnabled && marketRes.data?.value) {
    try { marketEnabled = (JSON.parse(marketRes.data.value) as string[]).includes(username) } catch {}
  }

  return {
    role:                data?.role              ?? sessionRole,
    department:          data?.department        ?? "none",
    allowed_analytics:   data?.allowed_analytics ?? null,
    allowed_tabs:        data?.allowed_tabs       ?? null,
    writable_tabs:       writableTabs,
    gp_enabled:          gpEnabled,
    gp_moved:            gpMoved,
    portal_enabled:      portalEnabled,
    my_metrics_enabled:  myMetricsEnabled,
    market_enabled:      marketEnabled,
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const username = session.user.username
  const payload = await memo(`me:${username}`, 20_000, () => loadMe(username, session.user.role as string))
  return NextResponse.json(payload)
}
