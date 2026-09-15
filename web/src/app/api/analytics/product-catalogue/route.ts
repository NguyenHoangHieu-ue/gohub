import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import {
  getDestinationSQL, shipFilter, internalOpsFilter, getCountryMappings,
  CACHE_HEADERS, cachedQuery, analyticsGuard,
} from "@/lib/analytics-helpers"

// GoHub Product Catalogue — 4 tầng Destination → Loại SP → Nhà mạng → Sản phẩm cụ thể (Hiếu yêu cầu
// 2026-09-14, đợt 2+3+4; redesign kiến trúc đợt 5-6, 2026-09-15). Toàn bộ phân loại dựa ĐÚNG dữ liệu
// thật, không tự đặt taxonomy:
//   - Ký tự 2 mã SKU (ProductType): C=eSIM full, E=SIM full — CHỈ 2 loại category thật (Hiếu chốt lại
//     đợt 6, xem docs/wiki/business/ma-sku.md) — legacy 14/15 ký tự → "Khác".
//   - "Có SDT nội địa" (`local_phone_number`="Yes") KHÔNG còn là trục category riêng (đợt 2 làm vậy) —
//     nay là thuộc tính nổi bật, hiển thị qua filter/badge ngay trong category eSIM/SIM (đợt 6).
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

const MAX_PRODUCTS_PER_OPERATOR = 60 // safety valve chống payload phình bất thường, KHÔNG phải giới hạn hiển thị bình thường
const GROWTH_BADGE_THRESHOLD = 15    // % — dưới ngưỡng này không gắn badge "Tăng trưởng mạnh"
const MIN_UNITS_FOR_VALUE_BADGE = 10 // tránh outlier 1-2 đơn lẻ thành "Giá tốt nhất"

// Bảng mã data_policy_code — field THẬT trong Supabase products (không decode ký tự 8 SKU, tránh mâu
// thuẫn 2 wiki ma-sku.md/loai-data-policy.md ở A/B). Mapping ĐỒNG BỘ với agents.ts DATA_DICT (nguồn
// production Bé Gấu/BI Analyst đang dùng để trả lời user — giữ 1 sự thật duy nhất xuyên hệ thống).
interface DataPolicyInfo { label: string; capType: "Fixed" | "Daily"; mbpsAfterQuota: number | null; noThrottle: boolean }
const DATA_POLICY: Record<string, DataPolicyInfo> = {
  A: { label: "Daily — giảm còn 5 Mbps sau quota",   capType: "Daily", mbpsAfterQuota: 5,   noThrottle: false },
  B: { label: "Daily — giảm còn 10 Mbps sau quota",  capType: "Daily", mbpsAfterQuota: 10,  noThrottle: false },
  C: { label: "Không giới hạn — tối đa 20 Mbps",     capType: "Daily", mbpsAfterQuota: 20,  noThrottle: false },
  D: { label: "Không giới hạn — tối đa 100 Mbps",    capType: "Daily", mbpsAfterQuota: 100, noThrottle: false },
  E: { label: "Fixed — giảm còn 5 Mbps sau quota",   capType: "Fixed", mbpsAfterQuota: 5,   noThrottle: false },
  G: { label: "Fixed — giảm còn 10 Mbps sau quota",  capType: "Fixed", mbpsAfterQuota: 10,  noThrottle: false },
  H: { label: "Không giới hạn — tối đa 5 Mbps",      capType: "Daily", mbpsAfterQuota: 5,   noThrottle: false },
  F: { label: "Fixed — giảm dưới 2 Mbps sau quota",  capType: "Fixed", mbpsAfterQuota: 2,   noThrottle: false },
  P: { label: "Daily — giảm dưới 2 Mbps sau quota",  capType: "Daily", mbpsAfterQuota: 2,   noThrottle: false },
  Y: { label: "Fixed — không giảm tốc",              capType: "Fixed", mbpsAfterQuota: null, noThrottle: true },
  Z: { label: "Daily — không giảm tốc",              capType: "Daily", mbpsAfterQuota: null, noThrottle: true },
}
// Rank so sánh tốc độ giữa các nhà mạng — noThrottle > mbps cao hơn > mbps thấp hơn > không rõ
function throttleRank(code: string | null): number {
  const dp = code ? DATA_POLICY[code.toUpperCase()] : null
  if (!dp) return -1
  if (dp.noThrottle) return 1000
  return dp.mbpsAfterQuota ?? 0
}

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

// Chỉ 2 loại THẬT theo ProductType (ký tự 2 mã SKU) — Hiếu chốt lại 2026-09-15: KHÔNG tách data-only vs
// có SDT nội địa thành category riêng nữa (đợt 2 làm vậy), gộp chung — "có SDT nội địa" giờ là 1 thuộc
// tính nổi bật (badge/filter) NGAY TRONG category eSIM/SIM, không phải trục phân loại.
type CategoryKey = "esim" | "sim" | "other"

