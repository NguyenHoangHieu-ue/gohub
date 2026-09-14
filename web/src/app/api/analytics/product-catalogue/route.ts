import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import {
  getDestinationSQL, shipFilter, internalOpsFilter, getCountryMappings,
  CACHE_HEADERS, cachedQuery, analyticsGuard,
} from "@/lib/analytics-helpers"

// GoHub Product Catalogue — 3 tầng Destination → Loại sản phẩm → Sản phẩm cụ thể (Hiếu yêu cầu
// 2026-09-14, đợt 2 + đợt 3 mở rộng field). Toàn bộ phân loại dựa ĐÚNG dữ liệu thật, không tự đặt
// taxonomy:
//   - Ký tự 2 mã SKU (ProductType): C=eSIM full, E=SIM full (2 loại chính bán ra thị trường, xem
//     docs/wiki/business/ma-sku.md) — chỉ đúng cho SKU chuẩn 13 ký tự, legacy 14/15 ký tự → "Khác".
//   - "Có gọi/nhắn tin nội địa" = Supabase products.local_phone_number = "Yes".
//   - "Loại data" (Fixed/Daily) = Supabase products.data_type — field CÓ SẴN, thay cho việc tự decode
//     ký tự 8 SKU (2 wiki nguồn ma-sku.md/loai-data-policy.md ghi NGƯỢC NHAU ở mbps A/B — dùng
//     data_type thật từ Supabase an toàn hơn nhiều, đợt trước phải né vì chưa có field này).
//   - Dung lượng + số ngày: vẫn decode từ ký tự 9-11/12-13 SKU (4 dạng mã hoá NNN/NHM/NDN/UNL) — không
//     có field tương đương sẵn trong Supabase products.
//   - APN/operator/hotspot/KYC/daily_reset_time/telco_perks/unsupported_apps/onsite_carrier: lấy thẳng
//     từ Supabase products, không suy đoán.
//   - Chính sách QR/đổi máy theo operator (OPERATOR_POLICY dưới) — trích từ bảng tham chiếu Hiếu cung
//     cấp (ảnh 2026-09-14), CHỈ giữ phần thông số thực tế (hạn QR/số lần cài lại/đổi máy), bỏ phần quy
//     trình xử lý CS nội bộ (refund workflow) — không hợp với 1 trang catalogue giới thiệu sản phẩm.
// 1 câu query tổng hợp DUY NHẤT cho gohub_dw (rule N+1, s197) — không loop theo destination/category.

const TOP_DESTINATIONS = 8
const TOP_PRODUCTS_PER_CATEGORY = 6
const GROWTH_BADGE_THRESHOLD = 15    // % — dưới ngưỡng này không gắn badge "Tăng trưởng mạnh"
const MIN_UNITS_FOR_VALUE_BADGE = 10 // tránh outlier 1-2 đơn lẻ thành "Giá tốt nhất"

