import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { flushAnalyticsCache } from "@/lib/analytics-helpers"
import { canWrite } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator"]

// b2c_kpi_targets = { [month "YYYY-MM"]: { vn, us, total } } — target doanh thu B2C theo tháng × thị trường.

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "b2c_kpi_targets").maybeSingle()
  let targets: Record<string, { vn: number; us: number; total: number }> = {}
  try { targets = data?.value ? JSON.parse(data.value) : {} } catch {}
  return NextResponse.json(targets)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "b2c", WRITE_ROLES))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "b2c_kpi_targets",
    value: JSON.stringify(body ?? {}),
    category: "analytics",
  }, { onConflict: "key" })
  // B2C KPI target đọc trong /api/analytics/b2c/monthly (cache 12h) → xoá cache để dashboard cập nhật ngay.
  await flushAnalyticsCache().catch(() => {})
  return NextResponse.json({ ok: true })
}
