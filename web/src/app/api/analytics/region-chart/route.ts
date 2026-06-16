import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getDateFilter, getSkuDestinationRule, getDestinationSQL } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const companyCode = searchParams.get("companyCode") || undefined

  const filter = getDateFilter(startDate, endDate, "fulfiled_date", "30 days", companyCode)

  try {
    const rule   = await getSkuDestinationRule()
    const destSQL = getDestinationSQL(rule)

    const rows = await queryAnalytics<{ region_code: string; revenue: string }>(
      `WITH filtered_f AS (
         SELECT sku, fulfilled_revenue_amount_vnd
         FROM fact_fulfillment_revenue f WHERE ${filter}
       )
       SELECT ${destSQL} as region_code,
              SUM(fulfilled_revenue_amount_vnd) as revenue
       FROM filtered_f f
       GROUP BY 1
       ORDER BY revenue DESC
       LIMIT 15`
    )

    // Try to get country names from dim_location
    const codeList = rows.map(r => `'${r.region_code}'`).join(",")
    let nameMap: Record<string, string> = {}
    if (codeList) {
      try {
        const nameRows = await queryAnalytics<{ code: string; name: string }>(
          `SELECT UPPER(iso_code_3) as code, country_name as name
           FROM dim_location
           WHERE UPPER(iso_code_3) IN (${codeList})
           LIMIT 50`
        )
        nameRows.forEach(r => { nameMap[r.code] = r.name })
      } catch {}
    }

    return NextResponse.json(rows.map(r => ({
      region:  nameMap[r.region_code] || r.region_code || "Unknown",
      revenue: parseFloat(r.revenue || "0"),
      code:    r.region_code,
    })))
  } catch (err: any) {
    console.error("[analytics/region-chart]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
