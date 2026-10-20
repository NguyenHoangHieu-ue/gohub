import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { isPhase } from "@/lib/argon/missions"
import { ownMission, setPhase } from "@/lib/argon/missions-db"

export const dynamic = "force-dynamic"

// POST { to } → đổi pha. to="run" từ "plan" chính là nút Chốt (ghi committed_at lần đầu).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const mission = await ownMission(params.id, username)
  if (!mission) return NextResponse.json({ error: "Không tìm thấy sứ mệnh" }, { status: 404 })
  const { to } = (await req.json().catch(() => ({}))) as { to?: unknown }
  if (!isPhase(to)) return NextResponse.json({ error: "Pha không hợp lệ" }, { status: 400 })
  const r = await setPhase(mission, to)
  return r.error ? NextResponse.json({ error: r.error }, { status: 409 }) : NextResponse.json({ mission: r.mission })
}
