import { NextRequest, NextResponse } from "next/server"
import { prewarmAnalyticsCache } from "@/lib/analytics-helpers"

// Vercel Cron gọi định kỳ (xem vercel.json). Chạy lại các query analytics đã đăng ký (registry) để giữ
// cache nóng + làm tươi sau khi data ngày mới được nạp vào gohub_dw → load đầu ngày cũng nhanh.
// Vercel gửi Authorization: Bearer $CRON_SECRET. Cũng cho admin/creator gọi tay (qua nút Settings nếu cần).
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const result = await prewarmAnalyticsCache()
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() })
}
