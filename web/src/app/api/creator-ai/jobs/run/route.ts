import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { runJobChunk, triggerJobRun } from "@/lib/agents/creator/jobs"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Chạy 1 chặng việc nền Gấu Pro (G2). Gọi nội bộ (Bearer CRON_SECRET) từ lúc tạo việc, từ chặng trước, hoặc cron quét việc kẹt.
// Trả 202 ngay, làm trong waitUntil — để request gọi chặng tiếp không phải chờ chặng này chạy xong.
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await req.json().catch(() => ({}))
  if (typeof id !== "string") return NextResponse.json({ error: "Thiếu id" }, { status: 400 })
  const origin = req.nextUrl.origin
  waitUntil((async () => {
    try {
      if ((await runJobChunk(id)) === "continue") await triggerJobRun(origin, id)
    } catch (e) { console.error("[gp_jobs] run:", (e as Error).message) }
  })())
  return NextResponse.json({ accepted: true }, { status: 202 })
}
