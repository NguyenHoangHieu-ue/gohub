import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery } from "@/lib/analytics-helpers"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { orderTierSql } from "@/lib/orders-filters"
import { baseWhere, filterWhere, parseOrderBase, readFilterParams } from "@/lib/orders-where"
import { createHash } from "crypto"

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const p = req.nextUrl.searchParams
  const base = parseOrderBase(p)
  if ("error" in base) return NextResponse.json({ error: base.error }, { status: 400 })
  const flt = readFilterParams(p)
  const isExport    = p.get("export") === "1"
  const page        = Math.max(1, parseInt(p.get("page") || "1"))
  const limit       = isExport ? 5000 : Math.min(200, parseInt(p.get("limit") || "50"))
  const offset      = (page - 1) * limit
  const { mainTable, dateCol, revCol, qtyCol, gpCol, startDate, endDate, companyCode, dataSource, includeShip, includeInternalOps } = base

  // Tier = cùng định nghĩa với Quarter Report (từ khoá trong quarterly-settings) — đổi cấu hình thì khoá cache đổi theo
  const { tierKeywords } = await fetchQuarterlySettings()
  const tierExpr = orderTierSql(tierKeywords, "s.group_name", "dc.price_list_name")
  const { where, params } = filterWhere(baseWhere(base), flt, tierExpr)

  const baseSelect = `
    SELECT
      MIN(f.${dateCol})::date  AS order_date,
      TRIM(f.staff_code)       AS staff_code,
      COALESCE(st.name, NULLIF(TRIM(f.staff_code), ''), 'Unassigned') AS staff_name,
      COALESCE(dc.name, TRIM(f.customer_code))  AS customer_name,
      TRIM(f.customer_code)    AS customer_code,
      f.order_code,
      COALESCE(MAX(f.company_code), '')  AS company_code,
      STRING_AGG(DISTINCT TRIM(f.sku), ', ' ORDER BY TRIM(f.sku)) AS order_name,
      STRING_AGG(DISTINCT COALESCE(sk.type_of_sim, 'Other'), ', ') AS sim_type,
      COALESCE(MAX(s.channel_name), '')  AS channel_name,
      COALESCE(UPPER(MAX(s.group_name)), '') AS channel_group,
      SUM(${qtyCol})::bigint   AS quantity,
      ROUND(
        SUM(f.${revCol})::numeric / NULLIF(SUM(${qtyCol})::numeric, 0)
      )::bigint                AS unit_price,
      SUM(f.${revCol})::bigint  AS total_revenue,
      SUM(${gpCol})::bigint    AS gross_profit,
      MAX(dc.price_list_name)  AS price_list_name
    FROM ${mainTable} f
    LEFT JOIN dim_staff        st ON TRIM(f.staff_code)    = TRIM(st.code)
    LEFT JOIN dim_customer     dc ON TRIM(f.customer_code) = dc.code
    -- dim_sku dedupe: có mã trùng (vd 3ETWNWMF01010 × 2) → JOIN thẳng sẽ nhân đôi doanh thu (fan-out).
    LEFT JOIN (SELECT TRIM(sku) AS sku, MAX(type_of_sim) AS type_of_sim FROM dim_sku GROUP BY TRIM(sku)) sk
      ON TRIM(f.sku) = sk.sku
    LEFT JOIN dim_order_source  s ON f.order_source_code   = s.code
    ${where}
    GROUP BY
      f.order_code,
      TRIM(f.staff_code),
      COALESCE(st.name, NULLIF(TRIM(f.staff_code), ''), 'Unassigned'),
      COALESCE(dc.name, TRIM(f.customer_code)),
      TRIM(f.customer_code)
  `

  const countSQL = `SELECT COUNT(*) AS total FROM (${baseSelect}) sub`
  const aggrSQL  = `SELECT SUM(total_revenue) AS sum_revenue, SUM(gross_profit) AS sum_gp, SUM(quantity) AS sum_qty
                    FROM (${baseSelect}) sub`
  // ORDER BY có tiebreaker order_code → phân trang ổn định (không trùng/sót khi export loop nhiều page)
  const dataSQL  = `${baseSelect} ORDER BY MIN(f.${dateCol}) DESC, f.order_code LIMIT ${limit} OFFSET ${offset}`

  try {
    // Cache TTL 15' (s196+20 — cùng lớp bug timeout đã fix cho B2C Advanced s195+15): export CSV (limit
    // 5000, group-by nặng nhất) chạy lại tươi mỗi lần bấm xuất, dễ chạm ngưỡng 60s khi data lớn dần.
    const tierHash = createHash("sha1").update(JSON.stringify(tierKeywords)).digest("hex").slice(0, 8)
    const cacheKey = `order-report:v2:${startDate}:${endDate}:${flt.staffCode}:${flt.channelGroup}:${flt.channel}:${flt.orderSource}:${flt.tier}:${tierHash}:${companyCode}:${dataSource}:${includeShip}:${includeInternalOps}:${isExport}:${page}:${limit}`
    const [countRows, aggrRows, dataRows] = await cachedQuery(
      cacheKey,
      () => Promise.all([
        // Đếm tổng đơn cho CẢ export (để client loop lấy hết) lẫn view thường
        queryAnalytics<{ total: string }>(countSQL, params),
        isExport ? Promise.resolve([{ sum_revenue: "0", sum_gp: "0", sum_qty: "0" }]) : queryAnalytics(aggrSQL, params),
        queryAnalytics(dataSQL, params),
      ]),
      15,
      false,
      ["order-report"],
    )

    const total = parseInt((countRows as any[])[0]?.total || "0")

    const aggr = (aggrRows as any[])[0] || {}
    const totalRevenue = Number(aggr.sum_revenue) || 0
    const totalGp      = Number(aggr.sum_gp)      || 0
    const totalQty     = Number(aggr.sum_qty)      || 0

    const rows = (dataRows as any[]).map(r => ({
      order_date:      r.order_date,
      staff_code:      r.staff_code,
      staff_name:      r.staff_name,
      customer_name:   r.customer_name,
      customer_code:   r.customer_code,
      order_code:      r.order_code,
      company_code:    r.company_code || null,
      order_name:      r.order_name,
      sim_type:        r.sim_type,
      channel_name:    r.channel_name,
      channel_group:   r.channel_group,
      quantity:        Number(r.quantity) || 0,
      unit_price:      Number(r.unit_price) || 0,
      total_revenue:   Number(r.total_revenue) || 0,
      gross_profit:    Number(r.gross_profit) || 0,
      price_list_name: r.price_list_name || null,
    }))

    return NextResponse.json(
      { rows, total, page, limit, totalRevenue, totalGp, totalQty },
      { headers: CACHE_HEADERS },
    )
  } catch (err: any) {
    console.error("[order-report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
