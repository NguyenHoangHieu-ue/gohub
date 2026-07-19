import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { runScheduledMessage, isDueSince } from "@/lib/scheduled-runner"

// Scheduler (GitHub Actions mỗi 15' + Vercel Cron backstop) gọi endpoint này định kỳ. Tìm các scheduled
// message ĐANG active + ĐẾN HẠN kể từ lần chạy cuối (so cron_expression theo ICT/UTC+7, catch-up chịu được
// scheduler chạy thưa/trễ) rồi chạy. Xác thực: Authorization: Bearer $CRON_SECRET.
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  // Thời gian theo ICT (UTC+7) — matcher đọc qua getUTC* nên shift trước
  const ict = new Date(Date.now() + 7 * 3600_000)

  const { data: messages, error } = await supabaseAdmin
    .from("lark_scheduled_messages")
    .select("*")
    .eq("is_active", true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = (messages || []).filter(m => isDueSince(m.cron_expression, m.last_run_at, ict))
  const results: { id: string; name: string; ok: boolean; error?: string }[] = []

  for (const msg of due) {
    try {
      await runScheduledMessage(msg)
      results.push({ id: msg.id, name: msg.name, ok: true })
    } catch (err: any) {
      results.push({ id: msg.id, name: msg.name, ok: false, error: err.message })
    }
  }

  return NextResponse.json({ checked: messages?.length || 0, ran: results.length, results })
}