// Chính sách theo operator — trích thông số thực tế từ bảng Hiếu cung cấp (2026-09-14), key = operator_code
// (khớp Supabase products.operator_code). Vendor không có eSIM (Elite) không có entry — page tự ẩn.
interface OperatorPolicy { qrValidity: string; reinstallLimit: string; deviceChangeLimit: string }
const OPERATOR_POLICY: Record<string, OperatorPolicy> = {
  "3HK":                 { qrValidity: "Theo hạn eSIM frame", reinstallLimit: "Tuỳ loại SM-DP, một số không cài lại được", deviceChangeLimit: "Không hỗ trợ đổi thiết bị" },
  "WORLDMOVE":           { qrValidity: "30 ngày kể từ ngày tạo đơn (1 số mã dài hơn)", reinstallLimit: "5 lần / thiết bị", deviceChangeLimit: "Không hỗ trợ đổi thiết bị" },
  "DTAC":                { qrValidity: "Theo lô nhập", reinstallLimit: "1 lần / thiết bị", deviceChangeLimit: "Không hỗ trợ" },
  "TRUEMOVE":            { qrValidity: "Theo lô nhập", reinstallLimit: "1 lần / thiết bị", deviceChangeLimit: "Không hỗ trợ" },
  "KDDI":                { qrValidity: "Theo lô nhập", reinstallLimit: "1 lần / thiết bị", deviceChangeLimit: "Không hỗ trợ" },
  "JOYTEL":              { qrValidity: "30 ngày kể từ ngày tạo đơn", reinstallLimit: "5-10 lần / thiết bị", deviceChangeLimit: "Không hỗ trợ" },
  "BILLIONCONNECT":      { qrValidity: "90 ngày kể từ ngày tạo đơn", reinstallLimit: "5-10 lần / thiết bị", deviceChangeLimit: "Datapool: tối đa 3 lần · Trực tiếp: không hỗ trợ" },
  "CHINAUNICOMHONGKONG": { qrValidity: "Theo lô nhập", reinstallLimit: "Không hỗ trợ quét lại", deviceChangeLimit: "Không hỗ trợ" },
  "MOBIFONE":            { qrValidity: "Theo lô nhập", reinstallLimit: "Có hỗ trợ", deviceChangeLimit: "Có hỗ trợ (cần xoá SIM cũ trước khi cài lại)" },
  "SKYFI":               { qrValidity: "Theo lô nhập", reinstallLimit: "Có hỗ trợ", deviceChangeLimit: "Có hỗ trợ (cần xoá SIM cũ trước khi cài lại)" },
}

interface SkuDecode {
  productType: string | null
  capLabel: string | null
  days: number | null
}

function decodeSku(sku: string): SkuDecode {
  if (sku.length !== 13) return { productType: null, capLabel: null, days: null }
  const productType = sku[1]?.toUpperCase() || null
  const capChars = sku.slice(8, 11)
  let capLabel: string | null = null
  if (capChars === "UNL") capLabel = "Không giới hạn"
  else if (/^\d{3}$/.test(capChars)) capLabel = `${parseInt(capChars, 10)}GB`
  else if (/^\dHM$/i.test(capChars)) capLabel = `${parseInt(capChars[0], 10) * 100}MB`
  else if (/^\dD\d$/i.test(capChars)) capLabel = `${capChars[0]}.${capChars[2]}GB`
  const daysStr = sku.slice(11, 13)
  const days = /^\d{2}$/.test(daysStr) ? parseInt(daysStr, 10) : null
  return { productType, capLabel, days }
}

type CategoryKey = "esim_data" | "esim_local" | "sim_data" | "sim_local" | "other"

function categoryKey(productType: string | null, hasCall: boolean): CategoryKey {
  if (productType === "C") return hasCall ? "esim_local" : "esim_data"
  if (productType === "E") return hasCall ? "sim_local" : "sim_data"
  return "other"
}

const CATEGORY_LABEL: Record<CategoryKey, string> = {
  esim_data:  "eSIM — Chỉ Data",
  esim_local: "eSIM — Có số nội địa (Gọi/Nhắn tin)",
  sim_data:   "SIM vật lý — Chỉ Data",
  sim_local:  "SIM vật lý — Nội địa (Gọi/Nhắn tin)",
  other:      "Khác",
}

interface ProductMeta {
  network_type: string | null; hotspot: string | null; kyc_needed: string | null
  local_phone_number: string | null; data_type: string | null; daily_reset_time: string | null
  apn: string | null; operator_code: string | null; telco_perks: string | null; unsupported_apps: string | null
  onsite_carrier: string | null
}

