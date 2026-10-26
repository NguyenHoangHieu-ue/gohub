import { NextRequest, NextResponse } from "next/server"
import { requireArgonUser } from "@/lib/argon/server"
import { listMailThreads, setThreadStatus, syncMailStatus, type MailThreadStatus } from "@/lib/argon/mail-status"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// GET → sổ trạng thái mail theo thread của người dùng (chỉ đọc).
export async function GET() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ threads: await listMailThreads(username), now: Date.now() })
}

// POST → quét lại INBOX + SENT ngay (chỉ đọc mail), trả số liệu quét.
export async function POST() {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const result = await syncMailStatus(username, Date.now() + 100_000)
    return NextResponse.json({ result, threads: await listMailThreads(username), now: Date.now() })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

const SETTABLE: MailThreadStatus[] = ["waiting_me", "waiting_partner", "done", "ignored"]

// PATCH { id, status } → anh tự đổi trạng thái 1 luồng (giữ tới khi có thư mới trong luồng).
export async function PATCH(req: NextRequest) {
  const username = await requireArgonUser()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: MailThreadStatus }
  if (!b.id || !b.status || !SETTABLE.includes(b.status)) return NextResponse.json({ error: "Thiếu id hoặc status không hợp lệ" }, { status: 400 })
  const row = await setThreadStatus(username, b.id, b.status)
  return row ? NextResponse.json({ thread: row }) : NextResponse.json({ error: "Không tìm thấy luồng thư" }, { status: 404 })
}
