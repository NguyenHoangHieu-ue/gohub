import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, shipFilter, getMonthsInRange,
  CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache,
} from "@/lib/analytics-helpers"
import { getSafeReportDate } from "@/lib/analytics-engine/date-math"
import { fetchEcomCosts, ecomCostKey } from "@/lib/b2b-ecom-cost"
import { buildPeriods, periodsRange, buildTimeline, type DayRow, type Granularity } from "@/lib/b2b-ecom-timeline"

// VN Ecom theo thời gian: Tháng (Jan → hiện tại) / Tuần trong 1 tháng / Quý. SQL chỉ lấy số theo NGÀY (cache),
// gom kỳ + Est. + CH.Cost làm ở `lib/b2b-ecom-timeline.ts` — CH.Cost đọc tươi từ Turso nên sửa cost là lên ngay.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const sp = req.nextUrl.searchParams
  const g = (["month", "week", "quarter"].includes(sp.get("granularity") || "") ? sp.get("granularity") : "month") as Granularity
  const asOf = getSafeReportDate(1)
  const year = parseInt(sp.get("year") || asOf.slice(0, 4), 10)
  const month = Math.min(12, Math.max(1, parseInt(sp.get("month") || asOf.slice(5, 7), 10)))
  const dateColumn = sp.get("dateColumn") || "fulfiled_date"
  const includeShip = sp.get("includeShip") !== "0"
  if (!Number.isFinite(year) || year < 2020 || year > 2100) return NextResponse.json({ error: "year không hợp lệ" }, { status: 400 })

  const periods = buildPeriods(g, year, month, asOf)
  const range = periodsRange(periods, asOf)
  const headers = noCache(req) ? { "Cache-Control": "no-store" } : CACHE_HEADERS
  if (!range) return NextResponse.json({ granularity: g, year, month, asOf, periods: [], rows: [], totals: null }, { headers })

  try {
    const source = getAnalyticsSource(dateColumn)
    const filter = getDateFilter(range.start, range.end, source.dateCol)
    const key = `b2b-ecom-tl1:${dateColumn}:${includeShip ? 1 : 0}:${range.start}:${range.end}`
    const dayRows = await cachedQuery(key, () => queryAnalytics<DayRow>(
      `SELECT c.name AS customer_name, ds.type_of_sim AS sim_type, st.name AS staff_name,
              TO_CHAR(f.${source.dateCol}::DATE, 'YYYY-MM-DD') AS d,
              SUM(f.${source.revenueCol}) AS revenue, SUM(f.${source.marginCol}) AS margin,
              SUM(f.${source.quantityCol}) AS units, COUNT(*) AS orders
       FROM ${source.mainTable} f
       JOIN dim_customer c ON f.customer_code = c.code
       LEFT JOIN dim_sku ds ON f.sku = ds.sku
       LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
       WHERE c.name ILIKE 'VN Ecom %' AND ${filter} ${shipFilter(includeShip)}
       GROUP BY 1, 2, 3, 4`,
    ), QUERY_TTL_MIN, noCache(req), ["b2b-ecom"])

    const costs = await fetchEcomCosts(getMonthsInRange(range.start, range.end))
    const tl = buildTimeline(dayRows, periods, asOf, (m, c, s, sub) => costs.get(ecomCostKey(m, c, s, sub)))
    return NextResponse.json({ granularity: g, year, month, asOf, periods, ...tl }, { headers })
  } catch (err: any) {
    console.error("[analytics/b2b/ecom-timeline]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
