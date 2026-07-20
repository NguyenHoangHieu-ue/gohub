import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { tursoQuery } from "@/lib/turso"
import { getDateFilter, getSkuDestinationRule, getDestinationSQL, cachedQuery, CACHE_HEADERS, analyticsGuard } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const companyCode = searchParams.get("companyCode") || "ALL"
  const cacheKey    = `region-chart:${startDate}:${endDate}:${companyCode}`

  const filter = getDateFilter(startDate, endDate, "fulfiled_date", "30 days", companyCode)

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const rule    = await getSkuDestinationRule()
      const destSQL = getDestinationSQL(rule)

      const rows = await queryAnalytics<{ region_code: string; revenue: string }>(
        `WITH filtered_f AS (
           SELECT sku, fulfilled_revenue_amount_vnd
           FROM fact_fulfillment_revenue f WHERE ${filter}
         )
         SELECT ${destSQL} as region_code,
                SUM(fulfilled_revenue_amount_vnd) as revenue
         FROM filtered_f f
         GROUP BY 1 ORDER BY revenue DESC LIMIT 15`
      )

      // Map codes to names via Turso country_codes (332 rows, accurate)
      let nameMap: Record<string, string> = {}
      try {
        const countryRows = await tursoQuery<{ code: string; country: string }>(
          "SELECT code, country FROM country_codes"
        )
        countryRows.forEach(r => { nameMap[String(r.code).toUpperCase()] = String(r.country) })
      } catch {}

      return rows.map(r => ({
        region:  nameMap[r.region_code] || r.region_code || "Unknown",
        revenue: parseFloat(r.revenue || "0"),
        code:    r.region_code,
      }))
    })

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/region-chart]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
