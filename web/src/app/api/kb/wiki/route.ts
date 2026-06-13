import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"
import { embedText, DEPARTMENTS }   from "@/lib/kb"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role   = (session.user as any).role
  const search = req.nextUrl.searchParams.get("search") || ""
  const dept   = req.nextUrl.searchParams.get("dept")   || ""
  const type   = req.nextUrl.searchParams.get("type")   || ""

  let query = supabaseAdmin
    .from("kb_wiki_pages")
    .select("id, title, page_type, department, tags, version, is_hidden, created_by, updated_by, updated_at")
    .order("updated_at", { ascending: false })

  // Non-admin users cannot see hidden pages
  if (role !== "admin") query = query.eq("is_hidden", false)

  if (search) query = query.ilike("title", `%${search}%`)
  if (dept && DEPARTMENTS.includes(dept as any)) query = query.eq("department", dept)
  if (type)  query = query.eq("page_type", type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const username = session.user.name!
  const { title, content, page_type, department, tags } = await req.json()

  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 })

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
    })
    .select("id, title, page_type, department, version, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
