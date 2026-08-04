import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS, analyticsGuard, shipFilter, internalOpsFilterByCode } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const startDate = req.nextUrl.searchParams.get("startDate") || ""
  const endDate   = req.nextUrl.searchParams.get("endDate") || ""
  const includeShip        = req.nextUrl.searchParams.get("includeShip")        === "1"
  const includeInternalOps = req.nextUrl.searchParams.get("includeInternalOps") === "1"

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 })
  }

  const sfx = `${shipFilter(includeShip)} ${internalOpsFilterByCode(includeInternalOps)}`
  const cacheKey = `fulfillment-report:${startDate}:${endDate}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const params = [startDate, endDate]

      const [monthlyRows, catLocRows, locRows, overallLocRows] = await Promise.all([
        queryAnalytics<{
          month: string; gross_orders: string; revenue: string; items_delivery: string
        }>(`SELECT TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') as month,
                   COUNT(DISTINCT f.order_code) as gross_orders,
                   SUM(f.fulfilled_revenue_amount_vnd) as revenue,
                   SUM(f.fulfilled_quantity) as items_delivery
            FROM fact_fulfillment_revenue f
            WHERE f.fulfiled_date::date BETWEEN $1 AND $2 ${sfx}
            GROUP BY 1 ORDER BY 1 DESC`, params),

        queryAnalytics<{
          month: string; product_type: string; location: string
          orders: string; units: string; revenue: string
        }>(`SELECT TO_CHAR(fulfiled_date::date, 'YYYY-MM') as month,
                   COALESCE(v.type_of_sim, 'Others') as product_type,
                   l.location_name as location,
                   COUNT(DISTINCT f.order_code) as orders,
                   SUM(fulfilled_quantity) as units,
                   SUM(fulfilled_revenue_amount_vnd) as revenue
            FROM fact_fulfillment_revenue f
            LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) v ON f.sku = v.sku
            LEFT JOIN dim_location l ON f.location_id = l.location_id
            WHERE f.fulfiled_date::date BETWEEN $1 AND $2 ${sfx}
            GROUP BY 1, 2, 3`, params),

        queryAnalytics<{
          month: string; location: string; orders: string; units: string; revenue: string
        }>(`SELECT TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') as month,
                   l.location_name as location,
                   COUNT(DISTINCT f.order_code) as orders,
                   SUM(f.fulfilled_quantity) as units,
                   SUM(f.fulfilled_revenue_amount_vnd) as revenue
            FROM fact_fulfillment_revenue f
            LEFT JOIN dim_location l ON f.location_id = l.location_id
            WHERE f.fulfiled_date::date BETWEEN $1 AND $2 ${sfx}
            GROUP BY 1, 2`, params),

        queryAnalytics<{ location: string; orders: string; units: string }>(
          `SELECT l.location_name as location,
                  COUNT(DISTINCT f.order_code) as orders,
                  SUM(f.fulfilled_quantity) as units
           FROM fact_fulfillment_revenue f
           LEFT JOIN dim_location l ON f.location_id = l.location_id
           WHERE f.fulfiled_date::date BETWEEN $1 AND $2 ${sfx}
           GROUP BY 1 ORDER BY orders DESC LIMIT 10`, params),
      ])

      const monthly = monthlyRows.map(r => {
        const grossOrders = parseInt(r.gross_orders || "0")

        const categories: Record<string, {
          units: number; orders: number; revenue: number
          locations: Record<string, { units: number; orders: number; revenue: number }>
        }> = {}

        catLocRows.filter(c => c.month === r.month).forEach(c => {
          const key = c.product_type.toLowerCase().replace(/\s+/g, "_")
          if (!categories[key]) categories[key] = { units: 0, orders: 0, revenue: 0, locations: {} }
          categories[key].units   += parseInt(c.units || "0")
          categories[key].orders  += parseInt(c.orders || "0")
          categories[key].revenue += parseFloat(c.revenue || "0")
          if (c.location) {
            categories[key].locations[c.location] = {
              units:   parseInt(c.units || "0"),
              orders:  parseInt(c.orders || "0"),
              revenue: parseFloat(c.revenue || "0"),
            }
          }
        })

        return {
          month: r.month,
          gross_orders: grossOrders,
          revenue: parseFloat(r.revenue || "0"),
          items_delivery: parseInt(r.items_delivery || "0"),
          categories,
          locations: locRows
            .filter(l => l.month === r.month)
            .map(l => ({
              name:    l.location,
              orders:  parseInt(l.orders || "0"),
              units:   parseInt(l.units || "0"),
              revenue: parseFloat(l.revenue || "0"),
            })),
        }
      })

      return {
        monthly,
        overall_locations: overallLocRows.map(r => ({
          name:   r.location,
          orders: parseInt(r.orders || "0"),
          units:  parseInt(r.units || "0"),
        })),
      }
    })

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[fulfillment-report]", err.message)
    return NextResponse.json({ error: err.message, message: err.message }, { status: 500 })
  }
}
