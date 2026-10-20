import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { ownProject, requireArgonUser } from "@/lib/argon/server"
import { deleteProjectCascade } from "@/lib/argon/project-delete"
import { getHubId } from "@/lib/argon/hub"

export const dynamic = "force-dynamic"

// GET → dự án + nguồn (không kèm nội dung đầy đủ) + các lượt chạy · PATCH { name?, notes?, instructions? } · DELETE (xoá cả file trong kho).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const project = await ownProject(params.id, username)
  if (!project) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const [{ data: sources }, { data: runs }] = await Promise.all([
    supabaseAdmin.from("argon_sources")
      .select("id,project_id,kind,name,mime,size_bytes,send_binary,tokens,external_url,sync_mode,synced_at,enabled,pinned,version,meta,created_at,updated_at")
      .eq("project_id", params.id).order("created_at"),
    supabaseAdmin.from("argon_runs").select("*").eq("project_id", params.id).order("created_at"),
  ])
  return NextResponse.json({ project, sources: sources ?? [], runs: runs ?? [], hub: (await getHubId(username)) === params.id })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const b = (await req.json().catch(() => ({}))) as { name?: string; notes?: string; instructions?: string }
  const patch: Record<string, string> = { updated_at: new Date().toISOString() }
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 120)
  if (typeof b.notes === "string") patch.notes = b.notes.slice(0, 60_000)
  if (typeof b.instructions === "string") patch.instructions = b.instructions.slice(0, 10_000)
  const { data, error } = await supabaseAdmin.from("argon_projects").update(patch).eq("id", params.id).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const { error } = await deleteProjectCascade(params.id)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
