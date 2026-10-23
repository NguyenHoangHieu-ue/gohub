import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { archiveStats, readArchive, ARCHIVE_SOURCES } from "@/lib/log-archive"

export const dynamic = "force-dynamic"

// Creator/admin: thống kê kho lưu trữ log (Turso) hoặc đọc lại dòng cũ: ?src=conversation_messages&ref=<conversation_id> | &from=&to=&limit=
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== "creator" && session.user.role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const p = req.nextUrl.searchParams
  const src = p.get("src")
  try {
    if (!src) return NextResponse.json({ sources: ARCHIVE_SOURCES.map(s => ({ table: s.table, keepDays: s.keepDays })), archived: await archiveStats() })
    if (!ARCHIVE_SOURCES.some(s => s.table === src)) return NextResponse.json({ error: "Nguồn không hợp lệ" }, { status: 400 })
    const rows = await readArchive(src, { ref: p.get("ref") || undefined, from: p.get("from") || undefined, to: p.get("to") || undefined, limit: Number(p.get("limit")) || 200 })
    return NextResponse.json({ rows })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
