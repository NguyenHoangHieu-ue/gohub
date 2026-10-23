import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery, safeDate } from "@/lib/analytics-helpers"
import type { VendorFilterData } from "@/lib/vendors-filters"

export const maxDuration = 60

// Vendor / Nhóm kênh / Kênh có doanh thu trong kỳ (chuẩn "doanh thu SP thuần" của tab Vendors: loại phí ship + đơn nội bộ), dạng "combo"
// gọn để trình duyệt tự lọc nhiều tầng + xếp theo doanh thu. Vendor lấy từ dim_sku (dedupe theo SKU để không nhân đôi doanh thu).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const p = req.nextUrl.searchParams
  const startDate = safeDate(p.get("startDate")), endDate = safeDate(p.get("endDate"))
  if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 })
  const created = p.get("dateColumn") === "created_date"
  const table = created ? "fact_sales_revenue" : "fact_fulfillment_revenue"
  const dateCol = created ? "created_date" : "fulfiled_date"
  const revCol = created ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd"

  const sql = `
    SELECT v.vendor AS vendor,
           COALESCE(UPPER(TRIM(s.group_name)), '') AS grp,
           COALESCE(TRIM(s.channel_name), '') AS channel,
           COUNT(DISTINCT f.order_code)::int AS orders,
           COALESCE(SUM(f.${revCol}), 0)::bigint AS revenue
    FROM ${table} f
    JOIN (SELECT TRIM(sku) AS sku, MAX(TRIM(vendor)) AS vendor FROM dim_sku WHERE vendor IS NOT NULL AND TRIM(vendor) <> '' GROUP BY TRIM(sku)) v
      ON TRIM(f.sku) = v.sku
    LEFT JOIN dim_order_source s ON f.order_source_code = s.code
    WHERE f.${dateCol}::date BETWEEN $1 AND $2
      AND f.sku != 'SHIPPINGFEE0'
      AND f.order_source_code IS NOT NULL   -- trang loại bằng NOT IN (NULL cũng bị loại)
      AND UPPER(COALESCE(s.group_name, '')) != 'INTERNAL-TRANSACTION'
    GROUP BY 1, 2, 3`

  try {
    const key = `vendor-filters:v1:${startDate}:${endDate}:${created ? "c" : "f"}`
    const data = await cachedQuery<VendorFilterData>(key, async () => {
      const rows = await queryAnalytics<{ vendor: string; grp: string; channel: string; orders: number; revenue: string }>(sql, [startDate, endDate])
      const vIdx = new Map<string, number>(), gIdx = new Map<string, number>(), cIdx = new Map<string, number>()
      const vendors: string[] = [], groups: string[] = [], channels: string[] = []
      const combos: VendorFilterData["combos"] = []
      for (const r of rows) {
        let vi = vIdx.get(r.vendor)
        if (vi === undefined) { vi = vendors.length; vIdx.set(r.vendor, vi); vendors.push(r.vendor) }
        let gi = -1
        if (r.grp) { gi = gIdx.get(r.grp) ?? -1; if (gi < 0) { gi = groups.length; gIdx.set(r.grp, gi); groups.push(r.grp) } }
        let ci = -1
        if (r.channel) { ci = cIdx.get(r.channel) ?? -1; if (ci < 0) { ci = channels.length; cIdx.set(r.channel, ci); channels.push(r.channel) } }
        combos.push([vi, gi, ci, Number(r.orders) || 0, Number(r.revenue) || 0])
      }
      return { vendors, groups, channels, combos }
    }, 15, false, ["order-report"])
    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: unknown) {
    console.error("[vendor-filters]", (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
