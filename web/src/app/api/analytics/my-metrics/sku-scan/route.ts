import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"
import { canWriteTab } from "@/lib/writable-tabs"
import { parseQuarterLabel, prevQuarterLabel, OKR_GM_BASELINE } from "@/lib/okr-helpers"

const READ_ROLES = ["admin", "creator", "bod"]

// SKU đóng góp trong 80% doanh thu tích luỹ (Pareto) coi là "trọng điểm" — theo đúng câu offer
// letter "GM increase on key/new SKUs". Hằng số công khai ở đây để dễ chỉnh nếu Bảo muốn ngưỡng
// khác, giống cách WEIGHTS/OKR_GM_BASELINE đã làm ở nơi khác trong My Metrics.
const KEY_SKU_CUM_PCT = 80

interface ScanRow {
  sku: string; category: string | null; vendor: string | null
  rev_cur: number; gp_cur: number; gm_pct_cur: number; orders_cur: number
  rev_prev: number; gp_prev: number; gm_pct_prev: number; orders_prev: number
  delta: number | null; delta_basis: string
  is_key: boolean; is_new: boolean
  cum_rev_pct: number
}

// GET ?quarter=Q3-2026
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3-2026"
  const { start: curStart, end: curEnd } = parseQuarterLabel(quarter)
  const prevLabel = prevQuarterLabel(quarter)
  const { start: prevStart, end: prevEnd } = parseQuarterLabel(prevLabel)

  const cacheKey = `okr_sku_scan:${quarter}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const rows = await queryAnalytics<{
        sku: string; category: string | null; vendor: string | null
        rev_cur: string | null; gp_cur: string | null; orders_cur: string | null
        rev_prev: string | null; gp_prev: string | null; orders_prev: string | null
      }>(
        `WITH cur AS (
           SELECT TRIM(sku) AS sku,
                  SUM(fulfilled_revenue_amount_vnd)::bigint AS rev,
                  SUM(gross_profit_vnd)::bigint             AS gp,
                  COUNT(DISTINCT order_code)::bigint         AS orders
           FROM fact_fulfillment_revenue
           WHERE fulfiled_date IS NOT NULL AND TRIM(sku) != 'SHIPPINGFEE0'
             AND fulfiled_date::date BETWEEN $1::date AND $2::date
             AND fulfiled_date::date <= CURRENT_DATE - 1
           GROUP BY 1
         ),
         prev AS (
           SELECT TRIM(sku) AS sku,
                  SUM(fulfilled_revenue_amount_vnd)::bigint AS rev,
                  SUM(gross_profit_vnd)::bigint             AS gp,
                  COUNT(DISTINCT order_code)::bigint         AS orders
           FROM fact_fulfillment_revenue
           WHERE fulfiled_date IS NOT NULL AND TRIM(sku) != 'SHIPPINGFEE0'
             AND fulfiled_date::date BETWEEN $3::date AND $4::date
             AND fulfiled_date::date <= CURRENT_DATE - 1
           GROUP BY 1
         )
         SELECT COALESCE(c.sku, p.sku) AS sku, v.category_name AS category, v.vendor,
                c.rev AS rev_cur, c.gp AS gp_cur, c.orders AS orders_cur,
                p.rev AS rev_prev, p.gp AS gp_prev, p.orders AS orders_prev
         FROM cur c
         FULL OUTER JOIN prev p ON c.sku = p.sku
         LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) v
           ON COALESCE(c.sku, p.sku) = v.sku
         WHERE COALESCE(c.rev, 0) > 0 OR COALESCE(p.rev, 0) > 0
         ORDER BY COALESCE(c.rev, 0) DESC`,
        [curStart, curEnd, prevStart, prevEnd]
      )

      const items: ScanRow[] = rows.map(r => {
        const rev_cur  = Number(r.rev_cur)  || 0
        const gp_cur   = Number(r.gp_cur)   || 0
        const orders_cur = Number(r.orders_cur) || 0
        const rev_prev = Number(r.rev_prev) || 0
        const gp_prev  = Number(r.gp_prev)  || 0
        const orders_prev = Number(r.orders_prev) || 0
        const gm_pct_cur  = rev_cur  > 0 ? +(gp_cur  / rev_cur  * 100).toFixed(2) : 0
        const gm_pct_prev = rev_prev > 0 ? +(gp_prev / rev_prev * 100).toFixed(2) : 0

        let delta: number | null = null
        let delta_basis: string
        let is_new = false
        if (rev_cur <= 0) {
          delta_basis = "Không có doanh thu quý này (chỉ còn dữ liệu quý trước)"
        } else if (rev_prev <= 0) {
          is_new = true
          delta = +(gm_pct_cur - OKR_GM_BASELINE).toFixed(2)
          delta_basis = `SKU mới/chưa bán quý trước — so với baseline công ty ${OKR_GM_BASELINE}%`
        } else {
          delta = +(gm_pct_cur - gm_pct_prev).toFixed(2)
          delta_basis = "So GM% quý này vs quý trước, cùng SKU"
        }

        return {
          sku: r.sku, category: r.category, vendor: r.vendor,
          rev_cur, gp_cur, gm_pct_cur, orders_cur,
          rev_prev, gp_prev, gm_pct_prev, orders_prev,
          delta, delta_basis, is_key: false, is_new,
          cum_rev_pct: 0,
        }
      })

      // Rank theo doanh thu quý này, đánh dấu "trọng điểm" = trong nhóm 80% doanh thu tích luỹ (Pareto).
      const sorted = [...items].sort((a, b) => b.rev_cur - a.rev_cur)
      const totalRevCur = sorted.reduce((a, r) => a + r.rev_cur, 0)
      let cum = 0
      for (const row of sorted) {
        cum += row.rev_cur
        row.cum_rev_pct = totalRevCur > 0 ? +(cum / totalRevCur * 100).toFixed(2) : 0
        row.is_key = totalRevCur > 0 && row.rev_cur > 0 && (cum - row.rev_cur) / totalRevCur * 100 < KEY_SKU_CUM_PCT
      }

      const scored = sorted.filter(r => (r.is_key || r.is_new) && r.delta !== null)
      const totalScoredRev = scored.reduce((a, r) => a + r.rev_cur, 0)
      const weighted_delta = totalScoredRev > 0
        ? +(scored.reduce((a, r) => a + (r.delta! * r.rev_cur), 0) / totalScoredRev).toFixed(2)
        : null

      return {
        quarter, curStart, curEnd, prevQuarter: prevLabel, prevStart, prevEnd,
        key_threshold_pct: KEY_SKU_CUM_PCT,
        items: sorted,
        weighted_delta,
        key_count: sorted.filter(r => r.is_key).length,
        new_count: sorted.filter(r => r.is_new).length,
        scored_count: scored.length,
        total_rev_cur: totalRevCur,
      }
    }, 720)

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[my-metrics/sku-scan]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
