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
    params.push(channelGroup); where += ` AND s.group_name = $${params.length}`
  }

  try {
    const sql = `
      SELECT
        f.customer_code,
        COALESCE(dc.name, f.customer_code) AS customer_name,
        SUM(f.${revCol}) AS revenue,
        SUM(CASE WHEN sk.vendor = '3HKDATAPOOL' THEN f.${revCol} ELSE 0 END) AS hk3_revenue,
        COUNT(DISTINCT f.order_code) AS order_count
      FROM ${mainTable} f
      LEFT JOIN dim_customer dc ON f.customer_code = dc.code
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN dim_sku sk ON f.sku = sk.sku_code
      ${where}
      GROUP BY f.customer_code, COALESCE(dc.name, f.customer_code)
      ORDER BY revenue DESC
      LIMIT 50
    `

    const rows = await queryAnalytics(sql, params)
    const result = (rows as any[]).map(r => ({
      customer_code: r.customer_code,
      customer_name: r.customer_name,
      revenue:       Number(r.revenue) || 0,
      hk3_revenue:   Number(r.hk3_revenue) || 0,
      order_count:   Number(r.order_count) || 0,
    }))

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[staff-report/customers]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
