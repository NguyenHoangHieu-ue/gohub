import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

// NOTE: cột chat_group_members.user_email lưu USERNAME (không phải email thật) — xem CLAUDE.md /
// docs/wiki/system/tabs/analytics-to-gau.md §"fix identity". Giữ tên cột cũ để không phải viết migration đổi tên.
async function isMember(groupId: string, username: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_email", username)
    .maybeSingle()
  return !!data
}

async function getMemberRole(groupId: string, username: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_email", username)
    .maybeSingle()
  return data?.role ?? null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.username || ""
  const role     = session.user.role     || ""
  const { id } = params

  if (!isPrivileged(role) && !(await isMember(id, username))) {
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

// POST — thêm thành viên bằng username (không phải email — nhiều tài khoản Lark không có email)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role      = session.user.role     || ""
  const addedBy   = session.user.username || ""
  const { id }    = params

  // Creator/admin hoặc manager của group này được thêm thành viên (#2)
  const memberRole = isPrivileged(role) ? "admin" : await getMemberRole(id, addedBy)
  if (!isPrivileged(role) && memberRole !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const targetUsername: string = (body.username ?? "").trim()
  const bodyName: string | undefined = body.user_name

  if (!targetUsername) return NextResponse.json({ error: "username required" }, { status: 400 })

  let resolvedName = bodyName || null
  if (!resolvedName) {
    const { data: u } = await supabaseAdmin
      .from("users")
      .select("name")
      .eq("username", targetUsername)
      .maybeSingle()
    resolvedName = u?.name ?? targetUsername
  }

  const { data, error } = await supabaseAdmin
    .from("chat_group_members")
    .insert({ group_id: id, user_email: targetUsername, user_name: resolvedName, added_by: addedBy })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// PATCH — đổi role thành viên (creator/admin only) (#2)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role || ""
  if (!isPrivileged(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id }  = params
  const body    = await req.json()
  const { username, role: newRole } = body

  if (!username || !["admin", "manager", "member"].includes(newRole)) {
    return NextResponse.json({ error: "username and valid role (admin/manager/member) required" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("chat_group_members")
    .update({ role: newRole })
    .eq("group_id", id)
    .eq("user_email", username)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role     = session.user.role     || ""
  const username = session.user.username || ""
  const { id }   = params

  // Creator/admin hoặc manager được xóa thành viên (#2)
  const memberRole = isPrivileged(role) ? "admin" : await getMemberRole(id, username)
  if (!isPrivileged(role) && memberRole !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const targetUsername = req.nextUrl.searchParams.get("username")
  if (!targetUsername) return NextResponse.json({ error: "username query param required" }, { status: 400 })

  const { error } = await supabaseAdmin
    .from("chat_group_members")
    .delete()
    .eq("group_id", id)
    .eq("user_email", targetUsername)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
