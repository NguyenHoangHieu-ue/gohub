import { NextRequest, NextResponse } from "next/server"
import { runCreatorAI }              from "@/lib/agents/creator-ai"
import { getCreatorLarkOpenId, sendLarkDM } from "@/lib/lark"
import { alertCronFailure }          from "@/lib/cron-alert"

// Digest chủ động buổi sáng cho Gấu Pro (đề xuất "E"/ý tưởng #1 roadmap audit s196+5) — trước đây Gấu
// Pro 100% phản ứng theo lượt, không tự khởi xướng gì. Chạy 1 lần/ngày (Vercel Hobby: cron tối đa
// 1x/ngày/job), sau prewarm(09:00)+b2c-report(09:30) để dữ liệu đã ấm.
export const dynamic    = "force-dynamic"
export const maxDuration = 120

const DIGEST_PROMPT = `Viết digest buổi sáng ngắn gọn cho Hiếu, gửi qua Lark (không dùng bảng/chart
markdown — chỉ text + bullet + emoji nhẹ, tối đa ~120 từ):
1. Doanh thu HÔM QUA (fulfillment): tổng + tách B2B/B2C, so với hôm trước tăng/giảm bao nhiêu %.
2. Nếu có bất thường đáng chú ý (sụt giảm mạnh 1 kênh, SKU nào đó đột biến, v.v.) thì nêu — không có gì
   bất thường thì bỏ qua mục này, đừng bịa.
Không cần chào hỏi dài dòng, đi thẳng vào số liệu.`

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { text } = await runCreatorAI([], DIGEST_PROMPT, undefined, undefined, true, "cron")
    const openId = await getCreatorLarkOpenId()
    if (!openId) return NextResponse.json({ ok: false, error: "Không tìm được Lark open_id của creator" }, { status: 500 })

    await sendLarkDM(openId, `☀️ Digest sáng nay từ Gấu Pro\n\n${text}`)
    return NextResponse.json({ ok: true, at: new Date().toISOString() })
  } catch (err) {
    await alertCronFailure("gau-pro-digest", err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
