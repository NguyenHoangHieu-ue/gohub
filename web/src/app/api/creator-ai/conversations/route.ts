import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

// Gấu Pro conversations — dùng cùng bảng conversations + chat_messages như Bé Gấu,
// phân biệt bằng agent_id = 'gau_pro'. Title prefix "[GP] " để query hiệu quả.

const GP_PREFIX = "[GP] "

// GET — list 20 Gấu Pro conversations gần nhất
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.username
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("id,title,created_at,updated_at")
    .eq("username", username)
    .like("title", `${GP_PREFIX}%`)
    .order("updated_at", { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Strip prefix from title for display
  const cleaned = (data ?? []).map(c => ({ ...c, title: c.title.replace(GP_PREFIX, "") }))
  return NextResponse.json(cleaned)
}
