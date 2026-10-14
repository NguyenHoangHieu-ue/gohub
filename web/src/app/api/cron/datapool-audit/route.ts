// Soát giá vốn Datapool định kỳ (cron-job.org hằng ngày): tính lại giá vốn mọi SKU 3HK / BC CMHK / BC Singtel theo tỷ giá + công thức + bảng giá hiện tại
// rồi so với giá đang có. DM Hiếu CHỈ khi tập SKU lệch thay đổi so với lần đã báo (hoặc hết lệch) — không nhắn lặp mỗi ngày. `?force=1` luôn gửi.
// Gọi: GET/POST + `Authorization: Bearer $CRON_SECRET`. Kết quả chỉ trả số lượng.
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { alertCronFailure } from "@/lib/cron-alert"
import { runAuditAndNotify } from "@/lib/datapool-audit/server"

export const maxDuration = 300

async function run(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const r = await runAuditAndNotify("Soát định kỳ hằng ngày", req.nextUrl.searchParams.get("force") === "1")
    return NextResponse.json({ ok: true, ...r, changed: r.changed.length })
  } catch (e) {
    await alertCronFailure("datapool-audit", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
export const GET = run
export const POST = run
