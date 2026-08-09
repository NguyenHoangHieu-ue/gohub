import { getDateFilter, getDaysInMonth, cachedAnalyticsQuery } from "@/lib/analytics-helpers"
import { fetchBODGroupMarginData } from "@/lib/bod-data"
import { supabaseAdmin } from "@/lib/supabase"

// ─────────────────────────────────────────────────────────────────────────────
// Precompute số liệu cho Scheduled Reports (Daily/Weekly/Monthly).
// Trước đây mỗi report để Gemini TỰ sinh SQL nhiều vòng (chậm + Daily timeout + số có thể lệch).
// Nay tính SẴN bằng SQL cố định (đúng định nghĩa Dashboard), tách thị trường VN/US/Tổng theo
// fact_*.company_code, rồi nhồi DATA_BLOCK vào prompt → Gemini chỉ FORMAT (1 vòng).
// Định nghĩa số liệu tái dùng helpers chung (getDateFilter, fetchBODGroupMarginData) để KHỚP Dashboard.
// ─────────────────────────────────────────────────────────────────────────────

export type Period = "daily" | "weekly" | "monthly"

const REV = "fulfilled_revenue_amount_vnd"
const GP = "gross_profit_vnd"
// 3HK vendor ghi 2 kiểu trong DB ('3HKDATAPOOL' và '3HK DATAPOOL') → REPLACE bỏ space để bắt cả hai.
const SKU_3HK = `TRIM(f.sku) IN (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL')`

// ── Date helpers (giờ ICT = UTC+7; dùng getUTC* sau khi shift) ────────────────
function ictNow(): Date { return new Date(Date.now() + 7 * 3600_000) }
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}
function addDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 86400_000) }

interface Ranges {
  label: string                 // mô tả kỳ (vd "Tháng 5/2026", "7 ngày 10–16/06")
  curStart: string; curEnd: string
  prevStart: string; prevEnd: string   // kỳ liền trước (WoW/MoM)
  prevLabel: string
  monthStr: string              // tháng đang xét pro-rata/target (YYYY-MM)
  mtdStart: string; mtdEnd: string      // month-to-date (đầu tháng → hôm qua) — cho pro-rata
  daysElapsed: number; daysInMonth: number
  days: string[]                // các ngày cụ thể (daily: 3 ngày desc)
}

