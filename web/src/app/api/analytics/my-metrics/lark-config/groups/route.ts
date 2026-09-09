import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canWriteTab } from "@/lib/writable-tabs"
import { getLarkToken } from "@/lib/lark"
import { listBotChats } from "@/lib/lark-thread-scan"

const READ_ROLES = ["admin", "creator"]

// GET — danh sách group bot đang là thành viên, cho Hiếu chọn khi "Quét lịch sử 1 lần" thay vì phải
// tự tra chat_id tay.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username || !(await canWriteTab(session.user.username, "my-metrics", READ_ROLES))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const appToken = await getLarkToken()
    const groups = await listBotChats(appToken)
    return NextResponse.json({ groups })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
