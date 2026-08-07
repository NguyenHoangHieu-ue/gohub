import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, shipFilter, internalOpsFilter, getMonthsInRange, getDaysInRange, getDaysInMonth } from "@/lib/analytics-helpers"
import { fetchQuarterlySettings, makeClassifyTier } from "@/lib/quarterly-settings"
import { fetchCustomerCosts } from "@/lib/b2b-customer-cost"
import { calcChCostForPeriod } from "@/lib/analytics-engine/cost-engine"

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
  const includeShip        = p.get("includeShip")        === "1"
  const includeInternalOps = p.get("includeInternalOps") === "1"

  if (!staffCode) return NextResponse.json([], { status: 200 })

  const isSales   = dataSource === "created"
  const mainTable = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
  const dateCol   = isSales ? "created_date" : "fulfiled_date"
  const revCol    = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
  const gpCol     = isSales ? "0" : "f.gross_profit_vnd"

  // Nhất quán với route.ts: staffKey = sales_pic_code ưu tiên, fallback f.staff_code
  const staffKey = `COALESCE(NULLIF(TRIM(dc.sales_pic_code),''), NULLIF(TRIM(f.staff_code),''))`

  const params: unknown[] = [startDate, endDate, staffCode]
  let where = `WHERE f.${dateCol}::date BETWEEN $1 AND $2
    AND ${staffKey} = $3
    ${shipFilter(includeShip)}
    ${internalOpsFilter(includeInternalOps)}
    AND f.customer_code IS NOT NULL`

  if (companyCode && companyCode !== "ALL") {
    params.push(companyCode); where += ` AND f.company_code = $${params.length}`
  }
  if (channel) {
    params.push(channel); where += ` AND TRIM(s.channel_name) = $${params.length}`
  } else if (channelGroup && channelGroup !== "All") {
    params.push(channelGroup); where += ` AND UPPER(s.group_name) = UPPER($${params.length})`
  }

  // dim_customer join cần có trong cả summary lẫn monthly (where tham chiếu dc)
  const baseJoins = `
    LEFT JOIN dim_customer dc ON TRIM(f.customer_code) = TRIM(dc.code::text)
    LEFT JOIN dim_order_source s ON f.order_source_code = s.code`

  const skuJoin = `LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) sk ON TRIM(f.sku) = TRIM(sk.sku)`

  try {
    // Q1: customer-level aggregates
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
      ${baseJoins}
      ${skuJoin}
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
      ${baseJoins}
      ${skuJoin}
      ${where}
      GROUP BY f.customer_code, TO_CHAR(f.${dateCol}::date, 'YYYY-MM')
      ORDER BY f.customer_code, month
    `

    const months = startDate && endDate ? getMonthsInRange(startDate, endDate) : []

    const [summaryRows, monthlyRows, { tierKeywords }, customerCosts] = await Promise.all([
      queryAnalytics(summarySQL, params),
      queryAnalytics(monthlySQL, params),
      fetchQuarterlySettings(),
      months.length ? fetchCustomerCosts(months) : Promise.resolve(new Map<string, any>()),
    ])
    const classifyTier = makeClassifyTier(tierKeywords)

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

    const result = (summaryRows as any[]).map(r => {
      const pln = r.price_list_name || null
      const tier = pln === null ? "B2C" : classifyTier(pln)

      const monthly     = monthlyMap[r.customer_code] || []
      const grossProfit = Number(r.gross_profit) || 0
      const revenue     = Number(r.revenue) || 0

      let chCost = 0
      for (const mo of monthly) {
        const rec = (customerCosts as Map<string, any>).get(`${mo.month}_${r.customer_code}`)
        if (!rec) continue
        const dayRatio = getDaysInMonth(mo.month) > 0
          ? getDaysInRange(startDate, endDate, mo.month) / getDaysInMonth(mo.month)
          : 0
        chCost += calcChCostForPeriod(rec, mo.revenue, dayRatio)
      }

      const cm1 = grossProfit - chCost

      return {
        customer_code:   r.customer_code,
        customer_name:   r.customer_name,
        price_list_name: pln,
        tier,
        revenue,
        hk3_revenue:     Number(r.hk3_revenue) || 0,
        gross_profit:    grossProfit,
        ch_cost:         chCost,
        cm1,
        cm1_pct:         revenue > 0 ? (cm1 / revenue) * 100 : 0,
        order_count:     Number(r.order_count) || 0,
        monthly,
      }
    })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[staff-report/customers]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
