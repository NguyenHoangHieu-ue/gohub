import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { rollupCtx, ruHeaders, ruKey, serve } from "@/lib/rollup/serve"
import { rollupFirstDay, type PerfRow } from "@/lib/rollup/b2bperf"
import * as ch from "@/lib/rollup/channels"
import { analyticsGuard, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN } from "@/lib/analytics-helpers"

export const dynamic = "force-dynamic"

function classifyTier(priceListName: string | null): string {
  const p = (priceListName || "").toUpperCase()
  if (p.includes("VIP")) return "VIP"
  if (p.includes("GOLD")) return "Gold"
  if (p.includes("SILVER")) return "Silver"
  return "Strategic"
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate  = searchParams.get("startDate")  || ""
  const endDate    = searchParams.get("endDate")    || ""
  const dateColumn = searchParams.get("dateColumn") || "fulfiled_date"

  if (!startDate || !endDate) return NextResponse.json({ customers: [] }, { headers: CACHE_HEADERS })

  const dateFilter = `f.${dateColumn}::date >= '${startDate}' AND f.${dateColumn}::date <= '${endDate}'`

  const ctx = await rollupCtx("channels-b2b-customers")
  const key = `ch-b2b-cust${ruKey(ctx)}:${dateColumn}:${startDate}:${endDate}`

  try {
    const first = ctx.mode !== "off" && dateColumn === "fulfiled_date" ? await rollupFirstDay("ful").catch(() => null) : null
    const useRu = !!first && startDate >= first && startDate <= endDate
    const rawRows = () => queryAnalytics<PerfRow>(`
      SELECT
        TRIM(f.customer_code) as customer_code,
        COALESCE(c.name, TRIM(f.customer_code)) as customer_name,
        c.price_list_name,
        SUM(f.fulfilled_revenue_amount_vnd) as revenue,
        SUM(f.gross_profit_vnd) as margin,
        COUNT(DISTINCT f.order_code) as orders,
        SUM(f.fulfilled_quantity) as units
      FROM fact_fulfillment_revenue f
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN dim_customer c ON TRIM(f.customer_code) = c.code
      WHERE ${dateFilter}
        AND UPPER(COALESCE(s.group_name, '')) = 'B2B'
        AND NOT (UPPER(COALESCE(c.price_list_name, '')) LIKE '%INACTIVE%')
        AND COALESCE(c.name, TRIM(f.customer_code)) NOT ILIKE '%B2C Customer%'
        AND COALESCE(c.name, TRIM(f.customer_code)) NOT ILIKE '%B2B Ops%'
        AND f.sku != 'SHIPPINGFEE0'
      GROUP BY 1, 2, 3
      ORDER BY SUM(f.fulfilled_revenue_amount_vnd) DESC
    `)
    const rows = await cachedQuery(key, () => useRu ? serve<PerfRow[]>(ctx, rawRows, () => ch.fetchChB2bCustomersRollup(startDate, endDate), ch.diffChB2bCustomers, { startDate, endDate, dateColumn }) : rawRows(), QUERY_TTL_MIN)

    const customers = (rows as any[]).map(r => ({
      customer_code: r.customer_code,
      customer_name: r.customer_name,
      price_list_name: r.price_list_name,
      tier: classifyTier(r.price_list_name),
      revenue: parseFloat(r.revenue || "0"),
      margin: parseFloat(r.margin || "0"),
      orders: parseInt(r.orders || "0"),
      units: parseInt(r.units || "0"),
    }))

    return NextResponse.json({ customers }, { headers: ruHeaders(ctx, CACHE_HEADERS) })
  } catch (err: any) {
    console.error("[channels/b2b-customers]", err.message)
    return NextResponse.json({ customers: [] }, { status: 500 })
  }
}
