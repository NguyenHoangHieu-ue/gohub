import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const email = session.user.email || ""
  const role  = session.user.role  || ""

  if (isPrivileged(role)) {
    // creator/admin thấy tất cả groups
    const { data, error } = await supabaseAdmin
      .from("chat_groups")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Bổ sung member_count + last_message
    const enriched = await Promise.all((data ?? []).map(async (g) => {
      const [mc, lm] = await Promise.all([
        supabaseAdmin.from("chat_group_members").select("id", { count: "exact", head: true }).eq("group_id", g.id),
        supabaseAdmin.from("chat_messages").select("content, sender_name, created_at").eq("group_id", g.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      return { ...g, member_count: mc.count ?? 0, last_message: lm.data ?? null }
    }))
    return NextResponse.json({ data: enriched })
  }

  // User thường: chỉ group mình là member
  const { data: memberRows, error: memberErr } = await supabaseAdmin
    .from("chat_group_members")
    .select("group_id")
    .eq("user_email", email)
  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 })

  const groupIds = (memberRows ?? []).map(r => r.group_id)
  if (!groupIds.length) return NextResponse.json({ data: [] })

  const { data: groups, error: groupErr } = await supabaseAdmin
    .from("chat_groups")
    .select("*")
    .in("id", groupIds)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
  if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 })

  const enriched = await Promise.all((groups ?? []).map(async (g) => {
    const [mc, lm] = await Promise.all([
      supabaseAdmin.from("chat_group_members").select("id", { count: "exact", head: true }).eq("group_id", g.id),
      supabaseAdmin.from("chat_messages").select("content, sender_name, created_at").eq("group_id", g.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ])
    return { ...g, member_count: mc.count ?? 0, last_message: lm.data ?? null }
  }))
  return NextResponse.json({ data: enriched })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role  = session.user.role  || ""
  if (!isPrivileged(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const email = session.user.email || ""
  const name  = session.user.name  || ""
  const body  = await req.json()
  const { name: groupName, description, avatar_emoji } = body

  if (!groupName?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })

  const { data: group, error } = await supabaseAdmin
    .from("chat_groups")
    .insert({ name: groupName.trim(), description: description ?? null, avatar_emoji: avatar_emoji ?? "🐻", created_by: email })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-add creator as admin member
  await supabaseAdmin.from("chat_group_members").insert({
    group_id: group.id, user_email: email, user_name: name, role: "admin", added_by: email,
  })

  return NextResponse.json({ data: group }, { status: 201 })
}
