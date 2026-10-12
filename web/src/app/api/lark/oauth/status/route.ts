import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getLarkUserToken } from "@/lib/lark"

// Trạng thái kết nối Lark của CHÍNH người đang đăng nhập (cho UI Gấu Pro): Creator = token cũ, người khác = token riêng.
export async function GET() {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  if (!username) return NextResponse.json({ connected: false })
  const token = await getLarkUserToken(session.user.role === "creator" ? undefined : username)
  return NextResponse.json({ connected: !!token })
}
