import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

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
  if (!session || (session.user.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const body = await req.json()
  await supabaseAdmin.from("app_settings").upsert({
    key: "b2c_kpi_targets",
    value: JSON.stringify(body ?? {}),
    category: "analytics",
  }, { onConflict: "key" })
  return NextResponse.json({ ok: true })
}
