import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// Cột nhạy cảm: giá trị bị che trước khi trả xuống browser (hash mật khẩu, token, secret...).
const SENSITIVE = /(?:password|secret|token|api[_-]?key|service[_-]?key|private[_-]?key)/i
const HIDDEN = "‹hidden›"

// Creator-only: xem dữ liệu 1 bảng Supabase (read-only, phân trang).
// name validate bằng regex identifier + guard creator → không truy cập bảng tuỳ tiện ngoài ý muốn.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Forbidden — Creator only" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const name    = searchParams.get("name") || ""
  const limRaw  = parseInt(searchParams.get("limit")  || "50", 10)
  const offRaw  = parseInt(searchParams.get("offset") || "0", 10)
  const limit   = Number.isFinite(limRaw) ? Math.min(200, Math.max(1, limRaw)) : 50
  const offset  = Number.isFinite(offRaw) ? Math.max(0, offRaw) : 0

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return NextResponse.json({ error: "Tên bảng không hợp lệ" }, { status: 400 })
  }

  try {
    // Chỉ đếm exact ở trang đầu (offset 0) — trang sau bỏ count để không quét COUNT(*) toàn bảng mỗi lần lật.
    const withCount = offset === 0
    const query = withCount
      ? supabaseAdmin.from(name).select("*", { count: "exact" })
      : supabaseAdmin.from(name).select("*")
    const { data, error, count } = await query.range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const columns = data && data.length > 0 ? Object.keys(data[0]) : []
    const sensitiveCols = columns.filter(c => SENSITIVE.test(c))
    const rows = sensitiveCols.length === 0
      ? (data ?? [])
      : (data ?? []).map(row => {
          const clone: Record<string, any> = { ...row }
          for (const c of sensitiveCols) if (clone[c] != null) clone[c] = HIDDEN
          return clone
        })

    // count null khi offset > 0 → FE giữ count từ trang đầu.
    return NextResponse.json({ rows, columns, count: withCount ? (count ?? 0) : null, limit, offset })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
