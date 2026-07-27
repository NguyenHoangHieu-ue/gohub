import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"

// POST /api/analytics/sync-b2b-customers
// Sync toàn bộ B2B customers có dữ liệu từ gohub_dw → Supabase b2b_customers_cache.
// GET  → trả trạng thái cache (last_sync, count).

const BATCH = 200  // upsert theo lô để không timeout

export async function GET() {
  try {
    const [{ count }, { data: latest }] = await Promise.all([
      supabaseAdmin.from("b2b_customers_cache").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("b2b_customers_cache").select("synced_at").order("synced_at", { ascending: false }).limit(1),
    ])
    return NextResponse.json({
      cached_count:  count ?? 0,
      last_synced_at: latest?.[0]?.synced_at ?? null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator", "manager", "bod"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    // Query gohub_dw: B2B customers có ít nhất 1 đơn + join dim_customer để lấy tier info
    const rows = await queryAnalytics<{
      customer_code: string
      customer_name: string | null
      price_list_name: string | null
      currency_code: string | null
      price_list_code: string | null
      status: string | null
      sales_pic_code: string | null
      total_revenue: string
      total_gp: string
      total_orders: string
      total_units: string
      first_order_date: string
      last_order_date: string
    }>(`
      SELECT
        TRIM(f.customer_code)                             AS customer_code,
        COALESCE(c.name, TRIM(f.customer_code))          AS customer_name,
        c.price_list_name,
        c.currency_code,
        c.price_list_code,
        c.status,
        c.sales_pic_code,
        SUM(f.fulfilled_revenue_amount_vnd)               AS total_revenue,
        SUM(f.gross_profit_vnd)                           AS total_gp,
        COUNT(DISTINCT f.order_code)                      AS total_orders,
        SUM(f.fulfilled_quantity)                         AS total_units,
        MIN(f.fulfiled_date::date)::text                  AS first_order_date,
        MAX(f.fulfiled_date::date)::text                  AS last_order_date
      FROM fact_fulfillment_revenue f
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN dim_customer c     ON TRIM(f.customer_code) = TRIM(c.code::text)
      WHERE UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2B'
        AND f.customer_code IS NOT NULL
        AND TRIM(f.customer_code) != ''
        AND f.fulfiled_date::date <= CURRENT_DATE - 1
        AND f.sku != 'SHIPPINGFEE0'
        AND UPPER(COALESCE(c.price_list_name, '')) NOT LIKE '%INACTIVE%'
      GROUP BY
        TRIM(f.customer_code),
        COALESCE(c.name, TRIM(f.customer_code)),
        c.price_list_name, c.currency_code, c.price_list_code, c.status, c.sales_pic_code
      ORDER BY total_revenue DESC
    `)

    if (rows.length === 0) {
      return NextResponse.json({ synced: 0, message: "Không có dữ liệu B2B trong gohub_dw" })
    }

    const now = new Date().toISOString()
    const records = rows.map(r => ({
      customer_code:    r.customer_code,
      customer_name:    r.customer_name ?? r.customer_code,
      price_list_name:  r.price_list_name ?? null,
      currency_code:    r.currency_code ?? null,
      price_list_code:  r.price_list_code ?? null,
      status:           r.status ?? null,
      sales_pic_code:   r.sales_pic_code ?? null,
      total_revenue:    parseFloat(r.total_revenue) || 0,
      total_gp:         parseFloat(r.total_gp) || 0,
      total_orders:     parseInt(r.total_orders) || 0,
      total_units:      parseInt(r.total_units) || 0,
      first_order_date: r.first_order_date ?? null,
      last_order_date:  r.last_order_date ?? null,
      synced_at:        now,
    }))

    // Upsert theo lô
    let upserted = 0
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH)
      const { error } = await supabaseAdmin
        .from("b2b_customers_cache")
        .upsert(batch, { onConflict: "customer_code" })
      if (error) throw new Error(`Batch ${i}-${i + BATCH}: ${error.message}`)
      upserted += batch.length
    }

    return NextResponse.json({
      synced:     upserted,
      synced_at:  now,
      message:    `Đã sync ${upserted} B2B customers vào Supabase`,
    })
  } catch (err: any) {
    console.error("[sync-b2b-customers]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
