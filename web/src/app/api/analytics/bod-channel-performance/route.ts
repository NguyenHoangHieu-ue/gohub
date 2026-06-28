import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getBODFilters, cachedQuery, CACHE_HEADERS, QUERY_TTL_MIN } from "@/lib/analytics-helpers"
import { fetchBODChannelPerformanceData } from "@/lib/bod-data"

// Port intel bod-channel-performance: từng kênh + CM1 (margin − op-cost theo kênh/tháng prorate).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate      = searchParams.get("startDate")
  const endDate        = searchParams.get("endDate")
  const dateColumn     = searchParams.get("dateColumn")     || "fulfiled_date"
  const comparisonType = searchParams.get("comparisonType") || "none"
  const extraFilters   = getBODFilters(searchParams)

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  try {
    const key = `bod-channel-perf:${dateColumn}:${startDate}:${endDate}:${comparisonType}:${extraFilters}`
    const payload = await cachedQuery(key, async () => {
      const current = await fetchBODChannelPerformanceData(startDate, endDate, dateColumn, extraFilters)
      if (comparisonType === "none") return current

      const s = new Date(startDate); const e = new Date(endDate)
      let prevStart: Date, prevEnd: Date
      if (comparisonType === "previous_period") {
        const diff = e.getTime() - s.getTime()
        prevEnd = new Date(s.getTime() - 86400000); prevStart = new Date(prevEnd.getTime() - diff)
      } else {
        prevStart = new Date(s.getFullYear() - 1, s.getMonth(), s.getDate())
        prevEnd = new Date(e.getFullYear() - 1, e.getMonth(), e.getDate())
      }
      const previous = await fetchBODChannelPerformanceData(
        prevStart.toISOString().split("T")[0], prevEnd.toISOString().split("T")[0], dateColumn, extraFilters
      )
      return current.map(curr => {
        const prev = previous.find(p => p.channel === curr.channel)
        return { ...curr, prev_revenue: prev ? prev.revenue : 0 }
      })
    }, QUERY_TTL_MIN)

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/bod-channel-performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
