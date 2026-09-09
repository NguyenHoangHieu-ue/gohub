import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"

const CONFIG_KEY = "my_metrics_lark_scan_config"
const WRITE_ROLES = ["admin", "creator"]

// Dùng canWriteTab (role TƯƠI từ DB) thay vì session.user.role (JWT, maxAge 1 ngày) — tránh 403 oan
// cho user vừa được cấp admin/creator chưa re-login (cùng lỗi s165 đã fix hàng loạt route khác).
async function requireCreatorOrAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username || !(await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES))) {
    throw new Error("Unauthorized")
  }
  return session
}

export async function GET() {
  try {
    await requireCreatorOrAdmin()
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
    const raw = data?.value ? JSON.parse(data.value) : null
    return NextResponse.json({
      enabled: raw?.enabled === true,
      days_back: raw?.days_back ?? 3,
    })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireCreatorOrAdmin()
    const body = await req.json() as { enabled?: boolean; days_back?: number }
    const config = {
      enabled: body.enabled === true,
      days_back: Number(body.days_back) > 0 ? Number(body.days_back) : 3,
    }
    await supabaseAdmin.from("app_settings").upsert(
      { key: CONFIG_KEY, value: JSON.stringify(config), category: "lark_tool" },
      { onConflict: "key" }
    )
    return NextResponse.json({ ok: true, ...config })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
