import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// Trace các lượt chạy Gấu Pro (G2, bảng gp_runs) — chỉ creator xem (giám sát mọi user, như Nhật ký hành động).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== "creator") return NextResponse.json({ error: "Chỉ creator" }, { status: 403 })
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 1), 200)
  const { data, error } = await supabaseAdmin.from("gp_runs")
    .select("id,username,channel,question,steps,skills,tokens_in,tokens_out,duration_ms,outcome,created_at")
    .order("created_at", { ascending: false }).limit(limit)
  if (error) return NextResponse.json({ error: error.message, rows: [] }, { status: 200 })
  return NextResponse.json({ rows: data ?? [] })
}
