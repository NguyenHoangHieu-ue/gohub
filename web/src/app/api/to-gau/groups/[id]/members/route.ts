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

  const { data, error } = await supabaseAdmin
    .from("chat_group_members")
    .select("id, user_email, user_name, role, added_by, added_at")
    .eq("group_id", id)
    .order("added_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role       = session.user.role  || ""
  const addedBy    = session.user.email || ""
  if (!isPrivileged(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = params
  const body   = await req.json()
  const { user_email, user_name } = body

  if (!user_email?.trim()) return NextResponse.json({ error: "user_email required" }, { status: 400 })

  // Lookup user_name from Supabase users table if not provided
  let resolvedName = user_name || null
  if (!resolvedName) {
    const { data: u } = await supabaseAdmin
      .from("users")
      .select("name")
      .eq("email", user_email.trim())
      .maybeSingle()
    resolvedName = u?.name ?? user_email.trim()
  }

  const { data, error } = await supabaseAdmin
    .from("chat_group_members")
    .insert({ group_id: id, user_email: user_email.trim(), user_name: resolvedName, added_by: addedBy })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role || ""
  if (!isPrivileged(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = params
  const email  = req.nextUrl.searchParams.get("email")
  if (!email) return NextResponse.json({ error: "email query param required" }, { status: 400 })

  const { error } = await supabaseAdmin
    .from("chat_group_members")
    .delete()
    .eq("group_id", id)
    .eq("user_email", email)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
