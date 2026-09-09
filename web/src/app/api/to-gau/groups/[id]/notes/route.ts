import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

// NOTE: chat_group_members.user_email / chat_notes.created_by lưu USERNAME, không phải email thật.
async function isMember(groupId: string, username: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_email", username)
    .maybeSingle()
  return !!data
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.username || ""
  const role     = session.user.role     || ""
  const { id } = params

  if (!isPrivileged(role) && !(await isMember(id, username))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from("chat_notes")
    .select("id, group_id, content, created_by, creator_name, is_pinned, created_at, updated_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.username || ""
  const role     = session.user.role     || ""
  const name     = session.user.name     || username
  const { id } = params

  if (!isPrivileged(role) && !(await isMember(id, username))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body    = await req.json()
  const content = (body.content ?? "").trim()
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from("chat_notes")
    .insert({
      group_id:     id,
      content,
      created_by:   username,
      creator_name: name,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.username || ""
  const role      = session.user.role     || ""
  const { id }  = params
  const noteId  = req.nextUrl.searchParams.get("note_id")

  if (!noteId) return NextResponse.json({ error: "note_id required" }, { status: 400 })

  // Fetch note to check ownership
  const { data: note, error: fetchErr } = await supabaseAdmin
    .from("chat_notes")
    .select("id, group_id, created_by")
    .eq("id", noteId)
    .eq("group_id", id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!note)    return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (note.created_by !== username && !isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body    = await req.json()
  const content = (body.content ?? "").trim()
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from("chat_notes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.username || ""
  const role      = session.user.role     || ""
  const { id }  = params
  const noteId  = req.nextUrl.searchParams.get("note_id")

  if (!noteId) return NextResponse.json({ error: "note_id required" }, { status: 400 })

  const { data: note, error: fetchErr } = await supabaseAdmin
    .from("chat_notes")
    .select("id, group_id, created_by")
    .eq("id", noteId)
    .eq("group_id", id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!note)    return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (note.created_by !== username && !isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from("chat_notes").delete().eq("id", noteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
