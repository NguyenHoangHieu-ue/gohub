import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { analyticsGuard, cachedQuery, QUERY_TTL_MIN, noCache } from "@/lib/analytics-helpers"
import { fetchCustomerCosts, calcRecordCostProjected } from "@/lib/b2b-customer-cost"
import { fetchCosts } from "@/lib/bod-data"
import { buildQuarterMonthMeta, getKpiFactor, getElapsedRatio } from "@/lib/analytics-engine/quarter-projection"
import { fetchQuarterlySettings, makeExcludeSql, exclHash } from "@/lib/quarterly-settings"
import { fetchB2BLifecycleRows, classifyB2BLifecycle, fetchCustomerNames, type B2BLifecycleRow } from "@/lib/analytics-engine/b2b-lifecycle"

export const dynamic = "force-dynamic"

type RiskLevel = "very_safe" | "safe" | "safe_low" | "danger_low" | "danger_high" | "no_target"

function classifyTier(priceListName: string | null): string {
  const p = (priceListName || "").toUpperCase()
  if (p.includes("VIP"))    return "VIP"
  if (p.includes("GOLD"))   return "Gold"
  if (p.includes("SILVER")) return "Silver"
  return "Strategic"
}
function classifyRegion(priceListName: string | null, currencyCode: string | null): string {
  const p = (priceListName || "").toUpperCase()
  const c = (currencyCode  || "").toUpperCase()
  if (c === "USD" || p.includes(" US") || p.startsWith("US ")) return "US"
  return "VN"
}

