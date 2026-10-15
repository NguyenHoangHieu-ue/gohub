import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { triggerWorker } from "@/lib/argon/bg"
import { runBackgroundSegment } from "@/lib/argon/bg-worker"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Worker việc nền của Phòng Argon: chạy 1 đoạn (≤265s) của 1 lượt rồi tự gọi đoạn kế tới khi xong (tối đa MAX_BG_SEGMENTS đoạn / MAX_BG_COST_USD).
// Gọi nội bộ bằng Bearer CRON_SECRET (từ lúc giao việc, từ đoạn trước, hoặc cron argon-sync quét việc kẹt). Trả 202 ngay, làm trong waitUntil.
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { runId } = await req.json().catch(() => ({}))
  if (typeof runId !== "string") return NextResponse.json({ error: "Thiếu runId" }, { status: 400 })
  const origin = req.nextUrl.origin
  waitUntil((async () => {
    try {
      if ((await runBackgroundSegment(runId, origin)) === "continue") await triggerWorker(origin, runId)
    } catch (e) { console.error("[argon worker]", (e as Error).message) }
  })())
  return NextResponse.json({ accepted: true }, { status: 202 })
}
