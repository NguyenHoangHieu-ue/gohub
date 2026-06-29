import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"

// Phân loại SKU cũ 3HK Unlimited theo mã SKU trực tiếp — 3 loại:
//   500MB · 5mbps  = mã có P2  (5 mbps throttle)
//   500MB · 10mbps = mã có P1  (10 mbps throttle, lower data)
//   1GB   · 10mbps = mã không có P (base PY UNLI = 1GB 10mbps premium)
//
// Quy tắc chuẩn theo nghiệp vụ:
//   FY  = Fixed packages (không unlimited)
//   PY  = Daily (không UNLI) hoặc Unlimited 1GB 10mbps (có UNLI, không có P1/P2)
//   P1  = sub-branch PY UNLI → 500MB 10mbps
//   P2  = sub-branch PY UNLI → 500MB 5mbps
// Không cần COGS, chỉ đọc mã SKU.

const ANALYTICS_ROLES = new Set(["admin", "creator", "manager", "bod", "staff", "b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"])

const G_500_5  = "500MB high-speed · throttle 5 mbps"
const G_500_10 = "500MB high-speed · throttle 10 mbps"
const G_1GB_10 = "1GB high-speed · throttle 10 mbps"

// Parse mã CŨ usage: [E]<CTRY:3><3D>[P1|P2]...[UNLI]...<days>D
// Trả về mbps: 5 (P2), 10 (P1), null (không có P = base 1GB)
function parseOldSku(sku: string): { mbps: number | null } | null {
  // Phải là unlimited SKU (có UNLI hoặc UNL)
  if (!/UNL/i.test(sku)) return null
  const pm = sku.match(/P([12])/)
  if (!pm) return { mbps: null }           // Không P → base 1GB 10mbps
  return { mbps: pm[1] === "1" ? 10 : 5 } // P1 → 10mbps, P2 → 5mbps
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ANALYTICS_ROLES.has((session.user as any).role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    // Lấy tất cả SKU unlimited 3HK từ fact_data_usage
    const usageRows = await queryAnalytics<{ sku: string }>(`
      SELECT DISTINCT f.sku
      FROM fact_data_usage f
      JOIN dim_sku d ON f.sku = d.sku AND REPLACE(UPPER(d.vendor),' ','') = '3HKDATAPOOL'
      WHERE f.sku_type ILIKE '%nlimited%'
    `)
    if (!usageRows.length) return NextResponse.json({ map: {}, coverage: {} })

    const map: Record<string, { group: string | null; source: string }> = {}
    const coverage: Record<string, number> = {}

    for (const u of usageRows) {
      const parsed = parseOldSku(u.sku)
      let group: string | null = null
      let source = "no-parse"

      if (parsed) {
        if (parsed.mbps === 5) {
          group = G_500_5;  source = "rule-p2"
        } else if (parsed.mbps === 10) {
          group = G_500_10; source = "rule-p1"
        } else {
          // mbps === null → không có P1/P2 → base PY UNLI = 1GB 10mbps
          group = G_1GB_10; source = "rule-no-p"
        }
      }

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
