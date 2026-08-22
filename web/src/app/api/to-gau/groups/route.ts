import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"

function isPrivileged(role: string) {
  return role === "creator" || role === "admin"
}

// 2 batch queries thay vì N×2 queries; sort theo hoạt động mới nhất
async function enrichBatch(data: Record<string, unknown>[]) {
  if (!data.length) return []
  const ids = data.map(g => g.id as string)

  const [{ data: allMembers }, { data: recentMsgs }] = await Promise.all([
    supabaseAdmin
      .from("chat_group_members")
      .select("group_id")
      .in("group_id", ids),
    supabaseAdmin
      .from("chat_messages")
      .select("group_id, content, sender_name, created_at")
      .in("group_id", ids)
      .order("created_at", { ascending: false })
      .limit(Math.min(ids.length * 5, 100)),
  ])

  // Đếm members per group
  const memberCountMap = new Map<string, number>()
  allMembers?.forEach(m => {
    memberCountMap.set(m.group_id, (memberCountMap.get(m.group_id) ?? 0) + 1)
  })

  // Lấy tin nhắn mới nhất per group (first = newest vì ORDER DESC)
  const lastMsgMap = new Map<string, { content: string; sender_name: string; created_at: string }>()
  recentMsgs?.forEach(m => {
    if (!lastMsgMap.has(m.group_id))
      lastMsgMap.set(m.group_id, { content: m.content, sender_name: m.sender_name, created_at: m.created_at })
  })

  const enriched = data.map(g => ({
    ...g,
    member_count: memberCountMap.get(g.id as string) ?? 0,
    last_message: lastMsgMap.get(g.id as string) ?? null,
  }))

  // Sắp xếp: nhóm có tin mới nhất lên đầu; nhóm không có tin → dùng created_at group
  return enriched.sort((a, b) => {
    const ar = a as Record<string, unknown>
    const br = b as Record<string, unknown>
    const aTime = a.last_message?.created_at ?? (ar.created_at as string ?? "")
    const bTime = b.last_message?.created_at ?? (br.created_at as string ?? "")
    return bTime.localeCompare(aTime)
  })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const email    = session.user.email || ""
  const role     = session.user.role  || ""
  const archived = req.nextUrl.searchParams.get("archived") === "true"

  if (isPrivileged(role)) {
    const { data, error } = await supabaseAdmin
      .from("chat_groups")
      .select("*")
      .eq("is_archived", archived)
      .order("created_at", { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: await enrichBatch(data ?? []) })
  }

  // User thường: chỉ thấy group mình là member
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
    .eq("is_archived", archived)
    .order("created_at", { ascending: false })
  if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 500 })

  return NextResponse.json({ data: await enrichBatch(groups ?? []) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role || ""
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
