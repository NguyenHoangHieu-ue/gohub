import PptxGenJS from "pptxgenjs"
import { BRAND, PALETTE, formatValue, toNumber, type ReportSpec } from "./spec"

// Bản PowerPoint của báo cáo (U2): slide bìa, slide kết luận, mỗi mục 1 slide — biểu đồ GỐC của PowerPoint (sửa được), bảng ≤ 12 dòng
// (dài hơn thì ghi "xem bản Excel"), ô số. Màu/khung theo gohub.vn.
const hex = (c: string) => c.replace("#", "")
const FONT = "Arial"
const MAX_TABLE_ROWS = 12

export async function buildReportPptx(spec: ReportSpec): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = "LAYOUT_WIDE"   // 13.33 × 7.5 in
  pptx.author = "GoHub Intel — Bé Gấu"
  pptx.title = spec.title
  pptx.defineSlideMaster({
    title: "GOHUB", background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: hex(BRAND.primary) } } },
      { text: { text: "gohub", options: { x: 11.6, y: 7.0, w: 1.5, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: hex(BRAND.primary), align: "right" } } },
    ],
    slideNumber: { x: 0.4, y: 7.0, fontFace: FONT, fontSize: 10, color: "94A3B8" },
  })

  const cover = pptx.addSlide()
  cover.background = { color: hex(BRAND.dark) }
  cover.addText("GOHUB · travel like a local", { x: 0.7, y: 0.6, w: 12, h: 0.4, fontFace: FONT, fontSize: 14, color: "BFD7F5" })
  cover.addText(spec.title, { x: 0.7, y: 2.4, w: 11.9, h: 1.6, fontFace: FONT, fontSize: 38, bold: true, color: "FFFFFF", valign: "top" })
  cover.addText([spec.subtitle, spec.period ? `Kỳ dữ liệu: ${spec.period}` : ""].filter(Boolean).join("\n"),
    { x: 0.7, y: 4.2, w: 11.9, h: 1.2, fontFace: FONT, fontSize: 16, color: "DBEAFE", valign: "top" })

  const title = (s: PptxGenJS.Slide, t: string) =>
    s.addText(t, { x: 0.5, y: 0.3, w: 12.3, h: 0.7, fontFace: FONT, fontSize: 26, bold: true, color: hex(BRAND.dark) })
  const bullets = (s: PptxGenJS.Slide, items: string[], box: { x: number; y: number; w: number; h: number }) =>
    s.addText(items.map(t => ({ text: t, options: { bullet: true, breakLine: true } })),
      { ...box, fontFace: FONT, fontSize: 16, color: hex(BRAND.text), valign: "top", paraSpaceAfter: 8 })

  if (spec.summary.length) {
    const s = pptx.addSlide({ masterName: "GOHUB" })
    title(s, "Kết luận")
    bullets(s, spec.summary, { x: 0.6, y: 1.3, w: 12.1, h: 5.4 })
  }

  for (const sec of spec.sections) {
    const s = pptx.addSlide({ masterName: "GOHUB" })
    title(s, sec.heading)
    let y = 1.2
    if (sec.kpis?.length) {
      const w = 12.3 / sec.kpis.length
      sec.kpis.forEach((k, i) => {
        s.addShape("roundRect", { x: 0.5 + i * w, y, w: w - 0.15, h: 1.15, fill: { color: hex(BRAND.bg) }, line: { color: "E2E8F0" }, rectRadius: 0.08 })
        s.addText([
          { text: k.label, options: { fontSize: 12, color: "64748B", breakLine: true } },
          { text: typeof k.value === "number" ? formatValue(k.value, k.type) : k.value, options: { fontSize: 22, bold: true, color: hex(BRAND.primary), breakLine: k.change !== undefined } },
          ...(k.change !== undefined ? [{ text: `${k.change >= 0 ? "▲" : "▼"} ${formatValue(Math.abs(k.change), "percent")}`, options: { fontSize: 12, color: k.change >= 0 ? "059669" : "DC2626" } }] : []),
        ], { x: 0.6 + i * w, y: y + 0.05, w: w - 0.35, h: 1.05, fontFace: FONT, valign: "middle" })
      })
      y += 1.35
    }
    const c = sec.chart
    const hasChart = !!c?.data?.length
    const textItems = [...(sec.text ? [sec.text] : []), ...(sec.bullets ?? [])]
    if (hasChart) {
      const labels = c!.data!.map(r => String(r[c!.x] ?? ""))
      const data = (c!.type === "pie" ? c!.series.slice(0, 1) : c!.series).map(sr => ({ name: sr.label, labels, values: c!.data!.map(r => toNumber(r[sr.key])) }))
      const type = c!.type === "line" ? pptx.ChartType.line : c!.type === "pie" ? pptx.ChartType.pie : pptx.ChartType.bar
      const w = textItems.length ? 8.2 : 12.3
      s.addChart(type, data, {
        x: 0.5, y, w, h: 6.8 - y, barGrouping: c!.type === "stacked" ? "stacked" : "clustered", chartColors: PALETTE.map(hex),
        showLegend: c!.series.length > 1 || c!.type === "pie", legendPos: "b", legendFontFace: FONT,
        showTitle: true, title: c!.title, titleFontFace: FONT, titleFontSize: 14, titleColor: hex(BRAND.text),
        catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10,
        valAxisLabelFormatCode: "#,##0", showPercent: c!.type === "pie", showValue: false,
      })
      if (textItems.length) bullets(s, textItems, { x: 8.9, y, w: 3.9, h: 6.8 - y })
    } else if (sec.table?.rows?.length) {
      const t = sec.table
      const rows = t.rows!.slice(0, MAX_TABLE_ROWS)
      const isNum = (type?: string) => type === "number" || type === "money" || type === "percent"
      s.addTable([
        t.columns.map(col => ({ text: col.label, options: { bold: true, color: "FFFFFF", fill: { color: hex(BRAND.primary) }, align: isNum(col.type) ? "right" as const : "left" as const } })),
        ...rows.map((r, i) => t.columns.map(col => ({ text: formatValue(r[col.key], col.type),
          options: { align: isNum(col.type) ? "right" as const : "left" as const, fill: { color: i % 2 ? "F1F5F9" : "FFFFFF" } } }))),
      ], { x: 0.5, y, w: textItems.length ? 8.2 : 12.3, fontFace: FONT, fontSize: 11, border: { type: "solid", pt: 0.5, color: "CBD5E1" }, autoPage: false })
      if (t.rows!.length > MAX_TABLE_ROWS) s.addText(`(Hiện ${MAX_TABLE_ROWS}/${t.rows!.length} dòng — đầy đủ ở bản Excel)`, { x: 0.5, y: 6.7, w: 8, h: 0.3, fontFace: FONT, fontSize: 10, italic: true, color: "64748B" })
      if (textItems.length) bullets(s, textItems, { x: 8.9, y, w: 3.9, h: 6.8 - y })
    } else if (textItems.length) {
      bullets(s, textItems, { x: 0.6, y, w: 12.1, h: 6.8 - y })
    }
  }

  if (spec.actions?.length) {
    const s = pptx.addSlide({ masterName: "GOHUB" })
    title(s, "Việc nên làm")
    bullets(s, spec.actions, { x: 0.6, y: 1.3, w: 12.1, h: 5.4 })
  }
  return Buffer.from(await pptx.write({ outputType: "nodebuffer" }) as ArrayBuffer)
}
