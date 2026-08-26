import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"
import { embedText, DEPARTMENTS }   from "@/lib/kb"
import { getDbRole }                 from "@/lib/db-role"
import { createNotification }       from "@/lib/notifications"

function isPrivilegedRole(role: string) {
  return role === "admin" || role === "creator"
}

async function isGroupMember(groupId: string, email: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chat_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_email", email)
    .maybeSingle()
  return !!data
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Role DB tươi (JWT có thể cũ) → quyết trang ẩn có hiện hay không
  const role    = await getDbRole(session.user.username, session.user.role)
  const search  = req.nextUrl.searchParams.get("search")  || ""
  const dept    = req.nextUrl.searchParams.get("dept")    || ""
  const type    = req.nextUrl.searchParams.get("type")    || ""
  const groupId = req.nextUrl.searchParams.get("groupId") || ""

  // Xem theo 1 group Tổ Gấu cụ thể → phải là member của group đó (hoặc admin/creator)
  if (groupId && !isPrivilegedRole(role) && !(await isGroupMember(groupId, session.user.email || ""))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let query = supabaseAdmin
    .from("kb_wiki_pages")
    .select("id, title, page_type, department, tags, version, is_hidden, visibility_mode, created_by, updated_by, updated_at")
    .order("updated_at", { ascending: false })

  // Non-admin users cannot see hidden pages
  if (!isPrivilegedRole(role)) query = query.eq("is_hidden", false)

  if (search) query = query.ilike("title", `%${search}%`)
  if (dept && DEPARTMENTS.includes(dept as any)) query = query.eq("department", dept)
  if (type)  query = query.eq("page_type", type)

  // Lọc theo group được gán (visibility_mode='all' luôn hiện; 'groups' chỉ hiện nếu group này được gán)
  if (groupId) {
    const { data: assigned } = await supabaseAdmin
      .from("kb_wiki_page_groups")
      .select("page_id")
      .eq("group_id", groupId)
    const pageIds = (assigned ?? []).map(r => r.page_id)
    query = pageIds.length > 0
      ? query.or(`visibility_mode.eq.all,id.in.(${pageIds.join(",")})`)
      : query.eq("visibility_mode", "all")
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getDbRole(session.user.username, session.user.role)
  if (!isPrivilegedRole(role)) {
    return NextResponse.json({ error: "Chỉ admin/creator được tạo tài liệu chính thức" }, { status: 403 })
  }

  const username = session.user.name!
  const { title, content, page_type, department, tags, visibility_mode, group_ids } = await req.json()

  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 })

  const vmode: string = visibility_mode === "groups" ? "groups" : "all"
  const groupIds: string[] = vmode === "groups" && Array.isArray(group_ids) ? group_ids.filter(Boolean) : []

  // Embed title + content (first 2000 chars)
  let embedding: number[] | null = null
  try {
    embedding = await embedText(`${title}\n\n${content}`.slice(0, 2000))
  } catch { /* embed failure không block creation */ }

  const { data, error } = await supabaseAdmin
    .from("kb_wiki_pages")
    .insert({
      title:      title.trim(),
      content:    content ?? "",
      page_type:  page_type ?? "note",
      department: department ?? "all",
      tags:       tags ?? [],
      embedding,
      version:    1,
      created_by: username,
      updated_by: username,
      visibility_mode: vmode,
    })
    .select("id, title, page_type, department, version, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (vmode === "groups" && groupIds.length > 0 && data) {
    await supabaseAdmin
      .from("kb_wiki_page_groups")
      .insert(groupIds.map(gid => ({ page_id: data.id, group_id: gid })))
  }

  createNotification(
    "wiki",
    `Wiki mới: ${title.trim()}`,
    `Tạo bởi ${username}`,
    { title: title.trim(), action: "create", page_type: page_type ?? "note", department: department ?? "all" },
  )

  return NextResponse.json(data)
}