function computeRanges(period: Period): Ranges {
  const now = ictNow()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const yesterday = addDays(today, -1)
  const fmtVN = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}` }

  if (period === "monthly") {
    // Tháng dương lịch LIỀN TRƯỚC tháng hiện tại.
    const firstThis = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    const lastPrev = addDays(firstThis, -1)
    const firstPrev = new Date(Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1))
    const lastPrevPrev = addDays(firstPrev, -1)
    const firstPrevPrev = new Date(Date.UTC(lastPrevPrev.getUTCFullYear(), lastPrevPrev.getUTCMonth(), 1))
    const monthStr = ymd(firstPrev).slice(0, 7)
    return {
      label: `Tháng ${firstPrev.getUTCMonth() + 1}/${firstPrev.getUTCFullYear()}`,
      curStart: ymd(firstPrev), curEnd: ymd(lastPrev),
      prevStart: ymd(firstPrevPrev), prevEnd: ymd(lastPrevPrev),
      prevLabel: `Tháng ${firstPrevPrev.getUTCMonth() + 1}/${firstPrevPrev.getUTCFullYear()}`,
      monthStr,
      mtdStart: ymd(firstPrev), mtdEnd: ymd(lastPrev),
      daysElapsed: getDaysInMonth(monthStr), daysInMonth: getDaysInMonth(monthStr),
      days: [],
    }
  }

  if (period === "weekly") {
    const curStart = addDays(today, -7), curEnd = yesterday
    const prevStart = addDays(today, -14), prevEnd = addDays(today, -8)
    const monthStr = ymd(yesterday).slice(0, 7)
    const monthFirst = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), 1))
    const daysElapsed = Math.round((yesterday.getTime() - monthFirst.getTime()) / 86400_000) + 1
    return {
      label: `7 ngày ${fmtVN(ymd(curStart))}–${fmtVN(ymd(curEnd))}`,
      curStart: ymd(curStart), curEnd: ymd(curEnd),
      prevStart: ymd(prevStart), prevEnd: ymd(prevEnd),
      prevLabel: `tuần trước (${fmtVN(ymd(prevStart))}–${fmtVN(ymd(prevEnd))})`,
      monthStr,
      mtdStart: ymd(monthFirst), mtdEnd: ymd(yesterday),
      daysElapsed, daysInMonth: getDaysInMonth(monthStr),
      days: [],
    }
  }

  // daily: báo cáo NGÀY HÔM QUA (1 ngày). So với ngày liền trước (DoD).
  // Ma trận 3 ngày gần nhất (days) giữ làm CONTEXT xu hướng ở 【6】-【8】, KHÔNG dùng cho headline.
  const d1 = addDays(today, -1), d2 = addDays(today, -2), d3 = addDays(today, -3)
  const monthStr = ymd(d1).slice(0, 7)
  const monthFirst = new Date(Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), 1))
  const daysElapsed = Math.round((d1.getTime() - monthFirst.getTime()) / 86400_000) + 1
  return {
    label: `Ngày ${fmtVN(ymd(d1))}`,
    curStart: ymd(d1), curEnd: ymd(d1),          // chỉ hôm qua
    prevStart: ymd(d2), prevEnd: ymd(d2),         // ngày liền trước (day-over-day)
    prevLabel: `ngày liền trước (${fmtVN(ymd(d2))})`,
    monthStr,
    mtdStart: ymd(monthFirst), mtdEnd: ymd(d1),
    daysElapsed, daysInMonth: getDaysInMonth(monthStr),
    days: [ymd(d1), ymd(d2), ymd(d3)], // desc — ma trận context 3 ngày
  }
}

// ── Aggregation types ─────────────────────────────────────────────────────────
type Triple = { vn: number; us: number; total: number }
const zero = (): Triple => ({ vn: 0, us: 0, total: 0 })
function add(t: Triple, cc: string, v: number) {
  t.total += v
  if (cc === "VN") t.vn += v
  else if (cc === "US") t.us += v
}

// ── Queries ───────────────────────────────────────────────────────────────────
// Revenue + GP theo company_code × nhóm (B2B/B2C) cho 1 khoảng ngày.
async function revByMarketGroup(start: string, end: string) {
  const sql = `
    SELECT COALESCE(f.company_code,'NA') AS cc,
           CASE WHEN UPPER(s.group_name)='B2B' THEN 'B2B'
                WHEN UPPER(s.group_name)='B2C' THEN 'B2C' ELSE 'Other' END AS grp,
           SUM(f.${REV}) AS revenue, SUM(f.${GP}) AS gp
    FROM fact_fulfillment_revenue f
    LEFT JOIN dim_order_source s ON f.order_source_code = s.code
    WHERE ${getDateFilter(start, end, "fulfiled_date")}
    GROUP BY 1,2`
  return cachedAnalyticsQuery<{ cc: string; grp: string; revenue: string; gp: string }>(sql)
}

async function rev3hkByMarket(start: string, end: string) {
  const sql = `
    SELECT COALESCE(f.company_code,'NA') AS cc, SUM(f.${REV}) AS revenue
    FROM fact_fulfillment_revenue f
    WHERE ${getDateFilter(start, end, "fulfiled_date")} AND ${SKU_3HK}
    GROUP BY 1`
  return cachedAnalyticsQuery<{ cc: string; revenue: string }>(sql)
}

// Daily: revenue theo ngày × nhóm × market.
async function revByDay(start: string, end: string) {
  const sql = `
    SELECT TO_CHAR(f.fulfiled_date::date,'YYYY-MM-DD') AS d,
           COALESCE(f.company_code,'NA') AS cc,
           CASE WHEN UPPER(s.group_name)='B2B' THEN 'B2B'
                WHEN UPPER(s.group_name)='B2C' THEN 'B2C' ELSE 'Other' END AS grp,
           SUM(f.${REV}) AS revenue
    FROM fact_fulfillment_revenue f
    LEFT JOIN dim_order_source s ON f.order_source_code = s.code
    WHERE ${getDateFilter(start, end, "fulfiled_date")}
    GROUP BY 1,2,3`
  return cachedAnalyticsQuery<{ d: string; cc: string; grp: string; revenue: string }>(sql)
}

// Daily: Top khách B2B theo ngày. "Khách lẻ"/"Khachle" → thay bằng tên kênh (channel_name).
async function b2bCustomersByDay(start: string, end: string) {
  const sql = `
    SELECT CASE WHEN LOWER(COALESCE(TRIM(c.name),'')) IN ('khách lẻ','khachle','khach le','khách lẽ')
                  OR f.customer_code IS NULL OR TRIM(f.customer_code)=''
                THEN COALESCE(TRIM(s.channel_name),'(không rõ kênh)')
                ELSE COALESCE(TRIM(c.name), TRIM(f.customer_code)) END AS cust,
           TO_CHAR(f.fulfiled_date::date,'YYYY-MM-DD') AS d,
           SUM(f.${REV}) AS revenue
    FROM fact_fulfillment_revenue f
    LEFT JOIN dim_order_source s ON f.order_source_code = s.code
    LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code)
    WHERE ${getDateFilter(start, end, "fulfiled_date")} AND UPPER(s.group_name)='B2B'
    GROUP BY 1,2`
  return cachedAnalyticsQuery<{ cust: string; d: string; revenue: string }>(sql)
}

// Daily: kênh B2C theo ngày.
async function b2cChannelsByDay(start: string, end: string) {
  const sql = `
    SELECT COALESCE(TRIM(s.channel_name),'(không rõ)') AS ch,
           TO_CHAR(f.fulfiled_date::date,'YYYY-MM-DD') AS d,
           SUM(f.${REV}) AS revenue
    FROM fact_fulfillment_revenue f
    LEFT JOIN dim_order_source s ON f.order_source_code = s.code
    WHERE ${getDateFilter(start, end, "fulfiled_date")} AND UPPER(s.group_name)='B2C'
    GROUP BY 1,2`
  return cachedAnalyticsQuery<{ ch: string; d: string; revenue: string }>(sql)
}

// Target theo channel cho 1 tháng (target_planning ở Supabase, KHÔNG có trong gohub_dw).
async function getTargetRows(monthStr: string) {
  const { data } = await supabaseAdmin
    .from("analytics_target_planning")
    .select("channel,target_revenue,target_3hk_contribution,target_gpm2")
    .eq("month", monthStr)
  return (data || []) as Array<{ channel: string; target_revenue: number; target_3hk_contribution: number; target_gpm2: number }>
}

// ── Formatters ────────────────────────────────────────────────────────────────
const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN") + " VND"
const pct = (n: number) => (Math.round(n * 10) / 10).toLocaleString("vi-VN") + "%"
function triLine(label: string, t: Triple): string {
  return `  - ${label}: VN ${vnd(t.vn)} | US ${vnd(t.us)} | Tổng ${vnd(t.total)}`
}
function ratio(a: number, b: number) { return b > 0 ? (a / b) * 100 : 0 }

// ─────────────────────────────────────────────────────────────────────────────
// buildReportData: trả { block } — chuỗi DATA_BLOCK nhồi vào prompt.
// ─────────────────────────────────────────────────────────────────────────────
export async function buildReportData(period: Period): Promise<{ block: string; ranges: Ranges; raw: any }> {
  const r = computeRanges(period)

  // Monthly: kỳ hiện tại CHÍNH LÀ cả tháng → MTD trùng cur (tránh query thừa, dùng lại).
  const isMonthly = period === "monthly"
  const [curRows, prevRows, cur3hk, prev3hk, mtdRows, mtd3hkRows, bodCur, targetRows] = await Promise.all([
    revByMarketGroup(r.curStart, r.curEnd),
    revByMarketGroup(r.prevStart, r.prevEnd),
    rev3hkByMarket(r.curStart, r.curEnd),
    rev3hkByMarket(r.prevStart, r.prevEnd),
    isMonthly ? Promise.resolve([]) : revByMarketGroup(r.mtdStart, r.mtdEnd),
    isMonthly ? Promise.resolve([]) : rev3hkByMarket(r.mtdStart, r.mtdEnd),
    fetchBODGroupMarginData(r.curStart, r.curEnd),       // CM1 theo nhóm (company-agnostic, khớp Dashboard/Target)
    getTargetRows(r.monthStr),
  ])

  // Aggregate revenue/GP theo market & group
  const totalRev = zero(), b2bRev = zero(), b2cRev = zero(), totalGp = zero()
  for (const row of curRows) {
    const rev = parseFloat(row.revenue || "0"), gp = parseFloat(row.gp || "0")
    add(totalRev, row.cc, rev); add(totalGp, row.cc, gp)
    if (row.grp === "B2B") add(b2bRev, row.cc, rev)
    else if (row.grp === "B2C") add(b2cRev, row.cc, rev)
  }
  const prevTotal = zero(), prevB2b = zero(), prevB2c = zero()
  for (const row of prevRows) {
    const rev = parseFloat(row.revenue || "0")
    add(prevTotal, row.cc, rev)
    if (row.grp === "B2B") add(prevB2b, row.cc, rev)
    else if (row.grp === "B2C") add(prevB2c, row.cc, rev)
  }
  const tHk = zero(); for (const row of cur3hk) add(tHk, row.cc, parseFloat(row.revenue || "0"))
  const tHkPrev = zero(); for (const row of prev3hk) add(tHkPrev, row.cc, parseFloat(row.revenue || "0"))

  // MTD pro-rata
  const mtdTotal = zero()
  const mtdSrc = isMonthly ? curRows : mtdRows
  for (const row of mtdSrc) add(mtdTotal, row.cc, parseFloat(row.revenue || "0"))
  const mtd3hk = zero()
  for (const row of (isMonthly ? cur3hk : mtd3hkRows)) add(mtd3hk, row.cc, parseFloat(row.revenue || "0"))
  const proRata = (t: Triple): Triple => ({
    vn: r.daysElapsed > 0 ? (t.vn / r.daysElapsed) * r.daysInMonth : 0,
    us: r.daysElapsed > 0 ? (t.us / r.daysElapsed) * r.daysInMonth : 0,
    total: r.daysElapsed > 0 ? (t.total / r.daysElapsed) * r.daysInMonth : 0,
  })
  const proj = proRata(mtdTotal)

  // CM1 theo nhóm (B2B = Strategic + Non-Strategic)
  const g = (name: string) => bodCur.groups.find(x => x.group === name)
  const b2bStrat = g("B2B-Strategic"), b2bNon = g("B2B-Non-Strategic"), b2cG = g("B2C")
  const b2bRevTot = (b2bStrat?.revenue || 0) + (b2bNon?.revenue || 0)
  const b2bCm1 = (b2bStrat?.gpm2 || 0) + (b2bNon?.gpm2 || 0)
  const b2bMargin = (b2bStrat?.margin || 0) + (b2bNon?.margin || 0)

  // Target tổng tháng + theo channel (analytics_target_planning: channel = "B2B"/"B2C", month = YYYY-MM)
  const totalTargetMonth = targetRows.reduce((s, t) => s + Number(t.target_revenue || 0), 0)
  const target3hkPct = targetRows.find(t => Number(t.target_3hk_contribution) > 0)?.target_3hk_contribution ?? null
  const NO_TGT = "Chưa nhập target tháng này"
  const targetByChannel = targetRows
    .map(t => `${t.channel}=${vnd(Number(t.target_revenue || 0))}`).join(" · ") || NO_TGT
  // Target CM1% (target_gpm2) theo nhóm B2B/B2C — để so với CM1% thực tế ở 【4】.
  const targetCm1Pct = (grp: string): number | null => {
    const row = targetRows.find(t => (t.channel || "").toUpperCase() === grp)
    return row && Number(row.target_gpm2) > 0 ? Number(row.target_gpm2) : null
  }
  const tgtCm1B2b = targetCm1Pct("B2B"), tgtCm1B2c = targetCm1Pct("B2C")

  // MoM/WoW %
  const momPct = (cur: number, prv: number) => prv > 0 ? ((cur - prv) / prv) * 100 : 0

  // ── Build text block ──
  const L: string[] = []
  L.push(`━━━ DỮ LIỆU ĐÃ TÍNH SẴN (KỲ: ${r.label}) — CHỈ TRÌNH BÀY, KHÔNG TỰ QUERY ━━━`)
  L.push(`Kỳ hiện tại: ${r.curStart} → ${r.curEnd}. Kỳ so sánh: ${r.prevLabel} (${r.prevStart} → ${r.prevEnd}).`)
  L.push(``)
  L.push(`【1】DOANH THU theo thị trường (VN / US / Tổng):`)
  L.push(triLine("Revenue kỳ này", totalRev))
  L.push(triLine("Revenue kỳ trước", prevTotal))
  L.push(`  - Tăng/giảm Tổng: ${pct(momPct(totalRev.total, prevTotal.total))} | VN: ${pct(momPct(totalRev.vn, prevTotal.vn))} | US: ${pct(momPct(totalRev.us, prevTotal.us))}`)
  L.push(``)
  L.push(`【2】DOANH THU theo NHÓM KÊNH × thị trường:`)
  L.push(triLine("B2B kỳ này", b2bRev))
  L.push(triLine("B2B kỳ trước", prevB2b))
  L.push(`  - B2B tăng/giảm Tổng: ${pct(momPct(b2bRev.total, prevB2b.total))}`)
  L.push(triLine("B2C kỳ này", b2cRev))
  L.push(triLine("B2C kỳ trước", prevB2c))
  L.push(`  - B2C tăng/giảm Tổng: ${pct(momPct(b2cRev.total, prevB2c.total))}`)
  L.push(``)
  if (isMonthly) {
    // Tháng đã ĐÓNG → pro-rata vô nghĩa (đã đủ ngày). Dùng số THỰC TẾ so với target.
    L.push(`【3】TIẾN ĐỘ TARGET tháng ${r.monthStr} (tháng đã đóng — số THỰC TẾ, không pro-rata):`)
    L.push(triLine("Doanh thu thực tế cả tháng", mtdTotal))
    L.push(`  - Target cả tháng (mọi kênh): ${totalTargetMonth > 0 ? vnd(totalTargetMonth) : NO_TGT}`)
    L.push(`  - Target theo kênh: ${targetByChannel}`)
    L.push(`  - % đạt target (Thực tế/Target, Tổng): ${totalTargetMonth > 0 ? pct(ratio(mtdTotal.total, totalTargetMonth)) : NO_TGT}`)
  } else {
    // Daily/Weekly → đang trong tháng chạy → pro-rata dự phóng cả tháng + tiến độ hiện tại.
    L.push(`【3】PRO-RATA & TARGET tháng ${r.monthStr} (đã dùng ${r.daysElapsed}/${r.daysInMonth} ngày):`)
    L.push(triLine(`Doanh thu MTD (${r.mtdStart}→${r.mtdEnd})`, mtdTotal))
    L.push(triLine("Pro-rata dự phóng cả tháng", proj))
    L.push(`  - Target cả tháng (mọi kênh): ${totalTargetMonth > 0 ? vnd(totalTargetMonth) : NO_TGT}`)
    L.push(`  - Target theo kênh: ${targetByChannel}`)
    L.push(`  - % tiến độ hiện tại (MTD/Target, Tổng): ${totalTargetMonth > 0 ? pct(ratio(mtdTotal.total, totalTargetMonth)) : NO_TGT}`)
    L.push(`  - % đạt target theo pro-rata (dự phóng/Target, Tổng): ${totalTargetMonth > 0 ? pct(ratio(proj.total, totalTargetMonth)) : NO_TGT}`)
  }
  L.push(``)
  L.push(`【4】LỢI NHUẬN & CM1 (toàn công ty — cost/target không tách theo thị trường):`)
  L.push(`  - Gross Profit (GP) kỳ này: VN ${vnd(totalGp.vn)} | US ${vnd(totalGp.us)} | Tổng ${vnd(totalGp.total)}`)
  L.push(`  - GPM% (GP/Revenue) Tổng: ${pct(ratio(totalGp.total, totalRev.total))}`)
  L.push(`  - B2B: Revenue ${vnd(b2bRevTot)} | GP ${vnd(b2bMargin)} | CM1 ${vnd(b2bCm1)} | CM1% ${pct(ratio(b2bCm1, b2bRevTot))}${tgtCm1B2b != null ? ` | Target CM1% ${pct(tgtCm1B2b)}` : ""}`)
  if (b2cG) L.push(`  - B2C: Revenue ${vnd(b2cG.revenue)} | GP ${vnd(b2cG.margin)} | CM1 ${vnd(b2cG.gpm2)} | CM1% ${pct(ratio(b2cG.gpm2, b2cG.revenue))}${tgtCm1B2c != null ? ` | Target CM1% ${pct(tgtCm1B2c)}` : ""}`)
  if (b2bStrat) L.push(`  - B2B-Strategic: Revenue ${vnd(b2bStrat.revenue)} | CM1% ${pct(b2bStrat.gpm2_percent)}`)
  if (b2bNon) L.push(`  - B2B-Non-Strategic: Revenue ${vnd(b2bNon.revenue)} | CM1% ${pct(b2bNon.gpm2_percent)}`)
  L.push(``)
  L.push(`【5】3HK (vendor 3HKDATAPOOL) theo thị trường:`)
  L.push(triLine("3HK Revenue kỳ này", tHk))
  L.push(`  - 3HK Contribution % (3HK/Tổng revenue): ${pct(ratio(tHk.total, totalRev.total))}`)
  L.push(`  - 3HK MTD (${r.mtdStart}→${r.mtdEnd}) Tổng: ${vnd(mtd3hk.total)} → Pro-rata cả tháng (Tổng): ${vnd(proRata(mtd3hk).total)}`)
  if (target3hkPct != null) L.push(`  - Target 3HK Contribution %: ${pct(Number(target3hkPct))}`)
  L.push(``)

  // Daily: ma trận theo ngày + top khách B2B + kênh B2C
  let raw: any = { totalRev, b2bRev, b2cRev, tHk, proj }
  if (period === "daily") {
    // Ma trận 3 ngày (context) — headline chỉ 1 ngày (r.cur), nên query riêng khoảng d3→d1.
    const matrixStart = r.days[r.days.length - 1]  // d3 (cũ nhất)
    const matrixEnd   = r.days[0]                   // d1 (hôm qua)
    const [dayRows, b2bCust, b2cCh] = await Promise.all([
      revByDay(matrixStart, matrixEnd),
      b2bCustomersByDay(matrixStart, matrixEnd),
      b2cChannelsByDay(matrixStart, matrixEnd),
    ])
    const days = r.days // desc
    const fmtRow = (label: string, get: (d: string) => number) =>
      `  - ${label}: ${days.map(d => vnd(get(d))).join(" | ")}`

    // per-day per-group totals
    const dayGet = (grp: string, market: "all" | "VN" | "US") => (d: string) =>
      dayRows.filter(x => x.d === d && (grp === "ALL" || x.grp === grp) && (market === "all" || x.cc === market))
        .reduce((s, x) => s + parseFloat(x.revenue || "0"), 0)

    L.push(`【6】DOANH THU 3 NGÀY (cột theo thứ tự ${days.join(" | ")}):`)
    L.push(fmtRow("B2B (Tổng)", dayGet("B2B", "all")))
    L.push(fmtRow("B2C (Tổng)", dayGet("B2C", "all")))
    L.push(fmtRow("TỔNG", dayGet("ALL", "all")))
    L.push(fmtRow("  trong đó VN", dayGet("ALL", "VN")))
    L.push(fmtRow("  trong đó US", dayGet("ALL", "US")))
    L.push(``)

    // top 10 B2B customers
    const custTotal = new Map<string, number>()
    for (const x of b2bCust) custTotal.set(x.cust, (custTotal.get(x.cust) || 0) + parseFloat(x.revenue || "0"))
    const top = [...custTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    L.push(`【7】TOP 10 KHÁCH B2B (3 ngày ${days.join(" | ")}):`)
    for (const [name] of top) {
      const get = (d: string) => b2bCust.filter(x => x.cust === name && x.d === d).reduce((s, x) => s + parseFloat(x.revenue || "0"), 0)
      L.push(fmtRow(name, get))
    }
    L.push(``)

    // B2C channels (top 10)
    const chTotal = new Map<string, number>()
    for (const x of b2cCh) chTotal.set(x.ch, (chTotal.get(x.ch) || 0) + parseFloat(x.revenue || "0"))
    const topCh = [...chTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    L.push(`【8】KÊNH B2C (3 ngày ${days.join(" | ")}):`)
    for (const [name] of topCh) {
      const get = (d: string) => b2cCh.filter(x => x.ch === name && x.d === d).reduce((s, x) => s + parseFloat(x.revenue || "0"), 0)
      L.push(fmtRow(name, get))
    }
    L.push(``)
    raw = { ...raw, dayRows, top, topCh }
  }

  L.push(`(Ghi chú: số liệu trên là CHÍNH XÁC từ gohub_dw, đúng định nghĩa Dashboard. Thị trường = company_code VN/US, "Tổng" gồm cả TN≈0. CM1/Target không tách theo thị trường nên để ở mức toàn công ty.)`)

  return { block: L.join("\n"), ranges: r, raw }
}

// Suy period từ cron_expression (ƯU TIÊN — đây mới là lịch THỰC chạy). Tên chỉ dùng khi cron không chuẩn 5 trường.
// Trước đây xét TÊN trước → 1 lịch monthly đặt tên có chữ "ngày"/"tuần" bị tính nhầm sang daily/weekly (sai kỳ số liệu).
export function inferPeriod(cron: string, name?: string): Period {
  const parts = (cron || "").trim().split(/\s+/)
  if (parts.length === 5) {
    const [, , dom, , dow] = parts
    const isSingle = (f: string) => /^\d+$/.test(f)  // 1 ngày cố định — UI weekly/monthly luôn sinh dạng này
    if (isSingle(dom)) return "monthly"               // vd "0 8 15 * *"
    if (isSingle(dow)) return "weekly"                // vd "0 9 * * 1"
    return "daily"                                     // "* * *" hoặc range/list dow (vd "1-5" = ngày làm việc → daily)
  }
  // cron không chuẩn → fallback theo tên
  const n = (name || "").toLowerCase()
  if (n.includes("month") || n.includes("tháng")) return "monthly"
  if (n.includes("week") || n.includes("tuần")) return "weekly"
  return "daily"
}