function categoryKey(productType: string | null): CategoryKey {
  if (productType === "C") return "esim"
  if (productType === "E") return "sim"
  return "other"
}

const CATEGORY_LABEL: Record<CategoryKey, string> = {
  esim:  "eSIM",
  sim:   "SIM vật lý",
  other: "Khác",
}

interface ProductMeta {
  network_type: string | null; hotspot: string | null; kyc_needed: string | null
  local_phone_number: string | null; local_number_country: string | null
  data_type: string | null; daily_reset_time: string | null
  apn: string | null; operator_code: string | null; telco_perks: string | null; unsupported_apps: string | null
  onsite_carrier: string | null; data_policy_code: string | null
}

interface SkuAgg {
  sku: string; vendor: string; typeOfSim: string
  revenue: number; prevRevenue: number; units: number
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  try {
    const payload = await cachedQuery("product-catalogue:v6", async () => {
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
      // Toàn bộ destination có doanh thu trong kỳ hiện tại — Hiếu yêu cầu bỏ giới hạn top-8 (2026-09-15).
      const topDestinations = [...destRevenue.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d)
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
        .select("product_code, network_type, hotspot, kyc_needed, local_phone_number, local_number_country, data_type, daily_reset_time, apn, operator_code, telco_perks, unsupported_apps, onsite_carrier, data_policy_code")
      const metaBySku = new Map<string, ProductMeta>()
      ;(products || []).forEach(p => {
        allSkus.forEach(sku => { if (sku.startsWith(p.product_code)) metaBySku.set(sku, p) })
      })

      const countryMap = await getCountryMappings()

      const destinations = topDestinations.map(dest => {
        const skus = [...(skuMap.get(dest)?.values() ?? [])]
        const totalRevenue = skus.reduce((s, a) => s + a.revenue, 0)
        const totalUnits = skus.reduce((s, a) => s + a.units, 0)

        // Gom theo Category — CHỈ 2 loại thật (esim/sim) qua ProductType (ký tự 2 SKU).
        const catMap = new Map<CategoryKey, SkuAgg[]>()
        skus.forEach(a => {
          const decoded = decodeSku(a.sku)
          const key = categoryKey(decoded.productType)
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

            const bestSellerSku = [...arr].sort((a, b) => b.revenue - a.revenue)[0]?.sku
            const valueCandidates = arr.filter(a => a.units >= MIN_UNITS_FOR_VALUE_BADGE)
            const bestValueSku = valueCandidates.length
              ? valueCandidates.reduce((a, b) => (b.revenue / Math.max(b.units, 1) < a.revenue / Math.max(a.units, 1) ? b : a)).sku
              : null

            // Gom theo NHÀ MẠNG THẬT tại điểm đến (onsite_carrier) — không phải vendor GoHub. 1 vendor
            // (VD WorldMove) có thể route qua nhiều nhà mạng khác nhau tuỳ destination, đây mới là trục
            // so sánh có ý nghĩa với sale/đối tác ("ở nước này có carrier nào, khác nhau ra sao").
            // Fallback: khi onsite_carrier RỖNG hoặc là ĐOẠN VĂN phủ sóng nhiều nước (verify qua Supabase
            // thật 2026-09-15: gói pool đa quốc gia lưu cả list "Nước: Carrier" nhiều dòng ở field này, VD
            // "Singapore: Simba\nMalaysia: Celcomdigi..." — dùng thẳng làm tên tab sẽ ra cả đoạn văn, không
            // phải tên nhà mạng sạch) → group theo operator_code (tên hãng, VD "WORLDMOVE"/"JOYTEL") rồi
            // vendor GoHub (LUÔN có). Đoạn text phủ sóng dài vẫn giữ lại làm `coverageNote` hiển thị trong
            // panel carrier — không mất thông tin, chỉ không dùng làm TÊN TAB.
            const isCleanCarrierName = (s: string | null | undefined): s is string =>
              !!s && s.length <= 40 && !s.includes("\n")
            const opMap = new Map<string, SkuAgg[]>()
            arr.forEach(a => {
              const meta = metaBySku.get(a.sku)
              const opKey = isCleanCarrierName(meta?.onsite_carrier) ? meta!.onsite_carrier!.trim() : (meta?.operator_code || a.vendor)
              if (!opMap.has(opKey)) opMap.set(opKey, [])
              opMap.get(opKey)!.push(a)
            })

            const opRaw = [...opMap.entries()].map(([opKey, opArr]) => {
              const opMetaList = opArr.map(a => metaBySku.get(a.sku)).filter(Boolean) as ProductMeta[]
              const operatorCodes = [...new Set(opMetaList.map(m => m.operator_code).filter(Boolean))] as string[]
              const bestRank = opArr.reduce((mx, a) => Math.max(mx, throttleRank(metaBySku.get(a.sku)?.data_policy_code ?? null)), -1)
              const coverageNotes = [...new Set(
                opMetaList.map(m => m.onsite_carrier).filter((s): s is string => !!s && s !== opKey && !isCleanCarrierName(s))
              )]
              return {
                key: opKey, arr: opArr, opMetaList, operatorCodes, coverageNotes,
                revenue: opArr.reduce((s, a) => s + a.revenue, 0),
                bestRank,
              }
            })
            const maxOptions = Math.max(...opRaw.map(o => o.arr.length))
            const maxRank = Math.max(...opRaw.map(o => o.bestRank))
            const multiOperator = opRaw.length > 1

            const operators = opRaw
              .map(o => {
                const perksList = [...new Set(o.opMetaList.map(m => m.telco_perks).filter(Boolean))] as string[]
                const restrictionsList = [...new Set(o.opMetaList.map(m => m.unsupported_apps).filter(Boolean))] as string[]
                const hasPerks = perksList.length > 0
                const throttleSummary = [...new Set(
                  o.arr.map(a => metaBySku.get(a.sku)?.data_policy_code)
                    .filter((c): c is string => !!c)
                    .map(c => DATA_POLICY[c.toUpperCase()]?.label)
                    .filter(Boolean)
                )] as string[]
                const qrPolicies = o.operatorCodes.filter(c => OPERATOR_POLICY[c]).map(c => ({ code: c, ...OPERATOR_POLICY[c] }))
                const localNumberCountries = [...new Set(
                  o.opMetaList.filter(m => m.local_phone_number === "Yes").map(m => m.local_number_country).filter(Boolean)
                )] as string[]

                return {
                  key: o.key,
                  displayName: o.key,
                  networkTypes: [...new Set(o.opMetaList.map(m => m.network_type).filter(Boolean))] as string[],
                  productCount: o.arr.length,
                  throttleSummary,
                  perksList, restrictionsList,
                  qrPolicies,
                  localNumberCountries,
                  coverageNotes: o.coverageNotes,
                  tags: multiOperator ? [
                    o.bestRank === maxRank && maxRank > -1 ? "fastest_network" : null,
                    o.arr.length === maxOptions && maxOptions > 1 ? "most_options" : null,
                    hasPerks ? "has_perks" : null,
                  ].filter(Boolean) as string[] : (hasPerks ? ["has_perks"] : []),
                  revenue: Math.round(o.revenue),
                  products: [...o.arr].sort((a, b) => b.revenue - a.revenue).slice(0, MAX_PRODUCTS_PER_OPERATOR).map(a => {
                    const decoded = decodeSku(a.sku)
                    const meta = metaBySku.get(a.sku)
                    const dp = meta?.data_policy_code ? DATA_POLICY[meta.data_policy_code.toUpperCase()] : null
                    const growthPct = a.prevRevenue > 0 ? ((a.revenue - a.prevRevenue) / a.prevRevenue) * 100 : null
                    return {
                      sku: a.sku,
                      vendor: a.vendor,
                      typeOfSim: a.typeOfSim,
                      capLabel: decoded.capLabel,
                      days: decoded.days,
                      dataType: meta?.data_type || null,               // "Fixed Data" / "Daily Data" (Supabase thật)
                      dailyResetTime: meta?.daily_reset_time || null,   // chỉ có ý nghĩa khi dataType = Daily Data
                      throttleLabel: dp?.label || null,
                      apn: meta?.apn || null,
                      operatorCode: meta?.operator_code || null,
                      telcoPerks: meta?.telco_perks || null,
                      unsupportedApps: meta?.unsupported_apps || null,
                      hasLocalNumber: meta?.local_phone_number === "Yes",
                      localNumberCountry: meta?.local_phone_number === "Yes" ? (meta?.local_number_country || null) : null,
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

            const localNumberProductCount = arr.filter(a => metaBySku.get(a.sku)?.local_phone_number === "Yes").length

            return {
              key,
              label: CATEGORY_LABEL[key],
              hotspot: majorityYes("hotspot"),
              kycNeeded: majorityYes("kyc_needed"),
              networkTypes,
              localNumberProductCount,
              revenue: Math.round(catRevenue),
              units: Math.round(catUnits),
              revenueSharePct: totalRevenue > 0 ? Math.round((catRevenue / totalRevenue) * 1000) / 10 : 0,
              growthPct: catGrowthPct != null ? Math.round(catGrowthPct * 10) / 10 : null,
              productCount: arr.length,
              badges: [
                key === bestSellerCat ? "best_seller" : null,
                catGrowthPct != null && catGrowthPct >= GROWTH_BADGE_THRESHOLD ? "fastest_growing" : null,
              ].filter(Boolean),
              operators,
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
