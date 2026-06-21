import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const p = req.nextUrl.searchParams
  const startDate   = p.get("startDate") || ""
  const endDate     = p.get("endDate") || ""
  const channelGroup = p.get("channelGroup") || ""
  const channel     = p.get("channel") || ""
  const staff       = p.get("staff") || ""
  const search      = p.get("search") || ""
  const dataSource  = p.get("dataSource") || "fulfilled"
  const companyCode = p.get("companyCode") || "ALL"

  const isSales     = dataSource === "created"
  const mainTable   = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
  const dateCol     = isSales ? "created_date" : "fulfiled_date"
  const revenueCol  = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
  const quantityCol = isSales ? "quantity" : "fulfilled_quantity"

  try {
    const params: unknown[] = [startDate, endDate]
    let where = `WHERE f.${dateCol}::date BETWEEN $1 AND $2`

    if (companyCode && companyCode !== "ALL" && companyCode !== "undefined") {
      params.push(companyCode); where += ` AND f.company_code = $${params.length}`
    }
    if (channel) {
      params.push(channel); where += ` AND TRIM(s.channel_name) = $${params.length}`
    } else if (channelGroup && channelGroup !== "All") {
      params.push(channelGroup); where += ` AND s.group_name = $${params.length}`
    }
    if (staff) {
      if (staff.includes(",")) {
        const staffArray = staff.split(",").filter(Boolean)
        const pls = staffArray.map((_, i) => `$${params.length + i + 1}`).join(",")
        where += ` AND TRIM(f.staff_code) IN (${pls})`
        params.push(...staffArray)
      } else {
        params.push(staff, `%${staff}%`)
        where += ` AND (TRIM(f.staff_code) = $${params.length - 1} OR st.name ILIKE $${params.length} OR TRIM(f.staff_code) ILIKE $${params.length})`
      }
    }
    if (search) {
      params.push(`%${search}%`)
      where += ` AND (f.order_code ILIKE $${params.length} OR f.sku ILIKE $${params.length} OR st.name ILIKE $${params.length} OR TRIM(f.staff_code) ILIKE $${params.length})`
    }

    where += ` AND COALESCE(st.name, TRIM(f.staff_code)) != 'Auto ESIM' AND f.sku != 'SHIPPINGFEE0'`

    const sql = `
      SELECT
        COALESCE(st.name, NULLIF(NULLIF(TRIM(f.staff_code), ''), 'NaN'), 'Chưa gán NV') as staff_name,
        TRIM(f.staff_code) as staff_code,
        COUNT(DISTINCT f.order_code) as total_orders,
        SUM(f.${quantityCol}) as total_units,
        SUM(f.${revenueCol}) as total_revenue
      FROM ${mainTable} f
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
      ${where}
      GROUP BY COALESCE(st.name, NULLIF(NULLIF(TRIM(f.staff_code), ''), 'NaN'), 'Chưa gán NV'), TRIM(f.staff_code)
      ORDER BY total_revenue DESC
    `

    const rows = await queryAnalytics(sql, params)
    return NextResponse.json(rows)
  } catch (err: any) {
    console.error("[staff-performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
