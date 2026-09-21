import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { buildReportData } from "@/lib/scheduled-report-data"

// Đo thời gian dựng số liệu báo cáo tự động (Daily/Weekly/Monthly) KHÔNG gọi Gemini, KHÔNG gửi Lark — creator-only.
// Dùng khi cron scheduled-messages báo timeout. ?period=daily|weekly|monthly|quarterly
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const period = (req.nextUrl.searchParams.get("period") || "daily") as "daily" | "weekly" | "monthly" | "quarterly"
  const t = performance.now()
  try {
    const { block } = await buildReportData(period)
    return NextResponse.json({ period, ms: Math.round(performance.now() - t), blockChars: block.length })
  } catch (e: any) {
    return NextResponse.json({ period, ms: Math.round(performance.now() - t), error: e?.message }, { status: 500 })
  }
}
