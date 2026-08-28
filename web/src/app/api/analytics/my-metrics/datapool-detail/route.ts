import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"
import { canWriteTab } from "@/lib/writable-tabs"
import { parseQuarterLabel } from "@/lib/okr-helpers"

const READ_ROLES = ["admin", "creator", "bod"]

// Chi tiết theo SKU cho card "%Datapool Rev" — Hiếu yêu cầu xem đơn/rev/SKU thay vì chỉ số tổng theo tháng.
// GET ?quarter=Q3-2026 (nhận cả dạng "Q3" lẫn "Q3-2026", quarterRange tự chuẩn hoá qua parseQuarterLabel)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarterParam = req.nextUrl.searchParams.get("quarter") ?? "Q3-2026"
  const quarter = quarterParam.includes("-") ? quarterParam : `${quarterParam}-2026`
  const { start, end } = parseQuarterLabel(quarter)

  const cacheKey = `okr_datapool_detail:${quarter}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const rows = await queryAnalytics<{
        sku: string; vendor: string | null; category: string | null
        rev: string | null; units: string | null; orders: string | null
      }>(
        `SELECT TRIM(f.sku) AS sku, v.vendor, v.category_name AS category,
                SUM(f.fulfilled_revenue_amount_vnd)::bigint AS rev,
                SUM(f.fulfilled_quantity)::bigint            AS units,
                COUNT(DISTINCT f.order_code)::bigint          AS orders
         FROM fact_fulfillment_revenue f
         JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) v
           ON TRIM(f.sku) = v.sku
         WHERE f.fulfiled_date IS NOT NULL
           AND f.fulfiled_date::date BETWEEN $1::date AND $2::date
           AND f.fulfiled_date::date <= CURRENT_DATE - 1
           AND REPLACE(UPPER(TRIM(v.vendor)),' ','') IN ('3HKDATAPOOL','BCDATAPOOL')
         GROUP BY 1, 2, 3
         ORDER BY rev DESC`,
        [start, end]
      )

      const items = rows.map(r => ({
        sku: r.sku,
        vendor: (r.vendor ?? "").trim().toUpperCase().replace(/\s+/g, "") === "3HKDATAPOOL" ? "3HK Datapool" : "BC Datapool",
        category: r.category,
        rev: Number(r.rev) || 0,
        units: Number(r.units) || 0,
        orders: Number(r.orders) || 0,
      }))

      return {
        quarter, start, end,
        items,
        total_rev: items.reduce((a, r) => a + r.rev, 0),
        total_orders: items.reduce((a, r) => a + r.orders, 0),
        total_units: items.reduce((a, r) => a + r.units, 0),
      }
    }, 720)

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[my-metrics/datapool-detail]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
