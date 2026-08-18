import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// Target CM1, 3HK%, Revenue, 3HK Revenue per-KH per-quý — lưu Supabase b2b_customer_targets.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const quarter = req.nextUrl.searchParams.get("quarter") || ""
  const year    = parseInt(req.nextUrl.searchParams.get("year") || "0")
  if (!quarter || !year) return NextResponse.json({ targets: {} })

  const { data } = await supabaseAdmin
    .from("b2b_customer_targets")
    .select("customer_code, target_cm1, target_3hk_pct, target_rev, target_3hk_rev")
    .eq("quarter", quarter)
    .eq("year", year)

  const targets: Record<string, { cm1: number; thk: number; rev: number; hk3rev: number }> = {}
  ;(data ?? []).forEach(r => {
    targets[r.customer_code] = {
      cm1:    Number(r.target_cm1)     || 0,
      thk:    Number(r.target_3hk_pct) || 0,
      rev:    Number(r.target_rev)     || 0,
      hk3rev: Number(r.target_3hk_rev) || 0,
    }
  })

  return NextResponse.json({ targets })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator", "bod", "b2b", "b2c", "staff"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { quarter, year, customer_code, target_cm1, target_3hk_pct, target_rev, target_3hk_rev } = body

  if (!quarter || !year || !customer_code)
    return NextResponse.json({ error: "quarter, year, customer_code required" }, { status: 400 })

  const id = `${quarter}-${year}_${customer_code}`
  const updatedBy = (session.user as any).username || session.user.email || "web"

  const { error } = await supabaseAdmin.from("b2b_customer_targets").upsert({
    id, quarter, year, customer_code,
    target_cm1:     Number(target_cm1)     || 0,
    target_3hk_pct: Number(target_3hk_pct) || 0,
    target_rev:     Number(target_rev)     || 0,
    target_3hk_rev: Number(target_3hk_rev) || 0,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" })

  if (error) {
    console.error("[b2b-customer-targets POST]", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
