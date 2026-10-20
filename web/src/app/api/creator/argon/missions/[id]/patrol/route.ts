import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { ownMission } from "@/lib/argon/missions-db"
import { PATROL_PRESETS, getPatrol, savePatrol, startPatrol } from "@/lib/argon/patrol"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// "Tuần tra đêm" của sứ mệnh: GET → cấu hình + mẫu gợi ý · PUT { enabled, prompt } → lưu · POST → chạy thử NGAY 1 lượt nền (cần sứ mệnh đang ở pha chạy; xong nhắn Lark).
async function guard(id: string) {
  const username = await requireArgonUser()
  if (!username) return { res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  const mission = await ownMission(id, username)
  return mission ? { mission } : { res: NextResponse.json({ error: "Không tìm thấy sứ mệnh" }, { status: 404 }) }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  return NextResponse.json({ patrol: (await getPatrol(g.mission.id)) ?? { enabled: false, prompt: "" }, presets: PATROL_PRESETS })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  const b = (await req.json().catch(() => ({}))) as { enabled?: boolean; prompt?: string }
  const cur = await getPatrol(g.mission.id)
  const prompt = typeof b.prompt === "string" ? b.prompt : cur?.prompt ?? ""
  if (b.enabled && !prompt.trim()) return NextResponse.json({ error: "Nhập yêu cầu tuần tra trước khi bật" }, { status: 400 })
  return NextResponse.json({ patrol: await savePatrol(g.mission.id, { enabled: !!b.enabled, prompt, lastRunDate: cur?.lastRunDate, lastRunId: cur?.lastRunId }) })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  try {
    const r = await startPatrol(g.mission.id, req.nextUrl.origin, true)
    return r.runId ? NextResponse.json({ runId: r.runId }) : NextResponse.json({ error: r.skipped ?? "Không chạy được" }, { status: 400 })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
