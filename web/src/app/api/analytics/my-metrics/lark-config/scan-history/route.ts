import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runLarkHistoryScan } from "@/lib/lark-scan-runner"
import { canWriteTab } from "@/lib/writable-tabs"

const WRITE_ROLES = ["admin", "creator"]

// POST { chat_id, days_back } — quét lịch sử 1 LẦN cho 1 group Lark cụ thể (bù cho hạn chế real-time
// capture không thấy thread trước lúc bot bắt đầu sống, xem lark-scan-runner.ts). Khác "Quét ngay"
// (dùng capture log, mọi group cùng lúc) — route này cần Hiếu tự chỉ định đúng 1 chat_id.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username || !(await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { chat_id, days_back } = await req.json()
  if (!chat_id || typeof chat_id !== "string") {
    return NextResponse.json({ error: "Thiếu chat_id" }, { status: 400 })
  }
  try {
    const result = await runLarkHistoryScan(chat_id, Number(days_back) || 30)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
