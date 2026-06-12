import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"
import { embedText }                from "@/lib/kb"

type Ctx = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [pageRes, versionsRes] = await Promise.all([
    supabaseAdmin
      .from("kb_wiki_pages")
      .select("id, title, content, page_type, department, tags, version, created_by, updated_by, created_at, updated_at")
      .eq("id", params.id)
      .maybeSingle(),
    supabaseAdmin
      .from("kb_wiki_versions")
      .select("id, version, updated_by, updated_at")
      .eq("page_id", params.id)
      .order("version", { ascending: false })
      .limit(20),
  ])

  if (!pageRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ page: pageRes.data, versions: versionsRes.data ?? [] })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!
  const role     = (session.user as any).role

  const { title, content, page_type, department, tags } = await req.json()

  // Fetch current for version + ownership check
  const { data: current } = await supabaseAdmin
    .from("kb_wiki_pages")
    .select("version, created_by, title, content")
    .eq("id", params.id)
    .maybeSingle()

  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (role !== "admin" && current.created_by !== username)
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
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!
  const role     = (session.user as any).role

  const { data: page } = await supabaseAdmin
    .from("kb_wiki_pages")
    .select("created_by")
    .eq("id", params.id)
    .maybeSingle()

  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (role !== "admin" && page.created_by !== username)
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 })

  const { error } = await supabaseAdmin.from("kb_wiki_pages").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
