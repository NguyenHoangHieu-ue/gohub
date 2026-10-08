import { NextResponse } from "next/server"
import { beGauLiveUser, buildBeGauLive } from "@/lib/agents/be-gau-live"
import { createLiveToken } from "@/lib/agents/live-token"
import { checkRateLimit } from "@/lib/rate-limit"

// U3: token tạm cho phiên Trực tiếp của Bé Gấu (mở theo vai trò ở bảng tính năng, bộ tool chỉ đọc).
export async function POST() {
  const u = await beGauLiveUser()
  if (!u) return NextResponse.json({ error: "Vai trò của bạn chưa được mở Trò chuyện trực tiếp." }, { status: 403 })
  const rl = await checkRateLimit(`bg-live:${u.username}`, 6, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: "Mở phiên quá nhiều, đợi 1 phút." }, { status: 429 })
  const { systemInstruction, declarations, toolNames } = await buildBeGauLive(u)
  try {
    return NextResponse.json({ ...(await createLiveToken(systemInstruction, declarations)), tools: toolNames })
  } catch (e: any) {
    return NextResponse.json({ error: `Không tạo được phiên: ${e?.message || e}` }, { status: 500 })
  }
}
