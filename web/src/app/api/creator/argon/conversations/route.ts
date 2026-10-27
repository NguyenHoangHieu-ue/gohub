import { NextResponse } from "next/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { createConversation, listConversations } from "@/lib/argon/conversations"

export const dynamic = "force-dynamic"

// Cuộc trò chuyện của Trợ lý (xem lib/argon/conversations.ts). GET → danh sách (mới nhất trước, gồm cuộc mặc định "Tham mưu hằng ngày") · POST → tạo cuộc mới.
export async function GET() {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ conversations: await listConversations(username) })
}

export async function POST() {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try { return NextResponse.json({ conversation: await createConversation(username) }) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
