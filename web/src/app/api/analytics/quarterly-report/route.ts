import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, getAnalyticsSource, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN } from "@/lib/analytics-helpers"
import { fetchCosts, getDaysInMonth, getDaysInRange } from "@/lib/bod-data"

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

function getQuarterMonths(quarter: string, year: number): string[] {
  const q = parseInt(quarter.replace("Q", ""))
  const start = (q - 1) * 3 + 1
  return [0, 1, 2].map(i => {
    const m = start + i
    return `${year}-${String(m).padStart(2, "0")}`
  })
}

function computeChannelCost(
  channelCosts: any[], channel: string, month: string,
  revenue: number, startD: string, endD: string,
): number {
  let cost = 0
  channelCosts.filter(c => c.channel === channel && c.month === month).forEach(c => {
    const dim = getDaysInMonth(month)
    const ratio = dim > 0 ? getDaysInRange(startD, endD, month) / dim : 0
    COST_KEYS.forEach(key => {
      const v = (c as any)[key]
      if (v) cost += v.type === "amount" ? (v.value || 0) * ratio : (revenue * (v.value || 0)) / 100
    })
  })
  return cost
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const { searchParams } = req.nextUrl
  const today = new Date()
  const year = parseInt(searchParams.get("year") || String(today.getFullYear()))
  const quarter = searchParams.get("quarter") || `Q${Math.ceil((today.getMonth() + 1) / 3)}`
  const dateColumn = searchParams.get("dateColumn") || "fulfiled_date"
  const companyCode = searchParams.get("companyCode") || "ALL"

  const source = getAnalyticsSource(dateColumn)
  const months = getQuarterMonths(quarter, year)
  const todayStr = today.toISOString().split("T")[0]

  const qStartDate = `${months[0]}-01`
  const lastMonth = months[2]
  const lastMonthEndDate = new Date(parseInt(lastMonth.split("-")[0]), parseInt(lastMonth.split("-")[1]), 0)
  const qEndDate = lastMonthEndDate < today ? lastMonthEndDate.toISOString().split("T")[0] : todayStr

  if (new Date(qStartDate) > today) {
    return NextResponse.json({ quarter, year, months, summary: [], b2bChannels: [], b2cChannels: [] }, { headers: CACHE_HEADERS })
  }

  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""
  const cacheKey = `qreport:${quarter}:${year}:${dateColumn}:${companyCode}:${todayStr}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const [groupRows, channelRows] = await Promise.all([
        queryAnalytics<{ month: string; bg: string; revenue: string; gp: string }>(`
          SELECT
            TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
            UPPER(COALESCE(s.group_name, 'OTHER')) as bg,
            SUM(f.${source.revenueCol}) as revenue,
            SUM(f.${source.marginCol}) as gp
          FROM ${source.mainTable} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE f.${source.dateCol}::date >= '${qStartDate}'
            AND f.${source.dateCol}::date <= '${qEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, 'OTHER')) IN ('B2B', 'B2C')
          GROUP BY 1, 2
          ORDER BY 1, 2
        `),
        queryAnalytics<{ month: string; bg: string; channel: string; revenue: string; gp: string }>(`
          SELECT
            TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
            UPPER(COALESCE(s.group_name, 'OTHER')) as bg,
            TRIM(s.channel_name) as channel,
            SUM(f.${source.revenueCol}) as revenue,
            SUM(f.${source.marginCol}) as gp
          FROM ${source.mainTable} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE f.${source.dateCol}::date >= '${qStartDate}'
            AND f.${source.dateCol}::date <= '${qEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, 'OTHER')) IN ('B2B', 'B2C')
            AND s.channel_name IS NOT NULL AND TRIM(s.channel_name) != ''
          GROUP BY 1, 2, 3
          ORDER BY 1, 2, 3
        `),
      ])

      const { channelCosts, groupCosts } = await fetchCosts(months)

      // Metadata per month: projection factor, date ranges
      const monthMeta = months.map(m => {
        const mStart = `${m}-01`
        const mEndDate = new Date(parseInt(m.split("-")[0]), parseInt(m.split("-")[1]), 0)
        const mEnd = mEndDate.toISOString().split("T")[0]
        const actualEnd = mEnd < todayStr ? mEnd : todayStr
        const dim = getDaysInMonth(m)
        const isFuture = new Date(mStart) > today
        const isCurrent = !isFuture && mEndDate >= today
        const elapsed = isFuture ? 0 : getDaysInRange(mStart, actualEnd, m)
        const isProjected = isCurrent && elapsed > 0 && elapsed < dim
        const factor = isProjected ? dim / elapsed : 1
        return { month: m, mStart, mEnd, actualEnd, dim, elapsed, isProjected, factor, isFuture }
      })

      const pct = (num: number, den: number) => den > 0 ? Math.round(num / den * 1000) / 10 : 0
      const r = Math.round

      // Summary table
      const summary = monthMeta.filter(mr => !mr.isFuture).map(mr => {
        const { month, mStart, actualEnd, isProjected, factor } = mr

        const b2bR = groupRows.find(row => row.month === month && row.bg === "B2B")
        const b2cR = groupRows.find(row => row.month === month && row.bg === "B2C")

        const b2bRevAct = parseFloat(b2bR?.revenue || "0")
        const b2bGpAct  = parseFloat(b2bR?.gp      || "0")
        const b2cRevAct = parseFloat(b2cR?.revenue  || "0")
        const b2cGpAct  = parseFloat(b2cR?.gp       || "0")

        // Channel costs summed per business group
        let b2bCCAct = 0, b2cCCAct = 0
        channelRows.filter(row => row.month === month).forEach(row => {
          const rev = parseFloat(row.revenue || "0")
          const cc = computeChannelCost(channelCosts, row.channel, month, rev, mStart, actualEnd)
          if (row.bg === "B2B") b2bCCAct += cc
          else b2cCCAct += cc
        })

        // Group-level costs: full monthly budget
        const b2bGC = groupCosts.filter(c => c.group_name === "B2B" && c.month === month).reduce((s, c) => s + c.amount, 0)
        const b2cGC = groupCosts.filter(c => c.group_name === "B2C" && c.month === month).reduce((s, c) => s + c.amount, 0)

        const b2bRev = r(b2bRevAct * factor); const b2bGp = r(b2bGpAct * factor)
        const b2cRev = r(b2cRevAct * factor); const b2cGp = r(b2cGpAct * factor)
        // Channel cost scales with revenue (percent-type) or stays constant (amount-type, cancelled by factor math)
        const b2bCC = r(isProjected ? b2bCCAct * factor : b2bCCAct)
        const b2cCC = r(isProjected ? b2cCCAct * factor : b2cCCAct)
        // Group cost: full monthly budget (already committed)
        const b2bCm1 = b2bGp - b2bCC - b2bGC
        const b2cCm1 = b2cGp - b2cCC - b2cGC

        const totRev = b2bRev + b2cRev; const totGp = b2bGp + b2cGp
        const totCC  = b2bCC  + b2cCC;  const totGC  = b2bGC  + b2cGC
        const totCm1 = b2bCm1 + b2cCm1

        const row = (rev: number, gp: number, cc: number, gc: number, cm1: number) => ({
          revenue: rev, gp, gpPct: pct(gp, rev),
          channelCost: cc, groupCost: gc,
          cm1, cm1Pct: pct(cm1, rev),
        })

        return {
          month,
          isProjected,
          factor: isProjected ? Math.round(factor * 100) / 100 : 1,
          elapsed: mr.elapsed,
          dim: mr.dim,
          total: row(totRev, totGp, totCC, totGC, totCm1),
          b2b:   row(b2bRev, b2bGp, b2bCC, b2bGC, b2bCm1),
          b2c:   row(b2cRev, b2cGp, b2cCC, b2cGC, b2cCm1),
        }
      })

      // Quarter totals (sum of all non-projected months + projected for current)
      const qtotals = summary.reduce(
        (acc, m) => ({
          revenue: acc.revenue + m.total.revenue,
          gp: acc.gp + m.total.gp,
          channelCost: acc.channelCost + m.total.channelCost,
          groupCost: acc.groupCost + m.total.groupCost,
          cm1: acc.cm1 + m.total.cm1,
        }),
        { revenue: 0, gp: 0, channelCost: 0, groupCost: 0, cm1: 0 },
      )
      const quarterTotal = {
        revenue: qtotals.revenue,
        gp: qtotals.gp,
        gpPct: pct(qtotals.gp, qtotals.revenue),
        channelCost: qtotals.channelCost,
        groupCost: qtotals.groupCost,
        cm1: qtotals.cm1,
        cm1Pct: pct(qtotals.cm1, qtotals.revenue),
      }

      // Channel breakdown per business group
      const buildChannels = (bg: "B2B" | "B2C") => {
        const chs = [...new Set(channelRows.filter(r => r.bg === bg).map(r => r.channel))].filter(Boolean)
        return chs.map(ch => {
          let totalRevenue = 0
          const chMonths = monthMeta.filter(mr => !mr.isFuture).map((mr, i) => {
            const { month, mStart, actualEnd, isProjected, factor } = mr
            const rowData = channelRows.find(r => r.channel === ch && r.month === month && r.bg === bg)
            const revAct = parseFloat(rowData?.revenue || "0")
            const gpAct  = parseFloat(rowData?.gp      || "0")
            const ccAct  = rowData ? computeChannelCost(channelCosts, ch, month, revAct, mStart, actualEnd) : 0
            const rev = r(revAct * factor)
            const gp  = r(gpAct  * factor)
            const cc  = r(isProjected ? ccAct * factor : ccAct)
            const cm1 = gp - cc
            totalRevenue += rev
            return { month, revenue: rev, gp, channelCost: cc, cm1, cm1Pct: pct(cm1, rev), _i: i }
          })
          const withMom = chMonths.map((m, i) => {
            const prev = chMonths[i - 1]
            const momPct = prev && prev.revenue > 0
              ? Math.round((m.revenue - prev.revenue) / prev.revenue * 1000) / 10
              : null
            const { _i, ...rest } = m
            return { ...rest, momPct }
          })
          return { name: ch, totalRevenue, months: withMom }
        })
          .filter(ch => ch.totalRevenue > 0)
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
      }

      return {
        quarter, year, months,
        summary,
        quarterTotal,
        b2bChannels: buildChannels("B2B"),
        b2cChannels: buildChannels("B2C"),
      }
    }, QUERY_TTL_MIN)

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[quarterly-report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
