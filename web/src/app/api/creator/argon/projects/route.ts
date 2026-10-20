import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireArgonUser } from "@/lib/argon/server"
import { ensureHub } from "@/lib/argon/hub"
import { templateById } from "@/lib/argon/templates"
import { saveAutorun } from "@/lib/argon/autorun"

export const dynamic = "force-dynamic"

// GET → danh sách dự án của Creator (kèm số nguồn + tổng token nguồn đang bật) · POST { name } → tạo dự án.
export async function GET() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const hubId = await ensureHub(username).catch(() => null)
  const { data: projects, error } = await supabaseAdmin.from("argon_projects").select("id,name,updated_at,created_at").eq("username", username).eq("kind", "project").order("updated_at", { ascending: false })
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
  const rows = (projects ?? []).map(p => ({ ...p, ...(stats[p.id] ?? { sources: 0, tokens: 0 }), hub: p.id === hubId }))
  // Tổng hợp: số nguồn/token = của mọi dự án khác (đó là thứ nó đọc); luôn xếp đầu danh sách.
  const hub = rows.find(r => r.hub)
  if (hub) {
    const others = rows.filter(r => !r.hub)
    hub.sources += others.reduce((n, r) => n + r.sources, 0)
    hub.tokens += others.reduce((n, r) => n + r.tokens, 0)
  }
  return NextResponse.json({ projects: [...rows.filter(r => r.hub), ...rows.filter(r => !r.hub)] })
}

export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { name, template } = (await req.json().catch(() => ({}))) as { name?: string; template?: string }
  const tpl = templateById(template)
  const n = String(name ?? "").trim().slice(0, 120) || tpl?.name || ""
  if (!n) return NextResponse.json({ error: "Thiếu tên dự án" }, { status: 400 })
  const { data, error } = await supabaseAdmin.from("argon_projects").insert({ username, name: n, ...(tpl ? { notes: tpl.notes, instructions: tpl.instructions } : {}) }).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (tpl) await saveAutorun(data.id, { enabled: false, prompt: tpl.autorunPrompt, thinking: "medium" })
  return NextResponse.json({ project: data })
}
