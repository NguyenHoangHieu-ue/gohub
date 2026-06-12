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

  const { data, error } = await supabaseAdmin.rpc("search_kb", {
    query_embedding: embedding,
    match_count:     limit,
    match_threshold: 0.4,
    filter_dept:     department || null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data ?? [] })
}
