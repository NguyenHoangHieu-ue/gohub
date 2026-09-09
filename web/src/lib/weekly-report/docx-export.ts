import {
  Document, Packer, Paragraph, AlignmentType, Header, Footer,
  NumberFormat, PageNumber, TextRun,
} from "docx"
import { markdownToDocx } from "@/lib/docx-markdown"
import type { ReportContent } from "./report-content"

export async function buildWeeklyReportDocx(content: ReportContent): Promise<Buffer> {
  const elements = markdownToDocx(content.markdown, content.title, content.images)

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
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({ text: "Company Weekly Performance  ", font: "Times New Roman", size: 18, color: "666666" })],
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
  return Buffer.from(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength)
}
