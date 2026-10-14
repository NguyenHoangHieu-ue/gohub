import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireArgonUser } from "@/lib/argon/server"

export const dynamic = "force-dynamic"

// GET → danh sách dự án của Creator (kèm số nguồn + tổng token nguồn đang bật) · POST { name } → tạo dự án.
export async function GET() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { data: projects, error } = await supabaseAdmin.from("argon_projects").select("id,name,updated_at,created_at").eq("username", username).order("updated_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (projects ?? []).map(p => p.id)
  const stats: Record<string, { sources: number; tokens: number }> = {}
  if (ids.length) {
    const { data: src } = await supabaseAdmin.from("argon_sources").select("project_id,tokens,enabled").in("project_id", ids)
    for (const s of src ?? []) {
      const st = (stats[s.project_id] ??= { sources: 0, tokens: 0 })
      st.sources++
      if (s.enabled) st.tokens += s.tokens
    }
  }
  return NextResponse.json({ projects: (projects ?? []).map(p => ({ ...p, ...(stats[p.id] ?? { sources: 0, tokens: 0 }) })) })
}

export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { name } = (await req.json().catch(() => ({}))) as { name?: string }
  const n = String(name ?? "").trim().slice(0, 120)
  if (!n) return NextResponse.json({ error: "Thiếu tên dự án" }, { status: 400 })
  const { data, error } = await supabaseAdmin.from("argon_projects").insert({ username, name: n }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data })
}
