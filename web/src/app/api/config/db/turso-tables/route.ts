import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { tursoQuery, tursoConfigured } from "@/lib/turso"

// Creator/admin: liệt kê toàn bộ bảng trong Turso (sqlite_master) + số dòng mỗi bảng.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !["creator", "admin"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!tursoConfigured()) {
    return NextResponse.json({ error: "TURSO_URL / TURSO_AUTH_TOKEN chưa cấu hình" }, { status: 500 })
  }

  try {
    const rows = await tursoQuery<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    const tables = rows.map(r => r.name as string).filter(Boolean)
    return NextResponse.json({ tables })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
