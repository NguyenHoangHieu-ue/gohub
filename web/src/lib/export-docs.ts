// Sinh file Excel (từ SQL, full data) / Word (từ markdown) — dùng chung cho Gấu Pro
// (/api/creator-ai/export) và Bé Gấu (/api/chat/export). Tách từ creator-ai/export/route.ts (s192+1)
// khi thêm xuất file cho Bé Gấu, tránh chép lại logic docx/xlsx.

import { queryAnalytics }             from "@/lib/analytics-db"
import {
  Document, Packer, Paragraph,
  AlignmentType, Header, Footer,
  NumberFormat, PageNumber, TextRun,
} from "docx"
import { markdownToDocx } from "@/lib/docx-markdown"

function safeFilename(title: string | undefined, fallback: string, ext: string): string {
  const base = (title || fallback).replace(/[^a-z0-9À-ɏḀ-ỿ]+/gi, "_")
  return `${base}_${new Date().toISOString().slice(0, 10)}.${ext}`
}

// Xuất Excel FULL data từ 1 câu SELECT/WITH — chạy lại server-side để không giới hạn 200 dòng
// như bảng ```csv model tự gõ (dễ cắt/sai khi copy lại thủ công).
export async function buildXlsxFromSql(sql: string, title?: string): Promise<{ buffer: Uint8Array; filename: string; rowCount: number }> {
  const norm = (sql || "").trim().toLowerCase()
  if (!norm.startsWith("select") && !norm.startsWith("with")) throw new Error("Only SELECT/WITH queries allowed")
  if (sql.includes(";") && sql.split(";").filter(s => s.trim()).length > 1) throw new Error("Multiple statements not allowed")

  const rows = await queryAnalytics<Record<string, unknown>>(sql)
  const XLSX = await import("xlsx")
  const ws   = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "(no data)": "" }])
  const wb   = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Data")
  const buf  = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
  return { buffer: new Uint8Array(buf), filename: safeFilename(title, "export", "xlsx"), rowCount: rows.length }
}

// Xuất Word (.docx) từ markdown — cùng style (Times New Roman, header/footer GoHub Intel) cho mọi agent.
export async function buildDocxFromMarkdown(markdown: string, title?: string): Promise<{ buffer: Uint8Array; filename: string }> {
  const elements = markdownToDocx(markdown, title)

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 24, color: "000000" },
          paragraph: { spacing: { line: 360 } },
        },
      },
    },
    numbering: {
      config: [{
        reference: "default-numbering",
        levels: [{ level: 0, format: NumberFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT }],
      }],
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }, // 2.54cm margins
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({ text: (title || "Report") + "  ", font: "Times New Roman", size: 18, color: "666666" })],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: "GoHub Intel — Trang ", font: "Times New Roman", size: 18, color: "999999" }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Times New Roman", size: 18, color: "999999" }),
              new TextRun({ text: "/", font: "Times New Roman", size: 18, color: "999999" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Times New Roman", size: 18, color: "999999" }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children: elements,
    }],
  })

  const nodeBuffer = await Packer.toBuffer(doc)
  const uint8 = new Uint8Array(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength)
  return { buffer: uint8, filename: safeFilename(title, "report", "docx") }
}
