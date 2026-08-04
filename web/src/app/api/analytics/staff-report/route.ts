import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, getMonthsInRange, getGroupCostsForMonths, getDaysInRange, getDaysInMonth, shipFilter, internalOpsFilter } from "@/lib/analytics-helpers"

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
  const includeShip        = p.get("includeShip")        === "1"
  const includeInternalOps = p.get("includeInternalOps") === "1"

  const isSales   = dataSource === "created"
  const mainTable = isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue"
  const dateCol   = isSales ? "created_date" : "fulfiled_date"
  const revCol    = isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"
  // fact_sales_revenue không có gross_profit_vnd — trả 0
  const gpCol     = isSales ? "0" : "f.gross_profit_vnd"

  const params: unknown[] = [startDate, endDate]
  let where = `WHERE f.${dateCol}::date BETWEEN $1 AND $2
    AND COALESCE(st.name, TRIM(f.staff_code)) != 'Auto ESIM'
    ${shipFilter(includeShip)}
    ${internalOpsFilter(includeInternalOps)}
    AND f.staff_code IS NOT NULL AND TRIM(f.staff_code) != ''`

  if (companyCode && companyCode !== "ALL") {
    params.push(companyCode); where += ` AND f.company_code = $${params.length}`
  }
  if (channel) {
    params.push(channel); where += ` AND TRIM(s.channel_name) = $${params.length}`
  } else if (channelGroup && channelGroup !== "All") {
    params.push(channelGroup); where += ` AND UPPER(s.group_name) = UPPER($${params.length})`
  }

  try {
    // Q1: staff-level aggregates (+ GP + per-group revenue để tính CM1)
    const summarySQL = `
      SELECT
        COALESCE(st.name, NULLIF(NULLIF(TRIM(f.staff_code), ''), 'NaN'), 'Chưa gán NV') AS staff_name,
        TRIM(f.staff_code) AS staff_code,
        SUM(f.${revCol}) AS total_revenue,
        SUM(CASE WHEN REPLACE(UPPER(TRIM(sk.vendor)), ' ', '') = '3HKDATAPOOL' THEN f.${revCol} ELSE 0 END) AS hk3_revenue,
        SUM(${gpCol}) AS gross_profit,
        SUM(CASE WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' THEN f.${revCol} ELSE 0 END) AS b2b_revenue,
        SUM(CASE WHEN UPPER(COALESCE(s.group_name,'')) = 'B2C' THEN f.${revCol} ELSE 0 END) AS b2c_revenue,
        COUNT(DISTINCT f.customer_code) AS customer_count,
        COUNT(DISTINCT f.order_code) AS total_orders
      FROM ${mainTable} f
      LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) sk ON TRIM(f.sku) = TRIM(sk.sku)
      ${where}
      GROUP BY COALESCE(st.name, NULLIF(NULLIF(TRIM(f.staff_code), ''), 'NaN'), 'Chưa gán NV'), TRIM(f.staff_code)
      ORDER BY total_revenue DESC
    `

    // Q2: monthly breakdown per staff (+ GP)
    const monthlySQL = `
      SELECT
        TRIM(f.staff_code) AS staff_code,
        TO_CHAR(f.${dateCol}::date, 'YYYY-MM') AS month,
        SUM(f.${revCol}) AS revenue,
        SUM(CASE WHEN REPLACE(UPPER(TRIM(sk.vendor)), ' ', '') = '3HKDATAPOOL' THEN f.${revCol} ELSE 0 END) AS hk3_revenue,
        SUM(${gpCol}) AS gross_profit
      FROM ${mainTable} f
      LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) sk ON TRIM(f.sku) = TRIM(sk.sku)
      ${where}
      GROUP BY TRIM(f.staff_code), TO_CHAR(f.${dateCol}::date, 'YYYY-MM')
      ORDER BY staff_code, month
    `

    // Q3: total B2B / B2C revenue toàn kỳ để phân bổ group costs
    const groupTotalSQL = `
      SELECT
        UPPER(COALESCE(s.group_name, 'OTHER')) AS grp,
        SUM(f.${revCol}) AS total_rev
      FROM ${mainTable} f
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
      ${where}
      GROUP BY 1
    `

    const months = startDate && endDate ? getMonthsInRange(startDate, endDate) : []

    const [summaryRows, monthlyRows, groupTotalRows, groupCostsRaw] = await Promise.all([
      queryAnalytics(summarySQL, params),
      queryAnalytics(monthlySQL, params),
      queryAnalytics(groupTotalSQL, params),
      months.length ? getGroupCostsForMonths(months) : Promise.resolve([]),
    ])

    // Tính tổng chi phí nhóm B2B / B2C theo kỳ (có pro-rata ratio)
    const groupCosts = groupCostsRaw as Array<{ group_name: string; month: string; amount: number }>
    let totalB2BCost = 0, totalB2CCost = 0
    for (const gc of groupCosts) {
      const ratio = getDaysInMonth(gc.month) > 0
        ? getDaysInRange(startDate, endDate, gc.month) / getDaysInMonth(gc.month) : 0
      if (gc.group_name === "B2B") totalB2BCost += gc.amount * ratio
      else if (gc.group_name === "B2C") totalB2CCost += gc.amount * ratio
    }

    // Tổng revenue B2B / B2C toàn hệ thống trong kỳ
    let sysTotalB2B = 0, sysTotalB2C = 0
    for (const r of groupTotalRows as any[]) {
      if (r.grp === "B2B") sysTotalB2B = Number(r.total_rev) || 0
      else if (r.grp === "B2C") sysTotalB2C = Number(r.total_rev) || 0
    }

    // Build monthly map
    const monthlyMap: Record<string, { month: string; revenue: number; hk3_revenue: number; gross_profit: number }[]> = {}
    for (const r of monthlyRows as any[]) {
      const code = r.staff_code || ""
      if (!monthlyMap[code]) monthlyMap[code] = []
      monthlyMap[code].push({
        month:        r.month,
        revenue:      Number(r.revenue) || 0,
        hk3_revenue:  Number(r.hk3_revenue) || 0,
        gross_profit: Number(r.gross_profit) || 0,
      })
    }

    const result = (summaryRows as any[]).map(r => {
      const rev    = Number(r.total_revenue) || 0
      const gp     = Number(r.gross_profit) || 0
      const b2bRev = Number(r.b2b_revenue) || 0
      const b2cRev = Number(r.b2c_revenue) || 0

      // Phân bổ chi phí nhóm theo tỷ lệ revenue
      const b2bShare = sysTotalB2B > 0 ? b2bRev / sysTotalB2B : 0
      const b2cShare = sysTotalB2C > 0 ? b2cRev / sysTotalB2C : 0
      const opCost   = b2bShare * totalB2BCost + b2cShare * totalB2CCost
      const cm1      = gp - opCost
      const cm1Pct   = rev > 0 ? (cm1 / rev) * 100 : 0

      return {
        staff_name:     r.staff_name,
        staff_code:     r.staff_code,
        total_revenue:  rev,
        hk3_revenue:    Number(r.hk3_revenue) || 0,
        gross_profit:   gp,
        cm1,
        cm1_pct:        cm1Pct,
        customer_count: Number(r.customer_count) || 0,
        total_orders:   Number(r.total_orders) || 0,
        monthly:        monthlyMap[r.staff_code] || [],
      }
    })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[staff-report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
