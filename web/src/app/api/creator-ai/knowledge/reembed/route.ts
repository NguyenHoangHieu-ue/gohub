import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { reembedMissing } from "@/lib/agents/creator/kb-recall"

export const maxDuration = 300

// Tạo embedding (gemini-embedding-001, 768 chiều) cho mục KB còn thiếu — chạy sau khi đổi model embedding (s223). Chỉ creator.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== "creator") return NextResponse.json({ error: "Chỉ creator" }, { status: 403 })
  return NextResponse.json(await reembedMissing())
}
