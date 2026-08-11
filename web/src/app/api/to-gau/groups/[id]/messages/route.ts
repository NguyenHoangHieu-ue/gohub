import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

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

  let query = supabaseAdmin
    .from("chat_messages")
    .select("id, group_id, sender_email, sender_name, content, msg_type, attachments, reply_to, is_pinned, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (before) {
    // Cursor: lấy tin trước cursor (for pagination)
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
      group_id:    id,
      sender_email: email,
      sender_name: name,
      content:     content || "",
      msg_type:    msgType,
      attachments: attachments.length > 0 ? attachments : [],
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
