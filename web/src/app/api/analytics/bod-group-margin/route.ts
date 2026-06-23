import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getBODFilters } from "@/lib/analytics-helpers"
import { fetchBODGroupMarginData } from "@/lib/bod-data"

// Port intel bod-group-margin: nhóm B2B-Strategic/B2B-Non-Strategic/B2C/Other + CM1 (margin − op-cost).
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
    const current = (await fetchBODGroupMarginData(startDate, endDate, dateColumn, extraFilters)).groups

    if (comparisonType !== "none") {
      const s = new Date(startDate); const e = new Date(endDate)
      let prevStart: Date, prevEnd: Date
      if (comparisonType === "previous_period") {
        const diff = e.getTime() - s.getTime()
        prevEnd = new Date(s.getTime() - 86400000); prevStart = new Date(prevEnd.getTime() - diff)
      } else {
        prevStart = new Date(s.getFullYear() - 1, s.getMonth(), s.getDate())
        prevEnd = new Date(e.getFullYear() - 1, e.getMonth(), e.getDate())
      }
      const previous = (await fetchBODGroupMarginData(
        prevStart.toISOString().split("T")[0], prevEnd.toISOString().split("T")[0], dateColumn, extraFilters
      )).groups
      return NextResponse.json(current.map(curr => {
        const prev = previous.find(p => p.group === curr.group)
        return { ...curr, prev_revenue: prev?.revenue || 0, prev_margin: prev?.margin || 0 }
      }))
    }

    return NextResponse.json(current)
  } catch (err: any) {
    console.error("[analytics/bod-group-margin]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
