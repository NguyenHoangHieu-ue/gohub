import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { getDbRole }                  from "@/lib/db-role"
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, Header, Footer,
  NumberFormat, PageNumber,
} from "docx"

// Creator AI export endpoint — Word (.docx) generation
// PDF is generated client-side (html2canvas + jsPDF); Word needs server for proper encoding

async function requireAccess() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const role = await getDbRole(session.user.username)
  if (role === "creator") return session
  // Also allow gp_allowed_users (checked in chat route, but for export we check role only)
  if (!["creator", "admin"].includes(role)) throw new Error("Forbidden")
  return session
}

// ─── Markdown → docx paragraph converter ─────────────────────────────────────

function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = []
  // Bold: **text** or __text__
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

function markdownToDocx(markdown: string, title?: string): (Paragraph | Table)[] {
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

    // Skip empty lines
    if (!line.trim()) { i++; continue }

    // Headings
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

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      elements.push(new Paragraph({
        children: [new TextRun({ text: "" })],
        border: { bottom: { color: "999999", space: 1, style: BorderStyle.SINGLE, size: 6 } },
        spacing: { before: 200, after: 200 },
      }))
      i++; continue
    }

    // Table detection
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

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      elements.push(new Paragraph({
        children: parseInline("• " + line.replace(/^[-*+]\s*/, "")),
        indent: { left: 360 },
        spacing: { after: 80 },
      }))
      i++; continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      elements.push(new Paragraph({
        children: parseInline(line),
        indent: { left: 360 },
        spacing: { after: 80 },
      }))
      i++; continue
    }

    // Code block
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

    // Normal paragraph
    elements.push(new Paragraph({
      children: parseInline(line),
      spacing: { after: 120 },
    }))
    i++
  }

  return elements
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireAccess()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  const { markdown, title, format = "docx" } = await req.json()
  if (!markdown) return NextResponse.json({ error: "markdown required" }, { status: 400 })

  if (format !== "docx") {
    return NextResponse.json({ error: "Only docx format is supported via this endpoint. PDF is generated client-side." }, { status: 400 })
  }

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
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 2.54cm margins
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: (title || "Gấu Pro Report") + "  ", font: "Times New Roman", size: 18, color: "666666" }),
            ],
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
  const uint8      = new Uint8Array(nodeBuffer.buffer, nodeBuffer.byteOffset, nodeBuffer.byteLength)
  const filename = `${(title || "report").replace(/[^a-z0-9À-ɏḀ-ỿ]+/gi, "_")}_${new Date().toISOString().slice(0, 10)}.docx`

  return new NextResponse(uint8 as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
