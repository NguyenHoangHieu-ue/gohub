import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { loadPubState, publishProfiles, savePubState } from "@/lib/argon/lark-publish"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Xuất hồ sơ vendor ra Lark (MỘT CHIỀU: Argon là gốc, Lark chỉ để đọc).
// GET → trạng thái (bật tự cập nhật mỗi đêm?, thư mục, mục lục, số tài liệu, lần chạy cuối).
export async function GET() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const s = await loadPubState(username)
  return NextResponse.json({ enabled: s.enabled, folderUrl: s.folderUrl ?? null, indexUrl: s.index?.url ?? null, docs: Object.keys(s.docs).length, lastRunAt: s.lastRunAt ?? null })
}

// PUT { enabled } → bật/tắt tự cập nhật mỗi đêm (mặc định TẮT).
export async function PUT(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { enabled?: boolean }
  const s = await loadPubState(username)
  s.enabled = !!b.enabled
  await savePubState(username, s)
  return NextResponse.json({ enabled: s.enabled })
}

// POST { force? } → xuất/cập nhật ngay (force = ghi lại cả tài liệu không đổi).
export async function POST(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { force?: boolean }
  try {
    return NextResponse.json({ result: await publishProfiles(username, { deadline: Date.now() + 240_000, force: !!b.force }) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
