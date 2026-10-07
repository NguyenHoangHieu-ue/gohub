// Cron — Lark DM "Đánh giá My Metrics" cho Hiếu mỗi sáng (Hiếu chốt 8:30 giờ VN, s225 C0.6). Gộp luôn cảnh báo thread Lark chưa chốt
// cuối tháng (trước đây bot quét Lark gửi riêng). Chỉ gửi 1 lần/ngày (khoá app_settings) — Vercel cron (Hobby lệch trong khung giờ)
// và cron-job.org (đúng 8:30) cùng gọi cũng không gửi trùng. ?force=1 gửi lại.
import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { alertCronFailure } from "@/lib/cron-alert"
import { getLarkUserOpenId, sendLarkDM } from "@/lib/lark"
import { currentQuarterLabel } from "@/lib/okr-helpers"
import { loadDailyReview } from "@/lib/okr-review-server"
import { reviewText } from "@/lib/okr-review"

const SENT_KEY = "okr.daily_review_sent"
const LINK = "https://intel-v2.gohub.cloud/analytics/my-metrics"

export async function GET(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const force = req.nextUrl.searchParams.get("force") === "1"
  const dateVN = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
  try {
    const { data: sent } = await supabaseAdmin.from("app_settings").select("value").eq("key", SENT_KEY).maybeSingle()
    if (!force && sent?.value === dateVN) return NextResponse.json({ ok: true, skipped: "đã gửi hôm nay" })
    const hieuId = await getLarkUserOpenId()
    if (!hieuId) return NextResponse.json({ ok: false, skipped: "Chưa Kết nối Lark cá nhân (Creator Settings)" })

    const review = await loadDailyReview(currentQuarterLabel())
    const text = reviewText(review, LINK)
    await sendLarkDM(hieuId, text)
    await supabaseAdmin.from("app_settings").upsert({ key: SENT_KEY, value: dateVN, category: "okr", label: "Ngày gửi Lark DM đánh giá My Metrics gần nhất", updated_at: new Date().toISOString() }, { onConflict: "key" })
    return NextResponse.json({ ok: true, sent: dateVN, chars: text.length })
  } catch (e: any) {
    await alertCronFailure("my-metrics-daily-review", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
