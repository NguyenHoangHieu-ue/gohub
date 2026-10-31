import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { analyticsGuard } from "@/lib/analytics-helpers"
import { buildDailyTopline, buildDailyDetail, getToplineAssessmentCached } from "@/lib/scheduled-report-data"

// Popup Daily Report trên Dashboard: cùng bộ số + AI đánh giá với card Lark, thêm xu hướng 3 ngày / top khách B2B / kênh B2C.
// Quyền: phân quyền tab "dashboard" ở analytics layout (API chỉ cần đã đăng nhập, như các API dashboard khác).
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard
  try {
    const [topline, detail] = await Promise.all([buildDailyTopline(), buildDailyDetail()])
    const assessment = await getToplineAssessmentCached(topline)
    return NextResponse.json({ topline, detail, assessment })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
