import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runAssistantMemory } from "@/lib/assistant-memory"
import { personalFeaturesEnabled } from "@/lib/assistant-memory-auto"
import { getAgentProfile, saveAgentProfile } from "@/lib/agent-profile"
import { isMemoryOff, setMemoryOff, exportMemory, eraseMemory, deleteMemoryItem } from "@/lib/assistant-memory-rights"

// Trí nhớ của Gấu (G3): xem/thêm/sửa/ghim/xoá/xuất/tắt trí nhớ dài hạn CỦA CHÍNH người gọi. Bật theo cờ gp_personal_features.
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
  if (!u.enabled) return NextResponse.json({ enabled: false, off: false, memories: [] })
  if (req.nextUrl.searchParams.get("export")) {
    return new NextResponse(JSON.stringify(await exportMemory(u.username), null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="tri-nho-${u.username}.json"` },
    })
  }
  const r = await runAssistantMemory({ action: "list" }, u.username, "manual")
  return NextResponse.json({ enabled: true, off: await isMemoryOff(u.username), profile: await getAgentProfile(u.username), memories: r.result?.memories ?? [], error: r.error })
}

// POST { action: save|update|forget|delete|erase|off, id?, kind?, content?, pinned?, off? }
export async function POST(req: NextRequest) {
  const u = await me()
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!u.enabled) return NextResponse.json({ error: "Trí nhớ cá nhân chưa bật cho tài khoản này." }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  if (body.action === "delete")
    return typeof body.id === "number" && await deleteMemoryItem(u.username, body.id)
      ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Không thấy mục này." }, { status: 404 })
  if (body.action === "profile") return NextResponse.json({ ok: true, profile: await saveAgentProfile(u.username, body) })
  if (body.action === "erase") return NextResponse.json({ ok: true, ...(await eraseMemory(u.username)) })
  if (body.action === "off") { await setMemoryOff(u.username, !!body.off); return NextResponse.json({ ok: true, off: !!body.off }) }
  if (!["save", "update", "forget"].includes(body.action)) return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 })
  const r = await runAssistantMemory(body, u.username, "manual")
  return NextResponse.json(r, { status: r.error ? 400 : 200 })
}
