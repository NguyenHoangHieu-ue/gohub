import { getDateFilter, getDaysInMonth, cachedAnalyticsQuery, shipFilter, internalOpsFilterByCode } from "@/lib/analytics-helpers"
import { fetchBODGroupMarginData } from "@/lib/bod-data"
import { supabaseAdmin } from "@/lib/supabase"
import { tursoQuery } from "@/lib/turso"

// ─────────────────────────────────────────────────────────────────────────────
// Precompute số liệu cho Scheduled Reports (Daily/Weekly/Monthly).
// Trước đây mỗi report để Gemini TỰ sinh SQL nhiều vòng (chậm + Daily timeout + số có thể lệch).
// Nay tính SẴN bằng SQL cố định (đúng định nghĩa Dashboard), tách thị trường VN/US/Tổng theo
// fact_*.company_code, rồi nhồi DATA_BLOCK vào prompt → Gemini chỉ FORMAT (1 vòng).
// Định nghĩa số liệu tái dùng helpers chung (getDateFilter, fetchBODGroupMarginData) để KHỚP Dashboard.
// ─────────────────────────────────────────────────────────────────────────────

export type Period = "daily" | "weekly" | "monthly" | "quarterly"

const REV = "fulfilled_revenue_amount_vnd"
const GP = "gross_profit_vnd"
// 3HK vendor ghi 2 kiểu trong DB ('3HKDATAPOOL' và '3HK DATAPOOL') → REPLACE bỏ space để bắt cả hai.
const SKU_3HK = `TRIM(f.sku) IN (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL')`
// Khớp định nghĩa Dashboard: loại phí ship (SHIPPINGFEE0) + đơn nội bộ (INTERNAL-TRANSACTION).
const STD_FILTER = `${shipFilter(false)} ${internalOpsFilterByCode(false)}`

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

  if (period === "quarterly") {
    // Quý hiện tại: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
    const qIdx = Math.floor(today.getUTCMonth() / 3)          // 0,1,2,3
    const qStartMonth = qIdx * 3                               // 0,3,6,9
    const qStart = new Date(Date.UTC(today.getUTCFullYear(), qStartMonth, 1))
    const qEnd = addDays(today, -1)                            // data cutoff = hôm qua
    // Quý trước
    const prevQEnd = addDays(qStart, -1)
    const prevQStart = new Date(Date.UTC(prevQEnd.getUTCFullYear(), Math.floor(prevQEnd.getUTCMonth() / 3) * 3, 1))
    const qLabel = `Q${qIdx + 1}/${today.getUTCFullYear()}`
    const prevQLabel = `Q${Math.floor(prevQEnd.getUTCMonth() / 3) + 1}/${prevQEnd.getUTCFullYear()}`
    const daysElapsed = Math.round((qEnd.getTime() - qStart.getTime()) / 86400_000) + 1
    const daysInQ = 92  // Q3=92 days (Jul31+Aug31+Sep30); dùng 92 làm xấp xỉ chung
    const monthStr = ymd(qStart).slice(0, 7)
    return {
      label: qLabel,
      curStart: ymd(qStart), curEnd: ymd(qEnd),
      prevStart: ymd(prevQStart), prevEnd: ymd(prevQEnd),
      prevLabel: prevQLabel,
      monthStr,
      mtdStart: ymd(qStart), mtdEnd: ymd(qEnd),
      daysElapsed, daysInMonth: daysInQ,
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
    WHERE ${getDateFilter(start, end, "fulfiled_date")} ${STD_FILTER}
    GROUP BY 1,2`
  return cachedAnalyticsQuery<{ cc: string; grp: string; revenue: string; gp: string }>(sql)
}

async function rev3hkByMarket(start: string, end: string) {
  const sql = `
    SELECT COALESCE(f.company_code,'NA') AS cc, SUM(f.${REV}) AS revenue
    FROM fact_fulfillment_revenue f
    WHERE ${getDateFilter(start, end, "fulfiled_date")} AND ${SKU_3HK} ${STD_FILTER}
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
    WHERE ${getDateFilter(start, end, "fulfiled_date")} ${STD_FILTER}
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
    WHERE ${getDateFilter(start, end, "fulfiled_date")} AND UPPER(s.group_name)='B2B' ${STD_FILTER}
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
    WHERE ${getDateFilter(start, end, "fulfiled_date")} AND UPPER(s.group_name)='B2C' ${STD_FILTER}
    GROUP BY 1,2`
  return cachedAnalyticsQuery<{ ch: string; d: string; revenue: string }>(sql)
}

// Target quý từ Turso target_planning_quarter (cùng nguồn với tab Quarter Report).
// qKey format: "Q3-2026". Trả B2B + B2C tách riêng (Quarter Report không tách VN/US).
interface QuarterTargets { b2bRev: number; b2cRev: number; total: number }
async function getQuarterTargets(qKey: string): Promise<QuarterTargets> {
  const empty: QuarterTargets = { b2bRev: 0, b2cRev: 0, total: 0 }
  try {
    const rows = await tursoQuery<{ channel: string; target_revenue: string | number }>(
      `SELECT channel, target_revenue FROM target_planning_quarter WHERE quarter = ?`,
      [qKey]
    )
    const n = (v: string | number | undefined) => parseFloat(String(v ?? 0)) || 0
    const b2b = rows.find(r => r.channel === "B2B")
    const b2c = rows.find(r => r.channel === "B2C")
    const b2bRev = n(b2b?.target_revenue), b2cRev = n(b2c?.target_revenue)
    return { b2bRev, b2cRev, total: b2bRev + b2cRev }
  } catch {
    return empty
  }
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

  // Quarterly: build riêng, trả sớm
  if (period === "quarterly") return buildQuarterlyReportData(r)

  // Monthly: kỳ hiện tại CHÍNH LÀ cả tháng → MTD trùng cur (tránh query thừa, dùng lại).
  const isMonthly = period === "monthly"
  const isDaily   = period === "daily"

  // Daily: tính thêm QTD + target quý (từ Turso, cùng nguồn Quarter Report) để hiện trong【3】
  let qStartStr = "", qEndStr = "", daysElapsedInQ = 0, daysInQ = 92, qLabel = "", qKey = ""
  if (isDaily) {
    const ictD = ictNow()
    const todayD = new Date(Date.UTC(ictD.getUTCFullYear(), ictD.getUTCMonth(), ictD.getUTCDate()))
    const yestD  = addDays(todayD, -1)
    const qMo    = Math.floor(todayD.getUTCMonth() / 3) * 3
    const qStart = new Date(Date.UTC(todayD.getUTCFullYear(), qMo, 1))
    qStartStr = ymd(qStart)
    qEndStr   = ymd(yestD)
    daysElapsedInQ = Math.round((yestD.getTime() - qStart.getTime()) / 86400_000) + 1
    const qIdx = Math.floor(todayD.getUTCMonth() / 3) + 1
    qLabel = `Q${qIdx}/${todayD.getUTCFullYear()}`
    qKey   = `Q${qIdx}-${todayD.getUTCFullYear()}`   // format Turso: "Q3-2026"
  }

  const [allResults, qtdTargetRev] = await Promise.all([
    Promise.all([
      revByMarketGroup(r.curStart, r.curEnd),                                              // 0
      revByMarketGroup(r.prevStart, r.prevEnd),                                            // 1
      rev3hkByMarket(r.curStart, r.curEnd),                                                // 2
      rev3hkByMarket(r.prevStart, r.prevEnd),                                              // 3
      isMonthly ? Promise.resolve([]) : revByMarketGroup(r.mtdStart, r.mtdEnd),           // 4
      isMonthly ? Promise.resolve([]) : rev3hkByMarket(r.mtdStart, r.mtdEnd),             // 5
      fetchBODGroupMarginData(r.curStart, r.curEnd),                                       // 6
      getTargetRows(r.monthStr),                                                           // 7
      isDaily  ? revByMarketGroup(qStartStr, qEndStr) : Promise.resolve([]),              // 8: QTD revenue
    ]),
    isDaily ? getQuarterTargets(qKey) : Promise.resolve({ b2bRev: 0, b2cRev: 0, total: 0 } as QuarterTargets),  // target quý từ Turso
  ])

  const curRows    = allResults[0] as Awaited<ReturnType<typeof revByMarketGroup>>
  const prevRows   = allResults[1] as Awaited<ReturnType<typeof revByMarketGroup>>
  const cur3hk     = allResults[2] as Awaited<ReturnType<typeof rev3hkByMarket>>
  const prev3hk    = allResults[3] as Awaited<ReturnType<typeof rev3hkByMarket>>
  const mtdRows    = allResults[4] as Awaited<ReturnType<typeof revByMarketGroup>>
  const mtd3hkRows = allResults[5] as Awaited<ReturnType<typeof rev3hkByMarket>>
  const bodCur     = allResults[6] as Awaited<ReturnType<typeof fetchBODGroupMarginData>>
  const targetRows = allResults[7] as Awaited<ReturnType<typeof getTargetRows>>
  const qtdRevRows = allResults[8] as Awaited<ReturnType<typeof revByMarketGroup>>
  const qtTargets  = qtdTargetRev as QuarterTargets

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

  // QTD aggregates (daily only) — tách B2B/B2C để hiện trong【3】
  const qtdRev = zero(), qtdB2b = zero(), qtdB2c = zero()
  if (isDaily) {
    for (const row of qtdRevRows) {
      const v = parseFloat(row.revenue || "0")
      add(qtdRev, row.cc, v)
      if (row.grp === "B2B") add(qtdB2b, row.cc, v)
      else if (row.grp === "B2C") add(qtdB2c, row.cc, v)
    }
  }
  // Projections B2B/B2C theo quý (total only, không cần tách VN/US)
  const projQb2b = daysElapsedInQ > 0 ? (qtdB2b.total / daysElapsedInQ) * daysInQ : 0
  const projQb2c = daysElapsedInQ > 0 ? (qtdB2c.total / daysElapsedInQ) * daysInQ : 0
  const projQ: Triple = {
    vn:    daysElapsedInQ > 0 ? (qtdRev.vn    / daysElapsedInQ) * daysInQ : 0,
    us:    daysElapsedInQ > 0 ? (qtdRev.us    / daysElapsedInQ) * daysInQ : 0,
    total: daysElapsedInQ > 0 ? (qtdRev.total / daysElapsedInQ) * daysInQ : 0,
  }

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
  } else if (isDaily && qStartStr) {
    // Daily → tiến độ QUÝ theo B2B/B2C (không tách VN/US — khớp cách nhập trong Quarter Report)
    const hasQTgt = qtTargets.total > 0
    const NO_QTGT = "Chưa nhập target quý"
    L.push(`【3】PRO-RATA & TARGET ${qLabel} (đã dùng ${daysElapsedInQ}/${daysInQ} ngày từ ${qStartStr}):`)
    L.push(`  - Doanh thu QTD (${qStartStr}→${qEndStr}): B2B ${vnd(qtdB2b.total)} | B2C ${vnd(qtdB2c.total)} | Tổng ${vnd(qtdRev.total)}`)
    L.push(`  - Pro-rata dự phóng cả quý: B2B ${vnd(projQb2b)} | B2C ${vnd(projQb2c)} | Tổng ${vnd(projQb2b + projQb2c)}`)
    L.push(`  - Target quý: ${hasQTgt ? `B2B ${vnd(qtTargets.b2bRev)} | B2C ${vnd(qtTargets.b2cRev)} | Tổng ${vnd(qtTargets.total)}` : NO_QTGT}`)
    if (hasQTgt) {
      L.push(`  - % QTD/Target: B2B ${pct(ratio(qtdB2b.total, qtTargets.b2bRev))} | B2C ${pct(ratio(qtdB2c.total, qtTargets.b2cRev))} | Tổng ${pct(ratio(qtdRev.total, qtTargets.total))}`)
      L.push(`  - % Pro-rata/Target: B2B ${pct(ratio(projQb2b, qtTargets.b2bRev))} | B2C ${pct(ratio(projQb2c, qtTargets.b2cRev))} | Tổng ${pct(ratio(projQb2b + projQb2c, qtTargets.total))}`)
    }
  } else {
    // Weekly → pro-rata tháng hiện tại
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

// ─────────────────────────────────────────────────────────────────────────────
// Quarterly report: revenue QTD per month + QoQ + CM1 + 3HK + pro-rata
// ─────────────────────────────────────────────────────────────────────────────
async function buildQuarterlyReportData(r: Ranges): Promise<{ block: string; ranges: Ranges; raw: any }> {
  // Các tháng trong quý (đến hôm qua — tháng chưa đóng lấy partial)
  const qYear = parseInt(r.curStart.slice(0, 4))
  const qMonthStart = parseInt(r.curStart.slice(5, 7)) - 1  // 0-based
  const months: { label: string; start: string; end: string; monthStr: string }[] = []
  for (let i = 0; i < 3; i++) {
    const mIdx = qMonthStart + i
    const mStart = new Date(Date.UTC(qYear, mIdx, 1))
    const mEndFull = new Date(Date.UTC(qYear, mIdx + 1, 0))  // last day of month
    const mEnd = mEndFull.getTime() < new Date(r.curEnd + "T00:00:00Z").getTime()
      ? ymd(mEndFull) : r.curEnd   // cap ở hôm qua cho tháng chưa đóng
    if (mStart.getTime() > new Date(r.curEnd + "T00:00:00Z").getTime()) break
    months.push({
      label: `T${mIdx + 1}/${qYear}`,
      start: ymd(mStart), end: mEnd,
      monthStr: ymd(mStart).slice(0, 7),
    })
  }

  const [curRows, prevRows, cur3hk, prev3hk, bodCur, bodPrev, ...monthRows] = await Promise.all([
    revByMarketGroup(r.curStart, r.curEnd),
    revByMarketGroup(r.prevStart, r.prevEnd),
    rev3hkByMarket(r.curStart, r.curEnd),
    rev3hkByMarket(r.prevStart, r.prevEnd),
    fetchBODGroupMarginData(r.curStart, r.curEnd),
    fetchBODGroupMarginData(r.prevStart, r.prevEnd),
    ...months.map(m => revByMarketGroup(m.start, m.end)),
  ])

  // QTD aggregates
  const qtdRev = zero(), qtdB2b = zero(), qtdB2c = zero(), qtdGp = zero()
  for (const row of curRows) {
    const rev = parseFloat(row.revenue || "0"), gp = parseFloat(row.gp || "0")
    add(qtdRev, row.cc, rev); add(qtdGp, row.cc, gp)
    if (row.grp === "B2B") add(qtdB2b, row.cc, rev)
    else if (row.grp === "B2C") add(qtdB2c, row.cc, rev)
  }
  const prevQ = zero(), prevQB2b = zero(), prevQB2c = zero()
  for (const row of prevRows) {
    add(prevQ, row.cc, parseFloat(row.revenue || "0"))
    if (row.grp === "B2B") add(prevQB2b, row.cc, parseFloat(row.revenue || "0"))
    else if (row.grp === "B2C") add(prevQB2c, row.cc, parseFloat(row.revenue || "0"))
  }
  const qtd3hk = zero(); for (const row of cur3hk) add(qtd3hk, row.cc, parseFloat(row.revenue || "0"))
  const prev3hkT = zero(); for (const row of prev3hk) add(prev3hkT, row.cc, parseFloat(row.revenue || "0"))

  // Pro-rata cả quý
  const projQ: Triple = {
    vn: r.daysElapsed > 0 ? (qtdRev.vn / r.daysElapsed) * r.daysInMonth : 0,
    us: r.daysElapsed > 0 ? (qtdRev.us / r.daysElapsed) * r.daysInMonth : 0,
    total: r.daysElapsed > 0 ? (qtdRev.total / r.daysElapsed) * r.daysInMonth : 0,
  }

  // QoQ %
  const qoq = (cur: number, prv: number) => prv > 0 ? ((cur - prv) / prv) * 100 : 0

  // CM1 (từ BOD group margin, giống Dashboard)
  const g = (groups: any[], name: string) => groups.find((x: any) => x.group === name)
  const b2bStrat = g(bodCur.groups, "B2B-Strategic"), b2bNon = g(bodCur.groups, "B2B-Non-Strategic"), b2cG = g(bodCur.groups, "B2C")
  const b2bRevTot = (b2bStrat?.revenue || 0) + (b2bNon?.revenue || 0)
  const b2bCm1 = (b2bStrat?.gpm2 || 0) + (b2bNon?.gpm2 || 0)
  const prevB2bStrat = g(bodPrev.groups, "B2B-Strategic"), prevB2bNon = g(bodPrev.groups, "B2B-Non-Strategic"), prevB2cG = g(bodPrev.groups, "B2C")
  const prevB2bCm1 = (prevB2bStrat?.gpm2 || 0) + (prevB2bNon?.gpm2 || 0)

  // Target tháng trong quý → cộng thành target quý
  const allTargets = await Promise.all(months.map(m => getTargetRows(m.monthStr)))
  const qtdTargetRev = allTargets.flat().reduce((s, t) => s + Number(t.target_revenue || 0), 0)
  const NO_TGT = "Chưa nhập target tháng này"

  // Per-month breakdown
  const monthRevs: { label: string; rev: Triple; b2b: Triple; b2c: Triple }[] = months.map((m, i) => {
    const rows = monthRows[i] || []
    const rev = zero(), b2b = zero(), b2c = zero()
    for (const row of rows) {
      add(rev, row.cc, parseFloat(row.revenue || "0"))
      if (row.grp === "B2B") add(b2b, row.cc, parseFloat(row.revenue || "0"))
      else if (row.grp === "B2C") add(b2c, row.cc, parseFloat(row.revenue || "0"))
    }
    return { label: m.label, rev, b2b, b2c }
  })

  const L: string[] = []
  L.push(`━━━ DỮ LIỆU ĐÃ TÍNH SẴN (KỲ: ${r.label} — QTD từ ${r.curStart} đến ${r.curEnd}, ${r.daysElapsed}/${r.daysInMonth} ngày) — CHỈ TRÌNH BÀY, KHÔNG TỰ QUERY ━━━`)
  L.push(`So sánh với: ${r.prevLabel} (${r.prevStart} → ${r.prevEnd}).`)
  L.push(``)
  L.push(`【1】DOANH THU QTD (từ đầu quý đến hôm qua) vs ${r.prevLabel}:`)
  L.push(triLine(`${r.label} QTD`, qtdRev))
  L.push(triLine(`${r.prevLabel} (cả quý)`, prevQ))
  L.push(`  - QoQ Tổng: ${pct(qoq(qtdRev.total, prevQ.total))} | VN: ${pct(qoq(qtdRev.vn, prevQ.vn))} | US: ${pct(qoq(qtdRev.us, prevQ.us))}`)
  L.push(triLine("Pro-rata dự phóng cả quý", projQ))
  L.push(``)
  L.push(`【2】BREAKDOWN THEO NHÓM QTD:`)
  L.push(triLine("B2B QTD", qtdB2b))
  L.push(triLine("B2B cùng kỳ quý trước", prevQB2b))
  L.push(`  - B2B QoQ: ${pct(qoq(qtdB2b.total, prevQB2b.total))}`)
  L.push(triLine("B2C QTD", qtdB2c))
  L.push(triLine("B2C cùng kỳ quý trước", prevQB2c))
  L.push(`  - B2C QoQ: ${pct(qoq(qtdB2c.total, prevQB2c.total))}`)
  L.push(``)
  L.push(`【3】DOANH THU THEO THÁNG trong quý (VN | US | Tổng):`)
  for (const m of monthRevs) {
    L.push(`  - ${m.label}: Tổng ${vnd(m.rev.total)} (VN ${vnd(m.rev.vn)} | US ${vnd(m.rev.us)}) — B2B ${vnd(m.b2b.total)} | B2C ${vnd(m.b2c.total)}`)
  }
  L.push(``)
  L.push(`【4】TIẾN ĐỘ TARGET QUÝ (tổng target 3 tháng):`)
  L.push(triLine("QTD thực tế", qtdRev))
  L.push(`  - Target quý (tổng target tháng trong quý): ${qtdTargetRev > 0 ? vnd(qtdTargetRev) : NO_TGT}`)
  if (qtdTargetRev > 0) {
    L.push(`  - % QTD/Target quý: ${pct(ratio(qtdRev.total, qtdTargetRev))}`)
    L.push(`  - % Pro-rata/Target quý: ${pct(ratio(projQ.total, qtdTargetRev))}`)
  }
  L.push(``)
  L.push(`【5】CM1 & LỢI NHUẬN QTD:`)
  L.push(`  - B2B: Revenue ${vnd(b2bRevTot)} | CM1 ${vnd(b2bCm1)} | CM1% ${pct(ratio(b2bCm1, b2bRevTot))}`)
  if (b2cG) L.push(`  - B2C: Revenue ${vnd(b2cG.revenue)} | CM1 ${vnd(b2cG.gpm2)} | CM1% ${pct(ratio(b2cG.gpm2, b2cG.revenue))}`)
  L.push(`  - CM1 quý trước (${r.prevLabel}): B2B ${vnd(prevB2bCm1)}${prevB2cG ? ` | B2C ${vnd(prevB2cG.gpm2)}` : ""}`)
  L.push(`  - QoQ CM1: B2B ${pct(qoq(b2bCm1, prevB2bCm1))}`)
  L.push(``)
  L.push(`【6】3HK (DATAPOOL) QTD:`)
  L.push(triLine("3HK Revenue QTD", qtd3hk))
  L.push(`  - 3HK Contribution % (QTD): ${pct(ratio(qtd3hk.total, qtdRev.total))}`)
  L.push(triLine("3HK quý trước", prev3hkT))
  L.push(`  - 3HK QoQ: ${pct(qoq(qtd3hk.total, prev3hkT.total))}`)
  L.push(``)
  L.push(`(Ghi chú: QTD = từ đầu quý đến ${r.curEnd}. Tháng chưa đóng = số partial đến hôm qua. Pro-rata = QTD/ngày đã trôi × ${r.daysInMonth} ngày cả quý.)`)

  return { block: L.join("\n"), ranges: r, raw: { qtdRev, qtdB2b, qtdB2c, qtd3hk, projQ } }
}

// Suy period từ cron_expression (ƯU TIÊN — đây mới là lịch THỰC chạy). Tên chỉ dùng khi cron không chuẩn 5 trường.
// Trước đây xét TÊN trước → 1 lịch monthly đặt tên có chữ "ngày"/"tuần" bị tính nhầm sang daily/weekly (sai kỳ số liệu).
export function inferPeriod(cron: string, name?: string): Period {
  // Quarterly phát hiện qua tên — cron không có pattern riêng cho quý
  const n = (name || "").toLowerCase()
  if (n.includes("quý") || n.includes("quarter") || n.includes("quarterly")) return "quarterly"

  const parts = (cron || "").trim().split(/\s+/)
  if (parts.length === 5) {
    const [, , dom, , dow] = parts
    const isSingle = (f: string) => /^\d+$/.test(f)  // 1 ngày cố định — UI weekly/monthly luôn sinh dạng này
    if (isSingle(dom)) return "monthly"               // vd "0 8 15 * *"
    if (isSingle(dow)) return "weekly"                // vd "0 9 * * 1"
    return "daily"                                     // "* * *" hoặc range/list dow (vd "1-5" = ngày làm việc → daily)
  }
  // cron không chuẩn → fallback theo tên
  if (n.includes("month") || n.includes("tháng")) return "monthly"
  if (n.includes("week") || n.includes("tuần")) return "weekly"
  return "daily"
}
