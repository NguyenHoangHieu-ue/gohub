import { NextRequest, NextResponse } from "next/server"
import { ownProject, requireArgonUser } from "@/lib/argon/server"
import { getAutorun, saveAutorun, startAutorun } from "@/lib/argon/autorun"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// "Tự chạy hằng đêm": GET → cấu hình · PUT { enabled, prompt, thinking } → lưu · POST → chạy NGAY 1 lượt nền theo yêu cầu đã lưu (xong nhắn Lark).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  return NextResponse.json({ autorun: (await getAutorun(params.id)) ?? { enabled: false, prompt: "", thinking: "medium" } })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const b = (await req.json().catch(() => ({}))) as { enabled?: boolean; prompt?: string; thinking?: string }
  const cur = await getAutorun(params.id)
  const prompt = typeof b.prompt === "string" ? b.prompt : cur?.prompt ?? ""
  if (b.enabled && !prompt.trim()) return NextResponse.json({ error: "Nhập yêu cầu cố định trước khi bật" }, { status: 400 })
  const autorun = await saveAutorun(params.id, { enabled: !!b.enabled, prompt, thinking: b.thinking ?? cur?.thinking ?? "medium", lastRunDate: cur?.lastRunDate, lastRunId: cur?.lastRunId })
  return NextResponse.json({ autorun })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  try {
    const runId = await startAutorun(params.id, req.nextUrl.origin, true)
    return runId ? NextResponse.json({ runId }) : NextResponse.json({ error: "Chưa có yêu cầu cố định hoặc dự án chưa có nguồn nào đang bật" }, { status: 400 })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
