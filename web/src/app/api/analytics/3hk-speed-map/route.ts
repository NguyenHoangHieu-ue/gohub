import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"

// Map mã SKU 3HK (data usage, mã CŨ P1/P2/UNLI) → nhóm tốc độ Unlimited (high-speed × throttle).
// Trang 3hk-usage là client-only (chỉ query gohub_dw), không truy được Supabase → endpoint này gộp:
//   1. throttle_speed của product DB (Supabase skus/items, curated) — nguồn CHÍNH.
//   2. offer_name (gohub_dw data_usage_log) — bổ sung khi product DB trống/không khớp.
//   3. giá (latest_cogs) — đoán 500MB vs 1GB khi 2 nguồn trên thiếu high-speed (cohort theo throttle+days).
//   4. ký tự SKU — chốt throttle khi mọi thứ khác trống. ĐÃ SỬA: P1 = 10 mbps, P2 = 5 mbps
//      (theo offer_name + dung lượng thực trong fact, ngược định nghĩa cũ trong page).
// Trả map { [usageSku]: { group, source } }. UI gom nhóm theo group (giữ nguyên bảng).

const ANALYTICS_ROLES = new Set(["admin", "creator", "manager", "bod", "staff", "b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"])

type Speed = { hs_mb: number | null; mbps: number | null }

// Bóc "500 MB / 1GB / 2GB high-speed" + "5 / 10 / 50 mbps" từ chuỗi mô tả (throttle_speed hoặc offer_name).
function parseSpeed(s?: string | null): Speed {
  if (!s) return { hs_mb: null, mbps: null }
  const t = s.toLowerCase().replace(/mpbs/g, "mbps") // sửa typo "10mpbs"
  let hs_mb: number | null = null
  const g = t.match(/(\d+(?:\.\d+)?)\s*gb/)
  if (g) hs_mb = Math.round(parseFloat(g[1]) * 1000)
  else { const m = t.match(/(\d+)\s*mb(?!ps)/); if (m) hs_mb = parseInt(m[1]) }
  let mbps: number | null = null
  const p = t.match(/(\d+)\s*mbps/)
  if (p) mbps = parseInt(p[1])
  return { hs_mb, mbps }
}

// Throttle từ ký tự SKU — CHỐT cuối. P1 = 10 mbps, P2 = 5 mbps (đã sửa đảo). PY/khác → null.
function throttleFromCode(sku: string): number | null {
  const m = sku.match(/P([12Y])/)
  if (m?.[1] === "1") return 10
  if (m?.[1] === "2") return 5
  return null
}

const daysOf = (sku: string): number | null => {
  const m = sku.match(/(\d+)D$/); return m ? parseInt(m[1]) : null
}

function label(hs_mb: number | null, mbps: number | null): string | null {
  if (hs_mb == null && mbps == null) return null
  const hs = hs_mb == null ? "?" : hs_mb >= 1000 ? `${hs_mb / 1000}GB` : `${hs_mb}MB`
  const th = mbps == null ? "?" : `${mbps} mbps`
  return `${hs} high-speed · throttle ${th}`
}

