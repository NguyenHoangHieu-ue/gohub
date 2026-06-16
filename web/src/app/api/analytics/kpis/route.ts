import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getPrevDateFilter, cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn") || "fulfiled_date"
  const companyCode = searchParams.get("companyCode") || "ALL"

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol, "30 days", companyCode)
  const prevFilter = getPrevDateFilter(startDate, endDate, "none", source.dateCol, "30 days", companyCode)
  const cacheKey   = `kpis:${startDate}:${endDate}:${dateColumn}:${companyCode}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const [curRows, prvRows] = await Promise.all([
        queryAnalytics<{ revenue: string; orders: string; units: string }>(
          `SELECT SUM(${source.revenueCol}) as revenue,
                  COUNT(DISTINCT order_code) as orders,
                  SUM(${source.quantityCol}) as units
           FROM ${source.mainTable} f WHERE ${filter}`
        ),
        queryAnalytics<{ revenue: string; orders: string; units: string }>(
          `SELECT SUM(${source.revenueCol}) as revenue,
                  COUNT(DISTINCT order_code) as orders,
                  SUM(${source.quantityCol}) as units
           FROM ${source.mainTable} f WHERE ${prevFilter}`
        ),
      ])

      const cur = curRows[0]; const prv = prvRows[0]
      const cRev = parseFloat(cur?.revenue || "0"); const pRev = parseFloat(prv?.revenue || "0")
      const cOrd = parseInt(cur?.orders   || "0"); const pOrd = parseInt(prv?.orders   || "0")
      const cUni = parseInt(cur?.units    || "0"); const pUni = parseInt(prv?.units    || "0")
      const cAOV = cOrd === 0 ? 0 : cRev / cOrd;  const pAOV = pOrd === 0 ? 0 : pRev / pOrd
      const pct  = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b) * 100

      return [
        { label: "Total Revenue",    value: cRev, lastPeriod: pRev, change: Math.abs(pct(cRev, pRev)), isPositive: cRev >= pRev, isCurrency: true  },
        { label: "Total Orders",     value: cOrd, lastPeriod: pOrd, change: Math.abs(pct(cOrd, pOrd)), isPositive: cOrd >= pOrd, isCurrency: false },
        { label: "Avg. Order Value", value: cAOV, lastPeriod: pAOV, change: Math.abs(pct(cAOV, pAOV)), isPositive: cAOV >= pAOV, isCurrency: true  },
        { label: "Unit Sold",        value: cUni, lastPeriod: pUni, change: Math.abs(pct(cUni, pUni)), isPositive: cUni >= pUni, isCurrency: false },
      ]
    })

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/kpis]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
