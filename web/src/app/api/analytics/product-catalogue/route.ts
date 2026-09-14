import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import {
  getDestinationSQL, shipFilter, internalOpsFilter, getCountryMappings,
  CACHE_HEADERS, cachedQuery, analyticsGuard,
} from "@/lib/analytics-helpers"

// GoHub Product Catalogue — tổng hợp "dòng sản phẩm" (vendor × SIM/eSIM) theo destination, xếp hạng
// bằng số liệu thật (revenue/units/growth) để gắn badge Best Seller/Fastest Growing/Best Value.
// 1 câu query tổng hợp DUY NHẤT cho gohub_dw (không loop theo destination/line — rule N+1, s197).
// v1 cố định 90 ngày gần nhất so với 90 ngày trước đó (growth), chưa có date-range picker (xem plan).

const TOP_DESTINATIONS = 8
const GROWTH_BADGE_THRESHOLD = 15   // % — dưới ngưỡng này không gắn badge "Đang tăng trưởng mạnh"
const MIN_UNITS_FOR_VALUE_BADGE = 10 // tránh outlier 1-2 đơn lẻ thành "Giá tốt nhất"

interface LineRow {
  destination: string; vendor: string; typeOfSim: string
  revenue: number; prevRevenue: number; units: number; margin: number
  topSku: string; topSkuRevenue: number
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  try {
    const payload = await cachedQuery("product-catalogue:v1", async () => {
      const destExpr = getDestinationSQL()
      const sfx = `${shipFilter(false)} ${internalOpsFilter(false)}`

      // 1 query duy nhất: gộp 2 kỳ (current 90d / previous 90d) bằng CASE, group theo
      // destination×vendor×type_of_sim×sku (cần sku để lấy top-SKU đại diện mỗi dòng SP).
      const rows = await queryAnalytics<Record<string, string>>(
        `WITH tagged AS (
           SELECT f.sku, TRIM(v.vendor) as vendor, v.type_of_sim,
                  f.fulfilled_revenue_amount_vnd as revenue, f.gross_profit_vnd as margin,
                  f.fulfilled_quantity as units,
                  CASE WHEN f.fulfiled_date::date >= CURRENT_DATE - INTERVAL '90 days' THEN 'current'
                       WHEN f.fulfiled_date::date >= CURRENT_DATE - INTERVAL '180 days' THEN 'previous'
                       ELSE NULL END as period,
                  ${destExpr} as destination
           FROM fact_fulfillment_revenue f
           LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) v ON TRIM(f.sku) = TRIM(v.sku)
           WHERE f.fulfiled_date::date >= CURRENT_DATE - INTERVAL '180 days'
             AND f.fulfiled_date::date <= CURRENT_DATE - 1
             AND f.sku != 'SHIPPINGFEE0' ${sfx}
             AND v.vendor IS NOT NULL AND v.type_of_sim IS NOT NULL
         )
         SELECT destination, vendor, type_of_sim, period, sku,
                SUM(revenue) as revenue, SUM(margin) as margin, SUM(units) as units
         FROM tagged
         WHERE period IS NOT NULL
         GROUP BY destination, vendor, type_of_sim, period, sku`
      )

      // Top-N destination theo tổng revenue kỳ hiện tại (tính trong JS — 1 query đã đủ, không query lại).
      const destRevenue = new Map<string, number>()
      rows.forEach(r => {
        if (r.period !== "current") return
        destRevenue.set(r.destination, (destRevenue.get(r.destination) || 0) + parseFloat(r.revenue || "0"))
      })
      const topDestinations = [...destRevenue.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_DESTINATIONS)
        .map(([d]) => d)
      const topDestSet = new Set(topDestinations)

      // Gộp theo destination × vendor × type_of_sim (bỏ chiều sku, nhưng giữ lại SKU top-revenue đại
      // diện mỗi dòng để lát nữa lấy metadata mô tả từ Supabase products).
      const lineMap = new Map<string, LineRow>()
      rows.forEach(r => {
        if (!topDestSet.has(r.destination)) return
        const key = `${r.destination}|${r.vendor}|${r.type_of_sim}`
        if (!lineMap.has(key)) {
          lineMap.set(key, {
            destination: r.destination, vendor: r.vendor, typeOfSim: r.type_of_sim,
            revenue: 0, prevRevenue: 0, units: 0, margin: 0, topSku: "", topSkuRevenue: 0,
          })
        }
        const line = lineMap.get(key)!
        const rev = parseFloat(r.revenue || "0")
        if (r.period === "current") {
          line.revenue += rev
          line.units += parseFloat(r.units || "0")
          line.margin += parseFloat(r.margin || "0")
          if (rev > line.topSkuRevenue) { line.topSkuRevenue = rev; line.topSku = r.sku }
        } else {
          line.prevRevenue += rev
        }
      })

      // Metadata mô tả (network/hotspot/KYC) — 1 query Supabase duy nhất, prefix-match top-SKU mỗi dòng
      // (product_code Supabase là 8 ký tự đầu của sku thật, sku thêm suffix theo gói dung lượng/thời hạn).
      const topSkus = [...lineMap.values()].map(l => l.topSku).filter(Boolean)
      const metaBySku = new Map<string, { network_type: string | null; hotspot: string | null; kyc_needed: string | null }>()
      if (topSkus.length > 0) {
        const { data: products } = await supabaseAdmin
          .from("products")
          .select("product_code, network_type, hotspot, kyc_needed")
        ;(products || []).forEach(p => {
          topSkus.forEach(sku => {
            if (sku.startsWith(p.product_code)) metaBySku.set(sku, p)
          })
        })
      }

      const countryMap = await getCountryMappings()

      const destinations = topDestinations.map(dest => {
        const lines = [...lineMap.values()].filter(l => l.destination === dest)
        const totalRevenue = lines.reduce((s, l) => s + l.revenue, 0)
        const totalUnits = lines.reduce((s, l) => s + l.units, 0)

        // Badge: rank trong CHÍNH destination này (không so toàn hệ thống).
        const bestSellerKey = lines.length ? lines.reduce((a, b) => (b.revenue > a.revenue ? b : a)).vendor + lines.reduce((a, b) => (b.revenue > a.revenue ? b : a)).typeOfSim : ""
        const valueCandidates = lines.filter(l => l.units >= MIN_UNITS_FOR_VALUE_BADGE)
        const bestValueKey = valueCandidates.length
          ? valueCandidates.reduce((a, b) => (b.revenue / Math.max(b.units, 1) < a.revenue / Math.max(a.units, 1) ? b : a)).vendor +
            valueCandidates.reduce((a, b) => (b.revenue / Math.max(b.units, 1) < a.revenue / Math.max(a.units, 1) ? b : a)).typeOfSim
          : ""

        return {
          code: dest,
          name: countryMap[dest] || dest,
          totalRevenue: Math.round(totalRevenue),
          totalUnits: Math.round(totalUnits),
          lineCount: lines.length,
          lines: lines
            .sort((a, b) => b.revenue - a.revenue)
            .map(l => {
              const growthPct = l.prevRevenue > 0 ? ((l.revenue - l.prevRevenue) / l.prevRevenue) * 100 : null
              const meta = metaBySku.get(l.topSku)
              const lineKey = l.vendor + l.typeOfSim
              return {
                vendor: l.vendor,
                typeOfSim: l.typeOfSim,
                revenue: Math.round(l.revenue),
                units: Math.round(l.units),
                revenueSharePct: totalRevenue > 0 ? Math.round((l.revenue / totalRevenue) * 1000) / 10 : 0,
                growthPct: growthPct != null ? Math.round(growthPct * 10) / 10 : null,
                networkType: meta?.network_type || null,
                hotspot: meta?.hotspot === "Yes",
                kycNeeded: meta?.kyc_needed === "Yes",
                badges: [
                  lineKey === bestSellerKey ? "best_seller" : null,
                  growthPct != null && growthPct >= GROWTH_BADGE_THRESHOLD ? "fastest_growing" : null,
                  lineKey === bestValueKey ? "best_value" : null,
                ].filter(Boolean),
              }
            }),
        }
      }).sort((a, b) => b.totalRevenue - a.totalRevenue)

      return { destinations, periodDays: 90 }
    }, 60)

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/product-catalogue]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
