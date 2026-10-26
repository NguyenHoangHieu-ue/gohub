import { NextRequest, NextResponse } from "next/server"
import { requireArgonMember } from "@/lib/argon/access"
import { countByKind, loadInbox } from "@/lib/assistant/inbox"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// GET → "Việc cần duyệt" của Trợ lý: mọi thứ đang chờ anh, xếp theo độ gấp. ?count=1 chỉ trả số lượng (cho huy hiệu ở thanh tab).
// Hành động (duyệt/từ chối/xác nhận) gọi thẳng endpoint có sẵn của từng loại, không có endpoint ghi riêng ở đây.
export async function GET(req: NextRequest) {
  const acc = await requireArgonMember()
  if (!acc) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { items, failed } = await loadInbox(acc.username, Date.now(), acc.level)
  if (req.nextUrl.searchParams.get("count") === "1") return NextResponse.json({ total: items.length, byKind: countByKind(items), failed })
  return NextResponse.json({ items, byKind: countByKind(items), failed, now: Date.now() })
}
