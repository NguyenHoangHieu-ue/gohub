import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { runScheduledMessage, getMatchedSlotMs } from "@/lib/scheduled-runner"
import { alertCronFailure } from "@/lib/cron-alert"

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
export const maxDuration = 180

// Report Daily nặng nhất (~6 batch query gohub_dw tuần tự + Gemini format + gửi Lark) từng vượt quá
// maxDuration cũ (60s) → Vercel kill giữa chừng SAU khi atomic claim đã ghi last_run_at nhưng TRƯỚC khi
// gửi Lark → slot bị đánh dấu "đã chạy" dù tin chưa tới, lỗi này không throw exception nên catch/alert
// bên dưới không bắt được. Guard mềm này chủ động bailout sớm hơn giới hạn cứng của platform để LUÔN
// đi qua nhánh catch (release claim + alert Lark) thay vì bị kill âm thầm.
const SOFT_TIMEOUT_MS = 160_000 // để lại ~20s buffer trước maxDuration=180s cho phần response/claim-release
const REQUEST_BUDGET_MS = 165_000 // ngân sách tổng cả request — nhiều message đến hạn cùng lúc (catch-up sau downtime) chạy tuần tự nên phải chia ngân sách, không để message sau bị platform kill câm lặng vì message trước ăn hết giờ

function withSoftTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout sau ${Math.round(ms / 1000)}s khi chạy "${label}"`)), ms)
    ),
  ])
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Thời gian theo ICT (UTC+7) — matcher đọc qua getUTC* nên shift trước
  const ict = new Date(Date.now() + 7 * 3600_000)

  const { data: messages, error } = await supabaseAdmin
    .from("lark_scheduled_messages")
    .select("*")
    .eq("is_active", true)

  if (error) {
    await alertCronFailure("scheduled-messages", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const dueList = (messages || []).map(m => {
    const slotMs = getMatchedSlotMs(m.cron_expression, m.last_run_at, ict)
    return slotMs != null ? { msg: m, slotMs } : null
  }).filter(Boolean) as { msg: any; slotMs: number }[]

  const results: { id: string; name: string; ok: boolean; skipped?: boolean; error?: string }[] = []
  const startedAt = Date.now()

  for (const { msg, slotMs } of dueList) {
    // Hết ngân sách request (nhiều message đến hạn cùng lúc, vd catch-up sau downtime) → dừng, KHÔNG claim
    // message còn lại → lần chạy kế tiếp (vài phút sau) sẽ thấy vẫn "đến hạn" và xử lý tiếp, thay vì bị
    // Vercel kill giữa chừng và mất tin âm thầm.
    const remainingMs = REQUEST_BUDGET_MS - (Date.now() - startedAt)
    if (remainingMs < 15_000) {
      results.push({ id: msg.id, name: msg.name, ok: false, error: "Hết ngân sách thời gian lần chạy này — sẽ thử lại lần kế tiếp" })
      continue
    }

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
      await withSoftTimeout(
        runScheduledMessage(msg, { slotMs, noUpdateLastRun: true }),
        Math.min(SOFT_TIMEOUT_MS, remainingMs - 5_000),
        msg.name,
      )
      results.push({ id: msg.id, name: msg.name, ok: true })
    } catch (err: any) {
      // Gửi lỗi thật (hoặc soft-timeout) → nhả claim (trả last_run_at về giá trị cũ) để tick sau thử lại.
      await supabaseAdmin
        .from("lark_scheduled_messages")
        .update({ last_run_at: msg.last_run_at })
        .eq("id", msg.id)
      results.push({ id: msg.id, name: msg.name, ok: false, error: err.message })
      // Trước đây lỗi per-message không alert (chỉ lỗi đọc danh sách ở đầu route mới alert) → thất bại
      // âm thầm nhiều ngày không ai biết. Nay luôn báo Lark khi 1 message thất bại.
      await alertCronFailure("scheduled-messages", new Error(`"${msg.name}": ${err.message}`))
    }
  }

  const ran = results.filter(r => r.ok && !r.skipped).length
  return NextResponse.json({ checked: messages?.length || 0, ran, results })
}