// Chuẩn hoá để so khớp mã cũ ↔ alias/vendor_sku product DB (alias đôi khi có tiền tố W/S/B/listing).
const core = (s: string) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "")

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ANALYTICS_ROLES.has((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    // 1) Mã usage 3HK unlimited + offer_name (gohub_dw)
    const usageRows = await queryAnalytics<{ sku: string; offer_name: string | null }>(`
      SELECT f.sku, MAX(l.offer_name) AS offer_name
      FROM fact_data_usage f
      JOIN dim_sku d ON f.sku = d.sku AND REPLACE(UPPER(d.vendor),' ','') = '3HKDATAPOOL'
      LEFT JOIN data_usage_log l ON l.iccid = f.iccid AND l.offer_name IS NOT NULL
      WHERE f.sku_type ILIKE '%nlimited%'
      GROUP BY f.sku
    `)
    if (!usageRows.length) return NextResponse.json({ map: {}, coverage: {} })

    // 2) Product DB (Supabase): throttle_speed + cogs, kèm alias/vendor_sku để bắc cầu mã cũ.
    const [{ data: skuRows }, { data: itemRows }] = await Promise.all([
      supabaseAdmin.from("skus")
        .select("sku_code, vendor_sku, vendor_sku_sim, throttle_speed, latest_cogs")
        .or("throttle_speed.ilike.%mbps%,vendor_sku.ilike.%UNLI%,sku_code.ilike.%UNL%"),
      supabaseAdmin.from("items")
        .select("sku_code, alias, throttle_speed_en, unitprice")
        .or("throttle_speed_en.ilike.%mbps%,alias.ilike.%UNLI%,item_name_en.ilike.%Unlimited%"),
    ])

    // Index: core(candidate code) → throttle_speed string + cogs
    const prodIdx = new Map<string, { thr: string | null; cost: number | null }>()
    for (const r of skuRows ?? []) {
      const entry = { thr: r.throttle_speed as string | null, cost: r.latest_cogs != null ? Number(r.latest_cogs) : null }
      for (const cand of [r.vendor_sku, r.vendor_sku_sim, r.sku_code]) if (cand) {
        const k = core(cand); if (!prodIdx.has(k) || entry.thr) prodIdx.set(k, entry)
      }
    }
    for (const r of itemRows ?? []) {
      const entry = { thr: r.throttle_speed_en as string | null, cost: r.unitprice != null ? Number(r.unitprice) : null }
      for (const cand of [r.alias, r.sku_code]) if (cand) {
        const k = core(cand); if (!prodIdx.has(k) || (entry.thr && !prodIdx.get(k)!.thr)) prodIdx.set(k, entry)
      }
    }

    // Khớp 1 usage SKU với product DB: trùng core, hoặc core sản phẩm CHỨA core usage (alias có tiền tố).
    function matchProduct(usageSku: string): { thr: string | null; cost: number | null } | null {
      const k = core(usageSku)
      if (prodIdx.has(k)) return prodIdx.get(k)!
      for (const [pk, v] of prodIdx) if (pk.includes(k) || k.includes(pk)) return v
      return null
    }

    // Pass 1: phân giải hs/mbps từ throttle_speed → offer_name → ký tự SKU. Gom cohort cogs cho fallback giá.
    type Resolved = { sku: string; hs_mb: number | null; mbps: number | null; cost: number | null; source: string }
    const resolved: Resolved[] = []
    for (const u of usageRows) {
      const prod = matchProduct(u.sku)
      let hs_mb: number | null = null, mbps: number | null = null
      const sources: string[] = []
      if (prod?.thr) { const s = parseSpeed(prod.thr); hs_mb = s.hs_mb; mbps = s.mbps; if (s.hs_mb != null || s.mbps != null) sources.push("throttle_speed") }
      if (hs_mb == null || mbps == null) {
        const s = parseSpeed(u.offer_name)
        if (hs_mb == null && s.hs_mb != null) { hs_mb = s.hs_mb; sources.push("offer") }
        if (mbps == null && s.mbps != null) { mbps = s.mbps; if (!sources.includes("offer")) sources.push("offer") }
      }
      if (mbps == null) { const t = throttleFromCode(u.sku); if (t != null) { mbps = t; sources.push("code") } }
      resolved.push({ sku: u.sku, hs_mb, mbps, cost: prod?.cost ?? null, source: sources.join("+") || "none" })
    }

    // Cohort cogs theo (mbps, days) cho các SKU ĐÃ biết high-speed → tâm 500 vs 1000 để đoán cái còn thiếu.
    const cohort = new Map<string, { c500: number[]; c1000: number[] }>()
    for (const r of resolved) {
      if (r.hs_mb == null || r.cost == null || r.mbps == null) continue
      const d = daysOf(r.sku); if (d == null) continue
      const key = `${r.mbps}|${d}`
      const c = cohort.get(key) ?? cohort.set(key, { c500: [], c1000: [] }).get(key)!
      if (r.hs_mb <= 700) c.c500.push(r.cost)
      else if (r.hs_mb >= 1000 && r.hs_mb < 1900) c.c1000.push(r.cost)
    }
    const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null

    // Pass 2: fallback giá cho high-speed còn thiếu; rồi build group. Default 500MB nếu vẫn không suy được.
    const map: Record<string, { group: string | null; source: string }> = {}
    const coverage: Record<string, number> = {}
    for (const r of resolved) {
      let hs_mb = r.hs_mb, source = r.source
      if (hs_mb == null && r.mbps != null) {
        const d = daysOf(r.sku); const key = `${r.mbps}|${d}`; const c = cohort.get(key)
        const m500 = c ? mean(c.c500) : null, m1000 = c ? mean(c.c1000) : null
        if (r.cost != null && m500 != null && m1000 != null) {
          hs_mb = Math.abs(r.cost - m1000) < Math.abs(r.cost - m500) ? 1000 : 500
          source = (source ? source + "+" : "") + "price"
        } else { hs_mb = 500; source = (source ? source + "+" : "") + "default500" }
      }
      const group = label(hs_mb, r.mbps)
      map[r.sku] = { group, source }
      const tag = source.split("+")[0] || "none"
      coverage[tag] = (coverage[tag] ?? 0) + 1
    }

    return NextResponse.json({ map, coverage }, { headers: { "Cache-Control": "private, max-age=600" } })
  } catch (err: any) {
    console.error("[3hk-speed-map]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
