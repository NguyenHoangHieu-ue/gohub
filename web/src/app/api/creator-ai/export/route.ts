import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { getDbRole }                  from "@/lib/db-role"
import { buildXlsxFromSql, buildDocxFromMarkdown } from "@/lib/export-docs"

// Creator AI export endpoint — Word (.docx) + Excel (từ SQL) generation
// PDF is generated client-side (html2canvas + jsPDF); Word/Excel cần server.
// Sinh file dùng chung với Bé Gấu (/api/chat/export) — xem web/src/lib/export-docs.ts.

async function requireAccess() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const role = await getDbRole(session.user.username)
  if (role === "creator") return session
  // Also allow gp_allowed_users (checked in chat route, but for export we check role only)
  if (!["creator", "admin"].includes(role)) throw new Error("Forbidden")
  return session
}

export async function POST(req: NextRequest) {
  try {
    await requireAccess()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  const { markdown, title, format = "docx", sql } = await req.json()

  if (format === "xlsx") {
    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ error: "sql required for xlsx export" }, { status: 400 })
    }
    try {
      const { buffer, filename, rowCount } = await buildXlsxFromSql(sql, title)
      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "X-Row-Count": String(rowCount),
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

  try {
    const { buffer, filename } = await buildDocxFromMarkdown(markdown, title)
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
