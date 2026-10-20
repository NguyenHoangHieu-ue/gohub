import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { linkSource, linkSourcesBulk, linkedSources, listLinkable, ownMission, unlinkSource } from "@/lib/argon/missions-db"

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
  const body = (await req.json().catch(() => ({}))) as { sourceId?: string; sourceIds?: string[] }
  if (Array.isArray(body.sourceIds)) {   // gắn cả nhóm (vd toàn bộ nguồn của một dự án)
    const r = await linkSourcesBulk(g.mission, body.sourceIds.map(String))
    return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ sources: await linkedSources(g.mission.id), linked: r.linked })
  }
  const { sourceId } = body
  if (!sourceId) return NextResponse.json({ error: "Thiếu sourceId" }, { status: 400 })
  const r = await linkSource(g.mission, sourceId)
  return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ sources: await linkedSources(g.mission.id) })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  const many = req.nextUrl.searchParams.get("sourceIds")   // gỡ cả nhóm: ?sourceIds=a,b,c
  if (many) { for (const id of many.split(",").filter(Boolean).slice(0, 500)) await unlinkSource(g.mission.id, id); return NextResponse.json({ sources: await linkedSources(g.mission.id) }) }
  const sourceId = req.nextUrl.searchParams.get("sourceId")
  if (!sourceId) return NextResponse.json({ error: "Thiếu sourceId" }, { status: 400 })
  await unlinkSource(g.mission.id, sourceId)
  return NextResponse.json({ sources: await linkedSources(g.mission.id) })
}
