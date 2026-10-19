import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { runBroadcastOnce } from "@/lib/broadcast-once"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// GET ?id=<jobId>[&dryRun=1] — Bearer CRON_SECRET. Chỉ chạy các job đã tạo sẵn trong app_settings (key broadcast_once:<id>);
// KHÔNG nhận nội dung/người nhận từ request. Cổng giờ + chống gửi trùng nằm trong lib/broadcast-once.ts.
// HTTP: 200 gửi xong/đã gửi trước đó · 425 gọi SỚM (kèm waitMs, bên gọi chờ rồi gọi lại) · 410 gọi TRỄ (không gửi) · 404 không có job.
export async function GET(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = req.nextUrl.searchParams.get("id")?.trim()
  if (!id) return NextResponse.json({ error: "id bắt buộc" }, { status: 400 })
  try {
    const r = await runBroadcastOnce(id, { dryRun: req.nextUrl.searchParams.get("dryRun") === "1" })
    const status = r.state === "early" ? 425 : r.state === "late" ? 410 : r.state === "notfound" ? 404 : 200
    return NextResponse.json({ at: new Date().toISOString(), ...r }, { status, headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("[cron/broadcast-once]", (e as Error).message)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
