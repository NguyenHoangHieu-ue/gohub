import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

// GET — load 30 messages từ session gần nhất của user (dùng khi mở lại web)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!

  // Tìm session gần nhất
  const { data: recent } = await supabaseAdmin
    .from("chat_history")
    .select("session_id")
    .eq("username", username)
    .order("created_at", { ascending: false })
    .limit(1)

  if (!recent?.length) return NextResponse.json({ messages: [] })

  const { data: messages } = await supabaseAdmin
    .from("chat_history")
    .select("direction,content")
    .eq("session_id", recent[0].session_id)
    .order("created_at", { ascending: true })
    .limit(30)

  return NextResponse.json({
    messages: (messages ?? []).map(m => ({
      role:    m.direction === "user" ? "user" : "assistant",
      content: m.content,
    })),
  })
}

// POST — lưu 1 cặp (user + assistant) sau mỗi lượt chat
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { sessionId, messages } = await req.json()
  if (!sessionId || !Array.isArray(messages) || !messages.length) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const username = session.user.name!
  const userRole = (session.user as any).role || "standard"

  const rows = messages.map((m: { direction: string; content: string }) => ({
    username,
    user_role:  userRole,
    session_id: sessionId,
    direction:  m.direction,
    content:    m.content,
  }))

  await supabaseAdmin.from("chat_history").insert(rows)

  return NextResponse.json({ ok: true })
}