function getRiskLevel(cm1Pct: number | null, hk3Pct: number | null): RiskLevel {
  const hasCm1 = cm1Pct != null
  const hasHk3 = hk3Pct != null
  if (!hasCm1 && !hasHk3) return "no_target"

  if (!hasCm1 || !hasHk3) {
    const v = (cm1Pct ?? hk3Pct)!
    if (v >= 100) return "safe"
    if (v >= 85)  return "safe_low"
    return "danger_high"
  }

  // Ưu tiên từ dưới lên (mức xấu nhất thắng): 1 cột rơi vào nguy hiểm thì cả cặp
  // bị kéo xuống nguy hiểm, dù cột còn lại vượt target (tránh 1 metric cao che mất metric thấp).
  const c = cm1Pct!, h = hk3Pct!
  if (c < 85  && h < 85)  return "danger_high"  // Nguy hiểm nhiều: cả 2 < 85%
  if (c < 85  || h < 85)  return "danger_low"   // Nguy hiểm ít:    ít nhất 1 < 85%
  if (c < 100 && h < 100) return "safe_low"     // An toàn ít:      cả 2 trong [85%, 100%)
  if (c < 100 || h < 100) return "safe"         // An toàn:         ít nhất 1 chưa đạt 100% (còn lại đều >= 85%)
  return "very_safe"                             // Rất an toàn:     cả 2 >= 100%
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const p = req.nextUrl.searchParams
  const year    = parseInt(p.get("year")    || String(new Date().getFullYear()))
  const quarter = p.get("quarter") || "Q3"
  const companyCode = p.get("companyCode") || "ALL"
  const q = parseInt(quarter.replace("Q", ""))

  const today = new Date()
  const asOf  = new Date(today); asOf.setDate(asOf.getDate() - 1)
  const todayStr = asOf.toISOString().split("T")[0]

  const qStartM   = (q - 1) * 3 + 1
  const qStart    = `${year}-${String(qStartM).padStart(2, "0")}-01`
  const qLastMonth = `${year}-${String(q * 3).padStart(2, "0")}`
  const qEndDateObj = new Date(year, q * 3, 0)  // last day of quarter
  const qEnd = qEndDateObj < asOf ? qEndDateObj.toISOString().split("T")[0] : todayStr

  // Tháng trong quý (đến hiện tại) — dùng chung cho per-month projection + fetchCustomerCosts
  const months: string[] = []
  for (let i = 0; i < 3; i++) {
    const m = `${year}-${String(qStartM + i).padStart(2, "0")}`
    const mStart = new Date(year, qStartM - 1 + i, 1)
    if (mStart <= asOf) months.push(m)
  }

  // Per-month projection metadata — CÙNG logic với quarterly-report (buildQuarterMonthMeta).
  const monthMeta = buildQuarterMonthMeta(months, asOf, todayStr)
  const qTotalDays   = Math.round((qEndDateObj.getTime() - new Date(qStart).getTime()) / 86400000) + 1
  const elapsedDays  = Math.max(1, Math.round((new Date(qEnd).getTime() - new Date(qStart).getTime()) / 86400000) + 1)
  // futureScale — ước tính tháng CHƯA TỚI trong quý (khớp Tổng quan `quarterly/page.tsx` futureScale).
  // `months`/`monthMeta` chỉ gồm tháng đã bắt đầu → PR tính từ đó thiếu hẳn tháng tương lai (vd T9 khi mới
  // qua T7-T8). existingDays = tổng SỐ NGÀY ĐẦY ĐỦ của các tháng đã có (không phải elapsedDays — đã tính riêng
  // ở trên cho mục đích khác); futureScale = qTotalDays / existingDays để nới PR lên đủ cả quý.
  const existingDaysFull = monthMeta.reduce((s, mr) => s + mr.dim, 0)
  const futureScale = existingDaysFull > 0 ? qTotalDays / existingDaysFull : 1

  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""

  // Quý trước (s200) — chỉ dùng để lấy "doanh thu quý trước" của KH giờ Inactive (lifecycle).
  const prevQNum = q === 1 ? 4 : q - 1
  const prevQYear = q === 1 ? year - 1 : year
  const prevQFirst = (prevQNum - 1) * 3 + 1
  const prevQStartDate = `${prevQYear}-${String(prevQFirst).padStart(2, "0")}-01`
  const prevQEndDate = new Date(prevQYear, prevQNum * 3, 0).toISOString().split("T")[0]

  // Quý SAU — bảng "Performance theo tháng" hiện target 3 tháng của quý kế tiếp (nhập ở panel Target squad).
  const nextQNum = q === 4 ? 1 : q + 1
  const nextQYear = q === 4 ? year + 1 : year
  const nextQFirst = (nextQNum - 1) * 3 + 1
  const nextQuarterMonths = [0, 1, 2].map(i => `${nextQYear}-${String(nextQFirst + i).padStart(2, "0")}`)
  const quarterMonths = [0, 1, 2].map(i => `${year}-${String(qStartM + i).padStart(2, "0")}`)

  try {
    // Load song song: squad config, squad targets, excluded customers (quarterly-settings)
    const [cfgRes, tgtRes, { excludedCustomers }] = await Promise.all([
      supabaseAdmin.from("app_settings").select("value").eq("key", "squad_config").maybeSingle(),
      supabaseAdmin.from("app_settings").select("value").eq("key", "squad_targets").maybeSingle(),
      fetchQuarterlySettings(),
    ])
    const squadsConfig: { name: string; leader?: string; sales_pics: string[] }[] =
      cfgRes.data?.value ? (JSON.parse(cfgRes.data.value).squads ?? []) : []
    // months = target từng tháng của CHÍNH quý đó (mảng 3 phần tử); quý = tổng 3 tháng khi chưa nhập target quý riêng.
    type SquadTarget = { rev?: number; cm1?: number; hk3rev?: number; gp?: number; months?: Partial<Record<"rev" | "gp" | "cm1" | "hk3rev", number[]>> }
    let squadTargets: Record<string, SquadTarget> = {}
    let nextSquadTargets: Record<string, SquadTarget> = {}
    try {
      const allTgt = tgtRes.data?.value ? JSON.parse(tgtRes.data.value) : {}
      squadTargets = allTgt[`${quarter}_${year}`] ?? {}
      nextSquadTargets = allTgt[`Q${nextQNum}_${nextQYear}`] ?? {}
    } catch { squadTargets = {}; nextSquadTargets = {} }
    const sumMonths = (a?: number[]) => (Array.isArray(a) ? a.reduce((s, v) => s + (Number(v) || 0), 0) : 0)
    const month3 = (a?: number[]) => [0, 1, 2].map(i => Math.round(Number(a?.[i]) || 0))

    // EXCLUDE_CUST: dùng cùng nguồn với quarterly-report (dynamic từ Supabase quarterly-settings)
    const EXCLUDE_CUST_SQL = makeExcludeSql(excludedCustomers)

    // Per-month CASE WHEN columns — để áp đúng factor theo tháng (khớp buildQuarterMonthMeta)
    const monthCols = months.map((m, i) => `
      SUM(CASE WHEN LEFT(f.fulfiled_date, 7) = '${m}' THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) AS rev_m${i},
      SUM(CASE WHEN LEFT(f.fulfiled_date, 7) = '${m}' THEN f.gross_profit_vnd             ELSE 0 END) AS gm_m${i},
      SUM(CASE WHEN LEFT(f.fulfiled_date, 7) = '${m}' AND sk.sku IS NOT NULL
               THEN f.fulfilled_revenue_amount_vnd ELSE 0 END)                              AS hk3_m${i}`).join(",")

    // Revenue + GP + 3HK per customer, tách theo tháng
    // s203: route này TRƯỚC KHÔNG cache → mỗi lần mở Quarter Report chạy lại 3 query fact/dim (9-17s khi nguội). Nay khối
    // DOANH THU thô được cache SWR (khoá theo quý/năm/công ty/ngày/bộ loại trừ); chi phí, target, squad config vẫn đọc
    // tươi mỗi request (nhập xong hiện ngay, không cần flush).
    const rawKey = `squad_raw_v1:${quarter}:${year}:${companyCode}:${todayStr}:${exclHash(excludedCustomers)}`
    const [raw, { groupCosts }, lifecycleRows] = await Promise.all([
      cachedQuery(rawKey, async () => {
        const [custRows, picRows, prevCustRevRows] = await Promise.all([
        queryAnalytics<Record<string, string>>(`
          SELECT
            TRIM(f.customer_code)                               AS customer_code,
            COALESCE(c.name, TRIM(f.customer_code))             AS customer_name,
            TRIM(c.sales_pic_code)                              AS sales_pic_code,
            c.price_list_name,
            c.currency_code,
            SUM(f.fulfilled_revenue_amount_vnd)                 AS revenue,
            SUM(f.gross_profit_vnd)                             AS gm,
            SUM(CASE WHEN sk.sku IS NOT NULL
                     THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) AS hk3,
            ${monthCols}
          FROM fact_fulfillment_revenue f
          LEFT JOIN dim_order_source s  ON f.order_source_code = s.code
          LEFT JOIN dim_customer    c   ON TRIM(f.customer_code) = c.code
          LEFT JOIN (
            SELECT DISTINCT TRIM(sku) AS sku FROM dim_sku
            WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
          ) sk ON TRIM(f.sku) = sk.sku
          WHERE f.fulfiled_date >= '${qStart}'
            AND f.fulfiled_date <= '${qEnd}'
            ${companyFilter}
            AND f.sku != 'SHIPPINGFEE0'
            AND UPPER(COALESCE(s.group_name,'')) = 'B2B'
            AND NOT (UPPER(COALESCE(c.price_list_name,'')) LIKE '%INACTIVE%')
            ${EXCLUDE_CUST_SQL}
          GROUP BY 1, 2, 3, c.price_list_name, c.currency_code
        `),
        queryAnalytics<{ code: string; name: string }>(`
          SELECT DISTINCT
            TRIM(c.sales_pic_code)                       AS code,
            COALESCE(st.name, TRIM(c.sales_pic_code))    AS name
          FROM dim_customer c
          LEFT JOIN dim_staff st ON TRIM(c.sales_pic_code) = TRIM(st.code)
          WHERE c.sales_pic_code IS NOT NULL AND TRIM(c.sales_pic_code) != ''
            AND NOT (UPPER(COALESCE(c.price_list_name,'')) LIKE '%INACTIVE%')
          ORDER BY 2
        `),
        // Doanh thu B2B quý TRƯỚC theo KH (s200) — dùng tính "doanh thu mất" cho KH giờ Inactive.
        queryAnalytics<{ customer_code: string; revenue: string }>(`
          SELECT TRIM(f.customer_code) AS customer_code, SUM(f.fulfilled_revenue_amount_vnd) AS revenue
          FROM fact_fulfillment_revenue f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN dim_customer c ON TRIM(f.customer_code) = c.code
          WHERE f.fulfiled_date >= '${prevQStartDate}' AND f.fulfiled_date <= '${prevQEndDate}'
            ${companyFilter}
            AND f.sku != 'SHIPPINGFEE0'
            AND UPPER(COALESCE(s.group_name,'')) = 'B2B'
            AND NOT (UPPER(COALESCE(c.price_list_name,'')) LIKE '%INACTIVE%')
            ${EXCLUDE_CUST_SQL}
          GROUP BY 1
        `).catch(() => [] as { customer_code: string; revenue: string }[]),
        ])
        return { custRows, picRows, prevCustRevRows }
      }, QUERY_TTL_MIN, noCache(req)),
      fetchCosts(months),
      fetchB2BLifecycleRows(companyCode, EXCLUDE_CUST_SQL, exclHash(excludedCustomers)).catch(() => [] as B2BLifecycleRow[]),
    ])
    const { custRows, picRows, prevCustRevRows } = raw

    // Load targets + chi phí KH song song
    const custCodes = [...new Set(custRows.map(r => r.customer_code))]
    let targetMap: Record<string, { rev: number; cm1: number; hk3rev: number; hk3pct: number }> = {}
    let costMap = new Map<string, import("@/lib/b2b-customer-cost").CostRecord>()
    await Promise.all([
      custCodes.length > 0
        ? supabaseAdmin
            .from("b2b_customer_targets")
            .select("customer_code, target_rev, target_cm1, target_3hk_rev, target_3hk_pct")
            .eq("quarter", quarter).eq("year", String(year)).in("customer_code", custCodes)
            .then(({ data: tgts }) => {
              for (const t of tgts ?? []) {
                targetMap[t.customer_code] = {
                  rev:    Number(t.target_rev)     || 0,
                  cm1:    Number(t.target_cm1)     || 0,
                  hk3rev: Number(t.target_3hk_rev) || 0,
                  hk3pct: Number(t.target_3hk_pct) || 0,
                }
              }
            })
        : Promise.resolve(),
      fetchCustomerCosts(months).then(m => { costMap = m }).catch(() => {}),
    ])

    // elapsedRatioOf/kpiFactorOf — s183 Phase 2: dùng thẳng `getElapsedRatio`/`getKpiFactor` dùng chung
    // (analytics-engine/quarter-projection.ts) thay vì tự định nghĩa lại công thức tại đây. Trước s183,
    // route này VÀ `quarterly/page.tsx` (`kpiPrFactor`/`monthKpiFactor`) mỗi nơi viết tay 1 bản y hệt nhau
    // — chỉ đổi 1 nơi (bug s182: quên đồng bộ) từng làm Squad Progress lệch hẳn Quarter Report đầu tháng
    // cuối quý. Công thức không đổi (đã verify bằng test `analytics-engine.test.ts`), chỉ đổi NGUỒN.
    const elapsedRatioOf = (i: number) => getElapsedRatio(monthMeta[i])
    const kpiFactorOf = (i: number) => getKpiFactor(monthMeta[i])

    // Helper: CM1 thực + PR dùng per-month data để áp đúng factor (khớp quarterly-report)
    const calcCustCm1AndPr = (r: Record<string, string>, code: string) => {
      let cm1Act = 0, cm1Pr = 0
      for (let i = 0; i < months.length; i++) {
        const mRev = Number(r[`rev_m${i}`]) || 0
        const mGm  = Number(r[`gm_m${i}`])  || 0
        const rec  = costMap.get(`${months[i]}_${code}`)
        // Bỏ qua tháng KH không có doanh thu — nhất quán quarterly-report/tier (KH không có orders tháng đó
        // thì không hiện trong bảng chi tiết → cost không nên tính vào).
        const mCost = rec && mRev !== 0 ? calcRecordCostProjected(rec, mRev, 1, elapsedRatioOf(i)) : 0
        const mCm1 = mGm - mCost
        cm1Act += mCm1
        cm1Pr  += mCm1 * kpiFactorOf(i)
      }
      return { cm1Act, cm1Pr: Math.round(cm1Pr * futureScale) }
    }

    // Helper: projected revenue/hk3 dùng per-month factors × futureScale (ước tính tháng chưa tới, khớp Tổng quan).
    const calcPrByMonth = (r: Record<string, string>, field: string) =>
      Math.round(months.reduce((s, _, i) => s + (Number(r[`${field}_m${i}`]) || 0) * kpiFactorOf(i), 0) * futureScale)

    // Gộp custRows theo customer_code — query GROUP BY cả price_list_name/currency_code/sales_pic_code nên
    // 1 KH có thể ra NHIỀU dòng SQL nếu giá trị các cột này không ổn định suốt quý (đổi PIC/bảng giá giữa quý,
    // join dim_customer lệch ở vài đơn cũ...). Trước đây lấy `.find()` dòng đầu → MẤT doanh thu các dòng còn lại
    // + có thể gán sai squad. Gộp đúng: sum số liệu, chọn text field (PIC/tên/bảng giá) từ dòng revenue lớn nhất.
    const isNumCol = (k: string) => k === "revenue" || k === "gm" || k === "hk3" || /^(rev|gm|hk3)_m\d+$/.test(k)
    const rowsByCode = new Map<string, Record<string, string>[]>()
    custRows.forEach(r => {
      const arr = rowsByCode.get(r.customer_code) ?? []
      arr.push(r)
      rowsByCode.set(r.customer_code, arr)
    })
    const custAgg = new Map<string, Record<string, string>>()
    rowsByCode.forEach((group, code) => {
      if (group.length === 1) { custAgg.set(code, group[0]); return }
      console.warn(`  ! KH ${code} có ${group.length} dòng SQL (price_list_name/PIC không ổn định) — đã gộp`)
      const best = group.reduce((a, b) => (Number(b.revenue) || 0) > (Number(a.revenue) || 0) ? b : a)
      const merged: Record<string, string> = { ...best }
      Object.keys(group[0]).forEach(k => {
        if (isNumCol(k)) merged[k] = String(group.reduce((s, g) => s + (Number(g[k]) || 0), 0))
      })
      custAgg.set(code, merged)
    })

    // customerLifecycle (s200) — New/Recurring/Inactive B2B, per-squad + tổng công ty.
    const prevRevByCode = new Map<string, number>()
    ;(prevCustRevRows as Array<{ customer_code: string; revenue: string }>).forEach(r => {
      prevRevByCode.set(r.customer_code, parseFloat(r.revenue || "0"))
    })
    const activeCodesThisQuarter = new Set(
      [...custAgg.entries()].filter(([, r]) => (Number(r.revenue) || 0) !== 0).map(([code]) => code),
    )
    const lifecycleMap = classifyB2BLifecycle(lifecycleRows, activeCodesThisQuarter, qStart, qEnd)
    const emptyLifecycle = () => ({ new: { count: 0, revenue: 0 }, recurring: { count: 0, revenue: 0 }, inactive: { count: 0, lostRevenue: 0, list: [] as { code: string; name: string; lastRevenue: number }[] } })
    // Tổng công ty (KHÔNG chỉ cộng squad — gồm cả KH không gán PIC/squad nào), tính thẳng từ lifecycleMap.
    const totalsLifecycle = emptyLifecycle()
    lifecycleMap.forEach((st, code) => {
      if (st === "new") { totalsLifecycle.new.count++; totalsLifecycle.new.revenue += Number(custAgg.get(code)?.revenue) || 0 }
      else if (st === "recurring") { totalsLifecycle.recurring.count++; totalsLifecycle.recurring.revenue += Number(custAgg.get(code)?.revenue) || 0 }
      else { totalsLifecycle.inactive.count++; totalsLifecycle.inactive.lostRevenue += prevRevByCode.get(code) || 0 }
    })

    // Group Cost B2B — phân bổ theo revenue-share (khớp #4 NHẤT QUÁN GROUP COST trong quarterly-b2b-customers,
    // trước đây Squad Progress KHÔNG trừ khoản này → CM1 lệch cao hơn Tổng quan/tier).
    const grandTotalRevAct = custRows.reduce((s, r) => s + (Number(r.revenue) || 0), 0)
    const grandTotalRevPr  = custRows.reduce((s, r) => s + calcPrByMonth(r, "rev"), 0)
    let totalB2BGCAct = 0, totalB2BGCPr = 0
    // Group cost từng tháng (chưa nhân futureScale) — bảng "Performance theo tháng" phân bổ theo đúng tỷ trọng quý của squad
    // nên Σ các tháng khớp đúng số CM1 của card.
    const gcActByMonth: number[] = [], gcPrByMonth: number[] = []
    months.forEach((m, i) => {
      const budget = groupCosts.filter((g: any) => g.group_name === "B2B" && g.month === m).reduce((s: number, g: any) => s + (g.amount || 0), 0)
      const mr = monthMeta[i]
      const gcRatio = (mr.elapsed > 0 && mr.elapsed < mr.dim) ? mr.elapsed / mr.dim : 1
      gcActByMonth[i] = budget * gcRatio
      // gcRatio × kpiFactorOf(i) = 1 cho mọi tháng đã bắt đầu (2 tỉ lệ triệt tiêu nhau: elapsed/dim ×
      // dim/elapsed) → PR group cost = full budget tháng, khớp cách Tổng quan luôn chiếu ngay (ungated).
      gcPrByMonth[i] = budget * gcRatio * kpiFactorOf(i)
      totalB2BGCAct += gcActByMonth[i]
      totalB2BGCPr  += gcPrByMonth[i]
    })
    totalB2BGCPr *= futureScale  // ước tính group cost tháng chưa tới, khớp cách revPr/cm1Pr được nới

    // Aggregate per squad
    const squads = squadsConfig.map(sq => {
      const members = Array.from(custAgg.values()).filter(r => sq.sales_pics.includes(r.sales_pic_code || ""))
      const codes   = members.map(m => m.customer_code)

      // customerLifecycle per-squad (s200) — New/Recurring từ members ĐANG hoạt động quý này;
      // Inactive lấy từ lifecycleRows (KH cũ gán PIC squad này nhưng KHÔNG có đơn quý này → không có trong members).
      // Recurring tách 2: continuing (có mua quý trước → tiếp tục) / returning (KH cũ, quý trước KHÔNG mua → quay lại sau gián đoạn).
      // Inactive CHỈ đếm KH có doanh thu quý trước mà quý này chưa mua (KH cần gọi lại) — không đếm toàn lịch sử (~112.000 KH).
      const lifecycle = {
        ...emptyLifecycle(),
        continuing: { count: 0, revenue: 0 },
        returning: { count: 0, revenue: 0 },
      }
      members.forEach(r => {
        const st = lifecycleMap.get(r.customer_code) ?? "new"
        const revenue = Number(r.revenue) || 0
        if (st === "new") { lifecycle.new.count++; lifecycle.new.revenue += revenue }
        else if (st === "recurring") {
          lifecycle.recurring.count++; lifecycle.recurring.revenue += revenue
          const bucket = (prevRevByCode.get(r.customer_code) || 0) > 0 ? lifecycle.continuing : lifecycle.returning
          bucket.count++; bucket.revenue += revenue
        }
      })
      lifecycleRows
        .filter(row => sq.sales_pics.includes(row.sales_pic_code || "")
          && lifecycleMap.get(row.customer_code) === "inactive"
          && (prevRevByCode.get(row.customer_code) || 0) > 0)
        .forEach(row => {
          lifecycle.inactive.count++
          const lastRevenue = prevRevByCode.get(row.customer_code) || 0
          lifecycle.inactive.lostRevenue += lastRevenue
          lifecycle.inactive.list.push({ code: row.customer_code, name: row.customer_name, lastRevenue })
        })
      lifecycle.inactive.list.sort((a, b) => b.lastRevenue - a.lastRevenue)
      lifecycle.inactive.list = lifecycle.inactive.list.slice(0, 30).map(x => ({ ...x, lastRevenue: Math.round(x.lastRevenue) }))
      lifecycle.new.revenue = Math.round(lifecycle.new.revenue)
      lifecycle.recurring.revenue = Math.round(lifecycle.recurring.revenue)
      lifecycle.continuing.revenue = Math.round(lifecycle.continuing.revenue)
      lifecycle.returning.revenue = Math.round(lifecycle.returning.revenue)
      lifecycle.inactive.lostRevenue = Math.round(lifecycle.inactive.lostRevenue)

      let rev = 0, cm1 = 0, hk3 = 0, hk3Pr = 0, tgtRev = 0, tgtCm1 = 0, tgtHk3 = 0

      const customers = codes.map(code => {
        const r = custAgg.get(code)
        if (!r) return null

        const revenue    = Number(r.revenue) || 0
        const hk3Act     = Number(r.hk3) || 0
        const { cm1Act, cm1Pr } = calcCustCm1AndPr(r, code)
        const revPr      = calcPrByMonth(r, "rev")
        const custHk3Pr  = calcPrByMonth(r, "hk3")
        const hk3ActPct  = revenue > 0 ? Math.round(hk3Act / revenue * 1000) / 10 : 0

        const tgt = targetMap[code] ?? { rev: 0, cm1: 0, hk3rev: 0, hk3pct: 0 }
        // %TGT 3HK: so DOANH THU 3HK PR với target doanh thu 3HK (khớp Tổng quan `custPr`/tgt3hk trong
        // quarterly/page.tsx) — KHÔNG so % với % như trước (2 không gian khác nhau, ra số khác).
        // Target doanh thu 3HK: dùng target_3hk_rev nếu đã nhập, fallback target_rev × target_3hk_pct/100.
        const tgt3hk = tgt.hk3rev > 0 ? tgt.hk3rev : (tgt.rev > 0 && tgt.hk3pct > 0 ? Math.round(tgt.rev * tgt.hk3pct / 100) : 0)
        rev    += revenue
        cm1    += cm1Act
        hk3    += hk3Act
        hk3Pr  += custHk3Pr
        tgtRev += tgt.rev
        tgtCm1 += tgt.cm1
        tgtHk3 += tgt3hk

        const cm1TgtPct: number | null  = tgt.cm1 > 0 ? Math.round(cm1Pr / tgt.cm1 * 100) : null
        const hk3TgtPct: number | null  = tgt3hk > 0 ? Math.round(custHk3Pr / tgt3hk * 100) : null

        return {
          customer_code: code,
          customer_name: r.customer_name,
          sales_pic: r.sales_pic_code || "",
          tier:   classifyTier(r.price_list_name),
          region: classifyRegion(r.price_list_name, r.currency_code),
          lifecycle_state: lifecycleMap.get(code) ?? "new",
          revenue, revenue_pr: revPr, target_rev: tgt.rev,
          rev_pct: tgt.rev > 0 ? Math.round(revPr / tgt.rev * 100) : null,
          cm1: cm1Act, cm1_pr: cm1Pr, target_cm1: tgt.cm1,
          cm1_pct: revenue > 0 ? Math.round(cm1Act / revenue * 1000) / 10 : 0,
          cm1_tgt_pct: cm1TgtPct,
          hk3: hk3Act, hk3_pct: hk3ActPct, hk3_pr: custHk3Pr, target_hk3pct: tgt.hk3pct, target_hk3rev: tgt3hk,
          hk3_tgt_pct: hk3TgtPct,
          risk_level: getRiskLevel(cm1TgtPct, hk3TgtPct),
        }
      }).filter(Boolean) as any[]

      // Squad-level projected values: dùng per-month factors × futureScale (khớp Tổng quan, ước tính tháng chưa tới)
      // Số liệu từng tháng của squad (actual, CM1 chưa trừ group cost) — nguồn chung cho PR cả quý VÀ bảng "Performance theo tháng"
      // → 2 nơi luôn khớp nhau. Công thức PR giữ nguyên: Σ tháng × kpiFactor × futureScale.
      const mData = months.map((m, i) => {
        let mRevAct = 0, mGp = 0, mHk3 = 0, mCm1Pre = 0
        for (const r of members) {
          const mRev = Number(r[`rev_m${i}`]) || 0
          const mGm  = Number(r[`gm_m${i}`])  || 0
          const rec  = costMap.get(`${m}_${r.customer_code}`)
          const mCost = rec && mRev !== 0 ? calcRecordCostProjected(rec, mRev, 1, elapsedRatioOf(i)) : 0
          mRevAct += mRev; mGp += mGm; mHk3 += Number(r[`hk3_m${i}`]) || 0; mCm1Pre += mGm - mCost
        }
        return { rev: mRevAct, gp: mGp, hk3: mHk3, cm1Pre: mCm1Pre }
      })
      const sumPr = (pick: (d: typeof mData[number]) => number) =>
        mData.reduce((s, d, i) => s + pick(d) * kpiFactorOf(i), 0) * futureScale
      const revPr = Math.round(sumPr(d => d.rev))
      const gpAct = Math.round(mData.reduce((s, d) => s + d.gp, 0))
      const gpPr  = Math.round(sumPr(d => d.gp))
      let cm1Pr = sumPr(d => d.cm1Pre)
      const shareAct = grandTotalRevAct > 0 ? rev / grandTotalRevAct : 0
      const sharePr  = grandTotalRevPr  > 0 ? revPr / grandTotalRevPr : 0
      const groupShareAct = shareAct * totalB2BGCAct
      const groupSharePr  = sharePr  * totalB2BGCPr  // totalB2BGCPr đã nhân futureScale ở trên
      cm1 = Math.round(cm1 - groupShareAct)
      cm1Pr = Math.round(cm1Pr - groupSharePr)

      const monthly = mData.map((d, i) => {
        const k = kpiFactorOf(i)
        return {
          month: months[i],
          status: monthMeta[i].elapsed < monthMeta[i].dim ? "current" : "done",
          rev: Math.round(d.rev), gp: Math.round(d.gp), hk3: Math.round(d.hk3),
          cm1: Math.round(d.cm1Pre - shareAct * gcActByMonth[i]),
          rev_pr: Math.round(d.rev * k), gp_pr: Math.round(d.gp * k), hk3_pr: Math.round(d.hk3 * k),
          cm1_pr: Math.round(d.cm1Pre * k - sharePr * gcPrByMonth[i]),
        }
      })

      const tierCounts = { Strategic: 0, VIP: 0, Gold: 0, Silver: 0 }
      customers.forEach(c => { if (c?.tier in tierCounts) tierCounts[c.tier as keyof typeof tierCounts]++ })

      const mt = squadTargets[sq.name] ?? {}
      // Ưu tiên: target quý nhập tay > tổng target 3 tháng > tổng target per-customer (GP không có per-customer).
      const pickTarget = (manual: unknown, monthsArr: number[] | undefined, fallback: number) =>
        Number(manual) > 0 ? Number(manual) : sumMonths(monthsArr) > 0 ? sumMonths(monthsArr) : fallback
      const effTgtRev = pickTarget(mt.rev,    mt.months?.rev,    tgtRev)
      const effTgtCm1 = pickTarget(mt.cm1,    mt.months?.cm1,    tgtCm1)
      const effTgtHk3 = pickTarget(mt.hk3rev, mt.months?.hk3rev, tgtHk3)
      const effTgtGp  = pickTarget(mt.gp,     mt.months?.gp,     0)
      const nt = nextSquadTargets[sq.name]?.months

      const riskCounts: Record<RiskLevel, number> = {
        very_safe: 0, safe: 0, safe_low: 0, danger_low: 0, danger_high: 0, no_target: 0,
      }
      customers.forEach(c => { if (c?.risk_level) riskCounts[c.risk_level as RiskLevel]++ })

      return {
        name: sq.name, leader: sq.leader, sales_pics: sq.sales_pics,
        customer_count: codes.length,
        manual_target: { rev: Number(mt.rev) || 0, cm1: Number(mt.cm1) || 0, hk3rev: Number(mt.hk3rev) || 0, gp: Number(mt.gp) || 0 },
        next_targets: { rev: month3(nt?.rev), gp: month3(nt?.gp), cm1: month3(nt?.cm1), hk3rev: month3(nt?.hk3rev) },
        revenue: rev,  revenue_pr: revPr,  target_rev: effTgtRev,
        rev_pct: effTgtRev > 0 ? Math.round(revPr / effTgtRev * 100) : null,
        gp: gpAct, gp_pr: gpPr, target_gp: effTgtGp,
        gp_pct: rev > 0 ? Math.round(gpAct / rev * 1000) / 10 : 0,
        gp_tgt_pct: effTgtGp > 0 ? Math.round(gpPr / effTgtGp * 100) : null,
        cm1,           cm1_pr: cm1Pr,      target_cm1: effTgtCm1,
        cm1_pct: rev > 0 ? Math.round(cm1 / rev * 1000) / 10 : 0,
        cm1_tgt_pct: effTgtCm1 > 0 ? Math.round(cm1Pr / effTgtCm1 * 100) : null,
        hk3, hk3_pct: rev > 0 ? Math.round(hk3 / rev * 1000) / 10 : 0, hk3_pr: Math.round(hk3Pr),
        target_hk3: effTgtHk3,
        hk3_tgt_pct: effTgtHk3 > 0 ? Math.round(hk3Pr / effTgtHk3 * 100) : null,
        risk_counts: riskCounts,
        tier_counts: tierCounts,
        customers,
        lifecycle,
        monthly,
      }
    })

    // Tên KH của top-10 rời bỏ mỗi squad: khối cache lifecycle không chứa tên (xem b2b-lifecycle.ts) → tra 1 lần cho ≤ vài chục mã.
    const inactiveListCodes = squads.flatMap(sq => sq.lifecycle.inactive.list.map(x => x.code))
    if (inactiveListCodes.length > 0) {
      const names = await fetchCustomerNames(inactiveListCodes).catch(() => new Map<string, string>())
      squads.forEach(sq => sq.lifecycle.inactive.list.forEach(x => { x.name = names.get(x.code) ?? x.code }))
    }

    const totRev = squads.reduce((s, sq) => s + sq.revenue, 0)
    const totCm1 = squads.reduce((s, sq) => s + sq.cm1,     0)
    const totHk3 = squads.reduce((s, sq) => s + sq.hk3,     0)
    const totRevPr = squads.reduce((s, sq) => s + sq.revenue_pr, 0)
    const totCm1Pr = squads.reduce((s, sq) => s + sq.cm1_pr,    0)
    const totGp    = squads.reduce((s, sq) => s + sq.gp,        0)
    const totGpPr  = squads.reduce((s, sq) => s + sq.gp_pr,     0)

    return NextResponse.json({
      quarter, year, elapsed_days: elapsedDays, quarter_days: qTotalDays, pr_factor: kpiFactorOf(monthMeta.length - 1),
      quarter_months: quarterMonths,
      next_quarter: { label: `Q${nextQNum}-${nextQYear}`, quarter: `Q${nextQNum}`, year: nextQYear, months: nextQuarterMonths },
      squads,
      totals: {
        revenue: totRev, revenue_pr: totRevPr,
        gp: totGp, gp_pr: totGpPr,
        cm1: totCm1, cm1_pr: totCm1Pr,
        cm1_pct: totRev > 0 ? Math.round(totCm1 / totRev * 1000) / 10 : 0,
        hk3: totHk3, hk3_pct: totRev > 0 ? Math.round(totHk3 / totRev * 1000) / 10 : 0,
        lifecycle: {
          new: { count: totalsLifecycle.new.count, revenue: Math.round(totalsLifecycle.new.revenue) },
          recurring: { count: totalsLifecycle.recurring.count, revenue: Math.round(totalsLifecycle.recurring.revenue) },
          inactive: { count: totalsLifecycle.inactive.count, lostRevenue: Math.round(totalsLifecycle.inactive.lostRevenue) },
        },
      },
      available_pics: picRows,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
