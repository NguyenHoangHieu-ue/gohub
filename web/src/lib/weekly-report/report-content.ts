// Build markdown + card images cho Weekly Report — 1 NGUỒN nội dung DUY NHẤT dùng cho cả docx (qua
// markdownToDocx) lẫn pdf (qua markdownToPdf), tránh viết 2 lần cùng bố cục báo cáo.
import type { WeeklyReportData, ChannelMoM } from "./data"
import { fmtVnd, fmtInt, fmtPct } from "./period"
import { renderKpiCard, renderSectionedCard, renderProjectionBanner, type Stat } from "./card-images"
import type { DocxImage } from "@/lib/docx-markdown"

export interface ReportContent {
  title: string
  markdown: string
  images: Record<string, DocxImage>
}

function deltaStat(label: string, value: string, pct: number): Stat {
  return { label, value, delta: fmtPct(pct), deltaPositive: pct >= 0 }
}

function channelList(channels: ChannelMoM[], narratives: Map<string, string>): { positive: ChannelMoM[]; negative: ChannelMoM[] } {
  const positive = channels.filter(c => c.pctMoM >= 0).sort((a, b) => b.pctMoM - a.pctMoM)
  const negative = channels.filter(c => c.pctMoM < 0).sort((a, b) => a.pctMoM - b.pctMoM)
  return { positive, negative }
}

function channelBullets(list: ChannelMoM[], narratives: Map<string, string>): string {
  if (list.length === 0) return "- (Không có kênh nào trong nhóm này)\n"
  return list.map(c => `- **${c.channel}**: ${narratives.get(c.channel) || `Pro-rata ${fmtVnd(c.prorata)} (${fmtPct(c.pctMoM)} MoM).`}`).join("\n") + "\n"
}

