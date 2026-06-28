import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"
import { embedText }                from "@/lib/kb"
import { getDbRole }                 from "@/lib/db-role"
import { createNotification }       from "@/lib/notifications"

type Ctx = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [pageRes, versionsRes, role] = await Promise.all([
    supabaseAdmin
      .from("kb_wiki_pages")
      .select("id, title, content, page_type, department, tags, version, is_hidden, created_by, updated_by, created_at, updated_at")
      .eq("id", params.id)
      .maybeSingle(),
    supabaseAdmin
      .from("kb_wiki_versions")
      .select("id, version, updated_by, updated_at")
      .eq("page_id", params.id)
      .order("version", { ascending: false })
      .limit(20),
    getDbRole((session.user as any).username, (session.user as any).role),
  ])

  if (!pageRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Trang ẩn: chỉ admin/creator mở được (kể cả khi có id trực tiếp)
  if (pageRes.data.is_hidden && role !== "admin" && role !== "creator")
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ page: pageRes.data, versions: versionsRes.data ?? [] })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!
  const role     = await getDbRole((session.user as any).username, (session.user as any).role)

  const body = await req.json()
  const { title, content, page_type, department, tags, is_hidden } = body

  // is_hidden toggle: admin/creator only, no version history needed
  if (is_hidden !== undefined && Object.keys(body).length === 1) {
    if (role !== "admin" && role !== "creator") return NextResponse.json({ error: "Không có quyền" }, { status: 403 })
    const { error } = await supabaseAdmin
      .from("kb_wiki_pages")
      .update({ is_hidden })
      .eq("id", params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, is_hidden })
  }

  // Fetch current for version + ownership check
  const { data: current } = await supabaseAdmin
    .from("kb_wiki_pages")
    .select("version, created_by, title, content")
    .eq("id", params.id)
    .maybeSingle()

  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (role !== "admin" && role !== "creator" && current.created_by !== username)
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 })

  // Save current version to history
  await supabaseAdmin.from("kb_wiki_versions").insert({
    page_id:    params.id,
    title:      current.title,
    content:    current.content,
    version:    current.version,
    updated_by: username,
  })

  // Re-embed
  let embedding: number[] | null = null
  try {
    embedding = await embedText(`${title ?? current.title}\n\n${content ?? ""}`.slice(0, 2000))
  } catch {}

  const { data, error } = await supabaseAdmin
    .from("kb_wiki_pages")
    .update({
      ...(title      !== undefined && { title:      title.trim() }),
      ...(content    !== undefined && { content }),
      ...(page_type  !== undefined && { page_type }),
      ...(department !== undefined && { department }),
      ...(tags       !== undefined && { tags }),
      ...(embedding  !== null     && { embedding }),
      version:    current.version + 1,
      updated_by: username,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select("id, title, version, updated_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notification for content edits only (skip is_hidden toggles)
  if (title !== undefined || content !== undefined) {
    createNotification(
      "wiki",
      `Wiki cập nhật: ${title ?? current.title}`,
      `Sửa bởi ${username} (v${current.version + 1})`,
      { title: title ?? current.title, action: "update", page_id: params.id },
    )
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!
  const role     = await getDbRole((session.user as any).username, (session.user as any).role)

  const { data: page } = await supabaseAdmin
    .from("kb_wiki_pages")
    .select("created_by")
    .eq("id", params.id)
    .maybeSingle()

  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (role !== "admin" && role !== "creator" && page.created_by !== username)
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 })

  const { error } = await supabaseAdmin.from("kb_wiki_pages").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  createNotification(
    "wiki",
    `Xóa wiki page`,
    `ID ${params.id} xóa bởi ${username}`,
    { action: "delete", page_id: params.id, deleted_by: username },
  )

  return NextResponse.json({ ok: true })
}
