import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { checkRateLimit }            from "@/lib/rate-limit"
import { buildXlsxFromSql, buildDocxFromMarkdown } from "@/lib/export-docs"

// Xuất file cho Bé Gấu (Excel full từ SQL / Word từ markdown) — mở cho MỌI role đã đăng nhập
// (khác /api/creator-ai/export chỉ admin/creator), vì Bé Gấu phục vụ cả công ty. Cùng mức tin cậy đã có
// sẵn ở tool executeSQL của Bé Gấu (mọi role đã gọi được SELECT tuỳ ý qua chat — export không mở thêm
// quyền mới, chỉ thêm cách tải kết quả đầy đủ). PDF vẫn sinh client-side (html2canvas + jsPDF), không
// qua route này.

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rlKey = `chat-export:${(session.user as any).username || session.user.email || "anon"}`
  const rl = await checkRateLimit(rlKey, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu xuất file. Vui lòng chờ ${Math.ceil(rl.resetMs / 1000)}s.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    )
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
