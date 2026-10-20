import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireArgonUser } from "@/lib/argon/server"
import { buildTree } from "@/lib/argon/missions"
import { deleteMission, linkedSources, listFiles, ownMission, updateMission } from "@/lib/argon/missions-db"
import { getPendingAsk } from "@/lib/argon/ask-tool"
import { getPatches } from "@/lib/argon/patch-tool"

export const dynamic = "force-dynamic"

// GET → sứ mệnh + cây workspace + nguồn đã gắn + lượt chạy của dự án nền · PATCH { name?, goal?, archived? } · DELETE (xoá hẳn, kể cả dự án nền).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const mission = await ownMission(params.id, username)
  if (!mission) return NextResponse.json({ error: "Không tìm thấy sứ mệnh" }, { status: 404 })
  const [files, sources, pendingAsk, patches, runs] = await Promise.all([
    listFiles(mission.id), linkedSources(mission.id), getPendingAsk(mission.id), getPatches(mission.id),
    supabaseAdmin.from("argon_runs").select("*").eq("project_id", mission.project_id).order("created_at"),
  ])
  const spent = (runs.data ?? []).reduce((n, r) => n + (Number(r.cost_usd) || 0), 0)
  return NextResponse.json({ mission, pendingAsk, patches, tree: buildTree(files), files, sources, runs: runs.data ?? [], spent_usd: Math.round(spent * 10_000) / 10_000 })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownMission(params.id, username))) return NextResponse.json({ error: "Không tìm thấy sứ mệnh" }, { status: 404 })
  const b = (await req.json().catch(() => ({}))) as { name?: string; goal?: string; archived?: boolean }
  try {
    return NextResponse.json({ mission: await updateMission(params.id, {
      name: typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 120) : undefined,
      goal: typeof b.goal === "string" ? b.goal.slice(0, 2000) : undefined,
      archived: typeof b.archived === "boolean" ? b.archived : undefined,
    }) })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const mission = await ownMission(params.id, username)
  if (!mission) return NextResponse.json({ error: "Không tìm thấy sứ mệnh" }, { status: 404 })
  const { error } = await deleteMission(mission)
  return error ? NextResponse.json({ error }, { status: 500 }) : NextResponse.json({ ok: true })
}
