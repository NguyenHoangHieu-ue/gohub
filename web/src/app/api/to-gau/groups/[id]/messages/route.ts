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

// Parse @mention handles từ content: "@TênHandle" hoặc "@email.prefix"
function parseMentionHandles(content: string): string[] {
  const matches = content.match(/@([\w.]+)/g) ?? []
  return matches.map(m => m.slice(1).toLowerCase())
}

// Fire-and-forget: gửi Lark DM cho các member khi có tin nhắn mới hoặc được @mention
async function notifyLarkMembers(
  groupId: string,
  msg: { sender_name: string; content: string; msg_type: string },
  senderEmail: string,
) {
  // 1. Lấy group info + tất cả members (cần cho mention matching)
  const [{ data: group }, { data: members }] = await Promise.all([
    supabaseAdmin.from("chat_groups").select("name, avatar_emoji, notify_lark").eq("id", groupId).maybeSingle(),
    supabaseAdmin.from("chat_group_members").select("user_email, user_name").eq("group_id", groupId).neq("user_email", senderEmail),
  ])
  if (!group || !members?.length) return

  // 2. Phát hiện @mention → tìm member được nhắc đến
  const handles = parseMentionHandles(msg.content)
  const mentionedEmails = new Set<string>()
  if (handles.length > 0) {
    for (const handle of handles) {
      const matched = members.find(m => {
        const prefix = m.user_email.split("@")[0].toLowerCase()
        const name   = (m.user_name || "").replace(/\s+/g, "").toLowerCase()
        return handle === prefix || (name && handle === name)
      })
      if (matched) mentionedEmails.add(matched.user_email)
    }
  }

  // 3. Xác định danh sách cần notify:
  //    - @mention: luôn gửi cho mentioned users (bất kể notify_lark flag)
  //    - General: gửi cho all members nếu notify_lark không bị tắt
  const generalEmails: string[] = group.notify_lark !== false
    ? members.map(m => m.user_email)
    : []
  const allTargetEmails = [...new Set([...mentionedEmails, ...generalEmails])]
  if (!allTargetEmails.length) return

  // 4. Lấy lark_open_id
  const { data: users } = await supabaseAdmin
    .from("users")
    .select("email, lark_open_id")
    .in("email", allTargetEmails)
  if (!users?.length) return

  // 5. Build text — @mention dùng text khác
  const isFileMsg = msg.msg_type === "file" || msg.msg_type === "image"
  const preview   = isFileMsg ? "📎 Đã gửi file" : msg.content.slice(0, 100)
  const groupTag  = `[${group.avatar_emoji || "🐻"} ${group.name}]`

  await Promise.all(
    users
      .filter(u => u.lark_open_id)
      .map(u => {
        const isMentioned = mentionedEmails.has(u.email)
        const text = isMentioned
          ? `🔔 ${msg.sender_name} đã nhắc đến bạn trong ${groupTag}:\n${preview}`
          : `${groupTag} ${msg.sender_name}: ${preview}`
        return sendLarkDM(u.lark_open_id!, text)
      })
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
