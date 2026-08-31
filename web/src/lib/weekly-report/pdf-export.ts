// Markdown (rút gọn, cùng cú pháp report-content.ts sinh ra) → PDF, vẽ trực tiếp bằng jsPDF — chạy được
// thuần Node (đã verify: text + addImage hoạt động không cần canvas/DOM). Chỉ hỗ trợ đúng tập cú pháp Weekly
// Report cần: heading #/##, hr ---, bullet -, table |...|, ảnh ![[IMG:key]], đoạn văn có **bold**.
import { jsPDF } from "jspdf"
import type { ReportContent } from "./report-content"

const MARGIN = 40
const PAGE_W = 595.28  // A4 pt
const PAGE_H = 841.89
const CONTENT_W = PAGE_W - MARGIN * 2
const BRAND: [number, number, number] = [15, 76, 129] // #0f4c81

function stripBold(text: string): { text: string; bold: boolean }[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.filter(Boolean).map(p => {
    if (/^\*\*/.test(p)) return { text: p.slice(2, -2), bold: true }
    return { text: p.replace(/\*([^*]+)\*/g, "$1"), bold: false }
  })
}

export async function buildWeeklyReportPdf(content: ReportContent): Promise<Buffer> {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  let y = MARGIN

  const ensureSpace = (h: number) => {
    if (y + h > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN }
  }

  const drawRichLine = (text: string, x: number, fontSize: number, maxWidth: number): number => {
    doc.setFontSize(fontSize)
    const segments = stripBold(text)
    // Đo tổng để wrap thủ công theo từ (đơn giản hoá: nối lại rồi splitTextToSize theo plain text, sau đó
    // vẽ lại từng dòng đã wrap với style bold áp cho ĐOẠN gốc — chấp nhận bold không tách chính xác giữa dòng
    // wrap, đổi lại code đơn giản, đủ dùng cho báo cáo ngắn từng dòng).
    const plain = segments.map(s => s.text).join("")
    const lines: string[] = doc.splitTextToSize(plain, maxWidth)
    let cursorY = y
    lines.forEach(line => {
      ensureSpace(fontSize * 1.4)
      cursorY = y
      let cx = x
      // Vẽ lại line theo segment gốc (khớp gần đúng vì lines thường = segment liền mạch với báo cáo ngắn)
      let remaining = line
      for (const seg of segments) {
        if (!remaining) break
        const take = seg.text.length <= remaining.length && remaining.startsWith(seg.text) ? seg.text : remaining
        doc.setFont("helvetica", seg.bold ? "bold" : "normal")
        doc.text(take, cx, cursorY)
        cx += doc.getTextWidth(take)
        remaining = remaining.slice(take.length)
      }
      if (remaining) { doc.setFont("helvetica", "normal"); doc.text(remaining, cx, cursorY) }
      y += fontSize * 1.4
    })
    return cursorY
  }

  const addHeading = (level: number, text: string) => {
    const size = level === 1 ? 18 : level === 2 ? 15 : 12
    ensureSpace(size * 2)
    y += 8
    doc.setTextColor(...BRAND)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(size)
    doc.text(text, MARGIN, y)
    y += size * 0.9
    doc.setTextColor(20, 20, 20)
    if (level <= 2) {
      doc.setDrawColor(220, 220, 220)
      doc.line(MARGIN, y, PAGE_W - MARGIN, y)
      y += 10
    }
  }

  const addParagraph = (text: string, opts: { size?: number; color?: [number, number, number] } = {}) => {
    doc.setTextColor(...(opts.color || [20, 20, 20]))
    drawRichLine(text, MARGIN, opts.size || 10.5, CONTENT_W)
    y += 4
  }

  const addBullet = (text: string) => {
    doc.setTextColor(20, 20, 20)
    drawRichLine("•  " + text, MARGIN + 6, 10, CONTENT_W - 6)
  }

  const addHr = () => {
    ensureSpace(16)
    y += 6
    doc.setDrawColor(200, 200, 200)
    doc.line(MARGIN, y, PAGE_W - MARGIN, y)
    y += 12
  }

  const addTable = (rows: string[][]) => {
    if (!rows.length) return
    const cols = rows[0].length
    const colW = CONTENT_W / cols
    const rowH = 20
    rows.forEach((row, ri) => {
      ensureSpace(rowH)
      if (ri === 0) { doc.setFillColor(232, 232, 232) } else { doc.setFillColor(255, 255, 255) }
      doc.rect(MARGIN, y - 13, CONTENT_W, rowH, "F")
      doc.setDrawColor(210, 210, 210)
      doc.rect(MARGIN, y - 13, CONTENT_W, rowH)
      doc.setFont("helvetica", ri === 0 ? "bold" : "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(20, 20, 20)
      row.forEach((cell, ci) => {
        const cx = MARGIN + ci * colW + 4
        doc.line(MARGIN + ci * colW, y - 13, MARGIN + ci * colW, y + 7)
        const txt = doc.splitTextToSize(cell.replace(/\*\*/g, ""), colW - 8)[0] || ""
        doc.text(txt, cx, y)
      })
      y += rowH
    })
    y += 8
  }

  const addImage = (key: string) => {
    const img = content.images[key]
    if (!img) return
    const w = Math.min(CONTENT_W, img.width)
    const h = img.height * (w / img.width)
    ensureSpace(h + 12)
    doc.addImage(img.buffer, "PNG", MARGIN, y, w, h)
    y += h + 14
  }

  // Title page header
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.setTextColor(...BRAND)
  doc.text(content.title, MARGIN, y)
  y += 26
  doc.setFont("helvetica", "italic")
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(`Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}`, MARGIN, y)
  y += 20

  const lines = content.markdown.split("\n")
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const imgMatch = line.trim().match(/^!\[\[IMG:([\w.-]+)\]\]$/)
    if (imgMatch) { addImage(imgMatch[1]); i++; continue }

    if (/^#{1,6}\s/.test(line)) {
      const level = (line.match(/^(#+)/) || ["", ""])[1].length
      addHeading(level, line.replace(/^#+\s*/, ""))
      i++; continue
    }

    if (/^---+$/.test(line.trim())) { addHr(); i++; continue }

    if (line.includes("|") && /^\|/.test(line.trim())) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].includes("|")) {
        if (!/^[\s|:-]+$/.test(lines[i])) tableLines.push(lines[i])
        i++
      }
      const rows = tableLines.map(row => row.split("|").filter((_, ci, arr) => ci > 0 && ci < arr.length - 1).map(c => c.trim()))
      addTable(rows)
      continue
    }

    if (/^[-*]\s/.test(line)) { addBullet(line.replace(/^[-*]\s*/, "")); i++; continue }

    addParagraph(line)
    i++
  }

  const out = doc.output("arraybuffer")
  return Buffer.from(out)
}
