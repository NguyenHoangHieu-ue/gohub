import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { requireArgonUser } from "@/lib/argon/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { ensureDailyMission } from "@/lib/argon/daily-mission"
import { listFiles, readFile, writeFile } from "@/lib/argon/missions-db"
import { getPatrol, savePatrol, startPatrol } from "@/lib/argon/patrol"
import { BOI_CANH_PATH, NIGHTLY_PROMPT, TAC_DONG_PATH, auditProposals } from "@/lib/argon/context-pure"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// "Bối cảnh & Kế hoạch": GET → kế hoạch/metric của Hiếu (brief.md), bối cảnh công ty, tác động + đề xuất (kèm kết quả kiểm nguồn), trạng thái chạy/tự cập nhật.
//   PUT { plan } → lưu kế hoạch (brief.md) · POST → cập nhật NGAY (chạy nền, xong nhắn Lark) · PATCH { nightly } → bật/tắt tự cập nhật mỗi đêm.
async function snapshot(username: string) {
  const m = await ensureDailyMission(username)
  const [brief, boi, tac, files, patrol, running] = await Promise.all([
    readFile(m.id, "brief.md"), readFile(m.id, BOI_CANH_PATH), readFile(m.id, TAC_DONG_PATH), listFiles(m.id), getPatrol(m.id),
    supabaseAdmin.from("argon_runs").select("id,status,created_at").eq("project_id", m.project_id).in("status", ["queued", "running"]).order("created_at", { ascending: false }).limit(1),
  ])
  const at = (p: string) => files.find(f => f.path === p)?.updated_at ?? null
  return {
    missionId: m.id,
    plan: { text: brief?.content ?? "", updatedAt: at("brief.md") },
    boiCanh: { text: boi?.content ?? "", updatedAt: at(BOI_CANH_PATH) },
    tacDong: { text: tac?.content ?? "", updatedAt: at(TAC_DONG_PATH), audit: auditProposals(tac?.content ?? "") },
    nightly: !!patrol?.enabled,
    running: running.data?.[0] ? { runId: running.data[0].id as string, since: running.data[0].created_at as string } : null,
  }
}

export async function GET() {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json(await snapshot(username))
}

export async function PUT(req: NextRequest) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { plan?: string }
  if (typeof b.plan !== "string") return NextResponse.json({ error: "Thiếu plan" }, { status: 400 })
  const m = await ensureDailyMission(username)
  const r = await writeFile(m.id, "brief.md", b.plan, "user")
  return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json(await snapshot(username))
}

export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const m = await ensureDailyMission(username)
  const cur = await getPatrol(m.id)
  await savePatrol(m.id, { enabled: !!cur?.enabled, prompt: NIGHTLY_PROMPT, lastRunDate: cur?.lastRunDate, lastRunId: cur?.lastRunId })   // luôn dùng câu lệnh chuẩn (nút "Cập nhật ngay" và đêm cùng một việc)
  try {
    const r = await startPatrol(m.id, req.nextUrl.origin, true)
    return r.runId ? NextResponse.json({ runId: r.runId }) : NextResponse.json({ error: r.skipped ?? "Không chạy được" }, { status: 400 })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}

export async function PATCH(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { nightly?: boolean }
  if (typeof b.nightly !== "boolean") return NextResponse.json({ error: "Thiếu nightly" }, { status: 400 })
  const m = await ensureDailyMission(username)
  const cur = await getPatrol(m.id)
  await savePatrol(m.id, { enabled: b.nightly, prompt: NIGHTLY_PROMPT, lastRunDate: cur?.lastRunDate, lastRunId: cur?.lastRunId })
  return NextResponse.json(await snapshot(username))
}
