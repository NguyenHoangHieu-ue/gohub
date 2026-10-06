import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { analyticsGuard, CACHE_HEADERS, isCronReq, noCache } from "@/lib/analytics-helpers"
import { hasCreatorGrant, MARKET_USERS_KEY } from "@/lib/creator-access"
import { loadMarketData, parseMarketParams } from "@/lib/market-data"

// GET ?quarter=Q4-2026&group=ALL|B2B|B2C — doanh thu theo SKU × tháng (quý này + quý trước), kèm thuộc tính để FE gộp
// theo thị trường/vendor/loại SP. Tổng công ty = B2B + B2C (bỏ INTERNAL-TRANSACTION, s211d) và bỏ phí ship.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard
  if (!isCronReq(req) && !(await hasCreatorGrant(session?.user?.username, MARKET_USERS_KEY)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { quarter, group } = parseMarketParams(req.nextUrl.searchParams)
  try {
    return NextResponse.json(await loadMarketData(quarter, group, noCache(req)), { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/market]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
