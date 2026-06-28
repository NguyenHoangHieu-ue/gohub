import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS } from "@/lib/analytics-helpers"

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
    // Cache 2 tầng (L1 in-memory 5' + L2 Supabase 10') theo nội dung SQL. Data gohub_dw update
    // 1 lần/ngày (cron) → mỗi trang nặng (bod/products/vendors/website... 10-18 query) chỉ đập DB
    // lần đầu, các lần sau lấy từ cache → giảm round-trip + cold pg-connect. Read-only nên an toàn.
    const key = "q:" + createHash("sha1").update(trimmed).digest("hex")
    const rows = await cachedQuery(key, () => queryAnalytics(trimmed))
    return NextResponse.json(rows, { headers: CACHE_HEADERS })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}
