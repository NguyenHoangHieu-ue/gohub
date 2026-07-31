import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const p = req.nextUrl.searchParams
  // singleDate shorthand: sets startDate=endDate=date (filter by 1 day)
  const singleDate  = p.get("date") || ""
  const startDate   = singleDate || p.get("startDate") || ""
  const endDate     = singleDate || p.get("endDate") || ""
  const staffCode   = p.get("staffCode") || ""
  const channelGroup = p.get("channelGroup") || ""
  const channel     = p.get("channel") || ""
  const orderSource = p.get("orderSource") || ""
  const companyCode = p.get("companyCode") || "ALL"
  const dataSource  = p.get("dataSource") || "fulfilled"
  const isExport    = p.get("export") === "1"
  const page        = Math.max(1, parseInt(p.get("page") || "1"))
  const limit       = isExport ? 5000 : Math.min(200, parseInt(p.get("limit") || "50"))
  const offset      = (page - 1) * limit

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 })
  }

  const isSales   = dataSource === "created"
  const mainTable = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
  const dateCol   = isSales ? "created_date" : "fulfiled_date"
  const revCol    = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
  // fact_sales_revenue uses "quantity"; fact_fulfillment_revenue uses "fulfilled_quantity"
  const qtyCol    = isSales ? "f.quantity" : "f.fulfilled_quantity"
  // fact_sales_revenue has no gross_profit_vnd
  const gpCol     = isSales ? "0" : "f.gross_profit_vnd"

  const params: unknown[] = [startDate, endDate]

  let where = `WHERE f.${dateCol}::date BETWEEN $1 AND $2
    AND f.sku != 'SHIPPINGFEE0'`

  if (companyCode && companyCode !== "ALL") {
    params.push(companyCode)
    where += ` AND f.company_code = $${params.length}`
  }
  if (staffCode) {
    params.push(staffCode)
    where += ` AND TRIM(f.staff_code) = $${params.length}`
  }
  if (orderSource) {
    params.push(orderSource)
    where += ` AND TRIM(s.channel_name) = $${params.length}`
  } else if (channel) {
    params.push(channel)
    where += ` AND TRIM(s.channel_name) = $${params.length}`
  } else if (channelGroup && channelGroup !== "All") {
    params.push(channelGroup)
    where += ` AND UPPER(COALESCE(s.group_name, '')) = UPPER($${params.length})`
  }

  const baseSelect = `
    SELECT
      MIN(f.${dateCol})::date  AS order_date,
      TRIM(f.staff_code)       AS staff_code,
      COALESCE(st.name, NULLIF(TRIM(f.staff_code), ''), 'Unassigned') AS staff_name,
      COALESCE(dc.name, TRIM(f.customer_code))  AS customer_name,
      TRIM(f.customer_code)    AS customer_code,
      f.order_code,
      COALESCE(MAX(f.company_code), '')  AS company_code,
      STRING_AGG(DISTINCT TRIM(f.sku), ', ' ORDER BY TRIM(f.sku)) AS order_name,
      STRING_AGG(DISTINCT COALESCE(sk.type_of_sim, 'Other'), ', ') AS sim_type,
      COALESCE(MAX(s.channel_name), '')  AS channel_name,
      COALESCE(UPPER(MAX(s.group_name)), '') AS channel_group,
      SUM(${qtyCol})::bigint   AS quantity,
      ROUND(
        SUM(f.${revCol})::numeric / NULLIF(SUM(${qtyCol})::numeric, 0)
      )::bigint                AS unit_price,
      SUM(f.${revCol})::bigint  AS total_revenue,
      SUM(${gpCol})::bigint    AS gross_profit,
      MAX(dc.price_list_name)  AS price_list_name
    FROM ${mainTable} f
    LEFT JOIN dim_staff        st ON TRIM(f.staff_code)    = TRIM(st.code)
    LEFT JOIN dim_customer     dc ON TRIM(f.customer_code) = TRIM(dc.code::text)
    LEFT JOIN dim_sku          sk ON TRIM(f.sku)           = TRIM(sk.sku)
    LEFT JOIN dim_order_source  s ON f.order_source_code   = s.code
    ${where}
    GROUP BY
      f.order_code,
      TRIM(f.staff_code),
      COALESCE(st.name, NULLIF(TRIM(f.staff_code), ''), 'Unassigned'),
      COALESCE(dc.name, TRIM(f.customer_code)),
      TRIM(f.customer_code)
  `

  const countSQL = `SELECT COUNT(*) AS total FROM (${baseSelect}) sub`
  const aggrSQL  = `SELECT SUM(total_revenue) AS sum_revenue, SUM(gross_profit) AS sum_gp, SUM(quantity) AS sum_qty
                    FROM (${baseSelect}) sub`
  const dataSQL  = `${baseSelect} ORDER BY MIN(f.${dateCol}) DESC LIMIT ${limit} OFFSET ${offset}`

  try {
    const [countRows, aggrRows, dataRows] = await Promise.all([
      isExport ? Promise.resolve([{ total: "0" }]) : queryAnalytics<{ total: string }>(countSQL, params),
      isExport ? Promise.resolve([{ sum_revenue: "0", sum_gp: "0", sum_qty: "0" }]) : queryAnalytics(aggrSQL, params),
      queryAnalytics(dataSQL, params),
    ])

    const total = isExport
      ? (dataRows as any[]).length
      : parseInt((countRows as any[])[0]?.total || "0")

    const aggr = (aggrRows as any[])[0] || {}
    const totalRevenue = Number(aggr.sum_revenue) || 0
    const totalGp      = Number(aggr.sum_gp)      || 0
    const totalQty     = Number(aggr.sum_qty)      || 0

    const rows = (dataRows as any[]).map(r => ({
      order_date:      r.order_date,
      staff_code:      r.staff_code,
      staff_name:      r.staff_name,
      customer_name:   r.customer_name,
      customer_code:   r.customer_code,
      order_code:      r.order_code,
      company_code:    r.company_code || null,
      order_name:      r.order_name,
      sim_type:        r.sim_type,
      channel_name:    r.channel_name,
      channel_group:   r.channel_group,
      quantity:        Number(r.quantity) || 0,
      unit_price:      Number(r.unit_price) || 0,
      total_revenue:   Number(r.total_revenue) || 0,
      gross_profit:    Number(r.gross_profit) || 0,
      price_list_name: r.price_list_name || null,
    }))

    return NextResponse.json(
      { rows, total, page, limit, totalRevenue, totalGp, totalQty },
      { headers: CACHE_HEADERS },
    )
  } catch (err: any) {
    console.error("[order-report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
