import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"

const ALLOWED = /^\s*(SELECT|WITH|EXPLAIN)\b/i
const BLOCKED  = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY|VACUUM|ANALYZE)\b/i

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user?.role !== "admin") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })

  const { query } = await req.json()
  if (!query?.trim()) return NextResponse.json({ error: "Query is required" }, { status: 400 })

  if (!ALLOWED.test(query.trim())) {
    return NextResponse.json({ error: "Chỉ cho phép câu lệnh SELECT / WITH / EXPLAIN" }, { status: 400 })
  }
  if (BLOCKED.test(query)) {
    return NextResponse.json({ error: "Câu lệnh này không được phép" }, { status: 400 })
  }

  try {
    const rows = await queryAnalytics(query)
    return NextResponse.json({ rows, rowCount: rows.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
