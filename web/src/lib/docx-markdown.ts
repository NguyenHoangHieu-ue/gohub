// Markdown → docx converter — DÙNG CHUNG bởi Gấu Pro export (`api/creator-ai/export`) và Weekly Report
// (`api/admin/scheduled-messages/weekly-report`). Tách ra khỏi route để không lặp lại logic khi có nơi
// thứ 2 cần xuất Word (nguyên tắc single-source-of-truth của repo).
import {
  Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  HeadingLevel, AlignmentType, BorderStyle, WidthType,
} from "docx"

export interface DocxImage { buffer: Buffer; width: number; height: number }

// Cỡ ảnh tối đa trong trang (px hiển thị ~96dpi, trang A4 margin 2.54cm còn lại ~624px ngang).
const MAX_IMG_WIDTH = 600

function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = []
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/)
  for (const part of parts) {
    if (!part) continue
    if (/^\*\*/.test(part) || /^__/.test(part)) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, font: "Times New Roman", size: 24 }))
    } else if (/^`/.test(part)) {
      runs.push(new TextRun({ text: part.slice(1, -1), font: "Courier New", size: 20 }))
    } else if (/^\*/.test(part) || /^_/.test(part)) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true, font: "Times New Roman", size: 24 }))
    } else {
      runs.push(new TextRun({ text: part, font: "Times New Roman", size: 24 }))
    }
  }
  return runs.length ? runs : [new TextRun({ text, font: "Times New Roman", size: 24 })]
}

/**
 * Chèn ảnh vào docx qua marker riêng dòng: `![[IMG:<key>]]` — `images[key]` cấp buffer PNG/JPG + kích thước
 * gốc (px) để tự co theo tỷ lệ, không phình quá khổ trang. Marker KHÔNG phải cú pháp Markdown chuẩn (cố tình,
 * tránh đụng `![alt](url)` thường dùng cho ảnh web — ở đây luôn là ảnh nhị phân đã render sẵn server-side).
 */
export function markdownToDocx(
  markdown: string,
  title?: string,
  images: Record<string, DocxImage> = {},
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = []
  const lines = markdown.split("\n")

  if (title) {
    elements.push(new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      run: { font: "Times New Roman", size: 32, bold: true },
    }))
    elements.push(new Paragraph({
      children: [new TextRun({ text: `Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}`, font: "Times New Roman", size: 20, italics: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }))
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { i++; continue }

    // Ảnh — marker ![[IMG:key]]
    const imgMatch = line.trim().match(/^!\[\[IMG:([\w.-]+)\]\]$/)
    if (imgMatch) {
      const img = images[imgMatch[1]]
      if (img) {
        const scale = img.width > MAX_IMG_WIDTH ? MAX_IMG_WIDTH / img.width : 1
        elements.push(new Paragraph({
          children: [new ImageRun({
            data: img.buffer,
            transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) },
            type: "png",
          })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 240 },
        }))
      }
      i++; continue
    }

    if (/^#{1,6}\s/.test(line)) {
      const level = (line.match(/^(#+)/) || ["", ""])[1].length
      const text  = line.replace(/^#+\s*/, "")
      const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5, 6: HeadingLevel.HEADING_6,
      }
      elements.push(new Paragraph({
        children: parseInline(text),
        heading: headingMap[level] || HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 120 },
      }))
      i++; continue
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: "" })],
        border: { bottom: { color: "999999", space: 1, style: BorderStyle.SINGLE, size: 6 } },
        spacing: { before: 200, after: 200 },
      }))
      i++; continue
    }

    if (line.includes("|") && /^\|/.test(line.trim())) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].includes("|")) {
        if (!/^[\s|:-]+$/.test(lines[i])) tableLines.push(lines[i])
        i++
      }
      if (tableLines.length) {
        const rows = tableLines.map(row =>
          row.split("|").filter((_, ci) => ci > 0 && ci < row.split("|").length - 1).map(c => c.trim())
        )
        const maxCols = Math.max(...rows.map(r => r.length))
        const colWidth = Math.floor(9000 / maxCols)
        const tblRows = rows.map((cells, ri) =>
          new TableRow({
            children: Array.from({ length: maxCols }).map((_, ci) => {
              const cellText = cells[ci] || ""
              return new TableCell({
                children: [new Paragraph({
                  children: parseInline(cellText),
                  alignment: AlignmentType.LEFT,
                })],
                width: { size: colWidth, type: WidthType.DXA },
                shading: ri === 0 ? { fill: "E8E8E8" } : undefined,
              })
            }),
          })
        )
        elements.push(new Table({
          rows: tblRows,
          width: { size: 9000, type: WidthType.DXA },
        }))
        elements.push(new Paragraph({ text: "", spacing: { after: 160 } }))
      }
      continue
    }

    if (/^[-*+]\s/.test(line)) {
      elements.push(new Paragraph({
        children: parseInline("• " + line.replace(/^[-*+]\s*/, "")),
        indent: { left: 360 },
        spacing: { after: 80 },
      }))
      i++; continue
    }

    if (/^\d+\.\s/.test(line)) {
      elements.push(new Paragraph({
        children: parseInline(line),
        indent: { left: 360 },
        spacing: { after: 80 },
      }))
      i++; continue
    }

    if (line.startsWith("```")) {
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      if (codeLines.length) {
        elements.push(new Paragraph({
          children: [new TextRun({ text: codeLines.join("\n"), font: "Courier New", size: 18 })],
          shading: { fill: "F5F5F5" },
          border: {
            left:   { color: "CCCCCC", space: 10, style: BorderStyle.SINGLE, size: 4 },
            right:  { color: "CCCCCC", space: 10, style: BorderStyle.SINGLE, size: 4 },
            top:    { color: "CCCCCC", space: 4,  style: BorderStyle.SINGLE, size: 4 },
            bottom: { color: "CCCCCC", space: 4,  style: BorderStyle.SINGLE, size: 4 },
          },
          spacing: { before: 120, after: 120 },
        }))
      }
      i++; continue
    }

    elements.push(new Paragraph({
      children: parseInline(line),
      spacing: { after: 120 },
    }))
    i++
  }

  return elements
}
