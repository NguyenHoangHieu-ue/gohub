// U5b: danh sách phiếu sửa code (Creator Settings) + Hiếu trả lời câu hỏi ngay trên web. Chỉ Creator.
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getDbRole } from "@/lib/db-role"
import { answerTicket, listTickets, previewUrlOf } from "@/lib/dev-tickets"

async function creator() {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  if (!username) return null
  return (await getDbRole(username, session.user.role)) === "creator" ? username : null
}

export async function GET() {
  if (!(await creator())) return NextResponse.json({ error: "Creator only" }, { status: 403 })
  const r = await listTickets(30)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ tickets: r.tickets!.map(t => ({ ...t, prompt: undefined, preview_url: t.pr_url ? previewUrlOf(t.id) : null })) })
}

export async function POST(req: NextRequest) {
  if (!(await creator())) return NextResponse.json({ error: "Creator only" }, { status: 403 })
  const { id, answer } = await req.json().catch(() => ({})) as { id?: number; answer?: string }
  if (!Number.isInteger(id) || !answer?.trim()) return NextResponse.json({ error: "Thiếu id hoặc câu trả lời" }, { status: 400 })
  const r = await answerTicket(id!, answer)
  return NextResponse.json(r, { status: "error" in r ? 400 : 200 })
}
