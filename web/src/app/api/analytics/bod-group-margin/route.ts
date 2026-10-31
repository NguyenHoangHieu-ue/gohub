import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getBODFilters, cachedQuery, CACHE_HEADERS, QUERY_TTL_MIN, analyticsGuard, getStrategicSettingsHash, noCache } from "@/lib/analytics-helpers"
import { fetchQuarterlySettings, exclHash } from "@/lib/quarterly-settings"
import { rollupCtx, ruHeaders, ruKey } from "@/lib/rollup/serve"
import { fetchBODGroupMarginTripleShared } from "@/lib/bod-data"

// Port intel bod-group-margin: nhóm B2B-Strategic/B2B-Non-Strategic/B2C/Other + CM1 (margin − op-cost).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate      = searchParams.get("startDate")
  const endDate        = searchParams.get("endDate")
  const dateColumn     = searchParams.get("dateColumn")     || "fulfiled_date"
  const comparisonType = searchParams.get("comparisonType") || "none"
  const extraFilters   = getBODFilters(searchParams)
  const includeShip        = searchParams.get("includeShip")        === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  try {
    const ctx = await rollupCtx("bod-group-margin")
    const stratHash = await getStrategicSettingsHash()
    const { excludedCustomers } = await fetchQuarterlySettings()
    const key = `bod-group-margin4${ruKey(ctx)}:${dateColumn}:${startDate}:${endDate}:${comparisonType}:${extraFilters}:${stratHash}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${exclHash(excludedCustomers)}`
    const payload = await cachedQuery(key, async () => {
      // Dùng chung 3 kỳ với bod-summary (một lần quét, xem fetchBODGroupMarginTripleShared).
      const [currentRes, prevRes, lyRes] = await fetchBODGroupMarginTripleShared(startDate, endDate, dateColumn, extraFilters, includeShip, includeInternalOps)
      if (comparisonType === "none") return currentRes.groups
      const previous = (comparisonType === "previous_period" ? prevRes : lyRes).groups
      return currentRes.groups.map(curr => {
        const prev = previous.find(p => p.group === curr.group)
        return { ...curr, prev_revenue: prev?.revenue || 0, prev_margin: prev?.margin || 0 }
      })
    }, QUERY_TTL_MIN, noCache(req), ["b2b-cost"])

    return NextResponse.json(payload, { headers: ruHeaders(ctx, CACHE_HEADERS) })
  } catch (err: any) {
    console.error("[analytics/bod-group-margin]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
