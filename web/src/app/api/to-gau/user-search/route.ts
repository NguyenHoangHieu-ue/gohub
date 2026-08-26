import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

// GET /api/to-gau/user-search?q= — gợi ý user khi thêm thành viên (#3)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 1) return NextResponse.json({ data: [] })

  // Tìm theo email/tên/username — nhiều tài khoản Lark không có email nên phải cho tìm cả theo tên/username
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("username, email, name")
    .or(`email.ilike.%${q}%,name.ilike.%${q}%,username.ilike.%${q}%`)
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
