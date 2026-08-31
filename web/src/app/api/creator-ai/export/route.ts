import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { getDbRole }                  from "@/lib/db-role"
import { queryAnalytics }             from "@/lib/analytics-db"
import {
  Document, Packer, Paragraph, Table,
  AlignmentType, Header, Footer,
  NumberFormat, PageNumber, TextRun,
} from "docx"
import { markdownToDocx } from "@/lib/docx-markdown"

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

// ─── Route handler ────────────────────────────────────────────────────────────
// Markdown → docx converter dùng chung: xem web/src/lib/docx-markdown.ts

export async function POST(req: NextRequest) {
  try {
    await requireAccess()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  const { markdown, title, format = "docx", sql } = await req.json()

  // ── Excel export từ SQL (FULL data — không giới hạn 200 dòng như ```csv của model) ──
  // Model chỉ thấy 200 dòng đầu; để xuất ĐỦ + đúng số, chạy lại chính câu SELECT server-side.
  if (format === "xlsx") {
    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ error: "sql required for xlsx export" }, { status: 400 })
    }
    const norm = sql.trim().toLowerCase()
    if (!norm.startsWith("select") && !norm.startsWith("with")) {
      return NextResponse.json({ error: "Only SELECT/WITH queries allowed" }, { status: 400 })
    }
    if (sql.includes(";") && sql.split(";").filter(s => s.trim()).length > 1) {
      return NextResponse.json({ error: "Multiple statements not allowed" }, { status: 400 })
    }
    try {
      const rows = await queryAnalytics<Record<string, unknown>>(sql)
      const XLSX = await import("xlsx")
      const ws   = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "(no data)": "" }])
      const wb   = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Data")
      const buf  = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
      const fname = `${(title || "export").replace(/[^a-z0-9À-ɏḀ-ỿ]+/gi, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`
      return new NextResponse(new Uint8Array(buf) as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
          "X-Row-Count": String(rows.length),
        },
      })
    } catch (e: any) {
      return NextResponse.json({ error: `SQL export failed: ${e.message}` }, { status: 400 })
    }
  }

  if (!markdown) return NextResponse.json({ error: "markdown required" }, { status: 400 })

  if (format !== "docx") {
    return NextResponse.json({ error: "Only docx/xlsx formats are supported via this endpoint. PDF is generated client-side." }, { status: 400 })
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
