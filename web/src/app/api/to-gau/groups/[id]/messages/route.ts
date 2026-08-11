import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"
import { sendLarkDM }               from "@/lib/lark"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

async function isMember(groupId: string, email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_email", email)
    .maybeSingle()
  return !!data
}

// Fire-and-forget: gửi Lark DM cho các member khi có tin nhắn mới
async function notifyLarkMembers(
  groupId: string,
  msg: { sender_name: string; content: string; msg_type: string },
  senderEmail: string,
) {
  // 1. Lấy group info
  const { data: group } = await supabaseAdmin
    .from("chat_groups")
    .select("name, avatar_emoji, notify_lark")
    .eq("id", groupId)
    .maybeSingle()
  if (!group) return
  // 2. Nếu notify_lark tắt → return sớm
  if (group.notify_lark === false) return

  // 3. Lấy members trừ sender
  const { data: members } = await supabaseAdmin
    .from("chat_group_members")
    .select("user_email")
    .eq("group_id", groupId)
    .neq("user_email", senderEmail)
  if (!members?.length) return

  const emails = members.map(m => m.user_email)

  // 4. JOIN với users table để lấy lark_open_id
  const { data: users } = await supabaseAdmin
    .from("users")
    .select("email, lark_open_id")
    .in("email", emails)
  if (!users?.length) return

  // 5. Tạo preview text
  const isFileMsg = msg.msg_type === "file" || msg.msg_type === "image"
  const preview   = isFileMsg ? "📎 Đã gửi file" : msg.content.slice(0, 80)
  const text      = `[${group.avatar_emoji || "🐻"} ${group.name}] ${msg.sender_name}: ${preview}`

  // 6. Gửi DM cho từng member có lark_open_id
  await Promise.all(
    users
      .filter(u => u.lark_open_id)
      .map(u => sendLarkDM(u.lark_open_id!, text))
  )
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const email = session.user.email || ""
  const role  = session.user.role  || ""
  const { id } = params

  if (!isPrivileged(role) && !(await isMember(id, email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const limitParam  = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10)
  const limit       = Math.min(Math.max(1, limitParam), 200)
  const before      = req.nextUrl.searchParams.get("before")
  const search      = req.nextUrl.searchParams.get("search")
  const pinnedOnly  = req.nextUrl.searchParams.get("pinned") === "true"

  let query = supabaseAdmin
    .from("chat_messages")
    .select("id, group_id, sender_email, sender_name, content, msg_type, attachments, reply_to, is_pinned, created_at")
    .eq("group_id", id)

  if (pinnedOnly) {
    // Chỉ lấy pinned messages, mới nhất trước
    query = query.eq("is_pinned", true).order("created_at", { ascending: false }).limit(limit)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  }

  if (search) {
    // Search mode: ilike filter, trả DESC (mới nhất trước), không reverse
    query = query.ilike("content", `%${search}%`).order("created_at", { ascending: false }).limit(limit)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  }

  // Normal pagination
  query = query.order("created_at", { ascending: false }).limit(limit)

  if (before) {
    const { data: cur } = await supabaseAdmin
      .from("chat_messages")
      .select("created_at")
      .eq("id", before)
      .maybeSingle()
    if (cur) query = query.lt("created_at", cur.created_at)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return ASC (cũ → mới) for display
  const sorted = (data ?? []).reverse()
  return NextResponse.json({ data: sorted })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const email = session.user.email || ""
  const role  = session.user.role  || ""
  const name  = session.user.name  || email
  const { id } = params

  if (!isPrivileged(role) && !(await isMember(id, email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body    = await req.json()
  const content = body.content?.trim() ?? ""
  const attachments: { url: string; name: string; size: number; type: string }[] =
    Array.isArray(body.attachments) ? body.attachments : []

  if (!content && attachments.length === 0) {
    return NextResponse.json({ error: "content or attachments required" }, { status: 400 })
  }

  // Determine msg_type
  let msgType = "text"
  if (attachments.length > 0 && !content) {
    msgType = attachments[0].type.startsWith("image/") ? "image" : "file"
  }

  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .insert({
      group_id:     id,
      sender_email: email,
      sender_name:  name,
      content:      content || "",
      msg_type:     msgType,
      attachments:  attachments.length > 0 ? attachments : [],
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget Lark notification (không block response)
  notifyLarkMembers(id, { sender_name: name, content: content || "", msg_type: msgType }, email).catch(() => {})

  return NextResponse.json({ data }, { status: 201 })
}
