import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getTargetSummary } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const startDate = req.nextUrl.searchParams.get("startDate")
  const endDate   = req.nextUrl.searchParams.get("endDate")
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 })
  }

  try {
    const data = await getTargetSummary(startDate, endDate)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error("[analytics/targets-summary]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
