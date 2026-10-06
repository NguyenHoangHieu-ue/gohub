// Cron — đọc thread Lark liên quan Hiếu (capture log) và áp luật đánh dấu của Hiếu (s225, lib/okr-lark-rules.ts): chỉ group
// Telecom Product (Private), tính từ lúc tag Hiếu, YES = đóng không tính, Typing trên câu trả lời của Hiếu = xong (tự tính).
// Case còn mở được đọc lại mỗi lần chạy. Logic thật ở lib/lark-scan-runner.ts (dùng chung "Quét ngay" + lệnh "Note đi").
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { alertCronFailure } from "@/lib/cron-alert"
import { runLarkScan } from "@/lib/lark-scan-runner"

export async function GET(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const result = await runLarkScan()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    await alertCronFailure("my-metrics-lark-scan", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
