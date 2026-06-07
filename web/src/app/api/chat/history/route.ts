import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get("mode")
  const targetSid = searchParams.get("session_id")

  // List all sessions — newest first, with first user message as preview
  if (mode === "sessions") {
    const { data } = await supabaseAdmin
      .from("chat_history")
      .select("session_id,content,created_at")
      .eq("username", username)
      .eq("direction", "user")
      .order("created_at", { ascending: true })

    const map = new Map<string, {
      session_id:    string
      first_message: string
      created_at:    string
      message_count: number
    }>()

    for (const row of (data ?? [])) {
      if (!map.has(row.session_id)) {
        map.set(row.session_id, {
          session_id:    row.session_id,
          first_message: (row.content as string).slice(0, 100),
          created_at:    row.created_at,
          message_count: 1,
        })
      } else {
        map.get(row.session_id)!.message_count++
      }
    }

    const sessions = Array.from(map.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 30)

    return NextResponse.json({ sessions })
  }

  // Load messages of a specific session
  if (targetSid) {
    const { data: messages } = await supabaseAdmin
      .from("chat_history")
      .select("direction,content")
      .eq("session_id", targetSid)
      .eq("username", username)
      .order("created_at", { ascending: true })

    return NextResponse.json({
      messages: (messages ?? []).map(m => ({
        role:    m.direction === "user" ? "user" : "assistant",
        content: m.content,
      })),
    })
  }

  return NextResponse.json({ messages: [] })
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
