import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx"
import * as XLSX from "xlsx"

// Xuất phiên bản hiện tại của 1 nguồn thành file: docx (markdown nhẹ: # tiêu đề, - gạch đầu dòng, bảng | a | b |), xlsx (từ "=== Sheet: tên ===\ncsv"), md/txt.
// Lưu ý: docx xuất lại là văn bản định dạng đơn giản — KHÔNG giữ nguyên định dạng của file gốc.
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4]

function runs(text: string): TextRun[] {
  // **đậm** trong dòng
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(p => (p.startsWith("**") && p.endsWith("**") ? new TextRun({ text: p.slice(2, -2), bold: true }) : new TextRun(p)))
}

export async function toDocx(title: string, text: string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })]
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()))
        i++
      }
      i--
      if (rows.length) children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((r, ri) => new TableRow({ children: r.map(c => new TableCell({ children: [new Paragraph({ children: ri === 0 ? [new TextRun({ text: c, bold: true })] : runs(c) })] })) })) }))
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) { children.push(new Paragraph({ text: h[2], heading: HEADINGS[h[1].length - 1] })); continue }
    const b = line.match(/^\s*[-*•]\s+(.*)$/)
    if (b) { children.push(new Paragraph({ children: runs(b[1]), bullet: { level: 0 } })); continue }
    children.push(new Paragraph({ children: runs(line) }))
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }))
}

function parseCsvLine(l: string): string[] {
  const cells: string[] = []; let cur = "", q = false
  for (let i = 0; i < l.length; i++) {
    const ch = l[i]
    if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (ch === "," && !q) { cells.push(cur); cur = "" } else cur += ch
  }
  cells.push(cur)
  return cells
}

export function toXlsx(text: string): Buffer {
  const wb = XLSX.utils.book_new()
  const blocks = text.startsWith("=== Sheet:") ? text.split(/^=== Sheet: /m).filter(Boolean) : []
  if (!blocks.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(text.split(/\r?\n/).map(parseCsvLine)), "Sheet1")
  for (const block of blocks) {
    const nl = block.indexOf("\n")
    const name = block.slice(0, nl).replace(/ ===$/, "").replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "Sheet"
    const rows = block.slice(nl + 1).split("\n").map(parseCsvLine)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}
