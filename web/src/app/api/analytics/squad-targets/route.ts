import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWrite } from "@/lib/writable-tabs"

const KEY = "squad_targets"
const WRITE_ROLES = ["admin", "creator"]

// value shape: { "Q3_2026": { "Squad 1 Ngọc": { rev, cm1, hk3rev, gp, months?: { rev:[3], gp:[3], cm1:[3], hk3rev:[3] } } } }
// POST gộp (merge) theo từng squad: gửi target quý không làm mất `months` và ngược lại.
async function loadAll(): Promise<Record<string, any>> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
  try { return data?.value ? JSON.parse(data.value) : {} } catch { return {} }
}

export async function GET(req: NextRequest) {
  const quarter = req.nextUrl.searchParams.get("quarter") || "Q3"
  const year    = req.nextUrl.searchParams.get("year")    || String(new Date().getFullYear())
  const all = await loadAll()
  return NextResponse.json({ targets: all[`${quarter}_${year}`] ?? {} })
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await canWrite(session, "quarterly", WRITE_ROLES)))
      return NextResponse.json({ error: "Chỉ admin/creator mới có thể lưu target squad" }, { status: 403 })

    // `next` (tuỳ chọn): target các tháng của quý sau, ghi cùng 1 lần upsert với target quý đang xem.
    const { quarter, year, targets, next } = await req.json()
    if (!quarter || !year) return NextResponse.json({ error: "Thiếu quarter/year" }, { status: 400 })

    const all = await loadAll()
    const mergeInto = (key: string, incoming: Record<string, any> | undefined) => {
      const cur = all[key] ?? {}
      for (const [squad, t] of Object.entries(incoming ?? {})) cur[squad] = { ...(cur[squad] ?? {}), ...(t as object) }
      all[key] = cur
    }
    mergeInto(`${quarter}_${year}`, targets)
    if (next?.quarter && next?.year) mergeInto(`${next.quarter}_${next.year}`, next.targets)
    const { error } = await supabaseAdmin.from("app_settings").upsert(
      { key: KEY, value: JSON.stringify(all), category: "squad" },
      { onConflict: "key" }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Lỗi không xác định" }, { status: 500 })
  }
}
