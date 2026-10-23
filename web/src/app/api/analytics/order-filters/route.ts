import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery } from "@/lib/analytics-helpers"
import { baseWhere, parseOrderBase } from "@/lib/orders-where"
import type { FilterSource, FilterStaff, OrderFilterData } from "@/lib/orders-filters"

export const maxDuration = 60

// Lựa chọn cho các bộ lọc tab Orders (Nhóm, Kênh, Nguồn, PIC, Tier) CHỈ GỒM những gì có đơn trong kỳ + số đơn, trả gọn dạng
// "combo" (nguồn × PIC × bảng giá → số đơn) để trình duyệt tự lọc nhiều tầng (chọn nhóm thì kênh/nguồn/PIC thu hẹp theo) không cần gọi lại.
// Dùng CÙNG điều kiện ngày/Entity/Phí ship/Đơn nội bộ với order-report (lib/orders-where.ts).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const base = parseOrderBase(req.nextUrl.searchParams)
  if ("error" in base) return NextResponse.json({ error: base.error }, { status: 400 })
  const { where, params } = baseWhere(base)

  const comboSql = `
    SELECT COALESCE(s.code, 'nan') AS src, COALESCE(TRIM(f.staff_code), '') AS staff, COALESCE(dc.price_list_name, '') AS pln,
           COUNT(DISTINCT f.order_code)::int AS orders
    FROM ${base.mainTable} f
    LEFT JOIN dim_customer     dc ON TRIM(f.customer_code) = dc.code
    LEFT JOIN dim_order_source  s ON f.order_source_code   = s.code
    ${where}
    GROUP BY 1, 2, 3`

  try {
    const key = `order-filters:v1:${base.startDate}:${base.endDate}:${base.companyCode}:${base.dataSource}:${base.includeShip}:${base.includeInternalOps}`
    const data = await cachedQuery<OrderFilterData>(key, async () => {
      const [combos, srcRows, staffRows] = await Promise.all([
        queryAnalytics<{ src: string; staff: string; pln: string; orders: number }>(comboSql, params),
        queryAnalytics<{ code: string; name: string | null; sapo_name: string | null; old_name: string | null; channel_name: string | null; group_name: string | null; status: string | null }>(
          "SELECT code, name, sapo_name, old_name, channel_name, group_name, status FROM dim_order_source"),
        queryAnalytics<{ code: string; name: string }>("SELECT TRIM(code) AS code, name FROM dim_staff"),
      ])
      const srcMeta = new Map(srcRows.map(r => [String(r.code), r]))
      const srcIdx = new Map<string, number>(), staffIdx = new Map<string, number>(), plnIdx = new Map<string, number>()
      const sources: FilterSource[] = [], staff: FilterStaff[] = [], plns: string[] = []
      const staffName = new Map(staffRows.map(r => [String(r.code), r.name]))
      const out: [number, number, number, number][] = []
      for (const c of combos) {
        let si = srcIdx.get(c.src)
        if (si === undefined) {
          const m = srcMeta.get(c.src)
          si = sources.length; srcIdx.set(c.src, si)
          sources.push({ code: c.src, name: m?.name || m?.sapo_name || m?.old_name || c.src, channel: (m?.channel_name ?? "").trim(), group: (m?.group_name ?? "").trim(), status: m?.status ?? "" })
        }
        let ti = -1
        if (c.staff) {
          ti = staffIdx.get(c.staff) ?? -1
          if (ti < 0) { ti = staff.length; staffIdx.set(c.staff, ti); staff.push({ code: c.staff, name: staffName.get(c.staff) || c.staff }) }
        }
        let pi = plnIdx.get(c.pln)
        if (pi === undefined) { pi = plns.length; plnIdx.set(c.pln, pi); plns.push(c.pln) }
        out.push([si, ti, pi, Number(c.orders) || 0])
      }
      return { sources, staff, plns, combos: out }
    }, 15, false, ["order-report"])
    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: unknown) {
    console.error("[order-filters]", (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
