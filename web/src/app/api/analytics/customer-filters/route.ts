import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery, safeDate } from "@/lib/analytics-helpers"
import type { CustomerFilterData } from "@/lib/customers-filters"

export const maxDuration = 60

// Khách B2B CÓ ĐƠN trong kỳ (nguồn nhóm B2B) kèm kênh + PIC + số đơn + doanh thu, dạng "combo" gọn để trình duyệt tự lọc nhiều tầng
// (Tier → Kênh → PIC) và xếp theo doanh thu. Thay danh sách cũ `/api/customers` (50 tên theo thứ tự ABC, không biết khách nào còn hoạt động).
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
    SELECT TRIM(f.customer_code) AS code,
           COALESCE(NULLIF(TRIM(c.name::text), ''), TRIM(f.customer_code)) AS name,
           COALESCE(c.price_list_name, '') AS pln,
           COALESCE(TRIM(s.channel_name), '') AS channel,
           COALESCE(TRIM(f.staff_code), '') AS staff,
           COUNT(DISTINCT f.order_code)::int AS orders,
           COALESCE(SUM(f.${revCol}), 0)::bigint AS revenue
    FROM ${table} f
    LEFT JOIN dim_customer     c ON TRIM(f.customer_code) = c.code
    LEFT JOIN dim_order_source s ON f.order_source_code   = s.code
    WHERE f.${dateCol}::date BETWEEN $1 AND $2
      AND UPPER(COALESCE(s.group_name, '')) = 'B2B'
      AND TRIM(COALESCE(f.customer_code, '')) <> ''
    GROUP BY 1, 2, 3, 4, 5`

  try {
    const key = `customer-filters:v1:${startDate}:${endDate}:${created ? "c" : "f"}`
    const data = await cachedQuery<CustomerFilterData>(key, async () => {
      const [rows, staffRows] = await Promise.all([
        queryAnalytics<{ code: string; name: string; pln: string; channel: string; staff: string; orders: number; revenue: string }>(sql, [startDate, endDate]),
        queryAnalytics<{ code: string; name: string }>("SELECT TRIM(code) AS code, name FROM dim_staff"),
      ])
      const staffName = new Map(staffRows.map(r => [String(r.code), r.name]))
      const custIdx = new Map<string, number>(), chIdx = new Map<string, number>(), stIdx = new Map<string, number>()
      const customers: CustomerFilterData["customers"] = [], channels: string[] = [], staff: CustomerFilterData["staff"] = []
      const combos: CustomerFilterData["combos"] = []
      for (const r of rows) {
        let ci = custIdx.get(r.code)
        if (ci === undefined) { ci = customers.length; custIdx.set(r.code, ci); customers.push({ code: r.code, name: r.name, pln: r.pln }) }
        let chi = -1
        if (r.channel) { chi = chIdx.get(r.channel) ?? -1; if (chi < 0) { chi = channels.length; chIdx.set(r.channel, chi); channels.push(r.channel) } }
        let si = -1
        if (r.staff) { si = stIdx.get(r.staff) ?? -1; if (si < 0) { si = staff.length; stIdx.set(r.staff, si); staff.push({ code: r.staff, name: staffName.get(r.staff) || r.staff }) } }
        combos.push([ci, chi, si, Number(r.orders) || 0, Number(r.revenue) || 0])
      }
      return { customers, channels, staff, combos }
    }, 15, false, ["order-report"])
    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: unknown) {
    console.error("[customer-filters]", (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
