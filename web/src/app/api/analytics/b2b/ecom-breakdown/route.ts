import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, shipFilter, getMonthsInRange,
  CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache,
} from "@/lib/analytics-helpers"
import { getDaysInMonth, getDaysInRange } from "@/lib/analytics-engine/date-math"
import { calcChCostForPeriod, type CostLine } from "@/lib/analytics-engine/cost-engine"
import { fetchEcomCosts, ecomCostKey } from "@/lib/b2b-ecom-cost"

// VN Ecom → 3 KH (Lazada/Shopee/Tiktokshop) mỗi KH tách shop SIM/eSIM. Riêng Shopee-SIM tách thêm
// 2 shop con theo người tạo đơn (Hiếu chốt 2026-09-22, verify sống qua Dev Tools SQL trước khi code):
// HUỲNH LÊ MINH = Gohub, Kieu Anh = Nobrand. KHÔNG áp cho Lazada/Tiktokshop/eSIM — verify không có field
// nào khác (company_code/location_id/order_source_code) tách được 2 shop con này, chỉ staff_code khớp.
const SHOP_STAFF: Record<string, "Gohub" | "Nobrand"> = {
  "HUỲNH LÊ MINH": "Gohub",
  "KIEU ANH": "Nobrand",
}

type Bucket = { revenue: number; margin: number; units: number; orders: number }
const emptyBucket = (): Bucket => ({ revenue: 0, margin: 0, units: 0, orders: 0 })
const addRow = (b: Bucket, r: Record<string, string>) => {
  b.revenue += parseFloat(r.revenue || "0")
  b.margin  += parseFloat(r.margin  || "0")
  b.units   += parseFloat(r.units   || "0")
  b.orders  += parseInt(r.orders    || "0", 10)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate") || ""
  const endDate     = searchParams.get("endDate")   || ""
  const dateColumn  = searchParams.get("dateColumn") || "fulfiled_date"
  const includeShip = searchParams.get("includeShip") === "1"

  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate || null, endDate || null, source.dateCol)

  try {
    const key = `b2b-ecom2:${dateColumn}:${startDate}:${endDate}:${includeShip ? 1 : 0}`
    const payload = await cachedQuery(key, async () => {
      const rows = await queryAnalytics<Record<string, string>>(
        `SELECT c.name AS customer_name, ds.type_of_sim AS sim_type, st.name AS staff_name,
                TO_CHAR(f.${source.dateCol}::DATE, 'YYYY-MM') AS month,
                SUM(f.${source.revenueCol}) AS revenue, SUM(f.${source.marginCol}) AS margin,
                SUM(f.${source.quantityCol}) AS units, COUNT(*) AS orders
         FROM ${source.mainTable} f
         JOIN dim_customer c ON f.customer_code = c.code
         LEFT JOIN dim_sku ds ON f.sku = ds.sku
         LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
         WHERE c.name ILIKE 'VN Ecom %' AND ${filter} ${shipFilter(includeShip)}
         GROUP BY 1, 2, 3, 4`
      )

      type MonthRow = { month: string } & Bucket
      type Shop  = { name: string } & Bucket & { subshops?: ({ name: string } & Bucket & { monthly: MonthRow[] })[]; monthly: MonthRow[] }
      type Customer = { name: string } & Bucket & { shops: Shop[]; monthly: MonthRow[] }
      const customers = new Map<string, Customer>()

      const addMonthly = (list: MonthRow[], month: string, r: Record<string, string>) => {
        let mo = list.find(m => m.month === month)
        if (!mo) { mo = { month, ...emptyBucket() }; list.push(mo) }
        addRow(mo, r)
      }

      for (const r of rows) {
        const custName = r.customer_name
        if (!customers.has(custName)) customers.set(custName, { name: custName, ...emptyBucket(), shops: [], monthly: [] })
        const cust = customers.get(custName)!
        addRow(cust, r)
        addMonthly(cust.monthly, r.month, r)

        const simType = r.sim_type === "eSIM" ? "eSIM" : r.sim_type === "SIM" ? "SIM" : "Khác"
        let shop = cust.shops.find(s => s.name === simType)
        if (!shop) { shop = { name: simType, ...emptyBucket(), monthly: [] }; cust.shops.push(shop) }
        addRow(shop, r)
        addMonthly(shop.monthly, r.month, r)

        if (custName === "VN Ecom Shopee" && simType === "SIM") {
          const subName = SHOP_STAFF[(r.staff_name || "").trim().toUpperCase()] || "Khác"
          if (!shop.subshops) shop.subshops = []
          let sub = shop.subshops.find(s => s.name === subName)
          if (!sub) { sub = { name: subName, ...emptyBucket(), monthly: [] }; shop.subshops.push(sub) }
          addRow(sub, r)
          addMonthly(sub.monthly, r.month, r)
        }
      }

      // ── CH.Cost VN Ecom (Turso, riêng b2b_ecom_cost_monthly) → CM1/%CM1 pro-rata theo tháng ──────
      const months = startDate && endDate ? getMonthsInRange(startDate, endDate) : []
      const ecomCosts = months.length > 0 ? await fetchEcomCosts(months) : new Map()
      const withCost = <T extends Bucket & { name: string; monthly: MonthRow[] }>(item: T, custName: string, shopName: string, subshopName: string) => {
        let chCost = 0
        let costLines: CostLine[] = []
        for (const mo of item.monthly) {
          const rec = ecomCosts.get(ecomCostKey(mo.month, custName, shopName, subshopName))
          if (!rec) continue
          const dayRatio = getDaysInMonth(mo.month) > 0
            ? getDaysInRange(startDate || "", endDate || "", mo.month) / getDaysInMonth(mo.month) : 0
          chCost += calcChCostForPeriod(rec, mo.revenue, dayRatio)
          if (rec.cost_lines) {
            try {
              const lines: CostLine[] = typeof rec.cost_lines === "string" ? JSON.parse(rec.cost_lines) : (rec.cost_lines as unknown as CostLine[])
              costLines = costLines.concat(lines)
            } catch { /* ignore */ }
          }
        }
        const cm1 = item.margin - chCost
        return { ...item, ch_cost: chCost, cm1, cm1_percent: item.revenue > 0 ? (cm1 / item.revenue) * 100 : 0, cost_lines: costLines }
      }

      return Array.from(customers.values())
        .map(c => {
          const shops = c.shops
            .sort((a, b) => b.revenue - a.revenue)
            .map(s => {
              const subshops = s.subshops?.sort((a, b) => b.revenue - a.revenue)
                .map(sub => withCost(sub, c.name, s.name, sub.name))
              return { ...withCost(s, c.name, s.name, ""), subshops }
            })
          return { ...withCost(c, c.name, "", ""), shops }
        })
        .sort((a, b) => b.revenue - a.revenue)
    }, QUERY_TTL_MIN, noCache(req), ["b2b-ecom", "b2b-ecom-cost"])

    // nocache=1 (sau khi lưu CH.Cost) → route tự tính tươi NHƯNG nếu vẫn trả CACHE_HEADERS
    // (s-maxage=300) thì Vercel CDN cache theo đúng URL đó 5' — request nocache=1 THỨ 2 cùng
    // params (vd sửa cost lần 2) bị CDN trả thẳng bản đã cache ở lần đầu, không tới lại route.
    // Phát hiện qua QA sống 2026-09-22: sửa cost lần 2 không lên UI dù server tính đúng.
    return NextResponse.json(payload, { headers: noCache(req) ? { "Cache-Control": "no-store" } : CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2b/ecom-breakdown]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
