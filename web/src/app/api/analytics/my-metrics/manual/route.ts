import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"

const READ_ROLES  = ["admin", "creator", "bod"]
const WRITE_ROLES = ["admin", "creator"]

export interface ManualMetrics {
  sla_time:     number   // giờ thực tế
  sla_pct:      number   // % compliance thực tế
  vendor_speed: number   // phút thực tế
  gm_baseline:  number   // GM% baseline (%)
  gm_actual:    number   // GM% actual (%)
  updated_by:   string
  updated_at:   string
}

function configKey(quarter: string, year: string) {
  return `okr.${quarter}-${year}`
}

// GET ?quarter=Q3&year=2026
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3"
  const year    = req.nextUrl.searchParams.get("year")    ?? "2026"
  const key     = configKey(quarter, year)

  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle()

  if (!data?.value) return NextResponse.json(null)
  try { return NextResponse.json(JSON.parse(data.value)) }
  catch { return NextResponse.json(null) }
}

// PATCH — lưu manual values cho 1 quarter
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as { quarter: string; year: string } & Partial<ManualMetrics>
  const { quarter, year, ...values } = body
  if (!quarter || !year) return NextResponse.json({ error: "quarter và year required" }, { status: 400 })

  const key     = configKey(quarter, year)
  const name    = session.user.name ?? session.user.email ?? session.user.username

  // Merge với existing
  const { data: existing } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", key).maybeSingle()
  const prev: Partial<ManualMetrics> = existing?.value ? JSON.parse(existing.value) : {}

  const next: ManualMetrics = {
    sla_time:     values.sla_time     ?? prev.sla_time     ?? 0,
    sla_pct:      values.sla_pct      ?? prev.sla_pct      ?? 0,
    vendor_speed: values.vendor_speed ?? prev.vendor_speed ?? 0,
    gm_baseline:  values.gm_baseline  ?? prev.gm_baseline  ?? 0,
    gm_actual:    values.gm_actual    ?? prev.gm_actual    ?? 0,
    updated_by:   name,
    updated_at:   new Date().toISOString(),
  }

  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({
      key,
      value:    JSON.stringify(next),
      category: "okr",
      label:    `OKR manual metrics ${quarter}-${year}`,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: next })
}
