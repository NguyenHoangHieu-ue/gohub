import { NextRequest, NextResponse } from "next/server"
import { getServerSession }         from "next-auth"
import { authOptions }              from "@/lib/auth"
import { supabaseAdmin }            from "@/lib/supabase"
import { embedText }                from "@/lib/kb"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { query, department, limit = 8 } = await req.json()
  if (!query?.trim()) return NextResponse.json({ error: "query required" }, { status: 400 })

  const embedding = await embedText(query.trim())

  // Search both KB chunks and wiki pages in parallel
  const [chunksRes, wikiRes] = await Promise.all([
    supabaseAdmin.rpc("search_kb", {
      query_embedding: embedding,
      match_count:     Math.ceil(limit * 0.6),
      match_threshold: 0.4,
      filter_dept:     department || null,
    }),
    supabaseAdmin.rpc("search_wiki", {
      query_embedding: embedding,
      match_count:     Math.ceil(limit * 0.5),
      match_threshold: 0.4,
      filter_dept:     department || null,
    }),
  ])

  const chunks = (chunksRes.data ?? []).map((r: any) => ({ ...r, source: "document" }))
  const wiki   = (wikiRes.data   ?? []).map((r: any) => ({
    chunk_id:      r.page_id,
    document_id:   r.page_id,
    document_name: r.title,
    department:    r.department,
    content:       r.content,
    similarity:    r.similarity,
    source:        "wiki",
    page_type:     r.page_type,
  }))

  // Merge + sort by similarity, deduplicate, take top limit
  const merged = [...chunks, ...wiki]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  if (chunksRes.error && wikiRes.error)
    return NextResponse.json({ error: chunksRes.error.message }, { status: 500 })

  return NextResponse.json({ results: merged })
}
