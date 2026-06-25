import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

async function getUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) return null
  return { username: session.user.username, role: session.user.role as string }
}

// GET — lấy notes của mình (hoặc của user khác nếu là admin)
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const targetUser = req.nextUrl.searchParams.get("username")
  const isAdmin = user.role === "admin" || user.role === "creator"

  // Nếu yêu cầu xem notes của người khác, phải là admin
  const queryUsername = (targetUser && isAdmin) ? targetUser : user.username

  const { data, error } = await supabaseAdmin
    .from("user_notes")
    .select("*")
    .eq("username", queryUsername)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST — tạo note mới
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { title, content } = await req.json()
  const { data, error } = await supabaseAdmin
    .from("user_notes")
    .insert({ username: user.username, title: title || "Untitled", content: content || "" })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
