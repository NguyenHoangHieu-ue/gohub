import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getLarkUserToken } from "@/lib/lark"

// Trạng thái kết nối Lark của creator (cho UI Gấu Pro).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ connected: false })
  }
  const token = await getLarkUserToken()
  return NextResponse.json({ connected: !!token })
}
