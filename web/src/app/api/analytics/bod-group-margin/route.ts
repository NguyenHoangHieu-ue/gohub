import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getBODFilters, cachedQuery, CACHE_HEADERS, QUERY_TTL_MIN, analyticsGuard, getStrategicSettingsHash } from "@/lib/analytics-helpers"
import { fetchBODGroupMarginData } from "@/lib/bod-data"

// Port intel bod-group-margin: nhóm B2B-Strategic/B2B-Non-Strategic/B2C/Other + CM1 (margin − op-cost).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

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
    const stratHash = await getStrategicSettingsHash()
    const key = `bod-group-margin2:${dateColumn}:${startDate}:${endDate}:${comparisonType}:${extraFilters}:${stratHash}`
    const payload = await cachedQuery(key, async () => {
      if (comparisonType === "none") {
        return (await fetchBODGroupMarginData(startDate, endDate, dateColumn, extraFilters)).groups
      }

      const s = new Date(startDate); const e = new Date(endDate)
      let prevStart: Date, prevEnd: Date
      if (comparisonType === "previous_period") {
        const diff = e.getTime() - s.getTime()
        prevEnd = new Date(s.getTime() - 86400000); prevStart = new Date(prevEnd.getTime() - diff)
      } else {
        prevStart = new Date(s.getFullYear() - 1, s.getMonth(), s.getDate())
        prevEnd = new Date(e.getFullYear() - 1, e.getMonth(), e.getDate())
      }
      // Kỳ hiện tại + kỳ trước độc lập → fetch song song
      const [currentRes, previousRes] = await Promise.all([
        fetchBODGroupMarginData(startDate, endDate, dateColumn, extraFilters),
        fetchBODGroupMarginData(prevStart.toISOString().split("T")[0], prevEnd.toISOString().split("T")[0], dateColumn, extraFilters),
      ])
      const current = currentRes.groups
      const previous = previousRes.groups
      return current.map(curr => {
        const prev = previous.find(p => p.group === curr.group)
        return { ...curr, prev_revenue: prev?.revenue || 0, prev_margin: prev?.margin || 0 }
      })
    }, QUERY_TTL_MIN)

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/bod-group-margin]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
