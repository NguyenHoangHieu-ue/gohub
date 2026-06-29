import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"

// Map mã SKU 3HK (data usage, mã CŨ) → nhóm tốc độ Unlimited. CHỈ 3 loại tồn tại trong hệ thống:
//   "500MB high-speed · throttle 5 mbps", "500MB high-speed · throttle 10 mbps", "1GB high-speed · throttle 10 mbps".
//
// Quy tắc (theo nghiệp vụ):
//  • P2 (5 mbps) → LUÔN 500MB (chỉ 1 loại 5 mbps).
//  • P1 (10 mbps) → phân biệt 1GB vs 500MB bằng CÔNG THỨC datapool:
//    expected_hkd = 1.8 × days × price_per_gb_hkd (zone ncc_3hk của nước đó)
//    expected_vnd = expected_hkd × fx_hkd_usd × fx_usd_vnd
//    So với latest_cogs (VND từ bảng skus) trong range ±20% (bù biến động tỷ giá hàng tháng):
//      - Trong range → 500MB·10, ngoài range → 1GB·10
//    Fallback khi thiếu zone price / cogs: dùng nhãn throttle_speed, rồi mặc định 500MB.

const ANALYTICS_ROLES = new Set(["admin", "creator", "manager", "bod", "staff", "b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"])

const G_500_5  = "500MB high-speed · throttle 5 mbps"
const G_500_10 = "500MB high-speed · throttle 10 mbps"
const G_1GB_10 = "1GB high-speed · throttle 10 mbps"

const FORMULA_DAILY_UTIL = 1.8   // GB/ngày ước tính cho gói 500MB·10mbps (datapool)
const FORMULA_RANGE      = 0.20  // ±20% bù biến động tỷ giá HKD/VND hàng tháng

// Parse mã CŨ usage: [E]<CTRY:3><3D>...P1|P2...<days>D
function oldParse(sku: string): { country: string; esim: boolean; mbps: number | null; days: number | null } | null {
  const i = sku.indexOf("3D"); if (i < 3) return null
  const country = sku.slice(0, i).slice(-3)
  const esim = sku[0] === "E"
  const pm = sku.match(/P([12])/)
  const mbps = pm ? (pm[1] === "1" ? 10 : 5) : null
  const dm = sku.replace(/P[12]/, "").match(/(\d+)D$/)   // bỏ token P1/P2 trước khi lấy ngày
  const days = dm ? parseInt(dm[1]) : null
  return { country, esim, mbps, days }
}

// Parse mã MỚI product DB: <prefix><CTRY:3><3D><A|B>UNL<days>
function newParse(code: string): { country: string; mbps: number | null; days: number | null } | null {
  const i = code.indexOf("3D"); if (i < 3) return null
  const after = code.slice(i + 2); if (!/UNL/.test(after)) return null
  const country = code.slice(0, i).slice(-3)
  const lm = after.match(/^([AB])/)
  const mbps = lm ? (lm[1] === "A" ? 5 : 10) : null
  const dm = after.match(/UNL[I]?(\d+)/) || after.match(/(\d+)$/)
  const days = dm ? parseInt(dm[1]) : null
  return { country, mbps, days }
}

