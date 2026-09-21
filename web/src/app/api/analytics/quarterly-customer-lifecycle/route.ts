import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, cachedQuery, QUERY_TTL_MIN, noCache, shipFilter, internalOpsFilter } from "@/lib/analytics-helpers"
import { fetchQuarterlySettings, makeExcludeSql, exclHash, makeClassifyTier } from "@/lib/quarterly-settings"
import { fetchB2BLifecycleRows } from "@/lib/analytics-engine/b2b-lifecycle"
import {
  selectB2BLifecycle, attachB2BProfiles, buildB2CLifecycleDetail, type B2BProfile, type LifecycleDetail,
} from "@/lib/analytics-engine/lifecycle-detail"
import { adminGohubConfigured, adminGohubCustomerList, adminGohubCustomerRangeSummary } from "@/lib/admin-gohub"

// Breakdown chi tiết KH Mới / Quay lại / Rời bỏ của Quarter Report (s203), tách B2B và B2C.
//   segment=b2b            → danh sách từng KH từ gohub_dw (nhanh, cache SWR 60')
//   segment=b2c&mode=summary → số KH + doanh thu mới/quay lại của quý (1 request Admin API, cho ô tổng quan)
//   segment=b2c            → danh sách từng KH B2C từ Admin GoHub API: ~130-150 trang × 100 KH, tải song song, cache 6h.
//                            Lần đầu mất ~1 phút → UI hiện "đang tải"; các lần sau tức thì.
export const dynamic = "force-dynamic"
export const maxDuration = 300

const B2C_READ_ROLES = ["admin", "creator", "bod", "manager", "b2c", "saleb2c"]
const B2C_TTL_MIN = 6 * 60

