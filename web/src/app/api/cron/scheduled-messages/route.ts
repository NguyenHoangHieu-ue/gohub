import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { runScheduledMessage, getMatchedSlotMs } from "@/lib/scheduled-runner"

// Scheduler (GitHub Actions mỗi 15' + Vercel Cron backstop) gọi endpoint này định kỳ. Tìm các scheduled
// message ĐANG active + ĐẾN HẠN kể từ lần chạy cuối (so cron_expression theo ICT/UTC+7, catch-up chịu được
// scheduler chạy thưa/trễ) rồi chạy. Xác thực: Authorization: Bearer $CRON_SECRET.
//
// ⚠️ CHỐNG GỬI TRÙNG (báo cáo chạy 3-4 lần/ngày): có 2 scheduler cùng hit endpoint này (GitHub Actions
// */15 + Vercel cron 1 lần/ngày), và GitHub Actions hay fire dồn/muộn thành cụm. Nếu chỉ ghi last_run_at
// SAU khi gửi thì các lần gọi ĐỒNG THỜI đều đọc last_run_at cũ → đều thấy "đến hạn" → cùng gửi. Fix bằng
// ATOMIC CLAIM: trước khi gửi, ghi last_run_at = slot với điều kiện last_run_at còn = giá trị cũ. Postgres
// khoá dòng nên chỉ 1 lần gọi "chiếm" được slot; các lần còn lại update 0 dòng → bỏ qua. Gửi lỗi thật →
// release (trả last_run_at về cũ) để tick sau thử lại.
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

  const dueList = (messages || []).map(m => {
    const slotMs = getMatchedSlotMs(m.cron_expression, m.last_run_at, ict)
    return slotMs != null ? { msg: m, slotMs } : null
  }).filter(Boolean) as { msg: any; slotMs: number }[]

  const results: { id: string; name: string; ok: boolean; skipped?: boolean; error?: string }[] = []

  for (const { msg, slotMs } of dueList) {
    // slotMs là ICT-shifted epoch → đổi về UTC ISO như runner vẫn ghi.
    const slotUtcIso = new Date(slotMs - 7 * 3600_000).toISOString()

    // ── Atomic claim: chỉ chiếm được nếu last_run_at CHƯA đổi kể từ lúc đọc ──
    let claimQuery = supabaseAdmin
      .from("lark_scheduled_messages")
      .update({ last_run_at: slotUtcIso })
      .eq("id", msg.id)
    claimQuery = msg.last_run_at == null
      ? claimQuery.is("last_run_at", null)
      : claimQuery.eq("last_run_at", msg.last_run_at)
    const { data: claimed, error: claimErr } = await claimQuery.select("id")

    if (claimErr) {
      results.push({ id: msg.id, name: msg.name, ok: false, error: `claim: ${claimErr.message}` })
      continue
    }
    if (!claimed || claimed.length === 0) {
      // Lần gọi khác (scheduler đồng thời) đã chiếm slot này → bỏ qua, không gửi trùng.
      results.push({ id: msg.id, name: msg.name, ok: true, skipped: true })
      continue
    }

    try {
      // Đã chiếm slot (last_run_at = slotUtcIso) → runner KHÔNG ghi lại last_run_at nữa.
      await runScheduledMessage(msg, { slotMs, noUpdateLastRun: true })
      results.push({ id: msg.id, name: msg.name, ok: true })
    } catch (err: any) {
      // Gửi lỗi thật → nhả claim (trả last_run_at về giá trị cũ) để tick sau thử lại.
      await supabaseAdmin
        .from("lark_scheduled_messages")
        .update({ last_run_at: msg.last_run_at })
        .eq("id", msg.id)
      results.push({ id: msg.id, name: msg.name, ok: false, error: err.message })
    }
  }

  const ran = results.filter(r => r.ok && !r.skipped).length
  return NextResponse.json({ checked: messages?.length || 0, ran, results })
}