export async function buildReportContent(
  data: WeeklyReportData,
  narratives: Map<string, string>,
): Promise<ReportContent> {
  const { periods, projFactor } = data
  const images: Record<string, DocxImage> = {}

  // ── Card A: Weekly KPI ──
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

  // ── Card B: Overall tháng ──
  {
    const k = data.monthKpi
    const buf = await renderKpiCard("Dashboard — Monthly Performance", `Gohub Business Intelligence · ${periods.monthLabel} (tới ${periods.cutoffDate})`, [
      deltaStat("Total Revenue", fmtVnd(k.revenue), ((k.revenue - k.revenuePrev) / (k.revenuePrev || 1)) * 100),
      deltaStat("Total Orders", fmtInt(k.orders), ((k.orders - k.ordersPrev) / (k.ordersPrev || 1)) * 100),
      deltaStat("Avg. Order Value", fmtVnd(k.aov), ((k.aov - k.aovPrev) / (k.aovPrev || 1)) * 100),
      deltaStat("Unit Sold", fmtInt(k.units), ((k.units - k.unitsPrev) / (k.unitsPrev || 1)) * 100),
    ])
    images["month_kpi"] = { buffer: buf, width: 1180, height: 210 }
  }

  // ── Card C: Month-End Projection ──
  {
    const k = data.monthKpi
    const buf = await renderProjectionBanner(
      `Dashboard · dựa trên số liệu tới ${periods.cutoffDate} · hệ số x${projFactor.toFixed(2)}`,
      [
        { label: "Projected Revenue", value: fmtVnd(k.revenue * projFactor) },
        { label: "Projected Orders", value: fmtInt(k.orders * projFactor) },
        { label: "Projected AOV", value: fmtVnd(k.aov) },
        { label: "Projected Units", value: fmtInt(k.units * projFactor) },
      ]
    )
    images["projection"] = { buffer: buf, width: 1180, height: 170 }
  }

  // ── Card D: B2B Performance Summary ──
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

  // ── Card E: B2C Performance ──
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

  // ── Card F: Vendor Performance — 3HK DATAPOOL ──
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
  const b2bCh = channelList(data.b2bChannels, narratives)
  const b2cCh = channelList(data.b2cChannels, narratives)

  const md = `
[Company Weekly Performance]

**Báo cáo performance tuần trước (${periods.weekRangeLabel}) so với tuần trước đó (${periods.prevWeekRangeLabel}) và pro-rata revenue ${periods.monthLabel}**

---

## 1. Overview

**Summary (${periods.weekRangeLabel}):**

Revenue: ${fmtVnd(data.weekKpi.revenue)} | Pro-rata ${periods.monthLabel} (tạm tính): ${fmtVnd(data.monthKpi.revenue * projFactor)}

--> ${wow.totalPct >= 0 ? "Tăng" : "Giảm"} ${fmtPct(Math.abs(wow.totalPct)).replace("+", "")} so với Doanh thu tuần trước (${fmtVnd(data.weekKpi.revenuePrev)})

--> Pro-rata ${mv.total.gpm2 >= 0 ? "" : ""}${((data.monthKpi.revenue * projFactor) - mv.total.prevMonthActual) >= 0 ? "tăng" : "giảm"} ${fmtPct(Math.abs(((data.monthKpi.revenue * projFactor - mv.total.prevMonthActual) / (mv.total.prevMonthActual || 1)) * 100)).replace("+", "")} so với Thực tế Doanh thu ${periods.prevMonthLabel} (${fmtVnd(mv.total.prevMonthActual)})

![[IMG:week_kpi]]

**Overall ${periods.monthLabel} (${periods.monthStart.slice(8, 10)}/${periods.monthStart.slice(5, 7)} - ${periods.cutoffDate.slice(8, 10)}/${periods.cutoffDate.slice(5, 7)})**

![[IMG:month_kpi]]

![[IMG:projection]]

**So sánh Performance Tuần (Weekly WoW)**

| Kênh bán | Doanh thu Tuần ${periods.weekRangeLabel} (VND) | Doanh thu Tuần ${periods.prevWeekRangeLabel} (VND) | Biến động WoW (%) |
|---|---|---|---|
${wow.rows.map(r => `| ${r.label} | ${fmtInt(r.cur)} | ${fmtInt(r.prev)} | ${fmtPct(r.pct)} |`).join("\n")}
| **TỔNG CỘNG** | **${fmtInt(wow.totalCur)}** | **${fmtInt(wow.totalPrev)}** | **${fmtPct(wow.totalPct)}** |

**Tổng quan chung:** Doanh thu toàn công ty ${wow.totalPct >= 0 ? "tăng" : "giảm"} **${fmtPct(Math.abs(wow.totalPct)).replace("+", "")}** so với tuần trước đó

---

## 2. Phân tích & Đánh giá Pro-rata ${periods.monthLabel} & So với Actual ${periods.prevMonthLabel}

*Tính toán dựa trên dữ liệu thực tế đến hết ngày ${periods.cutoffDate} (${periods.monthStart.slice(8, 10)} ngày đầu tháng).*

| Kênh | Lũy kế MTD (VND) | Pro-rata ${periods.monthLabel} (VND) | Thực tế ${periods.prevMonthLabel} (VND) | So sánh Pro-rata vs Tháng trước (%) |
|---|---|---|---|---|
| B2B | ${fmtInt(mv.b2b.revenue)} | ${fmtInt(mv.b2b.revenue * projFactor)} | ${fmtInt(mv.b2b.prevMonthActual)} | ${fmtPct(((mv.b2b.revenue * projFactor - mv.b2b.prevMonthActual) / (mv.b2b.prevMonthActual || 1)) * 100)} |
| B2C | ${fmtInt(mv.b2c.revenue)} | ${fmtInt(mv.b2c.revenue * projFactor)} | ${fmtInt(mv.b2c.prevMonthActual)} | ${fmtPct(((mv.b2c.revenue * projFactor - mv.b2c.prevMonthActual) / (mv.b2c.prevMonthActual || 1)) * 100)} |
| TỔNG | ${fmtInt(mv.total.revenue)} | ${fmtInt(mv.total.revenue * projFactor)} | ${fmtInt(mv.total.prevMonthActual)} | ${fmtPct(((mv.total.revenue * projFactor - mv.total.prevMonthActual) / (mv.total.prevMonthActual || 1)) * 100)} |

**B2B (${((mv.b2b.revenue * projFactor - mv.b2b.prevMonthActual) / (mv.b2b.prevMonthActual || 1) * 100) >= 0 ? "Tăng" : "Giảm"} ${fmtPct(Math.abs((mv.b2b.revenue * projFactor - mv.b2b.prevMonthActual) / (mv.b2b.prevMonthActual || 1) * 100)).replace("+", "")} MoM):**

*Điểm sáng:*

${channelBullets(b2bCh.positive, narratives)}

*Hạn chế:*

${channelBullets(b2bCh.negative, narratives)}

**B2C (${((mv.b2c.revenue * projFactor - mv.b2c.prevMonthActual) / (mv.b2c.prevMonthActual || 1) * 100) >= 0 ? "Tăng" : "Giảm"} ${fmtPct(Math.abs((mv.b2c.revenue * projFactor - mv.b2c.prevMonthActual) / (mv.b2c.prevMonthActual || 1) * 100)).replace("+", "")} MoM):**

*Điểm sáng:*

${channelBullets(b2cCh.positive, narratives)}

*Hạn chế:*

${channelBullets(b2cCh.negative, narratives)}

![[IMG:b2b_summary]]

---

## 3. GP & CM1 của B2B (${periods.monthStart} - ${periods.cutoffDate})

GP: ${fmtVnd(data.b2bGpCm1.gp)} | CM1: ${fmtVnd(data.b2bGpCm1.cm1)}

--> Pro-rata GP: ${fmtVnd(data.b2bGpCm1.gpProrata)} | CM1: ${fmtVnd(data.b2bGpCm1.cm1Prorata)} (${data.b2bGpCm1.cm1ProrataPct.toFixed(2)}%)

--> Pro-rata GP ${data.b2bGpCm1.gpProrata >= data.b2bGpCm1.gpPrevMonth ? "tăng" : "giảm"} ${fmtPct(Math.abs(((data.b2bGpCm1.gpProrata - data.b2bGpCm1.gpPrevMonth) / (data.b2bGpCm1.gpPrevMonth || 1)) * 100)).replace("+", "")} so với GP ${periods.prevMonthLabel} (${fmtVnd(data.b2bGpCm1.gpPrevMonth)})

--> Pro-rata CM1 ${data.b2bGpCm1.cm1Prorata >= data.b2bGpCm1.cm1PrevMonth ? "tăng" : "giảm"} ${fmtPct(Math.abs(((data.b2bGpCm1.cm1Prorata - data.b2bGpCm1.cm1PrevMonth) / (data.b2bGpCm1.cm1PrevMonth || 1)) * 100)).replace("+", "")} so với CM1 ${periods.prevMonthLabel} (${fmtVnd(data.b2bGpCm1.cm1PrevMonth)})

---

## 4. GP & CM1 của B2C (${periods.monthStart} - ${periods.cutoffDate})

GP: ${fmtVnd(data.b2cGpCm1.gp)} | CM1: ${fmtVnd(data.b2cGpCm1.cm1)}

--> Pro-rata GP: ${fmtVnd(data.b2cGpCm1.gpProrata)} | CM1: ${fmtVnd(data.b2cGpCm1.cm1Prorata)} (${data.b2cGpCm1.cm1ProrataPct.toFixed(2)}%)

--> Pro-rata GP ${data.b2cGpCm1.gpProrata >= data.b2cGpCm1.gpPrevMonth ? "tăng" : "giảm"} ${fmtPct(Math.abs(((data.b2cGpCm1.gpProrata - data.b2cGpCm1.gpPrevMonth) / (data.b2cGpCm1.gpPrevMonth || 1)) * 100)).replace("+", "")} so với GP ${periods.prevMonthLabel} (${fmtVnd(data.b2cGpCm1.gpPrevMonth)})

--> Pro-rata CM1 ${data.b2cGpCm1.cm1Prorata >= data.b2cGpCm1.cm1PrevMonth ? "tăng" : "giảm"} ${fmtPct(Math.abs(((data.b2cGpCm1.cm1Prorata - data.b2cGpCm1.cm1PrevMonth) / (data.b2cGpCm1.cm1PrevMonth || 1)) * 100)).replace("+", "")} so với CM1 ${periods.prevMonthLabel} (${fmtVnd(data.b2cGpCm1.cm1PrevMonth)})

![[IMG:b2c_summary]]

---

## 5. 3HK Contribution (${periods.monthStart} - ${periods.cutoffDate})

Revenue: ${fmtVnd(data.hk3.revenueMtd)} | Pro-rata ${periods.monthLabel}: ${fmtVnd(data.hk3.revenueProrata)}

--> Pro-rata ${data.hk3.pctVsPrevMonth >= 0 ? "tăng" : "giảm"} ${fmtPct(Math.abs(data.hk3.pctVsPrevMonth)).replace("+", "")} so với 3HK Revenue ${periods.prevMonthLabel} (${fmtVnd(data.hk3.revenuePrevMonth)})

--> Pro-rata %3HK đạt ${data.hk3.pctContributionOfProrataTotal.toFixed(1)}% so với pro-rata total revenue ${periods.monthLabel} (${fmtVnd(data.monthKpi.revenue * projFactor)})

![[IMG:hk3_projection]]

![[IMG:hk3_actual]]
`.trim()

  return {
    title: `Company Weekly Performance — Tuần ${periods.weekRangeLabel}`,
    markdown: md,
    images,
  }
}
