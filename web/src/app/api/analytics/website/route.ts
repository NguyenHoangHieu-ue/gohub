import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"
import { ga4WebsiteSummary, ga4Configured } from "@/lib/ga4"

// Tổng hợp GA4 cho 1 site: KPIs + chuỗi ngày + top countries/sources.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const siteId = sp.get("siteId") || undefined
  const days = Math.min(Math.max(parseInt(sp.get("days") || "28") || 28, 1), 365)
  const compare = sp.get("compare") === "1"

  try {
    if (!(await ga4Configured())) {
      return NextResponse.json({ error: "GA4 chưa cấu hình" }, { status: 400 })
    }
    const data = await cachedQuery(`ga4-website:${siteId}:${days}:${compare}`, () =>
      ga4WebsiteSummary(siteId, days, compare)
    )
    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err) {
    console.error("[analytics/website]", (err as Error).message)
    return NextResponse.json({ error: "Hiếu đang fix, vui lòng đợi" }, { status: 500 })
  }
}
