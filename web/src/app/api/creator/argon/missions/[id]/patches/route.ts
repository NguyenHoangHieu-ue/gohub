import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { ownMission } from "@/lib/argon/missions-db"
import { decide, getPatches, savePatches } from "@/lib/argon/patch-tool"
import { runDevTicket } from "@/lib/dev-tickets"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Đề xuất sửa code của Argon: GET → danh sách · POST { action:"approve"|"reject", id } → Hiếu quyết.
// approve = tạo phiếu dev_tickets (GitHub Actions chạy Claude Code → PR vào staging, KHÔNG vào main); chỉ Creator.
async function guard(id: string) {
  const username = await requireArgonUser()
  if (!username) return { res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  const mission = await ownMission(id, username)
  return mission ? { mission, username } : { res: NextResponse.json({ error: "Không tìm thấy sứ mệnh" }, { status: 404 }) }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  return NextResponse.json({ patches: await getPatches(g.mission.id) })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id); if (!g.mission) return g.res
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string }
  if (!b.id || (b.action !== "approve" && b.action !== "reject")) return NextResponse.json({ error: 'Cần id và action "approve" hoặc "reject"' }, { status: 400 })
  const list = await getPatches(g.mission.id)
  const now = new Date().toISOString()
  if (b.action === "reject") {
    const r = decide(list, b.id, "rejected", now)
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 })
    await savePatches(g.mission.id, r.list)
    return NextResponse.json({ patches: r.list })
  }
  const cur = list.find(x => x.id === b.id)
  if (!cur) return NextResponse.json({ error: "Không tìm thấy đề xuất" }, { status: 404 })
  if (cur.status !== "pending") return NextResponse.json({ error: "Đề xuất này đã được quyết rồi" }, { status: 409 })
  const ticket = await runDevTicket({ action: "create", title: `[Argon] ${cur.title}`, prompt: `${cur.request}\n\n(Đề xuất tự động của Argon từ sứ mệnh "${g.mission.name}"; Hiếu đã duyệt.)`, request: cur.request, plan: cur.plan }, g.username, true)
  const tid = typeof ticket?.id === "number" ? ticket.id : undefined
  const r = decide(list, b.id, "approved", now, tid ? { ticketId: tid } : { error: String(ticket?.error ?? "Không tạo được phiếu") })
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 })
  await savePatches(g.mission.id, r.list)
  return ticket?.error ? NextResponse.json({ error: ticket.error, patches: r.list }, { status: 502 }) : NextResponse.json({ patches: r.list, ticketId: tid })
}
