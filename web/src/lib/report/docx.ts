import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType,
} from "docx"
import { BRAND, formatValue, totalRow, type ReportSpec, type ReportTable, type ReportKpi } from "./spec"

// Bản Word của báo cáo (U2): tiêu đề màu thương hiệu, kết luận trước, bảng có khung + dòng tiêu đề xanh, số kiểu Việt, ảnh biểu đồ.
const FONT = "Arial"
const hex = (c: string) => c.replace("#", "")
const run = (text: string, o: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) =>
  new TextRun({ text, font: FONT, bold: o.bold, italics: o.italics, color: o.color ? hex(o.color) : undefined, size: o.size })
const para = (text: string, o: { bold?: boolean; color?: string; size?: number; italics?: boolean; after?: number } = {}) =>
  new Paragraph({ children: [run(text, o)], spacing: { after: o.after ?? 120 } })
const bullet = (text: string) => new Paragraph({ children: [run(text)], bullet: { level: 0 }, spacing: { after: 60 } })
const heading = (text: string) => new Paragraph({
  heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 },
  children: [new TextRun({ text, font: FONT, bold: true, size: 30, color: hex(BRAND.dark) })],
})
const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }
const borders = { top: border, bottom: border, left: border, right: border }

function cell(text: string, o: { header?: boolean; right?: boolean; bold?: boolean; zebra?: boolean } = {}) {
  return new TableCell({
    borders,
    shading: o.header ? { type: ShadingType.CLEAR, fill: hex(BRAND.primary), color: "auto" } : o.zebra ? { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [run(text, { bold: o.header || o.bold, color: o.header ? "#FFFFFF" : BRAND.text, size: 19 })] })],
  })
}

function dataTable(t: ReportTable): Table {
  const isNum = (type?: string) => type === "number" || type === "money" || type === "percent"
  const rows = [...(t.rows ?? [])]
  const tot = totalRow(t)
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: t.columns.map(c => cell(c.label, { header: true, right: isNum(c.type) })) }),
      ...rows.map((r, i) => new TableRow({ children: t.columns.map(c => cell(formatValue(r[c.key], c.type), { right: isNum(c.type), zebra: i % 2 === 1 })) })),
      ...(tot ? [new TableRow({ children: t.columns.map(c => cell(formatValue(tot[c.key], c.type), { right: isNum(c.type), bold: true })) })] : []),
    ],
  })
}

function kpiTable(kpis: ReportKpi[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: kpis.map(k => new TableCell({
      borders, shading: { type: ShadingType.CLEAR, fill: hex(BRAND.bg), color: "auto" }, margins: { top: 100, bottom: 100, left: 120, right: 120 },
      children: [
        new Paragraph({ children: [run(k.label, { size: 17, color: "#64748B" })] }),
        new Paragraph({ children: [run(typeof k.value === "number" ? formatValue(k.value, k.type) : k.value, { bold: true, size: 28, color: BRAND.primary })] }),
        ...(k.change !== undefined ? [new Paragraph({ children: [run(`${k.change >= 0 ? "▲" : "▼"} ${formatValue(Math.abs(k.change), "percent")}`, { size: 17, color: k.change >= 0 ? "#059669" : "#DC2626" })] })] : []),
      ],
    })) })],
  })
}

export async function buildReportDocx(spec: ReportSpec, charts: Map<number, Buffer>): Promise<Buffer> {
  const today = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [run("GOHUB", { bold: true, color: BRAND.primary, size: 22 }), run("  ·  travel like a local", { color: "#64748B", size: 18 })], spacing: { after: 240 } }),
    new Paragraph({ children: [run(spec.title, { bold: true, size: 44, color: BRAND.dark })], spacing: { after: 120 } }),
    ...(spec.subtitle ? [para(spec.subtitle, { size: 24, color: "#334155" })] : []),
    para(`${spec.period ? `Kỳ dữ liệu: ${spec.period}  ·  ` : ""}Ngày lập: ${today}`, { size: 18, color: "#64748B", after: 240 }),
  ]
  if (spec.summary.length) children.push(heading("Kết luận"), ...spec.summary.map(bullet))
  spec.sections.forEach((s, i) => {
    children.push(heading(s.heading))
    if (s.text) s.text.split(/\n{2,}/).forEach(p => children.push(para(p.trim())))
    if (s.kpis?.length) children.push(kpiTable(s.kpis), para(""))
    s.bullets?.forEach(b => children.push(bullet(b)))
    const png = charts.get(i)
    if (png) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 },
      children: [new ImageRun({ type: "png", data: png, transformation: { width: 600, height: 300 } })] }))
    if (s.table?.rows?.length) {
      if (s.table.title) children.push(para(s.table.title, { bold: true, size: 20 }))
      children.push(dataTable(s.table), para(""))
    } else if (s.table) children.push(para("(Không có dữ liệu)", { italics: true, color: "#64748B" }))
  })
  if (spec.actions?.length) children.push(heading("Việc nên làm"), ...spec.actions.map(bullet))
  if (spec.notes?.length) children.push(heading("Nguồn & ghi chú"), ...spec.notes.map(n => para(n, { size: 18, color: "#475569" })))

  const doc = new Document({
    creator: "GoHub Intel — Bé Gấu",
    title: spec.title,
    styles: { default: { document: { run: { font: FONT, size: 21, color: hex(BRAND.text) }, paragraph: { spacing: { line: 300 } } } } },
    sections: [{
      properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        run(`${spec.title} — Trang `, { size: 16, color: "#94A3B8" }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: "94A3B8" }),
        run("/", { size: 16, color: "#94A3B8" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: "94A3B8" }),
      ] })] }) },
      children,
    }],
  })
  return Packer.toBuffer(doc)
}
