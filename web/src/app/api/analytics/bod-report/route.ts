import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getBODFilters, cachedQuery, CACHE_HEADERS, QUERY_TTL_MIN, analyticsGuard } from "@/lib/analytics-helpers"
import { fetchBODReportData as fetchBODReport } from "@/lib/bod-data"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate     = searchParams.get("startDate")
  const endDate       = searchParams.get("endDate")
  const comparisonType = searchParams.get("comparisonType") || "none"
  const extraFilters   = getBODFilters(searchParams)

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  try {
    const key = `bod-report:${startDate}:${endDate}:${comparisonType}:${extraFilters}`
    const payload = await cachedQuery(key, async () => {
      const current = await fetchBODReport(startDate, endDate, extraFilters)
      if (comparisonType === "none") return current

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
        prevEnd.toISOString().split("T")[0],
        extraFilters
      )

      return current.map((curr, i) => {
        const prev = comparisonType === "previous_period"
          ? previous[i]
          : previous.find(p => {
              const d = new Date(curr.date)
              const ly = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()).toISOString().split("T")[0]
              return p.date === ly
            })
        return { ...curr, prev_revenue: prev?.revenue || 0 }
      })
    }, QUERY_TTL_MIN)

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/bod-report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
