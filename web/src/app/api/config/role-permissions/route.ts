import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// role_permissions = { [role]: analyticsPageId[] } — ma trận Role × trang Analytics (y hệt gohub-intel).
// Là quyền NỀN theo role (deny-by-default cho staff/bod); per-user allowed_analytics cộng dồn thêm.
// admin/manager luôn toàn quyền (không lưu ở đây).

// 18 trang analytics (khớp ANALYTICS_REPORTS ở admin + ANALYTICS_GROUPS ở sidebar)
const ALL_ANALYTICS_IDS = [
  "dashboard", "bod", "all-time", "channels", "b2b", "b2c", "website",
  "staff", "customers", "vendors", "orders", "fulfillment", "3hk-usage",
  "cs-troubleshoot", "feedback", "products", "targets", "sql",
]

// Mặc định nếu chưa cấu hình (giống intel: bod thấy hết, staff tối thiểu)
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  bod:   ALL_ANALYTICS_IDS,
  staff: ["dashboard", "feedback", "products"],
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "role_permissions").maybeSingle()
  let perms: Record<string, string[]> = DEFAULT_ROLE_PERMISSIONS
  try { if (data?.value) perms = JSON.parse(data.value) } catch {}
  return NextResponse.json(perms)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "role_permissions",
    value: JSON.stringify(body ?? {}),
    category: "analytics",
  }, { onConflict: "key" })
  return NextResponse.json({ ok: true })
}
