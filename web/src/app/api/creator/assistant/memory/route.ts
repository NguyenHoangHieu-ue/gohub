import { NextRequest, NextResponse } from "next/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { memoryGet, memoryPost } from "@/lib/assistant/memory-handlers"

export const dynamic = "force-dynamic"

// Trí nhớ của người dùng Gấu Prime (Creator + thành viên được cấp): chỉ trí nhớ CỦA CHÍNH người gọi (khoá theo username). Argon đọc chung trí nhớ này nên ai dùng Gấu Prime cũng xem/sửa/xoá/tắt được.
export async function GET(req: NextRequest) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return memoryGet(req, username, true)
}

export async function POST(req: NextRequest) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return memoryPost(req, username, true)
}
