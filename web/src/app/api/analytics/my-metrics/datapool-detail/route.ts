import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS, decodeSkuDestinationCode, getCountryMappings } from "@/lib/analytics-helpers"
import { canWriteTab } from "@/lib/writable-tabs"
import { parseQuarterLabel, prevQuarterLabel } from "@/lib/okr-helpers"
import type { HierarchyMonthlyRow } from "@/lib/my-metrics-types"

const READ_ROLES = ["admin", "creator", "bod"]

// Chi tiết theo SKU cho card "%Datapool Rev" — cùng playbook hierarchy/prorata với SKU Gross Margin
// (s195+18-B): thêm quý TRƯỚC (trước route này chỉ có quý hiện tại, không so sánh được) + gp (để tính
// GM%) + country/product_code (cho hierarchy Vendor→Nước→Product Code→SKU) + monthly (chart/tháng).
// GET ?quarter=Q3-2026 (nhận cả dạng "Q3" lẫn "Q3-2026", quarterRange tự chuẩn hoá qua parseQuarterLabel)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarterParam = req.nextUrl.searchParams.get("quarter") ?? "Q3-2026"
  const quarter = quarterParam.includes("-") ? quarterParam : `${quarterParam}-2026`
  const { start: curStart, end: curEnd } = parseQuarterLabel(quarter)
  const prevLabel = prevQuarterLabel(quarter)
  const { start: prevStart, end: prevEnd } = parseQuarterLabel(prevLabel)

  // v2: bump key sau s195+18-B (thêm prev quý/gp/gm_pct/country/product_code/monthly — shape khác hẳn
  // bản cũ) — cùng lý do bump ở sku-scan/route.ts, xem comment ở đó.
  const cacheKey = `okr_datapool_detail:v2:${quarter}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const rows = await queryAnalytics<{
        sku: string; vendor: string | null; category: string | null
        rev_cur: string | null; gp_cur: string | null; units_cur: string | null; orders_cur: string | null
        rev_prev: string | null; gp_prev: string | null
      }>(
        `WITH cur AS (
           SELECT TRIM(sku) AS sku,
                  SUM(fulfilled_revenue_amount_vnd)::bigint AS rev,
                  SUM(gross_profit_vnd)::bigint             AS gp,
                  SUM(fulfilled_quantity)::bigint            AS units,
                  COUNT(DISTINCT order_code)::bigint          AS orders
           FROM fact_fulfillment_revenue
           WHERE fulfiled_date IS NOT NULL
             AND fulfiled_date::date BETWEEN $1::date AND $2::date
             AND fulfiled_date::date <= CURRENT_DATE - 1
           GROUP BY 1
         ),
         prev AS (
           SELECT TRIM(sku) AS sku,
                  SUM(fulfilled_revenue_amount_vnd)::bigint AS rev,
                  SUM(gross_profit_vnd)::bigint             AS gp
           FROM fact_fulfillment_revenue
           WHERE fulfiled_date IS NOT NULL
             AND fulfiled_date::date BETWEEN $3::date AND $4::date
             AND fulfiled_date::date <= CURRENT_DATE - 1
           GROUP BY 1
         )
         SELECT COALESCE(c.sku, p.sku) AS sku, v.vendor, v.category_name AS category,
                c.rev AS rev_cur, c.gp AS gp_cur, c.units AS units_cur, c.orders AS orders_cur,
                p.rev AS rev_prev, p.gp AS gp_prev
         FROM cur c
         FULL OUTER JOIN prev p ON c.sku = p.sku
         JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) v
           ON COALESCE(c.sku, p.sku) = v.sku
         WHERE REPLACE(UPPER(TRIM(v.vendor)),' ','') IN ('3HKDATAPOOL','BCDATAPOOL')
           AND (COALESCE(c.rev, 0) > 0 OR COALESCE(p.rev, 0) > 0)
         ORDER BY COALESCE(c.rev, 0) DESC`,
        [curStart, curEnd, prevStart, prevEnd]
      )

      const monthlyRows = await queryAnalytics<{ sku: string; month: string; rev: string | null; gp: string | null }>(
        `SELECT TRIM(f.sku) AS sku, TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') AS month,
                SUM(f.fulfilled_revenue_amount_vnd)::bigint AS rev,
                SUM(f.gross_profit_vnd)::bigint             AS gp
         FROM fact_fulfillment_revenue f
         JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) v ON TRIM(f.sku) = v.sku
         WHERE f.fulfiled_date IS NOT NULL
           AND f.fulfiled_date::date BETWEEN $1::date AND $2::date
           AND f.fulfiled_date::date <= CURRENT_DATE - 1
           AND REPLACE(UPPER(TRIM(v.vendor)),' ','') IN ('3HKDATAPOOL','BCDATAPOOL')
         GROUP BY 1, 2
         ORDER BY 1, 2`,
        [prevStart, curEnd]
      )
      const monthly: HierarchyMonthlyRow[] = monthlyRows.map(r => ({
        sku: r.sku, month: r.month, rev: Number(r.rev) || 0, gp: Number(r.gp) || 0,
      }))

      const countryMap = await getCountryMappings()

      const items = rows.map(r => {
        const vendorNorm = (r.vendor ?? "").trim().toUpperCase().replace(/\s+/g, "")
        const country_code = decodeSkuDestinationCode(r.sku)
        const rev_cur = Number(r.rev_cur) || 0, gp_cur = Number(r.gp_cur) || 0
        const rev_prev = Number(r.rev_prev) || 0, gp_prev = Number(r.gp_prev) || 0
        return {
          sku: r.sku,
          vendor: vendorNorm === "3HKDATAPOOL" ? "3HK Datapool" : "BC Datapool",
          category: r.category,
          country: countryMap[country_code] ?? country_code, country_code,
          product_code: r.sku.slice(0, 8),
          rev: rev_cur, units: Number(r.units_cur) || 0, orders: Number(r.orders_cur) || 0,
          gp: gp_cur, gm_pct: rev_cur > 0 ? +(gp_cur / rev_cur * 100).toFixed(2) : 0,
          rev_prev, gp_prev, gm_pct_prev: rev_prev > 0 ? +(gp_prev / rev_prev * 100).toFixed(2) : 0,
        }
      })

      return {
        quarter, start: curStart, end: curEnd,
        prevQuarter: prevLabel, prevStart, prevEnd,
        items,
        total_rev: items.reduce((a, r) => a + r.rev, 0),
        total_orders: items.reduce((a, r) => a + r.orders, 0),
        total_units: items.reduce((a, r) => a + r.units, 0),
        total_rev_prev: items.reduce((a, r) => a + r.rev_prev, 0),
        monthly,
      }
    }, 720)

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[my-metrics/datapool-detail]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
