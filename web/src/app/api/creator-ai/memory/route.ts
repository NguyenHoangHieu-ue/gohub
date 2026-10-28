import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { personalFeaturesEnabled } from "@/lib/assistant-memory-auto"
import { memoryGet, memoryPost } from "@/lib/assistant/memory-handlers"

// Trí nhớ của Gấu Pro (G3): xử lý chung ở lib/assistant/memory-handlers.ts. Bật theo cờ gp_personal_features.
async function me() {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  if (!username) return null
  // Truyền isCreator, không truyền username: người dùng đã tự tắt vẫn phải vào được panel để bật lại / xuất / xoá.
  return { username, enabled: await personalFeaturesEnabled(session.user.role === "creator").catch(() => false) }
}

export async function GET(req: NextRequest) {
  const u = await me()
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return memoryGet(req, u.username, u.enabled)
}

export async function POST(req: NextRequest) {
  const u = await me()
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return memoryPost(req, u.username, u.enabled)
}
