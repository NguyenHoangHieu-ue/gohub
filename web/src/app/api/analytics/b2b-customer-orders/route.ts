import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS } from "@/lib/analytics-helpers"

// Creator-only: chi tiết đơn hàng/kênh per-customer trong một quý.
// groupBy=month (default) → tổng theo kênh × tháng
// groupBy=day → tổng theo kênh × ngày (chi tiết hơn)
// groupBy=sku → tổng theo SKU/sản phẩm (không tách kênh) — KH này thường mua SKU gì.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard
  // Cho phép tất cả user đã đăng nhập xem chi tiết số liệu

  const { searchParams } = req.nextUrl
  const customerCode = searchParams.get("customer_code") || ""
  const quarter      = searchParams.get("quarter") || ""
  const year         = parseInt(searchParams.get("year") || "0")
  const groupByRaw   = searchParams.get("groupBy")
  const groupBy      = groupByRaw === "day" ? "day" : groupByRaw === "sku" ? "sku" : "month"

  if (!customerCode || !quarter || !year)
    return NextResponse.json({ error: "customer_code, quarter, year required" }, { status: 400 })

  const q = parseInt(quarter.replace("Q", ""))
  const startMonth = (q - 1) * 3 + 1
  const qStart = `${year}-${String(startMonth).padStart(2, "0")}-01`
  const qEnd   = new Date(year, q * 3, 0).toISOString().split("T")[0]

  const safeCode = customerCode.replace(/'/g, "''")

  try {
    if (groupBy === "sku") {
      const rows = await queryAnalytics<{
        sku: string; product_name: string | null; orders: string; units: string; revenue: string; gp: string
      }>(`
        SELECT
          TRIM(f.sku) as sku,
          v.type_of_sim as product_name,
          COUNT(DISTINCT f.order_code) as orders,
          SUM(f.fulfilled_quantity) as units,
          SUM(f.fulfilled_revenue_amount_vnd) as revenue,
          SUM(f.gross_profit_vnd) as gp
        FROM fact_fulfillment_revenue f
        LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) v ON TRIM(f.sku) = v.sku
        WHERE f.fulfiled_date::date >= '${qStart}'
          AND f.fulfiled_date::date <= '${qEnd}'
          AND TRIM(f.customer_code) = '${safeCode}'
        GROUP BY 1, 2
        ORDER BY 5 DESC
      `)
      const data = rows.map(r => ({
        period:   r.sku,
        channel:  r.product_name || r.sku,
        orders:   parseInt(r.orders || "0"),
        units:    parseInt(r.units || "0"),
        revenue:  Math.round(parseFloat(r.revenue || "0")),
        gp:       Math.round(parseFloat(r.gp || "0")),
      }))
      return NextResponse.json({ data, groupBy }, { headers: CACHE_HEADERS })
    }

    const dateExpr = groupBy === "day"
      ? `TO_CHAR(f.fulfiled_date::date, 'YYYY-MM-DD') as period`
      : `TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') as period`

    const rows = await queryAnalytics<{
      period: string
      channel: string
      orders: string
      units: string
      revenue: string
      gp: string
    }>(`
      SELECT
        ${dateExpr},
        COALESCE(TRIM(s.channel_name), 'Unknown') as channel,
        COUNT(DISTINCT f.order_code) as orders,
        SUM(f.fulfilled_quantity) as units,
        SUM(f.fulfilled_revenue_amount_vnd) as revenue,
        SUM(f.gross_profit_vnd) as gp
      FROM fact_fulfillment_revenue f
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      WHERE f.fulfiled_date::date >= '${qStart}'
        AND f.fulfiled_date::date <= '${qEnd}'
        AND TRIM(f.customer_code) = '${safeCode}'
      GROUP BY 1, 2
      ORDER BY 1 DESC, 3 DESC
    `)

    const data = rows.map(r => ({
      period:   r.period,
      channel:  r.channel,
      orders:   parseInt(r.orders || "0"),
      units:    parseInt(r.units || "0"),
      revenue:  Math.round(parseFloat(r.revenue || "0")),
      gp:       Math.round(parseFloat(r.gp || "0")),
    }))

    return NextResponse.json({ data, groupBy }, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[b2b-customer-orders]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
