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

  // Escape ký tự đặc biệt trong cú pháp filter PostgREST (,.()"\) — chống filter injection.
  // Bọc value trong dấu ngoặc kép để dấu phẩy/ngoặc đơn của user không bị hiểu thành ranh giới điều kiện.
  const esc = q.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

  // Tìm theo email/tên/username — nhiều tài khoản Lark không có email nên phải cho tìm cả theo tên/username
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("username, email, name")
    .or(`email.ilike."%${esc}%",name.ilike."%${esc}%",username.ilike."%${esc}%"`)
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
