import ExcelJS from "exceljs"
import { BRAND, toNumber, totalRow, type ReportSpec, type ColType } from "./spec"

// Bản Excel của báo cáo (U2): sheet "Tóm tắt" (kết luận, ô số, việc nên làm) + mỗi bảng 1 sheet: dòng tiêu đề xanh cố định, bộ lọc,
// định dạng số kiểu Việt (#,##0 / 0.0%), độ rộng cột theo nội dung, dòng tổng là CÔNG THỨC SUM; ảnh biểu đồ đặt cạnh bảng.
// exceljs không tạo được biểu đồ gốc của Excel → dùng ảnh (biểu đồ gốc có ở bản PowerPoint).

const argb = (c: string) => "FF" + c.replace("#", "").toUpperCase()
const NUMFMT: Record<ColType, string> = { money: "#,##0", number: "#,##0.##", percent: '0.0"%"', text: "@" }

function sheetName(base: string, used: Set<string>): string {
  let n = base.replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Bang"
  for (let i = 2; used.has(n); i++) n = `${n.slice(0, 25)} ${i}`
  used.add(n)
  return n
}

export async function buildReportXlsx(spec: ReportSpec, charts: Map<number, Buffer>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "GoHub Intel — Bé Gấu"
  const used = new Set<string>()

  const sum = wb.addWorksheet(sheetName("Tóm tắt", used), { views: [{ showGridLines: false }] })
  sum.getColumn(1).width = 4
  sum.getColumn(2).width = 110
  let r = 2
  const line = (text: string, style: Partial<ExcelJS.Font> = {}, fill?: string) => {
    const c = sum.getCell(r, 2)
    c.value = text
    c.font = { name: "Arial", size: 11, ...style }
    c.alignment = { wrapText: true, vertical: "top" }
    if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(fill) } }
    r++
  }
  line(spec.title, { size: 18, bold: true, color: { argb: argb(BRAND.dark) } })
  if (spec.subtitle) line(spec.subtitle, { size: 12, color: { argb: "FF334155" } })
  line(`${spec.period ? `Kỳ dữ liệu: ${spec.period} · ` : ""}Ngày lập: ${new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`, { size: 10, color: { argb: "FF64748B" } })
  r++
  if (spec.summary.length) { line("KẾT LUẬN", { bold: true, color: { argb: "FFFFFFFF" } }, BRAND.primary); spec.summary.forEach(s => line(`• ${s}`)); r++ }
  spec.sections.forEach(s => s.kpis?.forEach(k => line(`${k.label}: ${typeof k.value === "number" ? k.value.toLocaleString("vi-VN") : k.value}${k.change !== undefined ? ` (${k.change >= 0 ? "+" : ""}${k.change.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%)` : ""}`)))
  if (spec.actions?.length) { r++; line("VIỆC NÊN LÀM", { bold: true, color: { argb: "FFFFFFFF" } }, BRAND.primary); spec.actions.forEach(a => line(`• ${a}`)) }
  if (spec.notes?.length) { r++; line("NGUỒN & GHI CHÚ", { bold: true, color: { argb: "FF64748B" } }); spec.notes.forEach(n => line(n, { size: 10, color: { argb: "FF475569" } })) }

  spec.sections.forEach((s, i) => {
    const t = s.table
    const png = charts.get(i)
    if (!t?.rows?.length && !png) return
    const ws = wb.addWorksheet(sheetName(s.heading, used))
    let startRow = 1
    if (t?.rows?.length) {
      ws.columns = t.columns.map(c => ({
        header: c.label, key: c.key,
        width: Math.min(45, Math.max(12, c.label.length + 2, ...t.rows!.slice(0, 50).map(row => String(row[c.key] ?? "").length + 2))),
        style: { numFmt: c.type ? NUMFMT[c.type] : undefined, font: { name: "Arial", size: 10 } },
      }))
      t.rows.forEach(row => ws.addRow(Object.fromEntries(t.columns.map(c => [c.key, c.type && c.type !== "text" ? toNumber(row[c.key]) : row[c.key] ?? ""]))))
      const head = ws.getRow(1)
      head.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } }
      head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(BRAND.primary) } }
      head.alignment = { vertical: "middle", wrapText: true }
      head.height = 22
      ws.views = [{ state: "frozen", ySplit: 1 }]
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.columns.length } }
      const last = t.rows.length + 1
      if (totalRow(t)) {
        const tr = ws.addRow({})
        tr.getCell(1).value = "Tổng"
        t.columns.forEach((c, ci) => {
          if (ci > 0 && (c.type === "number" || c.type === "money")) {
            const col = ws.getColumn(ci + 1).letter
            tr.getCell(ci + 1).value = { formula: `SUM(${col}2:${col}${last})` }
          }
        })
        tr.font = { name: "Arial", size: 10, bold: true }
        tr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }
      }
      startRow = t.columns.length + 2
    }
    if (png) {
      const id = wb.addImage({ buffer: png as any, extension: "png" })
      ws.addImage(id, { tl: { col: t?.rows?.length ? startRow - 1 : 0, row: 1 }, ext: { width: 720, height: 360 } })
    }
  })
  return Buffer.from(await wb.xlsx.writeBuffer())
}
