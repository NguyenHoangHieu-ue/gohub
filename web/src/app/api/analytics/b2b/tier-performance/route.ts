import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, getAnalyticsSource } from "@/lib/analytics-helpers"

// Phân loại tier từ price_list_name (nhất quán với quarterly-b2b-customers)
function classifyTier(priceListName: string | null): string {
  if (!priceListName) return "Strategic"
  const p = priceListName.toUpperCase()
  if (p.includes("STRATEGIC")) return "Strategic"
  if (p.includes("VIP")) return "VIP"
  if (p.includes("GOLD")) return "Gold"
  if (p.includes("SILVER")) return "Silver"
  return "Strategic"
}

function classifyRegion(priceListName: string | null, currencyCode: string | null): "VN" | "US" {
  const p = (priceListName || "").toUpperCase()
  const c = (currencyCode || "").toUpperCase()
  if (p.includes(" US") || p.startsWith("US ") || c === "USD") return "US"
  return "VN"
}

const EXCLUDED = ["B2C Customer US", "B2C Customer VN", "B2B Ops"]
const TIER_ORDER = ["Strategic", "VIP", "Gold", "Silver"]

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const { searchParams } = req.nextUrl
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split("T")[0]
  const startDate  = searchParams.get("startDate")  || fmt(new Date(today.getFullYear(), today.getMonth(), 1))
  const endDate    = searchParams.get("endDate")    || fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
  const dateColumn = searchParams.get("dateColumn") === "created_date" ? "created_date" : "fulfiled_date"
  const companyCode = searchParams.get("companyCode") || "ALL"

  // ISSUE-DASH-5: dùng getAnalyticsSource để Created mode đọc ĐÚNG nguồn (fact_sales_revenue + created_date,
  // GP=0) thay vì trước hardcode cột fulfilled nhưng lọc theo created_date (trộn 2 nguồn). Fulfillment KHÔNG đổi.
  const source = getAnalyticsSource(dateColumn)
  const gpExpr = source.marginCol === "0" ? "0" : `SUM(f.${source.marginCol})`
  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""
  const excludeList = EXCLUDED.map(n => `'${n.replace(/'/g, "''")}'`).join(",")
  const cacheKey = `b2b_tier:${startDate}:${endDate}:${dateColumn}:${companyCode}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const rows = await queryAnalytics<{
        price_list_name: string | null
        currency_code: string | null
        revenue: string
        gp: string
        orders: string
        units: string
      }>(`
        SELECT
          c.price_list_name,
          c.currency_code,
          SUM(f.${source.revenueCol}) AS revenue,
          ${gpExpr}                   AS gp,
          COUNT(DISTINCT f.order_code) AS orders,
          SUM(f.${source.quantityCol}) AS units
        FROM ${source.mainTable} f
        LEFT JOIN dim_order_source s ON f.order_source_code = s.code
        LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
        WHERE f.${source.dateCol}::date >= '${startDate}'
          AND f.${source.dateCol}::date <= '${endDate}'
          ${companyFilter}
          AND UPPER(COALESCE(s.group_name, '')) = 'B2B'
          AND COALESCE(c.name, TRIM(f.customer_code)) NOT IN (${excludeList})
        GROUP BY c.price_list_name, c.currency_code
      `)

      type TierAgg = { revenue: number; gp: number; orders: number; units: number }
      const emptyAgg = (): TierAgg => ({ revenue: 0, gp: 0, orders: 0, units: 0 })

      const tierAll  = new Map<string, TierAgg>()
      const tierByReg = new Map<string, { VN: TierAgg; US: TierAgg }>()
      TIER_ORDER.forEach(t => {
        tierAll.set(t, emptyAgg())
        tierByReg.set(t, { VN: emptyAgg(), US: emptyAgg() })
      })

      rows.forEach(r => {
        const tier   = classifyTier(r.price_list_name)
        const region = classifyRegion(r.price_list_name, r.currency_code)
        const rev = parseFloat(r.revenue || "0")
        const gp  = parseFloat(r.gp      || "0")
        const ord = parseFloat(r.orders  || "0")
        const unt = parseFloat(r.units   || "0")

        const a = tierAll.get(tier)!
        a.revenue += rev; a.gp += gp; a.orders += ord; a.units += unt

        const br = tierByReg.get(tier)![region]
        br.revenue += rev; br.gp += gp; br.orders += ord; br.units += unt
      })

      const r2 = Math.round
      const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 1000) / 10 : 0

      const tiers = TIER_ORDER
        .map(tier => {
          const all = tierAll.get(tier)!
          const vn  = tierByReg.get(tier)!.VN
          const us  = tierByReg.get(tier)!.US
          if (all.revenue === 0 && all.orders === 0) return null
          return {
            tier,
            totalRevenue: r2(all.revenue), totalGp: r2(all.gp),
            totalGpPct: pct(all.gp, all.revenue),
            totalOrders: r2(all.orders), totalUnits: r2(all.units),
            byRegion: {
              VN: { totalRevenue: r2(vn.revenue), totalGp: r2(vn.gp), totalGpPct: pct(vn.gp, vn.revenue), totalOrders: r2(vn.orders), totalUnits: r2(vn.units) },
              US: { totalRevenue: r2(us.revenue), totalGp: r2(us.gp), totalGpPct: pct(us.gp, us.revenue), totalOrders: r2(us.orders), totalUnits: r2(us.units) },
            },
          }
        })
        .filter(Boolean)

      return { tiers, startDate, endDate }
    }, QUERY_TTL_MIN)

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[b2b/tier-performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
