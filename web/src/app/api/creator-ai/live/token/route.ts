import { NextResponse } from "next/server"
import { liveUser } from "@/lib/agents/creator/live-auth"
import { buildLiveSession } from "@/lib/agents/creator-ai"
import { createLiveToken } from "@/lib/agents/live-token"
import { checkRateLimit } from "@/lib/rate-limit"

// G5: cấp token TẠM cho phiên Live Gấu Pro (bộ tool CHỈ ĐỌC) — xem lib/agents/live-token.ts.
export async function POST() {
  const u = await liveUser()
  if (!u) return NextResponse.json({ error: "Không có quyền dùng phiên giọng nói Gấu Pro." }, { status: 403 })
  const rl = await checkRateLimit(`gp-live:${u.username}`, 6, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: "Mở phiên quá nhiều, đợi 1 phút." }, { status: 429 })

  const { systemInstruction, declarations, toolNames } = await buildLiveSession(u.isCreator, u.username)
  try {
    return NextResponse.json({ ...(await createLiveToken(systemInstruction, declarations)), tools: toolNames })
  } catch (e: any) {
    return NextResponse.json({ error: `Không tạo được phiên: ${e?.message || e}` }, { status: 500 })
  }
}
