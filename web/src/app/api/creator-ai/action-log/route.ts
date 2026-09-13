import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { supabaseAdmin }             from "@/lib/supabase"

// Nhật ký hành động Gấu Pro (s196+6) — chỉ creator xem được (oversight toàn bộ user, không phải
// dữ liệu của riêng người gọi).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== "creator") {
    return NextResponse.json({ error: "Chỉ creator được xem nhật ký hành động" }, { status: 403 })
  }

  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 1), 300)
  const { data, error } = await supabaseAdmin
    .from("gp_action_log")
    .select("id,username,tool_name,args,ok,summary,created_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data || [] })
}
