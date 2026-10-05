import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runAssistantMemory } from "@/lib/assistant-memory"
import { personalFeaturesEnabled } from "@/lib/assistant-memory-auto"

// Trí nhớ của Gấu (G3): xem/thêm/sửa/ghim/quên trí nhớ dài hạn CỦA CHÍNH người gọi. Bật theo cờ gp_personal_features.
async function me() {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  if (!username) return null
  return { username, enabled: await personalFeaturesEnabled(session.user.role === "creator").catch(() => false) }
}

export async function GET() {
  const u = await me()
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!u.enabled) return NextResponse.json({ enabled: false, memories: [] })
  const r = await runAssistantMemory({ action: "list" }, u.username, "manual")
  return NextResponse.json({ enabled: true, memories: r.result?.memories ?? [], error: r.error })
}

// POST { action: save|update|forget, id?, kind?, content?, pinned? }
export async function POST(req: NextRequest) {
  const u = await me()
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!u.enabled) return NextResponse.json({ error: "Trí nhớ cá nhân chưa bật cho tài khoản này." }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  if (!["save", "update", "forget"].includes(body.action)) return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 })
  const r = await runAssistantMemory(body, u.username, "manual")
  return NextResponse.json(r, { status: r.error ? 400 : 200 })
}
