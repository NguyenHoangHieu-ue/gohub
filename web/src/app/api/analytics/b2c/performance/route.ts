import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, getSkuDestinationRule, getDestinationSQL,
  getCountryMappings, getBODFilters, shipFilter, internalOpsFilter, excludeOpsByCode,
  getDaysInMonth, getDaysInRange,
  CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache,
} from "@/lib/analytics-helpers"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { getProjectionFactor } from "@/lib/analytics-engine/projection"
import { fetchCosts, matchChannelCost } from "@/lib/bod-data"

// Cùng logic CM1 với quarterly-report: fetchCosts + matchChannelCost (source_code + sub-channel + exact name).
// Group cost KHÔNG phân bổ per-channel — FE trừ ở total row từ groupCosts state.

const COST_KEYS_CH = ["ads", "platformFee", "sponsorProducts", "media"] as const

function computeChCost(
  channelCosts: any[], channel: string, month: string,
  revenue: number, startDate: string, endDate: string,
  sourceCode?: string, projected = false,
): number {
  let amtCost = 0, pctCost = 0
  const dim = getDaysInMonth(month)
  const ratio = projected ? 1 : (dim > 0 ? getDaysInRange(startDate, endDate, month) / dim : 0)
  matchChannelCost(channelCosts, channel, month, sourceCode).forEach((c: any) => {
    COST_KEYS_CH.forEach(key => {
      const v = c[key]; if (!v) return
      if (v.type === "amount") amtCost += (v.value || 0) * ratio
      else pctCost += revenue * (v.value || 0) / 100
    })
  })
  return amtCost + pctCost
}

