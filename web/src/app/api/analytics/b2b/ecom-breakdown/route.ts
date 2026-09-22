import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, shipFilter,
  CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache,
} from "@/lib/analytics-helpers"

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
    const key = `b2b-ecom1:${dateColumn}:${startDate}:${endDate}:${includeShip ? 1 : 0}`
    const payload = await cachedQuery(key, async () => {
      const rows = await queryAnalytics<Record<string, string>>(
        `SELECT c.name AS customer_name, ds.type_of_sim AS sim_type, st.name AS staff_name,
                SUM(f.${source.revenueCol}) AS revenue, SUM(f.${source.marginCol}) AS margin,
                SUM(f.${source.quantityCol}) AS units, COUNT(*) AS orders
         FROM ${source.mainTable} f
         JOIN dim_customer c ON f.customer_code = c.code
         LEFT JOIN dim_sku ds ON f.sku = ds.sku
         LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
         WHERE c.name ILIKE 'VN Ecom %' AND ${filter} ${shipFilter(includeShip)}
         GROUP BY 1, 2, 3`
      )

      type Shop  = { name: string } & Bucket & { subshops?: ({ name: string } & Bucket)[] }
      type Customer = { name: string } & Bucket & { shops: Shop[] }
      const customers = new Map<string, Customer>()

      for (const r of rows) {
        const custName = r.customer_name
        if (!customers.has(custName)) customers.set(custName, { name: custName, ...emptyBucket(), shops: [] })
        const cust = customers.get(custName)!
        addRow(cust, r)

        const simType = r.sim_type === "eSIM" ? "eSIM" : r.sim_type === "SIM" ? "SIM" : "Khác"
        let shop = cust.shops.find(s => s.name === simType)
        if (!shop) { shop = { name: simType, ...emptyBucket() }; cust.shops.push(shop) }
        addRow(shop, r)

        if (custName === "VN Ecom Shopee" && simType === "SIM") {
          const subName = SHOP_STAFF[(r.staff_name || "").trim().toUpperCase()] || "Khác"
          if (!shop.subshops) shop.subshops = []
          let sub = shop.subshops.find(s => s.name === subName)
          if (!sub) { sub = { name: subName, ...emptyBucket() }; shop.subshops.push(sub) }
          addRow(sub, r)
        }
      }

      return Array.from(customers.values())
        .map(c => ({
          ...c,
          shops: c.shops
            .sort((a, b) => b.revenue - a.revenue)
            .map(s => ({ ...s, subshops: s.subshops?.sort((a, b) => b.revenue - a.revenue) })),
        }))
        .sort((a, b) => b.revenue - a.revenue)
    }, QUERY_TTL_MIN, noCache(req), ["b2b-ecom"])

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2b/ecom-breakdown]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
