import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"

// Phân loại SKU 3HK Unlimited → 1 trong 3 nhóm (high-speed × throttle):
//   500MB · 5mbps · 500MB · 10mbps · 1GB · 10mbps.
//
// Mã CŨ (code-based):  [E]<CTRY3><3D>[PY|P1|P2]UNLI<days>D
//   P2 → 5mbps (500MB) | P1 → 10mbps (500MB) | PY → 1GB 10mbps (base premium)
// Mã MỚI (Product DB):  <prefix><CTRY3><3D><A|B>UNL<days>
//   Throttle + dung lượng high-speed lấy từ cột throttle_speed (Supabase skus), vd
//   "500 MB high speed then drop to 5 mbps" → 500MB·5mbps; "...drop to 10 mbps" → ·10mbps;
//   "1GB high speed ... 10 mbps" → 1GB·10mbps. Spec thực tế: A=5mbps, B=10mbps.
//   Fallback khi thiếu throttle_speed: theo chữ A/B (A→5mbps·500MB, B→10mbps·500MB).

const ANALYTICS_ROLES = new Set(["admin", "creator", "manager", "bod", "staff", "b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"])

const G_500_5  = "500MB high-speed · throttle 5 mbps"
const G_500_10 = "500MB high-speed · throttle 10 mbps"
const G_1GB_10 = "1GB high-speed · throttle 10 mbps"

const isNewSku = (sku: string) => /[AB]UNL/i.test(sku)

// Mã CŨ → group theo P-code (chỉ áp khi KHÔNG phải mã mới).
function parseOldGroup(sku: string): { group: string; source: string } | null {
  if (!/UNL/i.test(sku)) return null
  if (/P2/i.test(sku)) return { group: G_500_5,  source: "rule-p2" }   // P2 → 500MB 5mbps
  if (/P1/i.test(sku)) return { group: G_500_10, source: "rule-p1" }   // P1 → 500MB 10mbps
  if (/PY/i.test(sku)) return { group: G_1GB_10, source: "rule-py" }   // PYUNLI → 1GB 10mbps
  return null
}

// Mã MỚI → group từ chuỗi throttle_speed Product DB (chuẩn nhất cho mã mới).
function groupFromThrottle(throttle: string | null | undefined): { group: string; source: string } | null {
  if (!throttle) return null
  const m = /drop\s*to\s*(\d+)\s*mbps/i.exec(throttle)
  if (!m) return null
  const mbps = parseInt(m[1])
  const isGb = /1\s*GB/i.test(throttle)              // "1GB"/"1 GB" high speed
  if (mbps === 5)  return { group: G_500_5,  source: "throttle-5" }   // 5mbps luôn 500MB
  if (mbps === 10) return isGb ? { group: G_1GB_10, source: "throttle-1gb-10" }
                               : { group: G_500_10, source: "throttle-500-10" }
  return null
}

// Fallback mã mới khi thiếu throttle_speed: theo chữ A/B (A=5mbps, B=10mbps — khớp spec product).
function groupFromLetter(sku: string): { group: string; source: string } | null {
  if (/AUNL/i.test(sku)) return { group: G_500_5,  source: "letter-a-5" }   // A → 5mbps 500MB
  if (/BUNL/i.test(sku)) return { group: G_500_10, source: "letter-b-10" }  // B → 10mbps 500MB
  return null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ANALYTICS_ROLES.has((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    // Mọi SKU Unlimited theo MÃ (chứa UNL) — KHÔNG tin cột sku_type (mã MỚI bị gán nhầm 'Daily').
    const usageRows = await queryAnalytics<{ sku: string }>(`
      SELECT DISTINCT f.sku
      FROM fact_data_usage f
      JOIN dim_sku d ON f.sku = d.sku AND REPLACE(UPPER(d.vendor),' ','') = '3HKDATAPOOL'
      WHERE f.sku_type ILIKE '%nlimited%' OR UPPER(f.sku) LIKE '%UNL%'
    `)
    if (!usageRows.length) return NextResponse.json({ map: {}, coverage: {} })

    // Throttle_speed của mã MỚI từ Product DB (Supabase skus) — quyết 500MB vs 1GB ở 10mbps.
    const newSkus = usageRows.map(u => u.sku).filter(isNewSku)
    const throttleBySku: Record<string, string | null> = {}
    if (newSkus.length) {
      const { data } = await supabaseAdmin
        .from("skus").select("sku_code, throttle_speed").in("sku_code", newSkus)
      for (const r of data ?? []) throttleBySku[r.sku_code] = r.throttle_speed
    }

    const map: Record<string, { group: string | null; source: string }> = {}
    const coverage: Record<string, number> = {}

    for (const u of usageRows) {
      let res: { group: string; source: string } | null = null
      if (isNewSku(u.sku)) {
        // Mã mới: ưu tiên throttle_speed Product DB → fallback theo chữ A/B
        res = groupFromThrottle(throttleBySku[u.sku]) ?? groupFromLetter(u.sku)
      } else {
        // Mã cũ: theo P-code
        res = parseOldGroup(u.sku)
      }
      const group = res?.group ?? null
      const source = res?.source ?? "no-parse"
      map[u.sku] = { group, source }
      coverage[source] = (coverage[source] ?? 0) + 1
    }

    return NextResponse.json(
      { map, coverage },
      { headers: { "Cache-Control": "private, max-age=600" } },
    )
  } catch (err: any) {
    console.error("[3hk-speed-map]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
