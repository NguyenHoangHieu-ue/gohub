// Cron — quét 1 group Lark (config Hiếu tự nhập ở /analytics/my-metrics), tự đề xuất cặp
// request/completion cho SLA (Product Request) và Vendor Selection Speed bằng Gemini, ghi vào
// okr_lark_events với status='pending_review'. Hiếu duyệt tay trong My Metrics trước khi tính vào KPI
// — bot KHÔNG tự quyết số báo cáo hiệu suất một mình. Logic thật nằm ở lib/lark-scan-runner.ts
// (dùng chung với nút "Quét ngay" thủ công).
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
