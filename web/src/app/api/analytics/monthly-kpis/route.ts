import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, getAnalyticsSource, getStrategicPartnersList, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
}
function daysInMonth(m: string) {
  const d = new Date(`${m}-01`)
  return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const companyCode = req.nextUrl.searchParams.get("companyCode") || "ALL"
  const dateColumn  = req.nextUrl.searchParams.get("dateColumn")  || "fulfiled_date"
  const source = getAnalyticsSource(dateColumn)

  const today = new Date()
  // Hiển thị 3 tháng: tháng trước tháng trước, tháng trước, tháng hiện tại
  const months = [-2, -1, 0].map(off => {
    const d = new Date(today.getFullYear(), today.getMonth() + off, 1)
    return getMonthStr(d)
  })

  const startDate = months[0] + "-01"
  const endDate   = today.toISOString().split("T")[0]
  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""

  const cacheKey = `monthly-kpis:${companyCode}:${dateColumn}:${endDate}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      // Query 1: Revenue, GP, 3HK revenue per month
      const rows = await queryAnalytics<{ month: string; revenue: string; gp: string; hk3: string }>(`
        SELECT
          TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
          SUM(f.${source.revenueCol}) as revenue,
          SUM(f.${source.marginCol}) as gp,
          SUM(CASE WHEN TRIM(f.sku) IN (
                SELECT DISTINCT TRIM(sku) FROM dim_sku
                WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
              ) THEN f.${source.revenueCol} ELSE 0 END) as hk3
        FROM ${source.mainTable} f
        WHERE f.${source.dateCol}::date >= '${startDate}'
          AND f.${source.dateCol}::date <= '${endDate}'
          ${companyFilter}
        GROUP BY 1 ORDER BY 1
      `)

      // Query 2: Strategic channel revenue per month
      const strategicList = await getStrategicPartnersList()
      let chanRows: any[] = []
      if (strategicList !== "''") {
        chanRows = await queryAnalytics(`
          SELECT
            TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
            TRIM(s.channel_name) as channel,
            SUM(f.${source.revenueCol}) as revenue
          FROM ${source.mainTable} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE f.${source.dateCol}::date >= '${startDate}'
            AND f.${source.dateCol}::date <= '${endDate}'
            AND s.channel_name ILIKE ANY(ARRAY[${strategicList}]::text[])
            ${companyFilter}
          GROUP BY 1, 2 ORDER BY 1, 3 DESC
        `)
      }

      // Supabase: group costs per month (B2B + B2C — full month budget)
      const { data: gcData } = await supabaseAdmin
        .from("analytics_channel_group_costs")
        .select("group_name, month, amount")
        .in("month", months)
      const groupCosts = (gcData || []) as { group_name: string; month: string; amount: string }[]

      // Build summary per month
      const summary = months.map(m => {
        const row = rows.find(r => r.month === m)
        const revenue = parseFloat(row?.revenue || "0")
        const gp      = parseFloat(row?.gp      || "0")
        const hk3     = parseFloat(row?.hk3     || "0")

        // Op cost = sum of group costs for this month (full monthly budget)
        const totalOpCost = groupCosts
          .filter(c => c.month === m)
          .reduce((s, c) => s + parseFloat(c.amount || "0"), 0)

        // Projection for current month
        const mDate = new Date(`${m}-01`)
        const isCurrent = mDate.getFullYear() === today.getFullYear() && mDate.getMonth() === today.getMonth()
        const dim = daysInMonth(m)
        const elapsed = isCurrent ? today.getDate() : dim
        const factor = (isCurrent && elapsed < dim) ? dim / elapsed : 1
        const isProjected = factor > 1

        // Actual CM1 (op cost prorated for partial month)
        const actualOpCost = isProjected ? totalOpCost * (elapsed / dim) : totalOpCost
        const cm1 = gp - actualOpCost

        // Projected (current month only)
        const projRevenue = Math.round(revenue * factor)
        const projGp      = Math.round(gp * factor)
        const projCm1     = isProjected ? Math.round(projGp - totalOpCost) : Math.round(cm1)
        const projHk3     = Math.round(hk3 * factor)

        const [y, mo] = m.split("-")
        return {
          month: m,
          label: `T${parseInt(mo)}`,
          year:  parseInt(y),
          isProjected,
          factor: isProjected ? Math.round(factor * 100) / 100 : 1,
          // Display values (projected for current month, actual for past)
          revenue:    isProjected ? projRevenue : Math.round(revenue),
          grossMargin:isProjected ? projGp      : Math.round(gp),
          cm1:        projCm1,
          cm1Pct:     projRevenue > 0 ? Math.round(projCm1 / projRevenue * 1000) / 10 : 0,
          hk3Revenue: isProjected ? projHk3     : Math.round(hk3),
          hk3Pct:     projRevenue > 0 ? Math.round(projHk3 / projRevenue * 1000) / 10 : 0,
          // Actual values (for tooltip)
          actualRevenue:    Math.round(revenue),
          actualGrossMargin:Math.round(gp),
          actualCm1:        Math.round(cm1),
          actualHk3:        Math.round(hk3),
        }
      })

      // Build channel data (top strategic channels by total revenue)
      const channelNames = [...new Set(chanRows.map((r: any) => r.channel))]
      const channels = channelNames.map(ch => {
        const monthData = months.map(m => {
          const r = chanRows.find((row: any) => row.channel === ch && row.month === m)
          const rev = parseFloat(r?.revenue || "0")
          // Apply projection for current month
          const sum = summary.find(s => s.month === m)
          const projected = sum?.isProjected ? Math.round(rev * (sum?.factor ?? 1)) : Math.round(rev)
          return { month: m, revenue: projected, actualRevenue: Math.round(rev) }
        })
        const total = monthData.reduce((s, m) => s + m.revenue, 0)
        return { name: ch, months: monthData, totalRevenue: total }
      })
        .filter(c => c.totalRevenue > 0)
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 12)

      return { summary, channels }
    }, QUERY_TTL_MIN)

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/monthly-kpis]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