async function fetchB2CPerformanceData(startDate: string, endDate: string, groupBy: string, advancedFilter: string, dateColumn: string, sfx = "") {
  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate, endDate, source.dateCol)
  const isChannelGroup = groupBy === "channel" || !groupBy

  let selectClause = `data.channel_name as name${isChannelGroup ? ", MIN(data.order_source_code) as source_code" : ""}`
  let joinClause = ""
  if (groupBy === "vendor") {
    selectClause = "v.vendor as name"; joinClause = "LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) v ON data.sku = v.sku"
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

  const withMarket = groupBy === "customer"
  const marketSelect = withMarket ? ", COALESCE(data.company_code, 'NA') as market" : ""
  const groupByCols  = withMarket ? "1, 2, 3" : "1, 2"

  const rows = await queryAnalytics<Record<string, string>>(
    `WITH b2c_data AS (
       SELECT f.*, TRIM(s.channel_name) as channel_name
       FROM ${source.mainTable} f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE UPPER(s.group_name) = 'B2C' AND ${filter} ${advancedFilter} ${sfx}
     )
     SELECT ${selectClause}${marketSelect},
       TO_CHAR(data.${source.dateCol}::DATE, 'YYYY-MM') as month,
       SUM(data.${source.revenueCol}) as revenue,
       SUM(data.${source.marginCol}) as margin,
       SUM(data.${source.quantityCol}) as units
     FROM b2c_data data ${joinClause}
     GROUP BY ${groupByCols}`
  )

  const aggregated = new Map<string, any>()
  rows.forEach(r => {
    const key = r.name
    if (!aggregated.has(key)) aggregated.set(key, { name: key, revenue: 0, margin: 0, units: 0, revenueVn: 0, revenueUs: 0, monthly_data: [] })
    const item = aggregated.get(key)
    const rev = parseFloat(r.revenue || "0")
    item.revenue += rev
    item.margin += parseFloat(r.margin || "0")
    item.units += parseFloat(r.units || "0")
    if (withMarket) {
      if (r.market === "VN") item.revenueVn += rev
      else if (r.market === "US") item.revenueUs += rev
    }
    item.monthly_data.push(r)
  })

  let finalRows = Array.from(aggregated.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 50)

  if (groupBy === "destination") {
    const mappings = await getCountryMappings()
    finalRows = finalRows.map(r => ({ ...r, name: mappings[r.name] || r.name }))
  }

  // Dùng fetchCosts + matchChannelCost từ bod-data.ts (cùng logic với quarterly-report).
  // source_code trong monthly_data giúp matchChannelCost tìm đúng cost kể cả khi channel đổi tên.
  let channelCosts: any[] = []
  if (isChannelGroup) {
    const start = new Date(startDate); const end = new Date(endDate)
    const months: string[] = []; let curr = new Date(start.getFullYear(), start.getMonth(), 1)
    while (curr <= end) { months.push(curr.toISOString().slice(0, 7)); curr.setMonth(curr.getMonth() + 1) }
    if (months.length > 0) {
      const fetched = await fetchCosts(months)
      channelCosts = fetched.channelCosts
    }
  }

  const channelRows = finalRows.map(r => {
    const revenue = r.revenue; const margin = r.margin
    let gpm2 = margin
    if (isChannelGroup) {
      r.monthly_data.forEach((monthRow: any) => {
        const mRev = parseFloat(monthRow.revenue || "0")
        const cc = computeChCost(channelCosts, r.name, monthRow.month, mRev, startDate, endDate, monthRow.source_code)
        gpm2 -= cc
      })
    }

    let projected_revenue = revenue; let projected_margin = margin; let projected_gpm2 = gpm2
    const projFactor = getProjectionFactor(startDate, endDate)
    if (projFactor > 1) {
      projected_revenue = revenue * projFactor
      projected_margin = margin * projFactor
      if (isChannelGroup) {
        projected_gpm2 = projected_margin
        r.monthly_data.forEach((monthRow: any) => {
          // projected: amount type không nhân ratio (full month budget)
          const cc = computeChCost(channelCosts, r.name, monthRow.month, projected_revenue, startDate, endDate, monthRow.source_code, true)
          projected_gpm2 -= cc
        })
      } else {
        const opCostFixed = margin - gpm2
        projected_gpm2 = projected_margin - opCostFixed
      }
    }

    return {
      name: r.name, revenue, projected_revenue, margin, projected_margin, units: r.units,
      margin_percent: revenue > 0 ? (margin / revenue) * 100 : 0,
      gpm2, projected_gpm2, gpm2_percent: revenue > 0 ? (gpm2 / revenue) * 100 : 0,
      ...(withMarket ? { revenueVn: r.revenueVn || 0, revenueUs: r.revenueUs || 0 } : {}),
    }
  })

  return channelRows
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
  const includeShip        = searchParams.get("includeShip")        === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"
  const includeOpsCustomers = searchParams.get("includeOpsCustomers") === "1"
  if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })

  const advancedFilter = getBODFilters(searchParams)

  try {
    const { excludedCustomers } = includeOpsCustomers ? { excludedCustomers: [] } : await fetchQuarterlySettings()
    const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)} ${excludeOpsByCode(excludedCustomers)}`
    const key = `b2c-perf:v3:${dateColumn}:${startDate}:${endDate}:${groupBy}:${comparisonType}:${advancedFilter}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${includeOpsCustomers ? 1 : 0}`
    const payload = await cachedQuery(key, async () => {
      if (comparisonType === "none") {
        return await fetchB2CPerformanceData(startDate, endDate, groupBy, advancedFilter, dateColumn, sfx)
      }

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
      const [current, previous] = await Promise.all([
        fetchB2CPerformanceData(startDate, endDate, groupBy, advancedFilter, dateColumn, sfx),
        fetchB2CPerformanceData(prevStart.toISOString().split("T")[0], prevEnd.toISOString().split("T")[0], groupBy, advancedFilter, dateColumn, sfx),
      ])
      return current.map((curr: any) => ({ ...curr, prev_revenue: previous.find((p: any) => p.name === curr.name)?.revenue || 0 }))
    }, QUERY_TTL_MIN, noCache(req))

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2c/performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
