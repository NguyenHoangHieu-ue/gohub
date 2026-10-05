import { NextRequest, NextResponse } from "next/server"
import { liveUser } from "@/lib/agents/creator/live-auth"
import { LIVE_TOOLS } from "@/lib/agents/creator-ai"
import { dispatchTool } from "@/lib/agents/creator/tools/dispatch"
import { checkRateLimit } from "@/lib/rate-limit"

export const maxDuration = 120

// G5: phiên Live gọi tool → trình duyệt chuyển về đây chạy (chỉ tool ĐỌC trong LIVE_TOOLS), trả kết quả cho model.
export async function POST(req: NextRequest) {
  const u = await liveUser()
  if (!u) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })
  const rl = await checkRateLimit(`gp-live-tool:${u.username}`, 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ response: { error: "Gọi tool quá nhiều, đợi chút." } })
  const { name, args } = await req.json().catch(() => ({}))
  if (typeof name !== "string" || !LIVE_TOOLS.has(name)) {
    return NextResponse.json({ response: { error: `Tool "${name}" không dùng được trong phiên giọng nói — chuyển sang chat thường.` } })
  }
  try {
    const out = await dispatchTool({ name, args: args ?? {} }, undefined, [], { username: u.username, isCreator: u.isCreator })
    let response = out.functionResponse.response
    const raw = JSON.stringify(response ?? null)
    if (raw.length > 20_000) response = { truncated: true, preview: raw.slice(0, 20_000) }   // giữ phiên live nhẹ
    return NextResponse.json({ response })
  } catch (e: any) {
    return NextResponse.json({ response: { error: e?.message || "Tool lỗi" } })
  }
}
