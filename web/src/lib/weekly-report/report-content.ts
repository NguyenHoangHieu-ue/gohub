// Build markdown + card images cho Weekly Report — 1 NGUỒN nội dung DUY NHẤT dùng cho cả docx (qua
// markdownToDocx) lẫn pdf (qua markdownToPdf), tránh viết 2 lần cùng bố cục báo cáo.
// Bố cục theo file Lark "Company Weekly Performance" (s245): Overview WEEKLY → Progress quý → Break down B2B/B2C →
// 3HK → Phân tích Pro-rata (Tier → Organization). Phần "Điểm sáng/Hạn chế" dựng THUẦN từ số (không Gemini, không bịa nguyên nhân).
import type { WeeklyReportData, ChannelMoM } from "./data"
import type { OrgRow, TierAnalysis, QuarterSeg } from "./extras"
import { fmtVnd, fmtInt, fmtPct } from "./period"
import { renderKpiCard, renderSectionedCard, renderProjectionBanner, renderProgressCards, type Stat, type ProgressCard } from "./card-images"
import type { DocxImage } from "@/lib/docx-markdown"

export interface ReportContent {
  title: string
  markdown: string
  images: Record<string, DocxImage>
}

function deltaStat(label: string, value: string, pct: number): Stat {
  return { label, value, delta: fmtPct(pct), deltaPositive: pct >= 0 }
}

const MIN_DELTA = 3_000_000   // chỉ nêu tên khách/kênh lệch ≥ 3 triệu so với tháng trước (tránh liệt kê nhiễu)
const MAX_LINES = 8
const pctTxt = (n: number) => fmtPct(n)
const dir = (n: number) => (n >= 0 ? "tăng" : "giảm")
const absPct = (n: number) => fmtPct(Math.abs(n)).replace("+", "")
const growth = (cur: number, prev: number) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : 0)
const qWord = (label: string) => `quý ${label.slice(1, 2)}`   // "Q4/2026" → "quý 4"

// ── B2C: kênh (giữ cách cũ, dựng thuần từ số) ──
function channelBullets(channels: ChannelMoM[], positive: boolean): string[] {
  const list = channels
    .filter(c => (positive ? c.pctMoM >= 0 : c.pctMoM < 0) && Math.abs(c.prorata - c.prevMonthActual) >= MIN_DELTA)
    .sort((a, b) => (positive ? b.pctMoM - a.pctMoM : a.pctMoM - b.pctMoM))
    .slice(0, MAX_LINES)
  return list.map(c => `- **${c.channel}**: Pro-rata ${fmtVnd(c.prorata)} (${pctTxt(c.pctMoM)} MoM${c.prevMonthActual > 0 ? `, tháng trước ${fmtVnd(c.prevMonthActual)}` : ""}).`)
}

// ── B2B: Tier → Organization ──
function childDetail(o: OrgRow): string {
  if (o.children.length < 2) return ""
  const top = [...o.children].filter(c => Math.abs(c.prorata - c.prev) >= MIN_DELTA)
    .sort((a, b) => Math.abs(b.prorata - b.prev) - Math.abs(a.prorata - a.prev)).slice(0, 3)
  if (!top.length) return ""
  return ` — gồm ${top.map(c => `${c.name} (Pro-rata ${fmtVnd(c.prorata)}${c.pct != null ? `, ${pctTxt(c.pct)}` : ""})`).join(", ")}`
}

function orgLine(o: OrgRow, prevLabel: string): string {
  if (o.prev === 0) return `- **${o.name}**: Phát sinh mới, Pro-rata ${fmtVnd(o.prorata)}.${childDetail(o)}`
  if (o.prorata === 0) return `- **${o.name}**: ${prevLabel} đạt ${fmtVnd(o.prev)} ➔ tháng này: 0 ₫.`
  return `- **${o.name}**: Pro-rata ${fmtVnd(o.prorata)} (${pctTxt(o.pct ?? 0)} MoM, ${prevLabel} đạt ${fmtVnd(o.prev)}).${childDetail(o)}`
}

