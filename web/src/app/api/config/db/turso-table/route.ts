import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { tursoQuery, tursoConfigured } from "@/lib/turso"

const SENSITIVE = /(?:password|secret|token|api[_-]?key|service[_-]?key|private[_-]?key)/i
const HIDDEN = "‹hidden›"

// Creator/admin: xem dữ liệu 1 bảng Turso (read-only, phân trang).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["creator", "admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!tursoConfigured()) {
    return NextResponse.json({ error: "TURSO_URL / TURSO_AUTH_TOKEN chưa cấu hình" }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const name   = searchParams.get("name") || ""
  const limRaw = parseInt(searchParams.get("limit")  || "50", 10)
  const offRaw = parseInt(searchParams.get("offset") || "0",  10)
  const limit  = Number.isFinite(limRaw) ? Math.min(200, Math.max(1, limRaw)) : 50
  const offset = Number.isFinite(offRaw) ? Math.max(0, offRaw) : 0

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return NextResponse.json({ error: "Tên bảng không hợp lệ" }, { status: 400 })
  }

  try {
    const [dataRows, countRows] = await Promise.all([
      tursoQuery<Record<string, any>>(`SELECT * FROM ${name} LIMIT ? OFFSET ?`, [limit, offset]),
      offset === 0
        ? tursoQuery<{ count: number }>(`SELECT COUNT(*) as count FROM ${name}`)
        : Promise.resolve(null),
    ])

    const columns = dataRows.length > 0 ? Object.keys(dataRows[0]) : []
    const sensitiveCols = columns.filter(c => SENSITIVE.test(c))
    const rows = sensitiveCols.length === 0
      ? dataRows
      : dataRows.map(row => {
          const clone: Record<string, any> = { ...row }
          for (const c of sensitiveCols) if (clone[c] != null) clone[c] = HIDDEN
          return clone
        })

    const count = countRows ? (Number((countRows[0] as any)?.count) || 0) : null
    return NextResponse.json({ rows, columns, count, limit, offset })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
