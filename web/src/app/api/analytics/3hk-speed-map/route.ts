import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"

// Map mã SKU 3HK (data usage, mã CŨ) → nhóm tốc độ Unlimited. CHỈ 3 loại tồn tại trong hệ thống:
//   "500MB high-speed · throttle 5 mbps", "500MB high-speed · throttle 10 mbps", "1GB high-speed · throttle 10 mbps".
//
// Quy tắc (theo nghiệp vụ):
//  • Mã CŨ: [E]<nước:3><3D><P1|P2><ngày>D. E=eSIM, không=SIM. P1 = 10 mbps, P2 = 5 mbps.
//  • Mã MỚI (product DB): <prefix><nước:3><3D><A|B>UNL<ngày>. A = 5 mbps, B = 10 mbps. (P1↔B, P2↔A)
//  • P2 (5 mbps) → LUÔN 500MB (chỉ có 1 loại 5 mbps).
//  • P1 (10 mbps) → 1GB hay 500MB: map sang mã mới theo (nước, ngày, 10 mbps) — tìm cả tenant VN & US —
//    lấy GIÁ (latest_cogs/ngày) so với ngưỡng (trung điểm median 1GB vs 500MB từ product DB) → dự đoán.
//    Thiếu giá → dùng nhãn throttle_speed; thiếu cả → mặc định 500MB.
// Trả map { [usageSku]: { group, source } }. Không dùng offer_name (join theo iccid dễ lẫn gói khác).

const ANALYTICS_ROLES = new Set(["admin", "creator", "manager", "bod", "staff", "b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"])

const G_500_5  = "500MB high-speed · throttle 5 mbps"
const G_500_10 = "500MB high-speed · throttle 10 mbps"
const G_1GB_10 = "1GB high-speed · throttle 10 mbps"

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
const median = (a: number[]): number | null => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null

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

    // 2) Product DB (Supabase skus): mã mới UNL + throttle_speed + giá (latest_cogs). Tenant VN & US gộp theo key.
    const { data: skuRows } = await supabaseAdmin.from("skus")
      .select("sku_code, vendor_sku, vendor_sku_sim, tenant, throttle_speed, latest_cogs")
      .or("sku_code.ilike.%UNL%,vendor_sku.ilike.%UNL%")

    // Index: `${country}|${days}|${mbps}` → [{ hs, cost }]
    const idx = new Map<string, { hs: "1GB" | "500MB" | null; cost: number | null }[]>()
    for (const s of skuRows ?? []) {
      for (const code of [s.sku_code, s.vendor_sku, s.vendor_sku_sim]) {
        if (!code) continue
        const p = newParse(code); if (!p || !p.mbps || !p.days) continue
        const key = `${p.country}|${p.days}|${p.mbps}`
        const arr = idx.get(key) ?? idx.set(key, []).get(key)!
        arr.push({ hs: hsOf(s.throttle_speed), cost: s.latest_cogs != null ? Number(s.latest_cogs) : null })
        break
      }
    }

    // Ngưỡng giá/ngày (VND) tách 1GB vs 500MB cho 10 mbps — từ các SKU đã có nhãn (lọc cost VND-scale > 1000).
    const band1: number[] = [], band5: number[] = []
    for (const [key, arr] of idx) {
      const [, days, mbps] = key.split("|"); if (mbps !== "10" || +days <= 0) continue
      for (const r of arr) if (r.cost != null && r.cost > 1000) {
        if (r.hs === "1GB") band1.push(Math.round(r.cost / +days))
        else if (r.hs === "500MB") band5.push(Math.round(r.cost / +days))
      }
    }
    const m1 = median(band1), m5 = median(band5)
    const threshold = (m1 != null && m5 != null) ? (m1 + m5) / 2 : 41000   // fallback từ khảo sát data

    // 3) Phân nhóm từng usage SKU — chỉ ra 3 loại hợp lệ.
    const map: Record<string, { group: string | null; source: string }> = {}
    const coverage: Record<string, number> = {}
    for (const u of usageRows) {
      const o = oldParse(u.sku)
      let group: string | null = null, source = "no-parse"
      if (o && o.mbps === 5) { group = G_500_5; source = "rule-5mbps" }
      else if (o && o.mbps === 10) {
        const arr = idx.get(`${o.country}|${o.days}|10`) ?? []
        const costs = (o.days && o.days > 0) ? arr.filter(r => r.cost != null && r.cost > 1000).map(r => r.cost! / o.days!) : []
        if (costs.length) {
          const avg = costs.reduce((a, b) => a + b, 0) / costs.length
          group = avg >= threshold ? G_1GB_10 : G_500_10; source = "price"
        } else {
          const labels = arr.map(r => r.hs).filter(Boolean)
          if (labels.includes("1GB") && !labels.includes("500MB")) { group = G_1GB_10; source = "label" }
          else if (labels.includes("500MB")) { group = G_500_10; source = "label" }
          else { group = G_500_10; source = "default" }
        }
      }
      map[u.sku] = { group, source }
      coverage[source] = (coverage[source] ?? 0) + 1
    }

    return NextResponse.json(
      { map, coverage, threshold: Math.round(threshold) },
      { headers: { "Cache-Control": "private, max-age=600" } },
    )
  } catch (err: any) {
    console.error("[3hk-speed-map]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
