import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWrite } from "@/lib/writable-tabs"

const KEY = "company_monthly_targets"
const WRITE_ROLES = ["admin", "creator"]
const SEGMENTS = ["ALL", "B2B", "B2C"]
const FIELDS = ["rev", "gp", "cm1", "hk3rev"]

// value shape: { "Q4_2026": { ALL|B2B|B2C: { rev:[3], gp:[3], cm1:[3], hk3rev:[3] } } } — target TỪNG THÁNG của quý, cấp công ty.
async function loadAll(): Promise<Record<string, any>> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
  try { return data?.value ? JSON.parse(data.value) : {} } catch { return {} }
}

const month3 = (a: unknown) => [0, 1, 2].map(i => Math.max(0, Math.round(Number(Array.isArray(a) ? a[i] : 0) || 0)))

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const quarter = req.nextUrl.searchParams.get("quarter") || "Q4"
  const year    = req.nextUrl.searchParams.get("year")    || String(new Date().getFullYear())
  const all = await loadAll()
  return NextResponse.json({ targets: all[`${quarter}_${year}`] ?? {} })
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await canWrite(session, "quarterly", WRITE_ROLES)))
      return NextResponse.json({ error: "Chỉ admin/creator mới có thể lưu target" }, { status: 403 })

    const { quarter, year, targets } = await req.json()
    if (!/^Q[1-4]$/.test(String(quarter)) || !year) return NextResponse.json({ error: "Thiếu/sai quarter/year" }, { status: 400 })

    const all = await loadAll()
    const key = `${quarter}_${year}`
    const cur = all[key] ?? {}
    for (const seg of SEGMENTS) {
      if (!targets?.[seg]) continue
      cur[seg] = Object.fromEntries(FIELDS.map(f => [f, month3(targets[seg][f])]))
    }
    all[key] = cur
    const { error } = await supabaseAdmin.from("app_settings").upsert(
      { key: KEY, value: JSON.stringify(all), category: "quarterly" },
      { onConflict: "key" },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Lỗi không xác định" }, { status: 500 })
  }
}
