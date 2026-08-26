import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

// NOTE: chat_group_members.user_email / chat_messages.sender_email lưu USERNAME, không phải email thật.
async function getMemberRole(groupId: string, username: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_email", username)
    .maybeSingle()
  return data?.role ?? null
}

// PATCH — sửa nội dung hoặc thu hồi tin nhắn (#4)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; msgId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username   = session.user.username || ""
  const role       = session.user.role     || ""
  const { id, msgId } = params

  const { data: msg, error: fetchErr } = await supabaseAdmin
    .from("chat_messages")
    .select("id, sender_email, is_recalled")
    .eq("id", msgId)
    .eq("group_id", id)
    .maybeSingle()
  if (fetchErr || !msg) return NextResponse.json({ error: "Message not found" }, { status: 404 })

  const memberRole       = isPrivileged(role) ? "admin" : await getMemberRole(id, username)
  const isManagerOrAbove = isPrivileged(role) || memberRole === "manager"
  const isAuthor         = msg.sender_email === username

  if (!isAuthor && !isManagerOrAbove) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const update: Record<string, unknown> = {}

  if (body.is_recalled === true) {
    update.is_recalled = true
    update.content     = "Tin nhắn đã được thu hồi"
    update.attachments = []
  } else if ("content" in body) {
    if (!body.content?.trim()) return NextResponse.json({ error: "content cannot be empty" }, { status: 400 })
    update.content   = body.content.trim()
    update.edited_at = new Date().toISOString()
  } else {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .update(update)
    .eq("id", msgId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
