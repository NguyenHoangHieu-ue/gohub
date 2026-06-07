import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

// GET /api/chat/conversations — list conversations for current user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("id,title,created_at,updated_at")
    .eq("username", username)
    .order("updated_at", { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/chat/conversations — create new conversation
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { title } = await req.json().catch(() => ({}))
  const username   = session.user.name!

  const { data, error } = await supabaseAdmin
    .from("conversations")
    .insert({ username, title: title || "Cuộc trò chuyện mới" })
    .select("id,title,created_at,updated_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
