import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { linkSource, linkedSources, listLinkable, ownMission, unlinkSource } from "@/lib/argon/missions-db"

export const dynamic = "force-dynamic"

// GET → nguồn đã gắn vào sứ mệnh (?available=1 → mọi nguồn trong Kho nguồn kèm cờ linked) · POST { sourceId } → gắn nguồn từ Kho nguồn · DELETE ?sourceId= → gỡ (không xoá nguồn gốc).
async function guard(id: string) {
  const username = await requireArgonUser()
  if (!username) return { res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  const mission = await ownMission(id, username)
  return mission ? { mission } : { res: NextResponse.json({ error: "Không tìm thấy sứ mệnh" }, { status: 404 }) }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  if (req.nextUrl.searchParams.get("available") === "1") return NextResponse.json({ candidates: await listLinkable(g.mission.username, g.mission.id) })
  return NextResponse.json({ sources: await linkedSources(g.mission.id) })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  const { sourceId } = (await req.json().catch(() => ({}))) as { sourceId?: string }
  if (!sourceId) return NextResponse.json({ error: "Thiếu sourceId" }, { status: 400 })
  const r = await linkSource(g.mission, sourceId)
  return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ sources: await linkedSources(g.mission.id) })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  const sourceId = req.nextUrl.searchParams.get("sourceId")
  if (!sourceId) return NextResponse.json({ error: "Thiếu sourceId" }, { status: 400 })
  await unlinkSource(g.mission.id, sourceId)
  return NextResponse.json({ sources: await linkedSources(g.mission.id) })
}
