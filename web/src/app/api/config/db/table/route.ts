import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// Creator-only: xem dữ liệu 1 bảng Supabase (read-only, phân trang).
// name validate bằng regex identifier + guard creator → không truy cập bảng tuỳ tiện ngoài ý muốn.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Forbidden — Creator only" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const name   = searchParams.get("name") || ""
  const limit  = Math.min(200, Math.max(1, parseInt(searchParams.get("limit")  || "50", 10)))
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10))

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    return NextResponse.json({ error: "Tên bảng không hợp lệ" }, { status: 400 })
  }

  try {
    const { data, error, count } = await supabaseAdmin
      .from(name)
      .select("*", { count: "exact" })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const columns = data && data.length > 0 ? Object.keys(data[0]) : []
    return NextResponse.json({ rows: data ?? [], columns, count: count ?? 0, limit, offset })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
