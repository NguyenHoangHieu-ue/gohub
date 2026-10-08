import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

type Ctx = { params: { id: string } }

// Bé Gấu lưu hội thoại theo session.user.name, Gấu Pro theo session.user.username (s223 QA: tài khoản có name ≠ username
// mở/xoá hội thoại Gấu Pro bị 404) → chấp nhận cả hai làm chủ sở hữu.
function ownersOf(session: { user: { name?: string | null; username?: string | null } }): string[] {
  return [session.user.name, session.user.username].filter((v): v is string => !!v)
}

// GET /api/chat/conversations/[id] — load messages for a conversation
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const owners = ownersOf(session)

  // Verify ownership
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("id", params.id)
    .in("username", owners)
    .maybeSingle()
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: messages, error } = await supabaseAdmin
    .from("conversation_messages")
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

  const owners = ownersOf(session)
  const body = await req.json()

  // Verify ownership
  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id,title")
    .eq("id", params.id)
    .in("username", owners)
    .maybeSingle()
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { role, content, agent_id, agent_name, isFirst } = body

  // Auto-set title from first user message
  if (isFirst && role === "user" && conv.title === "Cuộc trò chuyện mới") {
    const title = content.slice(0, 50) + (content.length > 50 ? "…" : "")
    await supabaseAdmin.from("conversations").update({ title }).eq("id", params.id)
  }

  const { error } = await supabaseAdmin
    .from("conversation_messages")
    .insert({ conversation_id: params.id, role, content, agent_id: agent_id ?? null, agent_name: agent_name ?? null })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Lịch sử xếp/nhóm theo updated_at (U4 phát hiện: trước không cập nhật → cuộc vừa chat vẫn nằm ở "Cũ hơn").
  await supabaseAdmin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", params.id)
  return NextResponse.json({ ok: true })
}

// DELETE /api/chat/conversations/[id] — delete conversation
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const owners = ownersOf(session)

  const { error } = await supabaseAdmin
    .from("conversations")
    .delete()
    .eq("id", params.id)
    .in("username", owners)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