function tierBlock(t: TierAnalysis, prevLabel: string): string {
  const delta = (o: OrgRow) => o.prorata - o.prev
  const up = t.orgs.filter(o => delta(o) >= MIN_DELTA).sort((a, b) => delta(b) - delta(a)).slice(0, MAX_LINES)
  const lost = t.orgs.filter(o => o.prorata === 0 && o.prev > 0).sort((a, b) => b.prev - a.prev).slice(0, 5)
  const down = t.orgs.filter(o => o.prorata > 0 && delta(o) <= -MIN_DELTA).sort((a, b) => delta(a) - delta(b)).slice(0, MAX_LINES)
  const head = `**Tier ${t.tier.toLowerCase()} (${t.pct == null ? "mới phát sinh" : `${dir(t.pct)} ${absPct(t.pct)} MoM`}):** Pro-rata ${fmtVnd(t.prorata)} so với ${prevLabel} ${fmtVnd(t.prev)}.`
  return [
    head, "",
    "*Điểm sáng:*", "",
    ...(up.length ? up.map(o => orgLine(o, prevLabel)) : ["- (Không có khách nào tăng đáng kể)"]), "",
    "*Hạn chế:*", "",
    ...(down.length || lost.length ? [...down, ...lost].map(o => orgLine(o, prevLabel)) : ["- (Không có khách nào giảm đáng kể)"]),
  ].join("\n")
}

// ── Tiến độ quý (dòng chữ + card) ──
function quarterBlock(data: WeeklyReportData): string {
  const q = data.quarter, w = qWord(q.label), pw = qWord(q.prevLabel)
  const t = q.total
  const revLine = t.revTarget > 0
    ? `--> Pro-rata đạt ${t.revPr > 0 ? ((t.revPr / t.revTarget) * 100).toFixed(1) : "0"}% progress target ${w} (${fmtVnd(t.revTarget)})`
    : `--> Chưa nhập target ${w}`
  const cm1Line = t.cm1Target > 0
    ? `--> Pro-rata đạt ${((t.cm1Pr / t.cm1Target) * 100).toFixed(1)}% so với target ${w} (${fmtVnd(t.cm1Target)})`
    : `--> Chưa nhập target CM1 ${w}`
  const thkLine = t.thkTargetRev > 0
    ? `--> Pro-rata đạt ${((t.thkPr / t.thkTargetRev) * 100).toFixed(1)}% so với target ${w} (${fmtVnd(t.thkTargetRev)})`
    : `--> Chưa nhập target 3HK ${w}`
  return [
    "**Revenue:**", "",
    `Revenue: ${fmtVnd(t.revRaw)} | Pro-rata ${w} (tạm tính): ${fmtVnd(t.revPr)}`, "",
    `--> Pro-rata ${dir(growth(t.revPr, q.prevRev))} ${absPct(growth(t.revPr, q.prevRev))} so với Doanh thu ${pw} (${fmtVnd(q.prevRev)})`, "",
    revLine, "",
    "**CM1:**", "",
    `CM1: ${fmtVnd(t.cm1Raw)} | Pro-rata ${w} (tạm tính): ${fmtVnd(t.cm1Pr)}`, "",
    `--> Pro-rata ${dir(growth(t.cm1Pr, q.prevCm1))} ${absPct(growth(t.cm1Pr, q.prevCm1))} so với CM1 ${pw} (${fmtVnd(q.prevCm1)})`, "",
    cm1Line, "",
    "**3HK:**", "",
    `Revenue: ${fmtVnd(t.thkAct)} | Pro-rata ${w} (tạm tính): ${fmtVnd(t.thkPr)}`, "",
    thkLine,
  ].join("\n")
}

function toProgressCard(title: string, accent: string, s: QuarterSeg): ProgressCard {
  const p = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null)
  return {
    title, accent,
    cm1PctPr: p(s.cm1Pr, s.cm1Target), cm1PctAct: p(s.cm1Raw, s.cm1Target),
    rows: [
      { label: "REV", actual: s.revRaw, prorata: s.revPr, target: s.revTarget, pct: p(s.revPr, s.revTarget) },
      { label: "CM1", actual: s.cm1Raw, prorata: s.cm1Pr, target: s.cm1Target, pct: p(s.cm1Pr, s.cm1Target) },
      { label: "3HK", actual: s.thkAct, prorata: null, target: s.thkTargetRev, pct: null, actualSub: `${s.thkPctAct.toFixed(1)}%`, targetSub: s.thkTargetPct > 0 ? `${s.thkTargetPct.toFixed(1)}%` : undefined },
    ],
  }
}

