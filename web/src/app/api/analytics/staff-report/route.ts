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
  const startDate    = p.get("startDate") || ""
  const endDate      = p.get("endDate") || ""
  const channelGroup = p.get("channelGroup") || ""
  const channel      = p.get("channel") || ""
  const companyCode  = p.get("companyCode") || "ALL"
  const dataSource   = p.get("dataSource") || "fulfilled"

  const isSales    = dataSource === "created"
  const mainTable  = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
  const dateCol    = isSales ? "created_date" : "fulfiled_date"
  const revCol     = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
  const orderCol   = isSales ? "order_code" : "order_code"

  const params: unknown[] = [startDate, endDate]
  let where = `WHERE f.${dateCol}::date BETWEEN $1 AND $2
    AND COALESCE(st.name, TRIM(f.staff_code)) != 'Auto ESIM'
    AND f.sku != 'SHIPPINGFEE0'
    AND f.staff_code IS NOT NULL AND TRIM(f.staff_code) != ''`

  if (companyCode && companyCode !== "ALL") {
    params.push(companyCode); where += ` AND f.company_code = $${params.length}`
  }
  if (channel) {
    params.push(channel); where += ` AND TRIM(s.channel_name) = $${params.length}`
  } else if (channelGroup && channelGroup !== "All") {
    params.push(channelGroup); where += ` AND s.group_name = $${params.length}`
  }

  try {
    // Query 1: staff-level aggregates
    const summarySQL = `
      SELECT
        COALESCE(st.name, NULLIF(NULLIF(TRIM(f.staff_code), ''), 'NaN'), 'Chưa gán NV') AS staff_name,
        TRIM(f.staff_code) AS staff_code,
        SUM(f.${revCol}) AS total_revenue,
        SUM(CASE WHEN sk.vendor = '3HKDATAPOOL' THEN f.${revCol} ELSE 0 END) AS hk3_revenue,
        COUNT(DISTINCT f.customer_code) AS customer_count,
        COUNT(DISTINCT f.${orderCol}) AS total_orders
      FROM ${mainTable} f
      LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN dim_sku sk ON f.sku = sk.sku
      ${where}
      GROUP BY COALESCE(st.name, NULLIF(NULLIF(TRIM(f.staff_code), ''), 'NaN'), 'Chưa gán NV'), TRIM(f.staff_code)
      ORDER BY total_revenue DESC
    `

    // Query 2: monthly breakdown per staff
    const monthlySQL = `
      SELECT
        TRIM(f.staff_code) AS staff_code,
        TO_CHAR(f.${dateCol}::date, 'YYYY-MM') AS month,
        SUM(f.${revCol}) AS revenue,
        SUM(CASE WHEN sk.vendor = '3HKDATAPOOL' THEN f.${revCol} ELSE 0 END) AS hk3_revenue
      FROM ${mainTable} f
      LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN dim_sku sk ON f.sku = sk.sku
      ${where}
      GROUP BY TRIM(f.staff_code), TO_CHAR(f.${dateCol}::date, 'YYYY-MM')
      ORDER BY staff_code, month
    `

    const [summaryRows, monthlyRows] = await Promise.all([
      queryAnalytics(summarySQL, params),
      queryAnalytics(monthlySQL, params),
    ])

    // Build monthly map: staffCode → [{month, revenue, hk3_revenue}]
    const monthlyMap: Record<string, { month: string; revenue: number; hk3_revenue: number }[]> = {}
    for (const r of monthlyRows as any[]) {
      const code = r.staff_code || ""
      if (!monthlyMap[code]) monthlyMap[code] = []
      monthlyMap[code].push({
        month:       r.month,
        revenue:     Number(r.revenue) || 0,
        hk3_revenue: Number(r.hk3_revenue) || 0,
      })
    }

    const result = (summaryRows as any[]).map(r => ({
      staff_name:     r.staff_name,
      staff_code:     r.staff_code,
      total_revenue:  Number(r.total_revenue) || 0,
      hk3_revenue:    Number(r.hk3_revenue) || 0,
      customer_count: Number(r.customer_count) || 0,
      total_orders:   Number(r.total_orders) || 0,
      monthly:        monthlyMap[r.staff_code] || [],
    }))

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[staff-report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
