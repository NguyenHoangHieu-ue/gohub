import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// GET — trả về số creator hiện tại + có thể gán creator không
// Admin dùng để quyết định có hiện option "creator" trong dropdown không
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { count } = await supabaseAdmin
    .from("users").select("*", { count: "exact", head: true }).eq("role", "creator")

  const creatorCount = count ?? 0
  return NextResponse.json({
    creatorCount,
    canAssignCreator: creatorCount < 2,   // max 2 creators
    hasCreator: creatorCount > 0,         // ẩn option creator khỏi admin dropdown nếu true
  })
}
