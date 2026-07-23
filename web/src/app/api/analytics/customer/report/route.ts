import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getMonthsInRange } from "@/lib/analytics-helpers"
import { getDimCustomerCols } from "@/lib/dim-schema"
import { fetchCustomerCosts, calcRecordCost } from "@/lib/b2b-customer-cost"
import { fetchQuarterlySettings, makeClassifyTier } from "@/lib/quarterly-settings"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { startDate, endDate, dateColumn = "fulfiled_date", customers, period = "month" } = body

  if (!customers || customers.length === 0) {
    return NextResponse.json({ kpis: [], trend: [], performance: [], products: [], channelDistribution: [], orders: [] })
  }

  try {
    const source = getAnalyticsSource(dateColumn)

    // Probe dim_customer schema để dùng đúng tên cột
    const { codeCol: custCodeCol, nameCol: custNameCol } = await getDimCustomerCols()

    // Resolve customer names → codes
    const customerNames = customers.map((c: string) => `'${String(c).trim().replace(/'/g, "''")}'`).join(",")
    const codeRows = await queryAnalytics<{ code: string; name: string }>(
      `SELECT TRIM(${custCodeCol}::text) as code, TRIM(${custNameCol}::text) as name FROM dim_customer WHERE TRIM(${custNameCol}::text) IN (${customerNames})`
    )

    const codeToName = new Map<string, string>()
    codeRows.forEach(r => { if (r.code) codeToName.set(r.code, r.name) })

    const allCodes = Array.from(new Set([
      ...codeRows.map(r => r.code),
      ...customers.map((c: string) => String(c).trim()),
    ])).filter(Boolean)

    if (!allCodes.length) {
      return NextResponse.json({ kpis: [], trend: [], performance: [], products: [], channelDistribution: [], orders: [] })
    }

    const codesList = allCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(",")

    // Date range for prev period comparison
    const currentStart = new Date(startDate)
    const currentEnd = new Date(endDate)
    const days = (currentEnd.getTime() - currentStart.getTime()) / (1000 * 3600 * 24)
    const prevStart = new Date(currentStart.getTime() - days * 86400000)
    const prevEnd = new Date(currentStart.getTime() - 1)

    // Single query covering both periods
    // Fetch settings + costs + rows in parallel
    const months = getMonthsInRange(startDate, endDate)
    const [{ tierKeywords }, costMap, priceListMap, rows] = await Promise.all([
      fetchQuarterlySettings(),
      fetchCustomerCosts(months),
      // Lấy price_list_name cho tier classification
      queryAnalytics<{ code: string; price_list_name: string | null }>(
        `SELECT TRIM(${custCodeCol}::text) as code, price_list_name FROM dim_customer WHERE TRIM(${custCodeCol}::text) IN (${codesList})`
      ).then(r => { const m = new Map<string, string | null>(); r.forEach(x => m.set(x.code, x.price_list_name)); return m }),
      queryAnalytics<{
        code: string; date: string; order_code: string; sku: string
        revenue: string; margin: string; quantity: string
        channel_name: string; product_name: string; is_3hk: string
      }>(
        `SELECT
           TRIM(f.customer_code) as code,
           f.${source.dateCol} as date,
           f.order_code,
           f.sku,
           f.${source.revenueCol} as revenue,
           f.${source.marginCol} as margin,
           f.${source.quantityCol} as quantity,
           TRIM(s.channel_name) as channel_name,
           v.type_of_sim as product_name,
           CASE WHEN REPLACE(UPPER(TRIM(v.vendor)),' ','') = '3HKDATAPOOL' THEN '1' ELSE '0' END as is_3hk
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         LEFT JOIN dim_sku v ON f.sku = v.sku
         WHERE TRIM(f.customer_code) IN (${codesList})
           AND f.${source.dateCol} >= $1 AND f.${source.dateCol} <= $2`,
        [prevStart.toISOString().split("T")[0], currentEnd.toISOString().split("T")[0]]
      ),
    ])
    const classifyTier = makeClassifyTier(tierKeywords)

    // Aggregation in JS (mirrors intel logic)
    let currRev = 0, currMar = 0, prevRev = 0, prevMar = 0
    let currUnits = 0, prevUnits = 0
    const currOrders = new Set<string>()
    const prevOrders = new Set<string>()

    const trendMap = new Map<string, { name: string; revenue: number; prev_revenue: number; margin: number; active_customers: Set<string> }>()
    const perfMap = new Map<string, { code: string; name: string; revenue: number; margin: number; hk3Rev: number; orders: Set<string>; units: number; last_order: Date }>()
    const productsMap = new Map<string, { sku: string; product_name: string; revenue: number; quantity: number; orders: Set<string> }>()
    const channelsMap = new Map<string, number>()
    const orderMap = new Map<string, { order_code: string; customer_name: string; product_name: string; order_date: Date; revenue: number; items: number }>()

    function getTrendKey(d: Date, isPrev: boolean): string {
      let shifted = d
      if (isPrev) {
        shifted = new Date(d.getTime() + (currentStart.getTime() - prevStart.getTime()))
      }
      if (period === "day") return shifted.toISOString().split("T")[0]
      if (period === "week") {
        const tmp = new Date(Date.UTC(shifted.getFullYear(), shifted.getMonth(), shifted.getDate()))
        tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7))
        const ys = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
        const wn = Math.ceil(((tmp.getTime() - ys.getTime()) / 86400000 + 1) / 7)
        return `${tmp.getUTCFullYear()}-W${String(wn).padStart(2, "0")}`
      }
      return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`
    }

    rows.forEach(row => {
      const rowDate = new Date(row.date)
      const isCurrent = rowDate >= currentStart && rowDate <= currentEnd
      const isPrev = rowDate >= prevStart && rowDate <= prevEnd
      if (!isCurrent && !isPrev) return

      const customerName = codeToName.get(row.code) || (row.code === "NaN" || !row.code ? "Chưa xác định" : row.code)
      const rev = parseFloat(row.revenue || "0")
      const mar = parseFloat(row.margin || "0")
      const qty = parseFloat(row.quantity || "0")
      const hk3 = row.is_3hk === "1" ? rev : 0

      if (isCurrent) {
        currRev += rev; currMar += mar; currUnits += qty
        currOrders.add(row.order_code)

        const tk = getTrendKey(rowDate, false)
        if (!trendMap.has(tk)) trendMap.set(tk, { name: tk, revenue: 0, prev_revenue: 0, margin: 0, active_customers: new Set() })
        const t = trendMap.get(tk)!
        t.revenue += rev; t.margin += mar; t.active_customers.add(customerName)

        if (!perfMap.has(customerName)) perfMap.set(customerName, { code: row.code, name: customerName, revenue: 0, margin: 0, hk3Rev: 0, orders: new Set(), units: 0, last_order: rowDate })
        const p = perfMap.get(customerName)!
        p.revenue += rev; p.margin += mar; p.hk3Rev += hk3; p.units += qty; p.orders.add(row.order_code)
        if (rowDate > p.last_order) p.last_order = rowDate

        if (row.sku) {
          if (!productsMap.has(row.sku)) productsMap.set(row.sku, { sku: row.sku, product_name: row.product_name || row.sku, revenue: 0, quantity: 0, orders: new Set() })
          const prod = productsMap.get(row.sku)!
          prod.revenue += rev; prod.quantity += qty; prod.orders.add(row.order_code)
        }

        const ch = row.channel_name || "Unknown"
        channelsMap.set(ch, (channelsMap.get(ch) || 0) + rev)

        if (row.order_code) {
          const key = `${row.order_code}_${row.product_name || row.sku}`
          if (!orderMap.has(key)) orderMap.set(key, { order_code: row.order_code, customer_name: customerName, product_name: row.product_name || row.sku || "Unknown", order_date: rowDate, revenue: 0, items: 0 })
          const ord = orderMap.get(key)!
          ord.revenue += rev; ord.items += qty
          if (rowDate > ord.order_date) ord.order_date = rowDate
        }
      } else {
        prevRev += rev; prevMar += mar; prevUnits += qty
        prevOrders.add(row.order_code)

        const tk = getTrendKey(rowDate, true)
        if (!trendMap.has(tk)) trendMap.set(tk, { name: tk, revenue: 0, prev_revenue: 0, margin: 0, active_customers: new Set() })
        trendMap.get(tk)!.prev_revenue += rev
      }
    })

    const currOrderCount = currOrders.size
    const prevOrderCount = prevOrders.size
    const currAov = currOrderCount > 0 ? currRev / currOrderCount : 0
    const prevAov = prevOrderCount > 0 ? prevRev / prevOrderCount : 0

    const kpis = [
      { label: "Revenue", value: currRev, lastPeriod: prevRev, change: currRev - prevRev, isPositive: currRev >= prevRev, isCurrency: true },
      { label: "Total Orders", value: currOrderCount, lastPeriod: prevOrderCount, change: currOrderCount - prevOrderCount, isPositive: currOrderCount >= prevOrderCount },
      { label: "Units Sold", value: currUnits, lastPeriod: prevUnits, change: currUnits - prevUnits, isPositive: currUnits >= prevUnits },
      { label: "Average Order Value", value: currAov, lastPeriod: prevAov, change: currAov - prevAov, isPositive: currAov >= prevAov, isCurrency: true },
      { label: "Total Margin", value: currMar, lastPeriod: prevMar, change: currMar - prevMar, isPositive: currMar >= prevMar, isCurrency: true },
    ]

    const trend = Array.from(trendMap.values())
      .map(t => ({ name: t.name, active_customers: t.active_customers.size, revenue: t.revenue, prev_revenue: t.prev_revenue, margin: t.margin }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Tính CM1 per-customer: GP - CH.Cost từ Turso
    const performance = Array.from(perfMap.values())
      .map(p => {
        let custCost = 0
        months.forEach(m => {
          const rec = costMap.get(`${m}_${p.code}`)
          if (rec) custCost += calcRecordCost(rec, p.revenue / Math.max(months.length, 1))
        })
        const cm1 = p.margin - custCost
        const tier = classifyTier(priceListMap.get(p.code) ?? null)
        return {
          name: p.name, code: p.code, tier,
          revenue: p.revenue, margin: p.margin,
          cm1, cm1_pct: p.revenue > 0 ? cm1 / p.revenue * 100 : 0,
          channel_cost: custCost,
          margin_percent: p.revenue > 0 ? p.margin / p.revenue * 100 : 0,
          hk3_rev: p.hk3Rev, hk3_pct: p.revenue > 0 ? p.hk3Rev / p.revenue * 100 : 0,
          orders: p.orders.size, units: p.units, last_order: p.last_order,
        }
      })
      .sort((a, b) => b.revenue - a.revenue)

    const products = Array.from(productsMap.values())
      .map(p => ({ sku: p.sku, product_name: p.product_name, revenue: p.revenue, quantity: p.quantity, orders: p.orders.size }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 20)

    const channelDistribution = Array.from(channelsMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    const orders = Array.from(orderMap.values())
      .sort((a, b) => b.order_date.getTime() - a.order_date.getTime()).slice(0, 50)

    return NextResponse.json({ kpis, trend, performance, products, channelDistribution, orders })
  } catch (err: any) {
    console.error("[customer/report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