export async function buildReportContent(data: WeeklyReportData): Promise<ReportContent> {
  const { periods, projFactor } = data
  const images: Record<string, DocxImage> = {}

  // ── Card: KPI tuần (như Dashboard) ──
  {
    const k = data.weekKpi
    const buf = await renderKpiCard("Dashboard — Monthly Performance", `Gohub Business Intelligence · Tuần ${periods.weekRangeLabel}`, [
      deltaStat("Total Revenue", fmtVnd(k.revenue), ((k.revenue - k.revenuePrev) / (k.revenuePrev || 1)) * 100),
      deltaStat("Total Orders", fmtInt(k.orders), ((k.orders - k.ordersPrev) / (k.ordersPrev || 1)) * 100),
      deltaStat("Avg. Order Value", fmtVnd(k.aov), ((k.aov - k.aovPrev) / (k.aovPrev || 1)) * 100),
      deltaStat("Unit Sold", fmtInt(k.units), ((k.units - k.unitsPrev) / (k.unitsPrev || 1)) * 100),
    ])
    images["week_kpi"] = { buffer: buf, width: 1180, height: 210 }
  }

  // ── Card: Tiến độ quý (3 thẻ B2B / B2C / Tổng) ──
  {
    const q = data.quarter
    const buf = await renderProgressCards([
      toProgressCard("B2B", "#0f4c81", q.b2b), toProgressCard("B2C", "#0ea5e9", q.b2c), toProgressCard("TỔNG", "#1e3a8a", q.total),
    ])
    images["quarter_progress"] = { buffer: buf, width: 1180, height: 330 }
  }

  // ── Card: B2B Performance Summary ──
  {
    const g = data.b2bGpCm1
    const b2b = data.monthVsPrev.b2b
    const buf = await renderSectionedCard("B2B Performance", `Main consolidated report · MTD tới ${periods.cutoffDate}`, [
      { label: "MTD Performance (Actual)", stats: [
        { label: "B2B Revenue", value: fmtVnd(b2b.revenue) },
        { label: "Gross Profit", value: fmtVnd(g.gp) },
        { label: "CM1", value: fmtVnd(g.cm1) },
        { label: "B2B Margin %", value: `${b2b.margin_percent.toFixed(3)}%` },
        { label: "B2B CM1 %", value: `${b2b.gpm2_percent.toFixed(3)}%` },
      ]},
      { label: "Full Period Forecast (Projected)", stats: [
        { label: "Proj. B2B Revenue", value: fmtVnd(b2b.revenue * projFactor) },
        { label: "Proj. Gross Profit", value: fmtVnd(g.gpProrata) },
        { label: "Proj. CM1", value: fmtVnd(g.cm1Prorata) },
        { label: "Proj. B2B Margin %", value: `${b2b.margin_percent.toFixed(3)}%` },
        { label: "Proj. B2B CM1 %", value: `${g.cm1ProrataPct.toFixed(3)}%` },
      ]},
    ])
    images["b2b_summary"] = { buffer: buf, width: 1180, height: 150 + 2 * 140 }
  }

  // ── Card: B2C Performance ──
  {
    const g = data.b2cGpCm1
    const b2c = data.monthVsPrev.b2c
    const buf = await renderSectionedCard("B2C Performance", `B2C channel revenue, margin và sub-channel metrics · MTD tới ${periods.cutoffDate}`, [
      { label: "MTD Performance (Actual)", stats: [
        { label: "Total Revenue", value: fmtVnd(b2c.revenue) },
        { label: "Gross Profit", value: fmtVnd(g.gp) },
        { label: "Margin %", value: `${b2c.margin_percent.toFixed(1)}%` },
        { label: "CM1", value: fmtVnd(g.cm1) },
        { label: "CM1 %", value: `${b2c.gpm2_percent.toFixed(1)}%` },
      ]},
      { label: "Month-End Projection (Pro-rata)", stats: [
        { label: "Projected Revenue", value: fmtVnd(b2c.revenue * projFactor) },
        { label: "Projected Margin", value: fmtVnd(g.gpProrata) },
        { label: "Projected CM1", value: fmtVnd(g.cm1Prorata) },
        { label: "Projected CM1 %", value: `${g.cm1ProrataPct.toFixed(1)}%` },
      ]},
    ])
    images["b2c_summary"] = { buffer: buf, width: 1180, height: 150 + 2 * 140 }
  }

  // ── Card: Vendor Performance — 3HK DATAPOOL ──
  {
    const h = data.hk3
    const bufProj = await renderProjectionBanner(
      `Vendor Performance · 3HK DATAPOOL · dựa trên số liệu tới ${periods.cutoffDate} (hệ số x${projFactor.toFixed(2)})`,
      [
        { label: "Projected Revenue", value: fmtVnd(h.revenueProrata) },
        { label: "Projected Orders", value: fmtInt(h.ordersProrata) },
        { label: "Projected GP", value: fmtVnd(h.grossMarginProrata) },
        { label: "Projected Units", value: fmtInt(h.unitsProrata) },
      ]
    )
    images["hk3_projection"] = { buffer: bufProj, width: 1180, height: 170 }

    const bufActual = await renderKpiCard("Vendor Performance", "Phân tích hiệu quả kinh doanh theo nhà cung cấp · 3HK DATAPOOL", [
      { label: "Revenue (VND)", value: fmtVnd(h.revenueMtd) },
      { label: "Orders", value: fmtInt(h.ordersMtd) },
      { label: "Units Sold", value: fmtInt(h.unitsMtd) },
      { label: "AOV (VND)", value: fmtVnd(h.aovMtd) },
      { label: "Gross Margin", value: fmtVnd(h.grossMarginMtd) },
    ])
    images["hk3_actual"] = { buffer: bufActual, width: 1180, height: 210 }
  }

  // ── Markdown text ──
  const wow = data.weeklyWow
  const mv = data.monthVsPrev
  const b2cWow = wow.rows.find(r => r.label === "B2C")
  const prorataTotal = data.monthKpi.revenue * projFactor
  const mom = (cur: number, prev: number) => growth(cur * projFactor, prev)
  const wowRows = wow.rows.filter(r => r.label !== "Internal/Misc" || r.cur !== 0 || r.prev !== 0)

  const b2bTiers = data.tiers.length
    ? data.tiers.map(t => tierBlock(t, periods.prevMonthLabel)).join("\n\n")
    : "(Chưa có dữ liệu phân tích theo Tier)"

  const b2cUp = channelBullets(data.b2cChannels, true)
  const b2cDown = channelBullets(data.b2cChannels, false)
  const marginDrop = data.b2cMargin.pct < data.b2cMargin.prevPct
  const marginLine = `- **GP Margin %**: ${data.b2cMargin.prevPct.toFixed(2).replace(".", ",")}% (${periods.prevMonthLabel}) → ${data.b2cMargin.pct.toFixed(2).replace(".", ",")}% (MTD ${periods.monthLabel}).`
  const paceLine = b2cWow ? `- **Nhịp mua tuần**: tuần ${periods.weekRangeLabel} B2C ${pctTxt(b2cWow.pct)} WoW (${fmtVnd(b2cWow.cur)} so với ${fmtVnd(b2cWow.prev)}).` : ""
  const b2cUpAll = [...b2cUp, ...(!marginDrop ? [marginLine] : []), ...(b2cWow && b2cWow.pct >= 0 ? [paceLine] : [])]
  const b2cDownAll = [...b2cDown, ...(marginDrop ? [marginLine] : []), ...(b2cWow && b2cWow.pct < 0 ? [paceLine] : [])]

  const md = `
[Company Weekly Performance]

**Báo cáo performance tuần trước (${periods.weekRangeLabel}) so với tuần trước đó (${periods.prevWeekRangeLabel}) và pro-rata revenue ${periods.monthLabel}**

---

## 1. Overview WEEKLY

**Summary (${periods.weekRangeLabel}):**

Revenue: ${fmtVnd(data.weekKpi.revenue)} | Pro-rata ${periods.monthLabel} (tạm tính): ${fmtVnd(prorataTotal)}

--> ${dir(wow.totalPct).replace(/^./, c => c.toUpperCase())} ${absPct(wow.totalPct)} so với Doanh thu tuần trước (${fmtVnd(data.weekKpi.revenuePrev)})

--> Pro-rata ${dir(growth(prorataTotal, mv.total.prevMonthActual))} ${absPct(growth(prorataTotal, mv.total.prevMonthActual))} so với Thực tế Doanh thu ${periods.prevMonthLabel} (${fmtVnd(mv.total.prevMonthActual)})

![[IMG:week_kpi]]

**So sánh Performance Tuần (Weekly WoW)**

| Khối | Tuần trước (${periods.prevWeekRangeLabel}) | Tuần vừa rồi (${periods.weekRangeLabel}) | Chênh lệch (VND) | Tăng trưởng (%) |
|---|---|---|---|---|
${wowRows.map(r => `| ${r.label} | ${fmtInt(r.prev)} ₫ | ${fmtInt(r.cur)} ₫ | ${r.cur - r.prev >= 0 ? "+" : "-"}${fmtInt(Math.abs(r.cur - r.prev))} ₫ | ${fmtPct(r.pct)} |`).join("\n")}
| **TỔNG CỘNG** | **${fmtInt(wow.totalPrev)} ₫** | **${fmtInt(wow.totalCur)} ₫** | **${wow.totalCur - wow.totalPrev >= 0 ? "+" : "-"}${fmtInt(Math.abs(wow.totalCur - wow.totalPrev))} ₫** | **${fmtPct(wow.totalPct)}** |

**Tổng quan chung:** Doanh thu toàn công ty ${dir(wow.totalPct)} **${absPct(wow.totalPct)}** so với tuần trước đó

---

## 2. Progress ${qWord(data.quarter.label)}

${quarterBlock(data)}

![[IMG:quarter_progress]]

---

## 3. Break down B2B

**CM1 của B2B ${periods.monthLabel.toLowerCase()} (${periods.monthStart.slice(8, 10)}/${periods.monthStart.slice(5, 7)}/${periods.monthStart.slice(0, 4)} - ${periods.cutoffDate.slice(8, 10)}/${periods.cutoffDate.slice(5, 7)}/${periods.cutoffDate.slice(0, 4)}):**

CM1: ${fmtVnd(data.b2bGpCm1.cm1)} | Pro-rata CM1: ${fmtVnd(data.b2bGpCm1.cm1Prorata)} (${data.b2bGpCm1.cm1ProrataPct.toFixed(2)}%)

--> Pro-rata CM1 ${dir(growth(data.b2bGpCm1.cm1Prorata, data.b2bGpCm1.cm1PrevMonth))} ${absPct(growth(data.b2bGpCm1.cm1Prorata, data.b2bGpCm1.cm1PrevMonth))} so với CM1 ${periods.prevMonthLabel} (${fmtVnd(data.b2bGpCm1.cm1PrevMonth)})

**CM1 của B2B theo quý:**

CM1 B2B: ${fmtVnd(data.quarter.b2b.cm1Raw)} | Pro-rata ${qWord(data.quarter.label)} (tạm tính): ${fmtVnd(data.quarter.b2b.cm1Pr)}

--> ${data.quarter.b2b.cm1Target > 0 ? `Pro-rata đạt ${((data.quarter.b2b.cm1Pr / data.quarter.b2b.cm1Target) * 100).toFixed(1)}% so với target ${qWord(data.quarter.label)} (${fmtVnd(data.quarter.b2b.cm1Target)})` : `Chưa nhập target CM1 ${qWord(data.quarter.label)}`}

![[IMG:b2b_summary]]

---

## 4. Break down B2C

**CM1 của B2C ${periods.monthLabel.toLowerCase()} (${periods.monthStart.slice(8, 10)}/${periods.monthStart.slice(5, 7)}/${periods.monthStart.slice(0, 4)} - ${periods.cutoffDate.slice(8, 10)}/${periods.cutoffDate.slice(5, 7)}/${periods.cutoffDate.slice(0, 4)}):**

CM1: ${fmtVnd(data.b2cGpCm1.cm1)} | Pro-rata CM1: ${fmtVnd(data.b2cGpCm1.cm1Prorata)} (${data.b2cGpCm1.cm1ProrataPct.toFixed(2)}%)

--> Pro-rata CM1 ${dir(growth(data.b2cGpCm1.cm1Prorata, data.b2cGpCm1.cm1PrevMonth))} ${absPct(growth(data.b2cGpCm1.cm1Prorata, data.b2cGpCm1.cm1PrevMonth))} so với CM1 ${periods.prevMonthLabel} (${fmtVnd(data.b2cGpCm1.cm1PrevMonth)})

**CM1 của B2C theo quý:**

CM1 B2C: ${fmtVnd(data.quarter.b2c.cm1Raw)} | Pro-rata ${qWord(data.quarter.label)} (tạm tính): ${fmtVnd(data.quarter.b2c.cm1Pr)}

--> ${data.quarter.b2c.cm1Target > 0 ? `Pro-rata đạt ${((data.quarter.b2c.cm1Pr / data.quarter.b2c.cm1Target) * 100).toFixed(1)}% so với target ${qWord(data.quarter.label)} (${fmtVnd(data.quarter.b2c.cm1Target)})` : `Chưa nhập target CM1 ${qWord(data.quarter.label)}`}

![[IMG:b2c_summary]]

---

## 5. 3HK theo ${periods.monthLabel.toLowerCase()} (${periods.monthStart.slice(8, 10)}/${periods.monthStart.slice(5, 7)}/${periods.monthStart.slice(0, 4)} - ${periods.cutoffDate.slice(8, 10)}/${periods.cutoffDate.slice(5, 7)}/${periods.cutoffDate.slice(0, 4)})

Revenue: ${fmtVnd(data.hk3.revenueMtd)} | Pro-rata ${periods.monthLabel}: ${fmtVnd(data.hk3.revenueProrata)}

--> Pro-rata ${dir(data.hk3.pctVsPrevMonth)} ${absPct(data.hk3.pctVsPrevMonth)} so với 3HK Revenue ${periods.prevMonthLabel} (${fmtVnd(data.hk3.revenuePrevMonth)})

--> Pro-rata %3HK đạt ${data.hk3.pctContributionOfProrataTotal.toFixed(1)}% so với pro-rata total revenue ${periods.monthLabel} (${fmtVnd(prorataTotal)})

![[IMG:hk3_projection]]

![[IMG:hk3_actual]]

---

## 6. Phân tích & Đánh giá Pro-rata Revenue ${periods.monthLabel} & So với Actual ${periods.prevMonthLabel}

*Tính toán dựa trên dữ liệu thực tế đến hết ngày ${periods.cutoffDate.slice(8, 10)}/${periods.cutoffDate.slice(5, 7)} (${Number(periods.cutoffDate.slice(8, 10))} ngày đầu tháng).*

| Khối | Thực tế ${periods.prevMonthLabel.replace("Tháng ", "T")} | MTD ${periods.monthLabel.slice(0, 8).replace("Tháng ", "T")} | Pro-rata ${periods.monthLabel.slice(0, 8).replace("Tháng ", "T")} | % Tăng trưởng |
|---|---|---|---|---|
| B2B | ${fmtInt(mv.b2b.prevMonthActual)} ₫ | ${fmtInt(mv.b2b.revenue)} ₫ | ${fmtInt(mv.b2b.revenue * projFactor)} ₫ | ${fmtPct(mom(mv.b2b.revenue, mv.b2b.prevMonthActual))} |
| B2C | ${fmtInt(mv.b2c.prevMonthActual)} ₫ | ${fmtInt(mv.b2c.revenue)} ₫ | ${fmtInt(mv.b2c.revenue * projFactor)} ₫ | ${fmtPct(mom(mv.b2c.revenue, mv.b2c.prevMonthActual))} |
| **TỔNG CỘNG** | **${fmtInt(mv.total.prevMonthActual)} ₫** | **${fmtInt(mv.total.revenue)} ₫** | **${fmtInt(mv.total.revenue * projFactor)} ₫** | **${fmtPct(mom(mv.total.revenue, mv.total.prevMonthActual))}** |

**B2B (${dir(mom(mv.b2b.revenue, mv.b2b.prevMonthActual)).replace(/^./, c => c.toUpperCase())} ${absPct(mom(mv.b2b.revenue, mv.b2b.prevMonthActual))} MoM):**

${b2bTiers}

**B2C (${dir(mom(mv.b2c.revenue, mv.b2c.prevMonthActual)).replace(/^./, c => c.toUpperCase())} ${absPct(mom(mv.b2c.revenue, mv.b2c.prevMonthActual))} MoM):**

*Điểm sáng:*

${b2cUpAll.length ? b2cUpAll.join("\n") : "- (Không có kênh nào tăng đáng kể)"}

*Hạn chế:*

${b2cDownAll.length ? b2cDownAll.join("\n") : "- (Không có kênh nào giảm đáng kể)"}
`.trim()

  return {
    title: `Company Weekly Performance — Tuần ${periods.weekRangeLabel}`,
    markdown: md,
    images,
  }
}
