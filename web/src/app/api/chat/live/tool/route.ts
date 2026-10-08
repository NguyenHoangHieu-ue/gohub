import { NextRequest, NextResponse } from "next/server"
import { beGauLiveUser, runBeGauLiveTool } from "@/lib/agents/be-gau-live"
import { checkRateLimit } from "@/lib/rate-limit"

export const maxDuration = 120

// U3: phiên Trực tiếp Bé Gấu gọi tool → chạy qua prepareBeGau (lọc vai trò/giá vốn như chat), chỉ tool đọc.
export async function POST(req: NextRequest) {
  const u = await beGauLiveUser()
  if (!u) return NextResponse.json({ error: "Không có quyền" }, { status: 403 })
  const rl = await checkRateLimit(`bg-live-tool:${u.username}`, 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ response: { error: "Gọi tool quá nhiều, đợi chút." } })
  const { name, args } = await req.json().catch(() => ({}))
  if (typeof name !== "string") return NextResponse.json({ response: { error: "Thiếu tên tool" } })
  try {
    let response: any = await runBeGauLiveTool(u, name, args)
    const raw = JSON.stringify(response ?? null)
    if (raw.length > 24_000) response = { truncated: true, preview: raw.slice(0, 24_000) }   // giữ phiên live nhẹ
    return NextResponse.json({ response })
  } catch (e: any) {
    return NextResponse.json({ response: { error: e?.message || "Tool lỗi" } })
  }
}