interface SkuAgg {
  sku: string; vendor: string; typeOfSim: string
  revenue: number; prevRevenue: number; units: number
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  try {
    const payload = await cachedQuery("product-catalogue:v3", async () => {
      const destExpr = getDestinationSQL()
      const sfx = `${shipFilter(false)} ${internalOpsFilter(false)}`

      // 1 query duy nhất: gộp 2 kỳ (current 90d / previous 90d) bằng CASE, giữ nguyên grain SKU.
      const rows = await queryAnalytics<Record<string, string>>(
        `WITH tagged AS (
           SELECT f.sku, TRIM(v.vendor) as vendor, v.type_of_sim,
                  f.fulfilled_revenue_amount_vnd as revenue, f.fulfilled_quantity as units,
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
                SUM(revenue) as revenue, SUM(units) as units
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
      const topDestinations = [...destRevenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_DESTINATIONS).map(([d]) => d)
      const topDestSet = new Set(topDestinations)

      // Gộp theo destination × sku (giữ nguyên grain sản phẩm cụ thể).
      const skuMap = new Map<string, Map<string, SkuAgg>>() // destination -> sku -> agg
      rows.forEach(r => {
        if (!topDestSet.has(r.destination)) return
        if (!skuMap.has(r.destination)) skuMap.set(r.destination, new Map())
        const byDest = skuMap.get(r.destination)!
        if (!byDest.has(r.sku)) byDest.set(r.sku, { sku: r.sku, vendor: r.vendor, typeOfSim: r.type_of_sim, revenue: 0, prevRevenue: 0, units: 0 })
        const agg = byDest.get(r.sku)!
        const rev = parseFloat(r.revenue || "0")
        if (r.period === "current") { agg.revenue += rev; agg.units += parseFloat(r.units || "0") }
        else agg.prevRevenue += rev
      })

      // Metadata thật — 1 query Supabase duy nhất cho TOÀN BỘ bảng products, prefix-match trong JS
      // (product_code Supabase = 8 ký tự đầu của sku thật, sku thêm suffix theo dung lượng/thời hạn).
      const allSkus = new Set<string>()
      skuMap.forEach(byDest => byDest.forEach(a => allSkus.add(a.sku)))
      const { data: products } = await supabaseAdmin
        .from("products")
        .select("product_code, network_type, hotspot, kyc_needed, local_phone_number, data_type, daily_reset_time, apn, operator_code, telco_perks, unsupported_apps, onsite_carrier")
      const metaBySku = new Map<string, ProductMeta>()
      ;(products || []).forEach(p => {
        allSkus.forEach(sku => { if (sku.startsWith(p.product_code)) metaBySku.set(sku, p) })
      })

      const countryMap = await getCountryMappings()

      const destinations = topDestinations.map(dest => {
        const skus = [...(skuMap.get(dest)?.values() ?? [])]
        const totalRevenue = skus.reduce((s, a) => s + a.revenue, 0)
        const totalUnits = skus.reduce((s, a) => s + a.units, 0)

        // Gom theo Category, mỗi SKU quyết định category qua ProductType (SKU) + local_phone_number (meta).
        const catMap = new Map<CategoryKey, SkuAgg[]>()
        skus.forEach(a => {
          const meta = metaBySku.get(a.sku)
          const decoded = decodeSku(a.sku)
          const hasCall = meta?.local_phone_number === "Yes"
          const key = categoryKey(decoded.productType, hasCall)
          if (!catMap.has(key)) catMap.set(key, [])
          catMap.get(key)!.push(a)
        })

        const catRevenues = [...catMap.entries()].map(([k, arr]) => [k, arr.reduce((s, a) => s + a.revenue, 0)] as const)
        const bestSellerCat = catRevenues.length ? catRevenues.reduce((a, b) => (b[1] > a[1] ? b : a))[0] : null

        const categories = [...catMap.entries()]
          .map(([key, arr]) => {
            const catRevenue = arr.reduce((s, a) => s + a.revenue, 0)
            const catPrevRevenue = arr.reduce((s, a) => s + a.prevRevenue, 0)
            const catUnits = arr.reduce((s, a) => s + a.units, 0)
            const catGrowthPct = catPrevRevenue > 0 ? ((catRevenue - catPrevRevenue) / catPrevRevenue) * 100 : null

            // Đại diện đặc điểm category: lấy đa số (mode) thay vì SKU đầu tiên, tránh 1 SKU lệch làm sai chip.
            const metaList = arr.map(a => metaBySku.get(a.sku)).filter(Boolean) as ProductMeta[]
            const majorityYes = (field: "hotspot" | "kyc_needed") => {
              if (metaList.length === 0) return null
              const yes = metaList.filter(m => m[field] === "Yes").length
              return yes >= metaList.length / 2
            }
            const networkTypes = [...new Set(metaList.map(m => m.network_type).filter(Boolean))] as string[]
            const operators = [...new Set(metaList.map(m => m.operator_code).filter(Boolean))] as string[]
            const operatorInfo = operators
              .filter(op => OPERATOR_POLICY[op])
              .map(op => ({ code: op, ...OPERATOR_POLICY[op] }))

            const sortedSkus = [...arr].sort((a, b) => b.revenue - a.revenue)
            const bestSellerSku = sortedSkus[0]?.sku
            const valueCandidates = arr.filter(a => a.units >= MIN_UNITS_FOR_VALUE_BADGE)
            const bestValueSku = valueCandidates.length
              ? valueCandidates.reduce((a, b) => (b.revenue / Math.max(b.units, 1) < a.revenue / Math.max(a.units, 1) ? b : a)).sku
              : null

            return {
              key,
              label: CATEGORY_LABEL[key],
              hasCall: key === "esim_local" || key === "sim_local",
              hotspot: majorityYes("hotspot"),
              kycNeeded: majorityYes("kyc_needed"),
              networkTypes,
              operatorInfo,
              revenue: Math.round(catRevenue),
              units: Math.round(catUnits),
              revenueSharePct: totalRevenue > 0 ? Math.round((catRevenue / totalRevenue) * 1000) / 10 : 0,
              growthPct: catGrowthPct != null ? Math.round(catGrowthPct * 10) / 10 : null,
              productCount: arr.length,
              badges: [
                key === bestSellerCat ? "best_seller" : null,
                catGrowthPct != null && catGrowthPct >= GROWTH_BADGE_THRESHOLD ? "fastest_growing" : null,
              ].filter(Boolean),
              products: sortedSkus.slice(0, TOP_PRODUCTS_PER_CATEGORY).map(a => {
                const decoded = decodeSku(a.sku)
                const meta = metaBySku.get(a.sku)
                const growthPct = a.prevRevenue > 0 ? ((a.revenue - a.prevRevenue) / a.prevRevenue) * 100 : null
                return {
                  sku: a.sku,
                  vendor: a.vendor,
                  typeOfSim: a.typeOfSim,
                  capLabel: decoded.capLabel,
                  days: decoded.days,
                  dataType: meta?.data_type || null,               // "Fixed Data" / "Daily Data" (Supabase thật)
                  dailyResetTime: meta?.daily_reset_time || null,   // chỉ có ý nghĩa khi dataType = Daily Data
                  apn: meta?.apn || null,
                  operatorCode: meta?.operator_code || null,
                  telcoPerks: meta?.telco_perks || null,
                  unsupportedApps: meta?.unsupported_apps || null,
                  onsiteCarrier: meta?.onsite_carrier || null,
                  revenue: Math.round(a.revenue),
                  units: Math.round(a.units),
                  growthPct: growthPct != null ? Math.round(growthPct * 10) / 10 : null,
                  badges: [
                    a.sku === bestSellerSku ? "best_seller" : null,
                    growthPct != null && growthPct >= GROWTH_BADGE_THRESHOLD ? "fastest_growing" : null,
                    a.sku === bestValueSku ? "best_value" : null,
                  ].filter(Boolean),
                }
              }),
            }
          })
          .sort((a, b) => b.revenue - a.revenue)

        return {
          code: dest,
          name: countryMap[dest] || dest,
          totalRevenue: Math.round(totalRevenue),
          totalUnits: Math.round(totalUnits),
          categoryCount: categories.length,
          categories,
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
