// Logic quét Lark thật — dùng chung giữa cron tự động (api/cron/my-metrics-lark-scan) và nút
// "Quét ngay" thủ công (api/analytics/my-metrics/lark-config/scan-now) để Hiếu test được ngay
// thay vì phải đợi cron chạy 1 lần/ngày mới biết fix có work không.
import { supabaseAdmin } from "@/lib/supabase"
import { fetchRecentThreads } from "@/lib/lark-thread-scan"
import { classifyLarkThread } from "@/lib/okr-lark-classify"
import { sendLarkDM, getLarkUserOpenId } from "@/lib/lark"
import { currentQuarterLabel } from "@/lib/okr-helpers"

const CONFIG_KEY = "my_metrics_lark_scan_config"
const MAX_NEW_THREADS_PER_RUN = 40

interface ScanConfig { enabled: boolean; chat_id: string; days_back: number }

function normalizeConfig(raw: any): ScanConfig {
  return {
    enabled: raw?.enabled === true,
    chat_id: typeof raw?.chat_id === "string" ? raw.chat_id : "",
    days_back: Number(raw?.days_back) > 0 ? Number(raw.days_back) : 3,
  }
}

export interface ScanRunResult {
  skipped?: string
  scanned: number; classified: number; inserted: number; not_matched: number
  backlog_remaining: number
}

// ignoreEnabled=true cho nút "Quét ngay" (Hiếu bấm test dù chưa tick "Bật quét tự động").
export async function runLarkScan(ignoreEnabled = false): Promise<ScanRunResult> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
  const config = normalizeConfig(data?.value ? JSON.parse(data.value) : null)

  if ((!config.enabled && !ignoreEnabled) || !config.chat_id) {
    return { skipped: "chưa bật hoặc chưa cấu hình chat_id", scanned: 0, classified: 0, inserted: 0, not_matched: 0, backlog_remaining: 0 }
  }

  // Bounded — mỗi thread tốn 2 call Lark để hydrate chi tiết (batch 15 tại 1 thời điểm, xem
  // lark-thread-scan.ts); 200 thread là đủ tiến bộ mỗi lần chạy mà không dồn quá tải/rate-limit.
  // Không cần thấy HẾT backlog trong 1 lần — not_matched dedupe (xem dưới) đảm bảo lần chạy sau
  // tự tiến tới phần backlog cũ hơn, không giẫm chân tại chỗ.
  const maxThreads = Math.min(200, config.days_back * 10)
  const threads = await fetchRecentThreads(config.chat_id, config.days_back, maxThreads)
    .then(list => list.filter(t => t.replies.length > 0))

  if (threads.length === 0) return { scanned: 0, classified: 0, inserted: 0, not_matched: 0, backlog_remaining: 0 }

  const { data: existing } = await supabaseAdmin
    .from("okr_lark_events").select("message_id")
    .in("message_id", threads.map(t => t.message_id))
  const seen = new Set((existing ?? []).map((r: any) => r.message_id))

  const toClassify = threads.filter(t => !seen.has(t.message_id)).slice(0, MAX_NEW_THREADS_PER_RUN)
  const quarter = currentQuarterLabel()
  let inserted = 0
  let notMatched = 0

  for (const t of toClassify) {
    const result = await classifyLarkThread(t)
    if (!result) continue

    if (!result.is_match || !result.metric) {
      await supabaseAdmin.from("okr_lark_events").upsert({
        quarter, metric: "none", chat_id: config.chat_id,
        thread_id: t.thread_id, message_id: t.message_id,
        request_time: new Date(parseInt(t.create_time)).toISOString(),
        request_snippet: t.content.slice(0, 300), request_sender: t.sender_name,
        ai_reason: result.reason, status: "not_matched",
      }, { onConflict: "message_id,metric" })
      notMatched++
      continue
    }

    const completion = result.completion_reply_index !== null ? t.replies[result.completion_reply_index] : null

    const { error } = await supabaseAdmin.from("okr_lark_events").upsert({
      quarter, metric: result.metric, chat_id: config.chat_id,
      thread_id: t.thread_id, message_id: t.message_id,
      request_time: new Date(parseInt(t.create_time)).toISOString(),
      request_snippet: t.content.slice(0, 300), request_sender: t.sender_name,
      completion_time: completion ? new Date(parseInt(completion.create_time)).toISOString() : null,
      completion_snippet: completion ? completion.content.slice(0, 300) : null,
      completion_sender: completion ? completion.name : null,
      duration_value: completion
        ? +((parseInt(completion.create_time) - parseInt(t.create_time)) / (result.metric === "sla" ? 3600000 : 60000)).toFixed(2)
        : null,
      ai_reason: result.reason, status: "pending_review",
    }, { onConflict: "message_id,metric" })
    if (!error) inserted++
  }

  if (inserted > 0) {
    const openId = await getLarkUserOpenId()
    if (openId) {
      await sendLarkDM(openId, `🤖 Bé Gấu vừa phát hiện ${inserted} case SLA/Vendor Speed mới từ Lark — vào My Metrics duyệt nhé.`)
    }
  }

  return {
    scanned: threads.length, classified: toClassify.length, inserted, not_matched: notMatched,
    backlog_remaining: threads.length - seen.size - toClassify.length,
  }
}
