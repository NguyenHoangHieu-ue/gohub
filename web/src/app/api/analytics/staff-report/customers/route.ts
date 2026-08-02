import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const p = req.nextUrl.searchParams
  const staffCode    = p.get("staffCode") || ""
  const startDate    = p.get("startDate") || ""
  const endDate      = p.get("endDate") || ""
  const channelGroup = p.get("channelGroup") || ""
  const channel      = p.get("channel") || ""
  const companyCode  = p.get("companyCode") || "ALL"
  const dataSource   = p.get("dataSource") || "fulfilled"

  if (!staffCode) return NextResponse.json([], { status: 200 })

  const isSales   = dataSource === "created"
  const mainTable = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
  const dateCol   = isSales ? "created_date" : "fulfiled_date"
  const revCol    = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
  const gpCol     = isSales ? "0" : "f.gross_profit_vnd"

  const params: unknown[] = [startDate, endDate, staffCode]
  let where = `WHERE f.${dateCol}::date BETWEEN $1 AND $2
    AND TRIM(f.staff_code) = $3
    AND f.sku != 'SHIPPINGFEE0'
    AND f.customer_code IS NOT NULL`

  if (companyCode && companyCode !== "ALL") {
    params.push(companyCode); where += ` AND f.company_code = $${params.length}`
  }
  if (channel) {
    params.push(channel); where += ` AND TRIM(s.channel_name) = $${params.length}`
  } else if (channelGroup && channelGroup !== "All") {
    params.push(channelGroup); where += ` AND UPPER(s.group_name) = UPPER($${params.length})`
  }

  try {
    // Q1: customer-level aggregates (+ GP)
    const summarySQL = `
      SELECT
        f.customer_code,
        COALESCE(dc.name, f.customer_code) AS customer_name,
        MAX(dc.price_list_name) AS price_list_name,
        SUM(f.${revCol}) AS revenue,
        SUM(CASE WHEN REPLACE(UPPER(TRIM(sk.vendor)), ' ', '') = '3HKDATAPOOL' THEN f.${revCol} ELSE 0 END) AS hk3_revenue,
        SUM(${gpCol}) AS gross_profit,
        COUNT(DISTINCT f.order_code) AS order_count
      FROM ${mainTable} f
      LEFT JOIN dim_customer dc ON TRIM(f.customer_code) = TRIM(dc.code::text)
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) sk ON TRIM(f.sku) = TRIM(sk.sku)
      ${where}
      GROUP BY f.customer_code, COALESCE(dc.name, f.customer_code)
      ORDER BY revenue DESC
      LIMIT 50
    `

    // Q2: monthly breakdown per customer
    const monthlySQL = `
      SELECT
        f.customer_code,
        TO_CHAR(f.${dateCol}::date, 'YYYY-MM') AS month,
        SUM(f.${revCol}) AS revenue,
        SUM(CASE WHEN REPLACE(UPPER(TRIM(sk.vendor)), ' ', '') = '3HKDATAPOOL' THEN f.${revCol} ELSE 0 END) AS hk3_revenue,
        SUM(${gpCol}) AS gross_profit
      FROM ${mainTable} f
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) sk ON TRIM(f.sku) = TRIM(sk.sku)
      ${where}
      GROUP BY f.customer_code, TO_CHAR(f.${dateCol}::date, 'YYYY-MM')
      ORDER BY f.customer_code, month
    `

    const [summaryRows, monthlyRows] = await Promise.all([
      queryAnalytics(summarySQL, params),
      queryAnalytics(monthlySQL, params),
    ])

    // Build monthly map per customer
    const monthlyMap: Record<string, { month: string; revenue: number; hk3_revenue: number; gross_profit: number }[]> = {}
    for (const r of monthlyRows as any[]) {
      const code = r.customer_code || ""
      if (!monthlyMap[code]) monthlyMap[code] = []
      monthlyMap[code].push({
        month:        r.month,
        revenue:      Number(r.revenue) || 0,
        hk3_revenue:  Number(r.hk3_revenue) || 0,
        gross_profit: Number(r.gross_profit) || 0,
      })
    }

    const result = (summaryRows as any[]).map(r => ({
      customer_code:   r.customer_code,
      customer_name:   r.customer_name,
      price_list_name: r.price_list_name || null,
      revenue:         Number(r.revenue) || 0,
      hk3_revenue:     Number(r.hk3_revenue) || 0,
      gross_profit:    Number(r.gross_profit) || 0,
      order_count:     Number(r.order_count) || 0,
      monthly:         monthlyMap[r.customer_code] || [],
    }))

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[staff-report/customers]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