function quarterRanges(quarter: string, year: number) {
  const today = new Date()
  const asOf = new Date(today); asOf.setDate(asOf.getDate() - 1)
  const todayStr = asOf.toISOString().split("T")[0]
  const q = parseInt(quarter.replace("Q", ""))
  const firstMonth = (q - 1) * 3 + 1
  const months = [0, 1, 2].map(i => `${year}-${String(firstMonth + i).padStart(2, "0")}`)
  const qStart = `${months[0]}-01`
  const lastMonth = months[2]
  const lastMonthEnd = new Date(parseInt(lastMonth.split("-")[0]), parseInt(lastMonth.split("-")[1]), 0)
  const qEnd = lastMonthEnd < asOf ? lastMonthEnd.toISOString().split("T")[0] : todayStr

  const prevQ = q === 1 ? 4 : q - 1
  const prevYear = q === 1 ? year - 1 : year
  const prevFirst = (prevQ - 1) * 3 + 1
  const prevMonths = [0, 1, 2].map(i => `${prevYear}-${String(prevFirst + i).padStart(2, "0")}`)
  const prevStart = `${prevYear}-${String(prevFirst).padStart(2, "0")}-01`
  const prevEnd = new Date(prevYear, prevQ * 3, 0).toISOString().split("T")[0]
  return { todayStr, months, prevMonths, qStart, qEnd, prevStart, prevEnd }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const p = req.nextUrl.searchParams
  const year = parseInt(p.get("year") || String(new Date().getFullYear()))
  const quarter = p.get("quarter") || `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`
  const companyCode = (p.get("companyCode") || "ALL").replace(/[^A-Za-z0-9_-]/g, "") || "ALL"
  const segment = p.get("segment") === "b2c" ? "b2c" : "b2b"
  const mode = p.get("mode") === "summary" ? "summary" : "detail"
  const includeShip = p.get("includeShip") === "1"
  const includeInternalOps = p.get("includeInternalOps") === "1"
  const refresh = noCache(req)

  const r = quarterRanges(quarter, year)
  if (new Date(r.qStart) > new Date()) return NextResponse.json({ segment, quarter, year, detail: null })

  try {
    // ── B2C ──────────────────────────────────────────────────────────────────
    if (segment === "b2c") {
      const role = (session?.user as { role?: string } | undefined)?.role ?? ""
      if (!B2C_READ_ROLES.includes(role)) return NextResponse.json({ error: "Không có quyền xem danh sách KH B2C" }, { status: 403 })
      if (!adminGohubConfigured()) return NextResponse.json({ error: "Admin GoHub API chưa được cấu hình" }, { status: 503 })
      const from = (d: string) => `${d}T00:00:00.000Z`
      const to = (d: string) => `${d}T23:59:59.999Z`

      if (mode === "summary") {
        const summary = await cachedQuery(
          `qlife_b2c_summary:v1:${quarter}:${year}:${r.todayStr}`,
          () => adminGohubCustomerRangeSummary(from(r.qStart), to(r.qEnd)),
          QUERY_TTL_MIN, refresh,
        )
        return NextResponse.json({ segment, quarter, year, mode, summary })
      }

      const detail = await cachedQuery<LifecycleDetail>(
        `qlife_b2c_detail:v1:${quarter}:${year}:${r.todayStr}`,
        async () => {
          // Tuần tự 2 danh sách (mỗi cái 8 luồng) — tránh dồn ~16 request đồng thời lên API ngoài.
          const cur = await adminGohubCustomerList(from(r.qStart), to(r.qEnd), { concurrency: 8 })
          const prev = await adminGohubCustomerList(from(r.prevStart), to(r.prevEnd), { concurrency: 8 })
          return buildB2CLifecycleDetail(cur, prev)
        },
        B2C_TTL_MIN, refresh,
      )
      return NextResponse.json({ segment, quarter, year, mode, detail })
    }

    // ── B2B ──────────────────────────────────────────────────────────────────
    const { excludedCustomers, tierKeywords } = await fetchQuarterlySettings()
    const EXCLUDE_CUST_SQL = makeExcludeSql(excludedCustomers)
    const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""
    const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)}`

    const detail = await cachedQuery<LifecycleDetail>(
      `qlife_b2b_detail:v1:${quarter}:${year}:${companyCode}:${r.todayStr}:${exclHash(excludedCustomers)}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${createHash("sha1").update(JSON.stringify(tierKeywords)).digest("hex").slice(0, 8)}`,
      async () => {
        // Doanh thu B2B theo KH × tháng cho [quý trước → quý này] — CÙNG bộ lọc INACTIVE/exclude/ship/company với Quarter Report
        // nên "đang hoạt động quý này" khớp đúng ô tổng quan.
        const [revRows, lifecycleRows] = await Promise.all([
          queryAnalytics<{ month: string; customer_code: string; revenue: string }>(`
            WITH inactive_cust AS (
              SELECT TRIM(code) as code FROM dim_customer WHERE UPPER(COALESCE(price_list_name, '')) LIKE '%INACTIVE%'
            )
            SELECT LEFT(f.fulfiled_date, 7) as month, TRIM(f.customer_code) as customer_code, SUM(f.fulfilled_revenue_amount_vnd) as revenue
            FROM fact_fulfillment_revenue f
            LEFT JOIN dim_order_source s ON f.order_source_code = s.code
            WHERE f.fulfiled_date >= '${r.prevStart}' AND f.fulfiled_date <= '${r.qEnd}'
              ${companyFilter}
              AND UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2B'
              AND NOT EXISTS (SELECT 1 FROM inactive_cust ic WHERE ic.code = TRIM(f.customer_code))
              ${EXCLUDE_CUST_SQL}
              ${sfx}
            GROUP BY 1, 2`),
          fetchB2BLifecycleRows(companyCode, EXCLUDE_CUST_SQL, exclHash(excludedCustomers)),
        ])

        const cur = new Set(r.months), prev = new Set(r.prevMonths)
        const revThisQ = new Map<string, number>(), revPrevQ = new Map<string, number>()
        for (const row of revRows) {
          const v = parseFloat(row.revenue || "0")
          if (cur.has(row.month)) revThisQ.set(row.customer_code, (revThisQ.get(row.customer_code) || 0) + v)
          else if (prev.has(row.month)) revPrevQ.set(row.customer_code, (revPrevQ.get(row.customer_code) || 0) + v)
        }

        const sel = selectB2BLifecycle({ lifecycleRows, revThisQ, revPrevQ, qStart: r.qStart, qEnd: r.qEnd })
        const codes = [...new Set([...sel.selected.new, ...sel.selected.recurring, ...sel.selected.inactive].map(c => c.code))]
        const profiles = new Map<string, B2BProfile>()
        if (codes.length > 0) {
          const classifyTier = makeClassifyTier(tierKeywords)
          const list = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(",")
          const prof = await queryAnalytics<{ code: string; name: string | null; price_list_name: string | null; pic_name: string | null }>(`
            SELECT c.code, c.name, c.price_list_name, st.name AS pic_name
            FROM dim_customer c
            LEFT JOIN dim_staff st ON TRIM(st.code) = TRIM(c.sales_pic_code)
            WHERE c.code IN (${list})`)
          for (const x of prof) profiles.set(x.code, { name: x.name || x.code, tier: classifyTier(x.price_list_name), picName: x.pic_name || "" })
        }
        return attachB2BProfiles(sel, code => profiles.get(code))
      },
      QUERY_TTL_MIN, refresh,
    )
    return NextResponse.json({ segment, quarter, year, mode, detail })
  } catch (err: any) {
    console.error("[quarterly-customer-lifecycle]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
