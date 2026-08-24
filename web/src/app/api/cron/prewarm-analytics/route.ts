import { NextRequest, NextResponse } from "next/server"
import { prewarmAnalyticsCache, prewarmAnalyticsUrls } from "@/lib/analytics-helpers"
import { alertCronFailure } from "@/lib/cron-alert"

// Vercel Cron gọi định kỳ (xem vercel.json). Chạy lại các query analytics đã đăng ký (registry) để giữ
// cache nóng + làm tươi sau khi data ngày mới được nạp vào gohub_dw → load đầu ngày cũng nhanh.
// Vercel gửi Authorization: Bearer $CRON_SECRET. Cũng cho admin/creator gọi tay (qua nút Settings nếu cần).
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // 1) generic /api/analytics/query (replay SQL); 2) endpoint chuyên dụng bod/b2b/b2c/channels (re-fetch URL)
    const generic = await prewarmAnalyticsCache()
    const routes  = await prewarmAnalyticsUrls(req.nextUrl.origin)
    return NextResponse.json({ ok: true, generic, routes, at: new Date().toISOString() })
  } catch (err) {
    await alertCronFailure("prewarm-analytics", err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
