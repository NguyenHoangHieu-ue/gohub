import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { cachedAnalyticsQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"
import { checkRateLimit } from "@/lib/rate-limit"

// Endpoint query chung cho các trang Analytics (port "y hệt" gohub-intel /api/query).
// Bảo mật: chỉ role analytics, CHỈ SELECT/WITH/EXPLAIN, không multi-statement, read-only trên gohub_dw.
// Trả về MẢNG rows trực tiếp (khớp cách intel component đọc: data.map(...)).
//
// Lưu ý: role-filters (giới hạn dòng theo role) KHÔNG thể auto-áp cho SQL tùy ý — cùng giới hạn như
// intel. Quyền truy cập trang đã được enforce ở analytics/layout.tsx; endpoint này gate theo role.

const ANALYTICS_ROLES = new Set(["admin", "creator", "manager", "bod", "staff", "b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"])
const ALLOWED = /^\s*(SELECT|WITH|EXPLAIN)\b/i
const BLOCKED = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY|VACUUM|ANALYZE)\b/i

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!ANALYTICS_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit: 60 req/min/user (khuyến nghị operations-runbook §7 — endpoint dùng chung mọi tab BI,
  // đa số cache hit nên hạn mức cao hơn chat, chỉ chặn khi thật sự bất thường).
  const rlKey = `analytics-query:${(session.user as any).username || session.user.email || "anon"}`
  const rl = await checkRateLimit(rlKey, 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Quá nhiều truy vấn. Vui lòng chờ ${Math.ceil(rl.resetMs / 1000)}s.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
    )
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
    // Cache 2 tầng (L1 in-memory + L2 Supabase, TTL 12h) theo nội dung SQL. Data gohub_dw update
    // 1 lần/ngày → mỗi trang nặng (bod/products/vendors/website... 10-18 query) chỉ đập DB lần đầu
    // trong ngày, sau đó lấy cache. SQL được ghi registry để cron prewarm làm tươi. Read-only nên an toàn.
    const rows = await cachedAnalyticsQuery(trimmed)
    return NextResponse.json(rows, { headers: CACHE_HEADERS })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