function hsOf(thr?: string | null): "1GB" | "500MB" | null {
  if (!thr) return null
  if (/1\s*gb/i.test(thr)) return "1GB"
  if (/500/i.test(thr)) return "500MB"
  return null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ANALYTICS_ROLES.has((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    // 1) Mã usage 3HK unlimited (gohub_dw)
    const usageRows = await queryAnalytics<{ sku: string }>(`
      SELECT DISTINCT f.sku
      FROM fact_data_usage f
      JOIN dim_sku d ON f.sku = d.sku AND REPLACE(UPPER(d.vendor),' ','') = '3HKDATAPOOL'
      WHERE f.sku_type ILIKE '%nlimited%'
    `)
    if (!usageRows.length) return NextResponse.json({ map: {}, coverage: {} })

    // 2) Fetch song song: skus (cogs), ncc_3hk (zone price), ref_countries (name→code), fx rates
    const [skuRes, zonesRes, countriesRes, configRes] = await Promise.all([
      supabaseAdmin.from("skus")
        .select("sku_code, vendor_sku, vendor_sku_sim, tenant, throttle_speed, latest_cogs")
        .or("sku_code.ilike.%UNL%,vendor_sku.ilike.%UNL%"),
      supabaseAdmin.from("ncc_3hk").select("country,price_per_gb_hkd"),
      supabaseAdmin.from("ref_countries").select("code,name"),
      supabaseAdmin.from("app_config").select("key,value").in("key", ["fx.hkd_usd", "fx.usd_vnd"]),
    ])

    // FX rates — fallback về default nếu chưa cấu hình
    const fxCfg = Object.fromEntries((configRes.data ?? []).map((r: any) => [r.key, parseFloat(r.value)]))
    const fxHkdUsd = fxCfg["fx.hkd_usd"] ?? 0.1282
    const fxUsdVnd = fxCfg["fx.usd_vnd"] ?? 26394

    // Map: tên quốc gia (lowercase) → price_per_gb_hkd (từ ncc_3hk)
    const namePriceMap = new Map<string, number>()
    for (const z of zonesRes.data ?? []) {
      if (z.price_per_gb_hkd != null)
        namePriceMap.set((z.country as string).toLowerCase().trim(), Number(z.price_per_gb_hkd))
    }

    // Map: ISO-3 code → price_per_gb_hkd (qua ref_countries name matching)
    const iso3PriceMap = new Map<string, number>()
    for (const c of countriesRes.data ?? []) {
      const price = namePriceMap.get((c.name as string).toLowerCase().trim())
      if (price != null) iso3PriceMap.set(c.code as string, price)
    }

    // Index từ skus table: `${country}|${days}|${mbps}` → [{ hs, cost }]
    // Dùng làm fallback khi không có zone price
    const idx = new Map<string, { hs: "1GB" | "500MB" | null; cost: number | null }[]>()
    for (const s of skuRes.data ?? []) {
      for (const code of [s.sku_code, s.vendor_sku, s.vendor_sku_sim]) {
        if (!code) continue
        const p = newParse(code); if (!p || !p.mbps || !p.days) continue
        const key = `${p.country}|${p.days}|${p.mbps}`
        const arr = idx.get(key) ?? idx.set(key, []).get(key)!
        arr.push({ hs: hsOf(s.throttle_speed), cost: s.latest_cogs != null ? Number(s.latest_cogs) : null })
        break
      }
    }

    // 3) Phân nhóm từng usage SKU
    const map: Record<string, { group: string | null; source: string }> = {}
    const coverage: Record<string, number> = {}

    for (const u of usageRows) {
      const o = oldParse(u.sku)
      let group: string | null = null, source = "no-parse"

      if (o && o.mbps === 5) {
        // P2 → luôn 500MB·5mbps
        group = G_500_5; source = "rule-5mbps"

      } else if (o && o.mbps === 10) {
        const priceHkd = iso3PriceMap.get(o.country)
        const arr      = idx.get(`${o.country}|${o.days}|10`) ?? []
        const costs    = arr.filter(r => r.cost != null && r.cost > 1000).map(r => r.cost!)

        if (priceHkd != null && o.days != null && o.days > 0 && costs.length) {
          // Công thức datapool: expected COGS cho gói 500MB·10mbps
          const expectedHkd = FORMULA_DAILY_UTIL * o.days * priceHkd
          const expectedVnd = expectedHkd * fxHkdUsd * fxUsdVnd
          const avgCost     = costs.reduce((a, b) => a + b, 0) / costs.length
          const lo          = expectedVnd * (1 - FORMULA_RANGE)
          const hi          = expectedVnd * (1 + FORMULA_RANGE)

          if (avgCost >= lo && avgCost <= hi) {
            group = G_500_10; source = "formula-500mb"
          } else {
            group = G_1GB_10; source = "formula-1gb"
          }

        } else {
          // Fallback: không có zone price hoặc không có cogs → dùng nhãn throttle_speed
          const labels = arr.map(r => r.hs).filter(Boolean)
          if (labels.includes("1GB") && !labels.includes("500MB")) { group = G_1GB_10; source = "label" }
          else if (labels.includes("500MB"))                        { group = G_500_10; source = "label" }
          else                                                       { group = G_500_10; source = "default" }
        }
      }

      map[u.sku] = { group, source }
      coverage[source] = (coverage[source] ?? 0) + 1
    }

    return NextResponse.json(
      { map, coverage, fxHkdUsd, fxUsdVnd },
      { headers: { "Cache-Control": "private, max-age=600" } },
    )
  } catch (err: any) {
    console.error("[3hk-speed-map]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
