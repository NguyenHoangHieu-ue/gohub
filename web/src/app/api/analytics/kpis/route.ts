import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getPrevDateFilter } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn") || "fulfiled_date"
  const companyCode = searchParams.get("companyCode") || undefined

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol, "30 days", companyCode)
  const prevFilter = getPrevDateFilter(startDate, endDate, "none", source.dateCol, "30 days", companyCode)

  try {
    const [currentRows, previousRows] = await Promise.all([
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

    const cur = currentRows[0]
    const prv = previousRows[0]

    const currentRev   = parseFloat(cur?.revenue || "0")
    const prevRev      = parseFloat(prv?.revenue || "0")
    const currentOrd   = parseInt(cur?.orders   || "0")
    const prevOrd      = parseInt(prv?.orders   || "0")
    const currentUnits = parseInt(cur?.units    || "0")
    const prevUnits    = parseInt(prv?.units    || "0")
    const currentAOV   = currentOrd === 0 ? 0 : currentRev / currentOrd
    const prevAOV      = prevOrd     === 0 ? 0 : prevRev   / prevOrd

    const pct = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b) * 100

    return NextResponse.json([
      { label: "Total Revenue", value: currentRev,   lastPeriod: prevRev,      change: Math.abs(pct(currentRev, prevRev)),       isPositive: currentRev >= prevRev,       isCurrency: true  },
      { label: "Total Orders",  value: currentOrd,   lastPeriod: prevOrd,      change: Math.abs(pct(currentOrd, prevOrd)),       isPositive: currentOrd >= prevOrd,       isCurrency: false },
      { label: "Avg. Order Value", value: currentAOV, lastPeriod: prevAOV,     change: Math.abs(pct(currentAOV, prevAOV)),       isPositive: currentAOV >= prevAOV,       isCurrency: true  },
      { label: "Unit Sold",     value: currentUnits, lastPeriod: prevUnits,    change: Math.abs(pct(currentUnits, prevUnits)),   isPositive: currentUnits >= prevUnits,   isCurrency: false },
    ])
  } catch (err: any) {
    console.error("[analytics/kpis]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
