import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getPrevDateFilter } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate  = searchParams.get("startDate")
  const endDate    = searchParams.get("endDate")
  const dateColumn = searchParams.get("dateColumn") || "fulfiled_date"

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const prevFilter = getPrevDateFilter(startDate, endDate, "none", source.dateCol)

  try {
    const [cur, prv] = await Promise.all([
      queryAnalytics<Record<string, string>>(
        `SELECT SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol})  as margin,
                COUNT(DISTINCT f.order_code) as orders,
                SUM(f.${source.quantityCol}) as units
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2C' AND ${filter}`
      ),
      queryAnalytics<Record<string, string>>(
        `SELECT SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol})  as margin,
                COUNT(DISTINCT f.order_code) as orders,
                SUM(f.${source.quantityCol}) as units
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2C' AND ${prevFilter}`
      ),
    ])

    const c   = cur[0] || {}
    const p   = prv[0] || {}
    const cRev = parseFloat(c.revenue || "0")
    const pRev = parseFloat(p.revenue || "0")
    const cMar = parseFloat(c.margin  || "0")
    const pMar = parseFloat(p.margin  || "0")
    const cOrd = parseInt(c.orders    || "0")
    const pOrd = parseInt(p.orders    || "0")
    const cUni = parseInt(c.units     || "0")
    const pUni = parseInt(p.units     || "0")
    const pct  = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b) * 100

    return NextResponse.json([
      { label: "Total Revenue", value: cRev, lastPeriod: pRev, change: pct(cRev, pRev), isPositive: cRev >= pRev, isCurrency: true  },
      { label: "Gross Profit",  value: cMar, lastPeriod: pMar, change: pct(cMar, pMar), isPositive: cMar >= pMar, isCurrency: true  },
      { label: "Margin %",      value: cRev > 0 ? (cMar/cRev)*100 : 0, lastPeriod: pRev > 0 ? (pMar/pRev)*100 : 0, change: 0, isPositive: true, isCurrency: false },
      { label: "Total Orders",  value: cOrd, lastPeriod: pOrd, change: pct(cOrd, pOrd), isPositive: cOrd >= pOrd, isCurrency: false },
      { label: "Unit Sold",     value: cUni, lastPeriod: pUni, change: pct(cUni, pUni), isPositive: cUni >= pUni, isCurrency: false },
    ])
  } catch (err: any) {
    console.error("[analytics/b2c/kpis]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
