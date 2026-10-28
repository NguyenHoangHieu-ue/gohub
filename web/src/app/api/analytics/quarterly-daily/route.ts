import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, noCache, shipFilter, internalOpsFilter } from "@/lib/analytics-helpers"
import { fetchQuarterlySettings, makeExcludeSql, exclHash } from "@/lib/quarterly-settings"
import { rollupCtx, ruHeaders, ruKey, serve } from "@/lib/rollup/serve"
import { diffDaily, fetchDailyRollup } from "@/lib/rollup/daily"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Doanh thu theo NGÀY của 1 quý (B2B + B2C, cùng bộ lọc loại trừ với quarterly-report) → vẽ đường "doanh thu cộng dồn so với đường đạt target".
// Tổng cộng dồn cuối kỳ phải khớp "Tổng" ở Quarter Report (REV thực tế).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const sp = req.nextUrl.searchParams
  const year = parseInt(sp.get("year") || String(new Date().getFullYear()))
  const quarter = sp.get("quarter") || `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`
  const q = parseInt(quarter.replace("Q", ""))
  if (!(q >= 1 && q <= 4)) return NextResponse.json({ error: "quarter không hợp lệ" }, { status: 400 })
  const companyCode = sp.get("companyCode") || "ALL"
  if (!["ALL", "VN", "US"].includes(companyCode)) return NextResponse.json({ error: "companyCode không hợp lệ" }, { status: 400 })
  const includeShip = sp.get("includeShip") === "1"
  const includeInternalOps = sp.get("includeInternalOps") === "1"

  const start = new Date(Date.UTC(year, (q - 1) * 3, 1))
  const end = new Date(Date.UTC(year, q * 3, 0))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const { excludedCustomers } = await fetchQuarterlySettings()
  const EXCLUDE = makeExcludeSql(excludedCustomers)
  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""
  const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)}`
  const closed = end < new Date()

  const ctx = await rollupCtx("quarterly-daily")
  const key = `qdaily_v1:${quarter}:${year}:${companyCode}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${exclHash(excludedCustomers)}${ruKey(ctx)}`
  const days = await cachedQuery(key, () => serve(ctx, async () => {
    const rows = await queryAnalytics<{ d: string; rev: string }>(`
      WITH inactive_cust AS (
        SELECT TRIM(code) as code FROM dim_customer WHERE UPPER(COALESCE(price_list_name, '')) LIKE '%INACTIVE%'
      )
      SELECT LEFT(f.fulfiled_date, 10) as d, SUM(f.fulfilled_revenue_amount_vnd) as rev
      FROM fact_fulfillment_revenue f
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      WHERE f.fulfiled_date >= '${iso(start)}' AND f.fulfiled_date <= '${iso(end)}'
        AND UPPER(COALESCE(s.group_name, 'OTHER')) IN ('B2B', 'B2C')
        ${companyFilter}
        AND NOT EXISTS (SELECT 1 FROM inactive_cust ic WHERE ic.code = TRIM(f.customer_code))
        ${EXCLUDE}
        ${sfx}
      GROUP BY 1 ORDER BY 1
    `)
    return rows.map(r => ({ d: r.d, rev: Number(r.rev) || 0 }))
  }, () => fetchDailyRollup({ start: iso(start), end: iso(end), companyCode, includeShip, includeInternalOps, excludedCustomers }), diffDaily, { quarter, year, companyCode, includeShip, includeInternalOps }), closed ? 24 * 60 : QUERY_TTL_MIN, noCache(req), [], closed ? { maxStaleMs: 48 * 60 * 60_000, ignoreSoftExpiry: true } : {})

  return NextResponse.json({ quarter, year, start: iso(start), end: iso(end), days }, { headers: ruHeaders(ctx, CACHE_HEADERS) })
}
