import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

type Ctx = { params: { id: string } }

// GET /api/chat/conversations/[id] — load messages for a conversation
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!

  // Verify ownership
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("id", params.id)
    .eq("username", username)
    .maybeSingle()
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: messages, error } = await supabaseAdmin
    .from("chat_messages")
    .select("id,role,content,agent_id,agent_name,created_at")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(messages ?? [])
}

// POST /api/chat/conversations/[id] — save a message
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!
  const body = await req.json()

  // Verify ownership
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id,title")
    .eq("id", params.id)
    .eq("username", username)
    .maybeSingle()
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { role, content, agent_id, agent_name, isFirst } = body

  // Auto-set title from first user message
  if (isFirst && role === "user" && conv.title === "Cuộc trò chuyện mới") {
    const title = content.slice(0, 50) + (content.length > 50 ? "…" : "")
    await supabaseAdmin.from("conversations").update({ title }).eq("id", params.id)
  }

  const { error } = await supabaseAdmin
    .from("chat_messages")
    .insert({ conversation_id: params.id, role, content, agent_id: agent_id ?? null, agent_name: agent_name ?? null })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/chat/conversations/[id] — delete conversation
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!

  const { error } = await supabaseAdmin
    .from("conversations")
    .delete()
    .eq("id", params.id)
    .eq("username", username)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
