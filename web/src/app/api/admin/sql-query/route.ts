import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { canWrite } from "@/lib/writable-tabs"
import { checkRateLimit } from "@/lib/rate-limit"

const ALLOWED = /^\s*(SELECT|WITH|EXPLAIN)\b/i
const BLOCKED  = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY|VACUUM|ANALYZE)\b/i
const WRITE_ROLES = ["admin", "creator"]

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await canWrite(session, "sql", WRITE_ROLES))) return NextResponse.json({ error: "Forbidden — admin/creator only" }, { status: 403 })

  // Rate limit: 30 req/min/user — endpoint chạy query RAW không cache, thẳng vào gohub_dw pool (max=3
  // connection, xem operations-runbook §4/§7 "DB pool exhaustion"). Chặn vòng lặp/script chạy nhầm liên
  // tục hơn là chặn người dùng bình thường (admin/creator vốn đã ít).
  const rlKey = `admin-sql:${(session.user as any).username || session.user.email || "anon"}`
  const rl = await checkRateLimit(rlKey, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Quá nhiều truy vấn. Vui lòng chờ ${Math.ceil(rl.resetMs / 1000)}s.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    )
  }

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
