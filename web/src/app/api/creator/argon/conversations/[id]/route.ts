import { NextRequest, NextResponse } from "next/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { isChatMission, isDailyMission } from "@/lib/argon/conversations"
import { CHAT_PREFIX } from "@/lib/argon/missions"
import { deleteMission, ownMission, updateMission } from "@/lib/argon/missions-db"

export const dynamic = "force-dynamic"

// PATCH { title } → đổi tên (cuộc mặc định "Tham mưu hằng ngày" không đổi: tuần tra đêm tìm nó theo tên) · DELETE → xoá cuộc trò chuyện (chỉ cuộc tạo từ khung chat).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const m = await ownMission(params.id, username)
  if (m && isDailyMission(m)) return NextResponse.json({ error: "Cuộc mặc định không đổi tên được" }, { status: 400 })
  if (!m || !isChatMission(m)) return NextResponse.json({ error: "Không tìm thấy cuộc trò chuyện" }, { status: 404 })
  const b = (await req.json().catch(() => ({}))) as { title?: unknown }
  const title = typeof b.title === "string" ? b.title.replace(/\s+/g, " ").trim().slice(0, 80) : ""
  if (!title) return NextResponse.json({ error: "Thiếu tên" }, { status: 400 })
  try { await updateMission(m.id, { name: CHAT_PREFIX + title }); return NextResponse.json({ ok: true, title }) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const m = await ownMission(params.id, username)
  if (!m || !isChatMission(m)) return NextResponse.json({ error: "Không tìm thấy cuộc trò chuyện" }, { status: 404 })
  const { error } = await deleteMission(m)
  return error ? NextResponse.json({ error }, { status: 500 }) : NextResponse.json({ ok: true })
}
