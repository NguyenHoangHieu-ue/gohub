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

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const email = session.user.email || ""
  const role  = session.user.role  || ""
  const { id } = params

  if (!isPrivileged(role) && !(await isMember(id, email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: group, error } = await supabaseAdmin
    .from("chat_groups")
    .select("*")
    .eq("id", id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const { data: members } = await supabaseAdmin
    .from("chat_group_members")
    .select("id, user_email, user_name, role, added_at")
    .eq("group_id", id)
    .order("added_at", { ascending: true })

  // Return current user's member role for manager permission check (#2)
  const myMember = (members ?? []).find(m => m.user_email === email)
  const my_member_role = myMember?.role ?? null

  return NextResponse.json({ data: { ...group, members: members ?? [], my_member_role } })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role || ""
  if (!isPrivileged(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = params
  const body   = await req.json()
  const allowed = ["name", "description", "avatar_emoji", "ai_enabled", "ai_scope", "notify_lark", "is_archived"]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  const { data, error } = await supabaseAdmin
    .from("chat_groups")
    .update(update)
    .eq("id", id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role || ""
  if (!isPrivileged(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = params
  const { error } = await supabaseAdmin.from("chat_groups").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
