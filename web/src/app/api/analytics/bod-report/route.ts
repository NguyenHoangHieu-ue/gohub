import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getDateFilter , CACHE_HEADERS } from "@/lib/analytics-helpers"

async function fetchBODReport(startDate: string, endDate: string) {
  const filter = getDateFilter(startDate, endDate, "fulfiled_date")
  const rows = await queryAnalytics<Record<string, string>>(
    `SELECT TO_CHAR(fulfiled_date::date, 'YYYY-MM-DD') as date,
            SUM(fulfilled_revenue_amount_vnd) as revenue,
            SUM(cogs_amount_vnd) as cogs,
            SUM(gross_profit_vnd) as margin,
            CASE WHEN SUM(fulfilled_revenue_amount_vnd) > 0
                 THEN (SUM(gross_profit_vnd) / SUM(fulfilled_revenue_amount_vnd)) * 100
                 ELSE 0 END as margin_percent
     FROM fact_fulfillment_revenue f
     WHERE ${filter}
     GROUP BY date
     ORDER BY date ASC`
  )
  return rows.map(r => ({
    date:           r.date,
    revenue:        parseFloat(r.revenue        || "0"),
    cogs:           parseFloat(r.cogs           || "0"),
    margin:         parseFloat(r.margin         || "0"),
    margin_percent: parseFloat(r.margin_percent || "0"),
    gpm2:           parseFloat(r.margin         || "0"), // no op costs for now
    gpm2_percent:   parseFloat(r.margin_percent || "0"),
  }))
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate     = searchParams.get("startDate")
  const endDate       = searchParams.get("endDate")
  const comparisonType = searchParams.get("comparisonType") || "none"

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  try {
    const current = await fetchBODReport(startDate, endDate)

    if (comparisonType !== "none") {
      const s    = new Date(startDate)
      const e    = new Date(endDate)
      let prevStart: Date, prevEnd: Date

      if (comparisonType === "previous_period") {
        const diff = e.getTime() - s.getTime()
        prevEnd   = new Date(s.getTime() - 86400000)
        prevStart = new Date(prevEnd.getTime() - diff)
      } else {
        prevStart = new Date(s.getFullYear() - 1, s.getMonth(), s.getDate())
        prevEnd   = new Date(e.getFullYear() - 1, e.getMonth(), e.getDate())
      }

      const previous = await fetchBODReport(
        prevStart.toISOString().split("T")[0],
        prevEnd.toISOString().split("T")[0]
      )

      return NextResponse.json(current.map((curr, i) => {
        const prev = comparisonType === "previous_period"
          ? previous[i]
          : previous.find(p => {
              const d = new Date(curr.date)
              const ly = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()).toISOString().split("T")[0]
              return p.date === ly
            })
        return { ...curr, prev_revenue: prev?.revenue || 0 }
      }))
    }

    return NextResponse.json(current)
  } catch (err: any) {
    console.error("[analytics/bod-report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
