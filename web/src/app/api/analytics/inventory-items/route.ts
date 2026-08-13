import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { queryAnalytics } from "@/lib/analytics-db"
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

// GET — danh sách items + latest snapshot + sold từ gohub_dw
export async function GET(req: NextRequest) {
  try {
    await requireRead()

    // 1. Lấy inventory_items
    const { data: items, error: itemErr } = await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .order("sim_type").order("vendor").order("sku_code")

    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
    if (!items?.length) return NextResponse.json([])

    const skuCodes = items.map(i => i.sku_code)

    // 2. Snapshot date từ query param (nếu có) hoặc latest
    const dateParam = req.nextUrl.searchParams.get("date")

    let snapRows: any[] = []
    if (dateParam) {
      const { data } = await supabaseAdmin
        .from("inventory_snapshots")
        .select("*")
        .in("sku_code", skuCodes)
        .eq("snapshot_date", dateParam)
      snapRows = data ?? []
    } else {
      // latest snapshot per sku
      const { data } = await supabaseAdmin
        .from("inventory_snapshots")
        .select("*")
        .in("sku_code", skuCodes)
        .order("snapshot_date", { ascending: false })
      // dedupe: lấy mỗi sku 1 lần (hàng đầu tiên = latest)
      const seen = new Set<string>()
      for (const r of data ?? []) {
        if (!seen.has(r.sku_code)) { snapRows.push(r); seen.add(r.sku_code) }
      }
    }

    const snapMap: Record<string, any> = {}
    for (const s of snapRows) snapMap[s.sku_code] = s

    // 3. Lấy sold 15D & 30D từ gohub_dw
    const today = new Date()
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const d15 = new Date(today); d15.setDate(today.getDate() - 15)
    const d30 = new Date(today); d30.setDate(today.getDate() - 30)

    const skuList = skuCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(",")

    let soldRows: { sku: string; sold_15d: string; sold_30d: string }[] = []
    try {
      soldRows = await queryAnalytics<{ sku: string; sold_15d: string; sold_30d: string }>(`
        SELECT
          TRIM(sku) AS sku,
          SUM(CASE WHEN fulfiled_date::date >= '${fmt(d15)}' THEN fulfilled_quantity ELSE 0 END) AS sold_15d,
          SUM(CASE WHEN fulfiled_date::date >= '${fmt(d30)}' THEN fulfilled_quantity ELSE 0 END) AS sold_30d
        FROM fact_fulfillment_revenue
        WHERE TRIM(sku) IN (${skuList})
          AND fulfiled_date IS NOT NULL
          AND fulfiled_date::date <= CURRENT_DATE - 1
        GROUP BY TRIM(sku)
      `)
    } catch {}

    const soldMap: Record<string, { sold_15d: number; sold_30d: number }> = {}
    for (const r of soldRows) soldMap[r.sku] = { sold_15d: Number(r.sold_15d) || 0, sold_30d: Number(r.sold_30d) || 0 }

    // 4. Merge & compute
    const todayStr = fmt(today)
    const result = items.map(item => {
      const snap  = snapMap[item.sku_code] ?? null
      const sold  = soldMap[item.sku_code] ?? { sold_15d: 0, sold_30d: 0 }
      const stock = snap?.stock_total ?? 0
      const avg   = sold.sold_30d / 30
      const doi   = avg > 0 ? Math.floor(stock / avg) : null
      const estOut = doi !== null
        ? fmt(new Date(today.getTime() + doi * 86400000))
        : null

      return {
        ...item,
        snapshot_date:  snap?.snapshot_date ?? null,
        stock_total:    snap?.stock_total    ?? 0,
        stock_warehouse: snap?.stock_warehouse ?? 0,
        stock_pq_hcm:   snap?.stock_pq_hcm   ?? 0,
        stock_dd_hn:    snap?.stock_dd_hn    ?? 0,
        stock_tsn_hcm:  snap?.stock_tsn_hcm  ?? 0,
        stock_kg:       snap?.stock_kg        ?? 0,
        expiry_date:    snap?.expiry_date     ?? null,
        expiry_qty:     snap?.expiry_qty      ?? 0,
        ops_qty:        snap?.ops_qty         ?? 0,
        telco_qty:      snap?.telco_qty       ?? 0,
        od_qty:         snap?.od_qty          ?? 0,
        ws_qty:         snap?.ws_qty          ?? 0,
        b2c_qty:        snap?.b2c_qty         ?? 0,
        marketing_qty:  snap?.marketing_qty   ?? 0,
        note:           snap?.note            ?? "",
        updated_by:     snap?.updated_by      ?? null,
        updated_at:     snap?.updated_at      ?? null,
        // computed từ gohub_dw
        sold_15d:  sold.sold_15d,
        sold_30d:  sold.sold_30d,
        avg_per_day: +avg.toFixed(2),
        doi,
        est_out_of_stock: estOut,
      }
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// POST — thêm SKU mới vào danh sách track
export async function POST(req: NextRequest) {
  try {
    const session = await requireWrite()
    const body = await req.json() as {
      sku_code: string; sim_type: string; vendor?: string; status?: string
      retail_price?: number; safety_stock?: number; reorder_point?: number; note_permanent?: string
    }
    if (!body.sku_code) return NextResponse.json({ error: "sku_code required" }, { status: 400 })

    // Thử lấy vendor/type từ gohub_dw dim_sku nếu không truyền
    let vendor = body.vendor ?? ""
    let simType = body.sim_type ?? "SIM"
    if (!vendor) {
      try {
        const rows = await queryAnalytics<{ vendor: string; type_of_sim: string }>(`
          SELECT vendor, type_of_sim FROM dim_sku WHERE TRIM(sku) = '${body.sku_code.replace(/'/g,"''")}' LIMIT 1
        `)
        if (rows[0]) { vendor = rows[0].vendor ?? ""; simType = rows[0].type_of_sim?.includes("eSIM") ? "ESIM" : "SIM" }
      } catch {}
    }

    const { error } = await supabaseAdmin.from("inventory_items").insert({
      sku_code:       body.sku_code,
      sim_type:       simType,
      vendor,
      status:         body.status         ?? "Active",
      retail_price:   body.retail_price   ?? 0,
      safety_stock:   body.safety_stock   ?? 0,
      reorder_point:  body.reorder_point  ?? 0,
      note_permanent: body.note_permanent ?? null,
      created_by:     session.user.email  ?? "",
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// PATCH — sửa metadata item (retail_price, safety_stock, reorder_point, status, vendor, sim_type, note_permanent)
export async function PATCH(req: NextRequest) {
  try {
    await requireWrite()
    const body = await req.json() as {
      sku_code: string; retail_price?: number; safety_stock?: number; reorder_point?: number
      status?: string; vendor?: string; sim_type?: string; note_permanent?: string | null
    }
    if (!body.sku_code) return NextResponse.json({ error: "sku_code required" }, { status: 400 })

    const { sku_code, ...fields } = body
    const { error } = await supabaseAdmin
      .from("inventory_items")
      .update(fields)
      .eq("sku_code", sku_code)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// DELETE — xóa SKU khỏi danh sách track
export async function DELETE(req: NextRequest) {
  try {
    await requireWrite()
    const { sku_code } = await req.json()
    if (!sku_code) return NextResponse.json({ error: "sku_code required" }, { status: 400 })

    const { error } = await supabaseAdmin.from("inventory_items").delete().eq("sku_code", sku_code)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
