import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import {
  getAnalyticsSource, getDateFilter, getSkuDestinationRule, getDestinationSQL,
  getCountryMappings, getBODFilters, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard,
} from "@/lib/analytics-helpers"

// Port intel /api/analytics/b2c/performance (fetchB2CPerformanceData). GroupBy: channel/sku/vendor/destination/
// staff/customer. gpm2 = margin − op-cost (chỉ khi groupBy channel, từ analytics_channel_costs prorate ngày).
// projected_* khi end ∈ tháng hiện tại. prev_revenue khi comparisonType != none.

function getDaysInMonth(month: string) {
  const d = new Date(`${month}-01`)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}
function getDaysInRange(startDate: string, endDate: string, month: string) {
  const rangeStart = new Date(startDate); const rangeEnd = new Date(endDate)
  const mStart = new Date(`${month}-01`); const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0)
  const iStart = rangeStart > mStart ? rangeStart : mStart
  const iEnd = rangeEnd < mEnd ? rangeEnd : mEnd
  return iStart <= iEnd ? Math.ceil((iEnd.getTime() - iStart.getTime()) / 86400000) + 1 : 0
}
const parseJson = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : (v || {}) } catch { return {} } }

async function fetchB2CPerformanceData(startDate: string, endDate: string, groupBy: string, advancedFilter: string, dateColumn: string) {
  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate, endDate, source.dateCol)

  let selectClause = "data.channel_name as name"
  let joinClause = ""
  if (groupBy === "vendor") {
    selectClause = "v.vendor as name"; joinClause = "LEFT JOIN dim_sku v ON data.sku = v.sku"
  } else if (groupBy === "destination") {
    const rule = await getSkuDestinationRule()
    selectClause = `${getDestinationSQL(rule).replace(/f\./g, "data.")} as name`
  } else if (groupBy === "sku") {
    selectClause = "data.sku as name"
  } else if (groupBy === "staff") {
    selectClause = "COALESCE(st.name, NULLIF(TRIM(data.staff_code), ''), 'Unknown') as name"
    joinClause = "LEFT JOIN dim_staff st ON TRIM(data.staff_code) = TRIM(st.code)"
  } else if (groupBy === "customer") {
    selectClause = "COALESCE(c.name, NULLIF(TRIM(data.customer_code), ''), 'Unknown') as name"
    joinClause = "LEFT JOIN dim_customer c ON TRIM(data.customer_code) = TRIM(c.code)"
  }

  const rows = await queryAnalytics<Record<string, string>>(
    `WITH b2c_data AS (
       SELECT f.*, TRIM(s.channel_name) as channel_name
       FROM ${source.mainTable} f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE UPPER(s.group_name) = 'B2C' AND ${filter} ${advancedFilter}
     )
     SELECT ${selectClause},
       TO_CHAR(data.${source.dateCol}::DATE, 'YYYY-MM') as month,
       SUM(data.${source.revenueCol}) as revenue,
       SUM(data.${source.marginCol}) as margin,
       SUM(data.${source.quantityCol}) as units
     FROM b2c_data data ${joinClause}
     GROUP BY 1, 2`
  )

  const aggregated = new Map<string, any>()
  rows.forEach(r => {
    const key = r.name
    if (!aggregated.has(key)) aggregated.set(key, { name: key, revenue: 0, margin: 0, units: 0, monthly_data: [] })
    const item = aggregated.get(key)
    item.revenue += parseFloat(r.revenue || "0")
    item.margin += parseFloat(r.margin || "0")
    item.units += parseFloat(r.units || "0")
    item.monthly_data.push(r)
  })

  let finalRows = Array.from(aggregated.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 50)

  if (groupBy === "destination") {
    const mappings = await getCountryMappings()
    finalRows = finalRows.map(r => ({ ...r, name: mappings[r.name] || r.name }))
  }

  let channelCosts: any[] = []
  const isChannelGroup = groupBy === "channel" || !groupBy
  if (isChannelGroup) {
    const start = new Date(startDate); const end = new Date(endDate)
    const months: string[] = []; let curr = new Date(start.getFullYear(), start.getMonth(), 1)
    while (curr <= end) { months.push(curr.toISOString().slice(0, 7)); curr.setMonth(curr.getMonth() + 1) }
    if (months.length > 0) {
      const { data } = await supabaseAdmin.from("analytics_channel_costs").select("channel, month, ads, platform_fee, sponsor_products, media").in("month", months)
      channelCosts = (data || []).map((r: any) => ({
        channel: r.channel, month: r.month,
        ads: parseJson(r.ads), platformFee: parseJson(r.platform_fee), sponsorProducts: parseJson(r.sponsor_products), media: parseJson(r.media),
      }))
    }
  }

  return finalRows.map(r => {
    const revenue = r.revenue; const margin = r.margin
    let gpm2 = margin
    if (isChannelGroup) {
      r.monthly_data.forEach((monthRow: any) => {
        const mRev = parseFloat(monthRow.revenue || "0")
        const ratio = getDaysInMonth(monthRow.month) > 0 ? getDaysInRange(startDate, endDate, monthRow.month) / getDaysInMonth(monthRow.month) : 0
        channelCosts.filter(c => c.channel === r.name && c.month === monthRow.month).forEach(c => {
          ;["ads", "platformFee", "sponsorProducts", "media"].forEach(key => {
            const v = c[key]; if (v) gpm2 -= v.type === "amount" ? (v.value || 0) * ratio : (mRev * (v.value || 0)) / 100
          })
        })
      })
    }

    let projected_revenue = revenue; let projected_margin = margin; let projected_gpm2 = gpm2
    const end = new Date(endDate); const now = new Date()
    const isCurrentMonth = end.getFullYear() === now.getFullYear() && end.getMonth() === now.getMonth()
    if (isCurrentMonth) {
      const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const daysElapsed = end.getDate()
      const projectionRatio = daysElapsed > 0 ? totalDaysInMonth / daysElapsed : 1
      projected_revenue = revenue * projectionRatio
      projected_margin = margin * projectionRatio
      if (isChannelGroup) {
        projected_gpm2 = projected_margin
        r.monthly_data.forEach((monthRow: any) => {
          channelCosts.filter(c => c.channel === r.name && c.month === monthRow.month).forEach(c => {
            ;["ads", "platformFee", "sponsorProducts", "media"].forEach(key => {
              const v = c[key]; if (v) projected_gpm2 -= v.type === "amount" ? (v.value || 0) : (projected_revenue * (v.value || 0)) / 100
            })
          })
        })
      } else {
        projected_gpm2 = gpm2 * projectionRatio
      }
    }

    return {
      name: r.name, revenue, projected_revenue, margin, projected_margin, units: r.units,
      margin_percent: revenue > 0 ? (margin / revenue) * 100 : 0,
      gpm2, projected_gpm2, gpm2_percent: revenue > 0 ? (gpm2 / revenue) * 100 : 0,
    }
  })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate      = searchParams.get("startDate")
  const endDate        = searchParams.get("endDate")
  const dateColumn     = searchParams.get("dateColumn") || "fulfiled_date"
  const groupBy        = searchParams.get("groupBy") || "channel"
  const comparisonType = searchParams.get("comparisonType") || "none"
  if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })

  const advancedFilter = getBODFilters(searchParams)

  try {
    const key = `b2c-perf:${dateColumn}:${startDate}:${endDate}:${groupBy}:${comparisonType}:${advancedFilter}`
    const payload = await cachedQuery(key, async () => {
      const current = await fetchB2CPerformanceData(startDate, endDate, groupBy, advancedFilter, dateColumn)
      if (comparisonType === "none") return current

      const start = new Date(startDate); const end = new Date(endDate)
      let prevStart: Date, prevEnd: Date
      if (comparisonType === "previous_period") {
        const diff = end.getTime() - start.getTime()
        prevEnd = new Date(start.getTime() - 86400000)
        prevStart = new Date(prevEnd.getTime() - diff)
      } else {
        prevStart = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate())
        prevEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate())
      }
      const previous = await fetchB2CPerformanceData(prevStart.toISOString().split("T")[0], prevEnd.toISOString().split("T")[0], groupBy, advancedFilter, dateColumn)
      return current.map(curr => ({ ...curr, prev_revenue: previous.find(p => p.name === curr.name)?.revenue || 0 }))
    }, QUERY_TTL_MIN)

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2c/performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
