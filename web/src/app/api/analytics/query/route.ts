import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"

// Endpoint query chung cho các trang Analytics (port "y hệt" gohub-intel /api/query).
// Bảo mật: chỉ role analytics, CHỈ SELECT/WITH/EXPLAIN, không multi-statement, read-only trên gohub_dw.
// Trả về MẢNG rows trực tiếp (khớp cách intel component đọc: data.map(...)).
//
// Lưu ý: role-filters (giới hạn dòng theo role) KHÔNG thể auto-áp cho SQL tùy ý — cùng giới hạn như
// intel. Quyền truy cập trang đã được enforce ở analytics/layout.tsx; endpoint này gate theo role.

const ANALYTICS_ROLES = new Set(["admin", "bod", "staff"])
const ALLOWED = /^\s*(SELECT|WITH|EXPLAIN)\b/i
const BLOCKED = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY|VACUUM|ANALYZE)\b/i

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ANALYTICS_ROLES.has(session.user?.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { sql } = await req.json()
  if (!sql?.trim()) return NextResponse.json({ error: "SQL is required" }, { status: 400 })

  const trimmed = sql.trim()
  if (!ALLOWED.test(trimmed)) {
    return NextResponse.json({ error: "Chỉ cho phép SELECT / WITH / EXPLAIN" }, { status: 400 })
  }
  if (BLOCKED.test(trimmed)) {
    return NextResponse.json({ error: "Câu lệnh không được phép" }, { status: 400 })
  }
  // Chặn multi-statement (cho phép 1 dấu ; ở cuối)
  if (trimmed.replace(/;\s*$/, "").includes(";")) {
    return NextResponse.json({ error: "Không cho phép nhiều câu lệnh" }, { status: 400 })
  }

  try {
    const rows = await queryAnalytics(trimmed)
    return NextResponse.json(rows)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
