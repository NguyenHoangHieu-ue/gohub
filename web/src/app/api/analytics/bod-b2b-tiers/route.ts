import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getBODFilters, cachedQuery, CACHE_HEADERS, QUERY_TTL_MIN, analyticsGuard, noCache } from "@/lib/analytics-helpers"
import { rollupCtx, ruHeaders, ruKey } from "@/lib/rollup/serve"
import { fetchQuarterlySettings, exclHash } from "@/lib/quarterly-settings"
import { fetchBODB2BTiers } from "@/lib/bod-b2b-tiers"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// B2B theo Tier → Organization cho khoảng ngày của tab BOD (xem lib/bod-b2b-tiers.ts).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard
  const sp = req.nextUrl.searchParams
  const startDate = sp.get("startDate"), endDate = sp.get("endDate")
  if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  const dateColumn = sp.get("dateColumn") || "fulfiled_date"
  const extraFilters = getBODFilters(sp)
  const includeShip = sp.get("includeShip") === "1"
  const includeInternalOps = sp.get("includeInternalOps") === "1"
  const { excludedCustomers } = await fetchQuarterlySettings()
  const ctx = await rollupCtx("bod-b2b-tiers")
  try {
    const key = `bod-b2b-tiers2${ruKey(ctx)}:${dateColumn}:${startDate}:${endDate}:${extraFilters}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${exclHash(excludedCustomers)}`
    const tiers = await cachedQuery(key, () => fetchBODB2BTiers(startDate, endDate, dateColumn, extraFilters, includeShip, includeInternalOps), QUERY_TTL_MIN, noCache(req), ["b2b-cost"])
    return NextResponse.json({ tiers }, { headers: ruHeaders(ctx, CACHE_HEADERS) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
