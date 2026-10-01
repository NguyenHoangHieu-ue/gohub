import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, buildGroupCaseByCustomerSql,
  CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache,
} from "@/lib/analytics-helpers"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { buildDistribution, type DistView, type RawDistRow } from "@/lib/vendor-distribution"
import { createHash } from "node:crypto"

// Bảng "phân bổ theo Khách hàng / Kênh" của tab Vendors. 1 lần quét fact cho CẢ kỳ này lẫn kỳ so sánh, mỗi dòng đã
// kèm tổng doanh thu mọi vendor của đơn vị đó (→ %Contrib) nên không cần quét lần 2 như bản client-side cũ.
// Bộ lọc nền GIỐNG các thẻ KPI cùng trang (loại phí ship + đơn nội bộ; không loại KH ops) để tổng khớp nhau.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const esc = (s: string) => s.replace(/'/g, "''")

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const sp = req.nextUrl.searchParams
  const startDate = sp.get("startDate") || "", endDate = sp.get("endDate") || ""
  const prevStart = sp.get("prevStart") || "", prevEnd = sp.get("prevEnd") || ""
  if (![startDate, endDate].every(d => DATE_RE.test(d)) || (prevStart && !(DATE_RE.test(prevStart) && DATE_RE.test(prevEnd)))) {
    return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 })
  }
  const view: DistView = sp.get("view") === "channel" ? "channel" : "customer"
  const vendors = sp.getAll("vendors").map(v => v.trim()).filter(Boolean)
  if (vendors.length === 0) return NextResponse.json([], { headers: CACHE_HEADERS })
  const channel = sp.get("channel") || "All Channels"
  const channelGroup = ["B2B", "B2C"].includes(sp.get("channelGroup") || "") ? sp.get("channelGroup")! : "All Groups"

  try {
    const source = getAnalyticsSource(sp.get("dateColumn") || "fulfiled_date")
    const { tierKeywords } = await fetchQuarterlySettings()
    // Không truyền excludedCustomers: trang không loại KH nào khỏi KPI, loại riêng ở đây sẽ làm tổng bảng lệch thẻ KPI.
    const groupCase = buildGroupCaseByCustomerSql(tierKeywords, [])
    const tierHash = createHash("sha1").update(JSON.stringify(tierKeywords)).digest("hex").slice(0, 8)
    const key = `vendor-dist1:${view}:${source.dateCol}:${startDate}:${endDate}:${prevStart}:${prevEnd}:${vendors.join("|")}:${channel}:${channelGroup}:${tierHash}`

    const rows = await cachedQuery(key, async () => {
      const dc = `f.${source.dateCol}::date`
      const cur = `${dc} >= '${startDate}' AND ${dc} <= '${endDate}'`
      const prev = prevStart ? ` OR (${dc} >= '${prevStart}' AND ${dc} <= '${prevEnd}')` : ""
      let chanFilter = channel !== "All Channels"
        ? `AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE channel_name = '${esc(channel)}')` : ""
      if (channelGroup !== "All Groups") chanFilter += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE UPPER(group_name) = '${channelGroup}')`
      const std = `AND f.sku != 'SHIPPINGFEE0' AND f.order_source_code NOT IN (SELECT code FROM dim_order_source WHERE UPPER(COALESCE(group_name,'')) = 'INTERNAL-TRANSACTION')`
      const vendorList = vendors.map(v => `'${esc(v)}'`).join(",")
      const marginExpr = source.marginCol === "0" ? "0" : `f.${source.marginCol}`

      const [bizExpr, unitKey, unitName] = view === "customer"
        ? [groupCase,
           `CASE WHEN b_biz LIKE 'B2B%' THEN org_key ELSE channel END`,
           `CASE WHEN b_biz LIKE 'B2B%' THEN org_name ELSE channel END`]
        : [`CASE WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' THEN 'B2B' WHEN UPPER(COALESCE(s.group_name,'')) = 'B2C' THEN 'B2C' ELSE 'Khác' END`,
           `channel`, `channel`]

      return queryAnalytics<RawDistRow>(
        `WITH base AS (
           SELECT f.order_code, f.${source.revenueCol} AS rev, f.${source.quantityCol} AS qty, ${marginExpr} AS mgn,
                  TRIM(f.customer_code) AS code,
                  COALESCE(NULLIF(TRIM(s.channel_name), ''), 'Unknown') AS channel,
                  ${bizExpr} AS b_biz,
                  COALESCE(NULLIF(TRIM(c.organization), ''), TRIM(f.customer_code)) AS org_key,
                  COALESCE(NULLIF(TRIM(c.organization), ''), COALESCE(c.name, TRIM(f.customer_code))) AS org_name,
                  (v.sku IS NOT NULL) AS is_vendor,
                  (${cur}) AS is_cur
           FROM ${source.mainTable} f
           LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           LEFT JOIN dim_customer c ON TRIM(f.customer_code) = c.code
           LEFT JOIN (SELECT DISTINCT TRIM(sku) AS sku FROM dim_sku WHERE TRIM(vendor) IN (${vendorList})) v ON TRIM(f.sku) = v.sku
           WHERE ((${cur})${prev}) ${std} ${chanFilter}
         ),
         keyed AS (SELECT base.*, ${unitKey} AS unit_key, ${unitName} AS unit_name FROM base)
         SELECT b_biz AS biz, unit_key, MAX(unit_name) AS unit_name,
                string_agg(DISTINCT channel, '|') FILTER (WHERE is_vendor AND is_cur) AS channels,
                COUNT(DISTINCT code)       FILTER (WHERE is_vendor AND is_cur) AS codes,
                COUNT(DISTINCT order_code) FILTER (WHERE is_vendor AND is_cur) AS orders,
                SUM(qty) FILTER (WHERE is_vendor AND is_cur) AS units,
                SUM(rev) FILTER (WHERE is_vendor AND is_cur) AS revenue,
                SUM(mgn) FILTER (WHERE is_vendor AND is_cur) AS margin,
                SUM(rev) FILTER (WHERE is_cur)               AS total_revenue,
                SUM(rev) FILTER (WHERE is_vendor AND NOT is_cur) AS prev_revenue
         FROM keyed
         GROUP BY b_biz, unit_key
         HAVING COALESCE(SUM(rev) FILTER (WHERE is_vendor AND is_cur), 0) <> 0
             OR COALESCE(SUM(rev) FILTER (WHERE is_vendor AND NOT is_cur), 0) <> 0`,
      )
    }, QUERY_TTL_MIN, noCache(req))

    return NextResponse.json(buildDistribution(rows, view), { headers: noCache(req) ? { "Cache-Control": "no-store" } : CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/vendors/distribution]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
