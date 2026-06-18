import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getMonthsInRange, getChannelCostsForMonths, CACHE_HEADERS } from "@/lib/analytics-helpers"

// GET /api/analytics/channels-with-platform-fee?startDate=&endDate= → string[]
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const startDate = req.nextUrl.searchParams.get("startDate")
  const endDate   = req.nextUrl.searchParams.get("endDate")
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 })
  }

  try {
    const months = getMonthsInRange(startDate, endDate)
    if (!months.length) return NextResponse.json([], { headers: CACHE_HEADERS })

    const costs = await getChannelCostsForMonths(months)
    const channelsWithFee = Array.from(
      new Set(
        costs
          .filter(c => c.platformFee && typeof c.platformFee.value === "number" && c.platformFee.value > 0)
          .map(c => c.channel)
      )
    )
    return NextResponse.json(channelsWithFee, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/channels-with-platform-fee]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
