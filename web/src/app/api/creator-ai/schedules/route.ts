import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { personalFeaturesEnabled } from "@/lib/assistant-memory-auto"
import { runScheduleTask } from "@/lib/agents/creator/schedules"

// Việc theo lịch Gấu Pro (G4): GET danh sách của tôi · DELETE ?id= huỷ. Tạo việc qua chat (tool scheduleTask).
async function me() {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  if (!username) return null
  const isCreator = session.user.role === "creator"
  return { username, isCreator, enabled: await personalFeaturesEnabled(isCreator).catch(() => false) }
}

export async function GET() {
  const u = await me()
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!u.enabled) return NextResponse.json({ enabled: false, tasks: [] })
  const r = await runScheduleTask({ action: "list" }, u.username, u.isCreator)
  return NextResponse.json({ enabled: true, tasks: r.tasks ?? [], error: r.error })
}

export async function DELETE(req: NextRequest) {
  const u = await me()
  if (!u?.enabled) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })
  const r = await runScheduleTask({ action: "cancel", id: req.nextUrl.searchParams.get("id") }, u.username, u.isCreator)
  return NextResponse.json(r, { status: r.error ? 400 : 200 })
}
