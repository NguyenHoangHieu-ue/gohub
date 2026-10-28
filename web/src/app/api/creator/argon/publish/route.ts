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
  const b = (await req.json().catch(() => ({}))) as { enabled?: boolean; wikiUrl?: string }
  const s = await loadPubState(username)
  if (typeof b.enabled === "boolean") s.enabled = b.enabled
  if (b.wikiUrl) {   // link không gian Wiki vendor: https://<miền>/wiki/space/<id>
    const m = b.wikiUrl.match(/^https?:\/\/([^/]+)\/wiki\/space\/(\d+)/)
    if (!m) return NextResponse.json({ error: "Link Wiki phải dạng https://…/wiki/space/<số>" }, { status: 400 })
    s.wikiHost = m[1]; s.wikiSpaceId = m[2]
  }
  await savePubState(username, s)
  return NextResponse.json({ enabled: s.enabled, wikiSpaceId: s.wikiSpaceId ?? null })
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
