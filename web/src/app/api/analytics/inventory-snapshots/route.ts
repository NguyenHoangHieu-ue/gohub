import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"

const READ_ROLES  = ["admin", "creator", "manager", "staff", "bod", "ops-&-cs"]
const WRITE_ROLES = ["admin", "creator", "manager", "staff"]

async function requireRead() {
  const session = await getServerSession(authOptions)
  if (!session || !READ_ROLES.includes(session.user.role)) throw new Error("Unauthorized")
  return session
}

async function requireWrite() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error("Unauthorized")
  const ok = await canWriteTab(session.user.username, "fulfillment", WRITE_ROLES)
  if (!ok) throw new Error("Forbidden")
  return session
}

// GET ?sku_code=xxx — lịch sử snapshots của 1 SKU
export async function GET(req: NextRequest) {
  try {
    await requireRead()
    const sku = req.nextUrl.searchParams.get("sku_code")
    if (!sku) return NextResponse.json({ error: "sku_code required" }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from("inventory_snapshots")
      .select("snapshot_date, stock_total, updated_by, updated_at")
      .eq("sku_code", sku)
      .order("snapshot_date", { ascending: false })
      .limit(52) // ~1 năm nếu nhập weekly

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// POST — lưu batch snapshot (nhiều SKU cùng 1 ngày)
export async function POST(req: NextRequest) {
  try {
    const session = await requireWrite()
    const { snapshot_date, updates } = await req.json() as {
      snapshot_date: string
      updates: Array<{
        sku_code:       string
        stock_total:    number
        stock_warehouse: number
        stock_pq_hcm:   number
        stock_dd_hn:    number
        stock_tsn_hcm:  number
        stock_kg:       number
        expiry_date?:   string | null
        expiry_qty?:    number
        ops_qty?:       number
        telco_qty?:     number
        od_qty?:        number
        ws_qty?:        number
        b2c_qty?:       number
        marketing_qty?: number
        note?:          string
      }>
    }

    if (!snapshot_date || !Array.isArray(updates) || updates.length === 0)
      return NextResponse.json({ error: "snapshot_date và updates required" }, { status: 400 })

    const now   = new Date().toISOString()
    const email = session.user.name ?? session.user.email ?? ""

    const rows = updates.map(u => ({
      sku_code:       u.sku_code,
      snapshot_date,
      stock_total:    u.stock_total    || 0,
      stock_warehouse: u.stock_warehouse || 0,
      stock_pq_hcm:   u.stock_pq_hcm   || 0,
      stock_dd_hn:    u.stock_dd_hn    || 0,
      stock_tsn_hcm:  u.stock_tsn_hcm  || 0,
      stock_kg:       u.stock_kg        || 0,
      expiry_date:    u.expiry_date     || null,
      expiry_qty:     u.expiry_qty      || 0,
      ops_qty:        u.ops_qty         || 0,
      telco_qty:      u.telco_qty       || 0,
      od_qty:         u.od_qty          || 0,
      ws_qty:         u.ws_qty          || 0,
      b2c_qty:        u.b2c_qty         || 0,
      marketing_qty:  u.marketing_qty   || 0,
      note:           u.note            ?? null,
      updated_by:     email,
      updated_at:     now,
    }))

    const { error } = await supabaseAdmin
      .from("inventory_snapshots")
      .upsert(rows, { onConflict: "sku_code,snapshot_date" })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, saved: rows.length })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// GET /available-dates — danh sách ngày đã có snapshot
export async function HEAD(req: NextRequest) {
  try {
    await requireRead()
    const { data, error } = await supabaseAdmin
      .from("inventory_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
    if (error) return new NextResponse(null, { status: 500 })
    const dates = [...new Set((data ?? []).map(r => r.snapshot_date))]
    return new NextResponse(JSON.stringify(dates), { status: 200, headers: { "Content-Type": "application/json" } })
  } catch {
    return new NextResponse(null, { status: 401 })
  }
}
