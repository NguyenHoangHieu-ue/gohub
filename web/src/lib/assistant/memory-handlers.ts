import { NextRequest, NextResponse } from "next/server"
import { runAssistantMemory } from "@/lib/assistant-memory"
import { getAgentProfile, saveAgentProfile } from "@/lib/agent-profile"
import { isMemoryOff, setMemoryOff, exportMemory, eraseMemory, deleteMemoryItem } from "@/lib/assistant-memory-rights"

// Xử lý chung của panel "Trí nhớ" (xem/thêm/sửa/ghim/xoá/xuất/tắt trí nhớ dài hạn CỦA CHÍNH người gọi) — dùng cho Gấu Pro (/api/creator-ai/memory, theo cờ gp_personal_features)
// và Gấu Prime (/api/creator/assistant/memory, mọi người dùng Gấu Prime: Argon đọc chung trí nhớ này nên ai dùng Gấu Prime cũng phải xem/xoá được). `enabled` do route quyết định.
export async function memoryGet(req: NextRequest, username: string, enabled: boolean): Promise<NextResponse> {
  if (!enabled) return NextResponse.json({ enabled: false, off: false, memories: [] })
  if (req.nextUrl.searchParams.get("export")) {
    return new NextResponse(JSON.stringify(await exportMemory(username), null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="tri-nho-${username}.json"` },
    })
  }
  const r = await runAssistantMemory({ action: "list" }, username, "manual")
  return NextResponse.json({ enabled: true, off: await isMemoryOff(username), profile: await getAgentProfile(username), memories: r.result?.memories ?? [], error: r.error })
}

/** POST { action: save|update|forget|delete|erase|off|profile, id?, kind?, content?, pinned?, off? } */
export async function memoryPost(req: NextRequest, username: string, enabled: boolean): Promise<NextResponse> {
  if (!enabled) return NextResponse.json({ error: "Trí nhớ cá nhân chưa bật cho tài khoản này." }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  if (body.action === "delete")
    return typeof body.id === "number" && await deleteMemoryItem(username, body.id)
      ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Không thấy mục này." }, { status: 404 })
  if (body.action === "profile") return NextResponse.json({ ok: true, profile: await saveAgentProfile(username, body) })
  if (body.action === "erase") return NextResponse.json({ ok: true, ...(await eraseMemory(username)) })
  if (body.action === "off") { await setMemoryOff(username, !!body.off); return NextResponse.json({ ok: true, off: !!body.off }) }
  if (!["save", "update", "forget"].includes(body.action)) return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 })
  const r = await runAssistantMemory(body, username, "manual")
  return NextResponse.json(r, { status: r.error ? 400 : 200 })
}
