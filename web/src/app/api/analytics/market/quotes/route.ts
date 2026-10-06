import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { analyticsGuard, CACHE_HEADERS, isCronReq, noCache } from "@/lib/analytics-helpers"
import { hasCreatorGrant, MARKET_USERS_KEY } from "@/lib/creator-access"
import { parseMarketParams } from "@/lib/market-data"
import { loadQuoteCompare } from "@/lib/quote-sources"

// GET ?quarter=Q3-2026&group=ALL|B2B|B2C — so giá full các vendor (3HK, BC Datapool CMHK/Singtel, WorldMove) cho mọi SKU bán trong quý.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard
  if (!isCronReq(req) && !(await hasCreatorGrant(session?.user?.username, MARKET_USERS_KEY)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { quarter, group } = parseMarketParams(req.nextUrl.searchParams)
  try {
    return NextResponse.json(await loadQuoteCompare(quarter, group, noCache(req)), { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/market/quotes]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
