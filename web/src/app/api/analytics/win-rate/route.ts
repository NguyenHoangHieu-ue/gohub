import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runTrackSKUWinRate } from "@/lib/agents/creator/tools/win-rate"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const p = req.nextUrl.searchParams
  const result = await runTrackSKUWinRate({
    days_since_created: Math.min(parseInt(p.get("days") ?? "90"), 365),
    vendor:             p.get("vendor") || undefined,
    win_threshold:      parseInt(p.get("win_threshold") ?? "5"),
    win_days:           parseInt(p.get("win_days") ?? "14"),
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result)
}
