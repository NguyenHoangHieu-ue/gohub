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

  const { data, error } = await supabaseAdmin
    .from("chat_docs")
    .select("id, group_id, title, description, file_url, file_name, file_size, file_type, tags, uploaded_by, uploader_name, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
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

  const body = await req.json()
  const title: string = (body.title ?? "").trim()
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from("chat_docs")
    .insert({
      group_id:     id,
      title,
      description:  body.description?.trim() || null,
      file_url:     body.file_url     || null,
      file_name:    body.file_name    || null,
      file_size:    body.file_size    ?? null,
      file_type:    body.file_type    || null,
      tags:         Array.isArray(body.tags) ? body.tags : [],
      uploaded_by:  email,
      uploader_name: name,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const email   = session.user.email || ""
  const role    = session.user.role  || ""
  const { id }  = params
  const docId   = req.nextUrl.searchParams.get("doc_id")

  if (!docId) return NextResponse.json({ error: "doc_id required" }, { status: 400 })

  // Fetch doc to check ownership
  const { data: doc, error: fetchErr } = await supabaseAdmin
    .from("chat_docs")
    .select("id, group_id, uploaded_by")
    .eq("id", docId)
    .eq("group_id", id)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!doc)     return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Only uploader or privileged can delete
  if (doc.uploaded_by !== email && !isPrivileged(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from("chat_docs").delete().eq("id", docId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
