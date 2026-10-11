import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runAssistantMemory } from "@/lib/assistant-memory"
import { loadFeatureMatrix, featureEnabled } from "@/lib/assistant-features"
import { isMemoryOff, setMemoryOff, exportMemory, eraseMemory, deleteMemoryItem } from "@/lib/assistant-memory-rights"

// Trí nhớ của Bé Gấu (P2): người dùng tự xem/thêm/sửa/ghim/xoá/xuất/tắt trí nhớ CỦA CHÍNH MÌNH. Bật theo bảng tính năng theo vai trò ("memory").
// Creator/admin KHÔNG đọc được trí nhớ người khác qua route này (luôn theo username của phiên đăng nhập).
async function me() {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  if (!username) return null
  return { username, enabled: featureEnabled(await loadFeatureMatrix(), "memory", session.user.role) }
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
  return NextResponse.json({ enabled: true, off: await isMemoryOff(u.username), memories: r.result?.memories ?? [], error: r.error })
}

// POST { action: save|update|delete|erase|off, id?, content?, pinned?, off? }
export async function POST(req: NextRequest) {
  const u = await me()
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!u.enabled) return NextResponse.json({ error: "Trí nhớ cá nhân chưa bật cho vai trò của bạn." }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  switch (body.action) {
    case "save": case "update": {
      const r = await runAssistantMemory(body, u.username, "manual")
      return NextResponse.json(r, { status: r.error ? 400 : 200 })
    }
    case "delete":
      return typeof body.id === "number" && await deleteMemoryItem(u.username, body.id)
        ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Không thấy mục này." }, { status: 404 })
    case "erase":
      return NextResponse.json({ ok: true, ...(await eraseMemory(u.username)) })
    case "off":
      await setMemoryOff(u.username, !!body.off)
      return NextResponse.json({ ok: true, off: !!body.off })
    default:
      return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 })
  }
}
