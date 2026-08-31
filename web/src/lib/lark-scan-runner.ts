// Logic quét Lark thật — dùng chung giữa cron tự động (api/cron/my-metrics-lark-scan) và nút
// "Quét ngay" thủ công (api/analytics/my-metrics/lark-config/scan-now) để Hiếu test được ngay
// thay vì phải đợi cron chạy 1 lần/ngày mới biết fix có work không.
import { supabaseAdmin } from "@/lib/supabase"
import { fetchThreadsFromCapturedLog, fetchRecentThreads, getChatName, type LarkThread } from "@/lib/lark-thread-scan"
import { classifyLarkThread } from "@/lib/okr-lark-classify"
import { sendLarkDM, getLarkUserOpenId, getLarkToken } from "@/lib/lark"
import { quarterLabelForDate } from "@/lib/okr-helpers"

const CONFIG_KEY = "my_metrics_lark_scan_config"
const MAX_NEW_THREADS_PER_RUN = 40

// s173: bỏ chat_id — nguồn phát hiện thread nay là capture log real-time (api/lark/events, MỌI
// group bot có mặt), không còn giới hạn đúng 1 group cấu hình tay. Field chat_id giữ optional trong
// type/parse để đọc được config cũ (không migration xoá cột Supabase) nhưng không dùng để lọc nữa.
interface ScanConfig { enabled: boolean; days_back: number }

function normalizeConfig(raw: any): ScanConfig {
  return {
    enabled: raw?.enabled === true,
    days_back: Number(raw?.days_back) > 0 ? Number(raw.days_back) : 3,
  }
}

export interface ScanRunResult {
  skipped?: string
  scanned: number; classified: number; inserted: number; not_matched: number
  classify_errors: number
  backlog_remaining: number
  groups: { chat_id: string; chat_name: string; thread_count: number }[]
}

// ignoreEnabled=true cho nút "Quét ngay" (Hiếu bấm test dù chưa tick "Bật quét tự động").
export async function runLarkScan(ignoreEnabled = false): Promise<ScanRunResult> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
  const config = normalizeConfig(data?.value ? JSON.parse(data.value) : null)

  if (!config.enabled && !ignoreEnabled) {
    return { skipped: "chưa bật quét tự động", scanned: 0, classified: 0, inserted: 0, not_matched: 0, classify_errors: 0, backlog_remaining: 0, groups: [] }
  }

  // Bounded — mỗi thread tốn 2 call Lark để hydrate chi tiết (batch 15 tại 1 thời điểm, xem
  // lark-thread-scan.ts); 200 thread là đủ tiến bộ mỗi lần chạy mà không dồn quá tải/rate-limit.
  // Không cần thấy HẾT backlog trong 1 lần — not_matched dedupe (xem dưới) đảm bảo lần chạy sau
  // tự tiến tới phần backlog cũ hơn, không giẫm chân tại chỗ.
  const maxThreads = Math.min(200, config.days_back * 10)
  const allThreads = await fetchThreadsFromCapturedLog(config.days_back, maxThreads)
  // "Đã quét" = mọi thread capture log phát hiện, KỂ CẢ bị loại bởi filter replies bên dưới — Hiếu
  // cần thấy group nào bot có chạm tới để đối chiếu, không chỉ nhóm lọt qua được tới bước phân loại.
  const groupCount = new Map<string, number>()
  for (const t of allThreads) groupCount.set(t.chat_id, (groupCount.get(t.chat_id) ?? 0) + 1)
  const groups: { chat_id: string; chat_name: string; thread_count: number }[] = []
  if (groupCount.size > 0) {
    const appToken = await getLarkToken()
    for (const [chatId, count] of groupCount) {
      groups.push({ chat_id: chatId, chat_name: await getChatName(chatId, appToken), thread_count: count })
    }
  }

  // Thread không có reply nào — thường vì tin gửi KHÔNG dùng "Reply in Thread" của Lark (root_id
  // không được set) nên Lark coi mỗi tin là 1 "thread" độc lập rỗng — bị loại TRƯỚC khi tới bước phân
  // loại, không bao giờ ra case dù nội dung đúng ý. Đây là gotcha thật, không phải bug — xem wiki.
  const threads = allThreads.filter(t => t.replies.length > 0)

  if (threads.length === 0) return { scanned: 0, classified: 0, inserted: 0, not_matched: 0, classify_errors: 0, backlog_remaining: 0, groups }

  const { data: existing } = await supabaseAdmin
    .from("okr_lark_events").select("message_id")
    .in("message_id", threads.map(t => t.message_id))
  const seen = new Set((existing ?? []).map((r: any) => r.message_id))

  const toClassify = threads.filter(t => !seen.has(t.message_id)).slice(0, MAX_NEW_THREADS_PER_RUN)
  const { inserted, notMatched, classifyErrors } = await classifyAndInsertThreads(toClassify)

  if (inserted > 0) {
    const openId = await getLarkUserOpenId()
    if (openId) {
      await sendLarkDM(openId, `🤖 Bé Gấu vừa phát hiện ${inserted} case SLA/Vendor Speed mới từ Lark — vào My Metrics duyệt nhé.`)
    }
  }

  return {
    scanned: threads.length, classified: toClassify.length, inserted, not_matched: notMatched,
    classify_errors: classifyErrors,
    backlog_remaining: threads.length - seen.size - toClassify.length,
    groups,
  }
}

// Dùng chung giữa quét real-time (quarter luôn = hôm nay) và quét lịch sử (thread có thể rơi vào
// quý TRƯỚC nếu quét ngược nhiều tháng) — quarter gắn theo NGÀY THẬT của từng thread, không phải
// ngày chạy scan.
async function classifyAndInsertThreads(threads: LarkThread[]): Promise<{ inserted: number; notMatched: number; classifyErrors: number }> {
  let inserted = 0
  let notMatched = 0
  let classifyErrors = 0

  for (const t of threads) {
    const result = await classifyLarkThread(t)
    if (!result) { classifyErrors++; continue }

    const quarter = quarterLabelForDate(new Date(parseInt(t.create_time)))

    if (!result.is_match || !result.metric) {
      await supabaseAdmin.from("okr_lark_events").upsert({
        quarter, metric: "none", chat_id: t.chat_id,
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
      quarter, metric: result.metric, chat_id: t.chat_id,
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

  return { inserted, notMatched, classifyErrors }
}

// Thread có "liên quan" 1 open_id không — chính mình gửi HOẶC được @mention, ở tin gốc HOẶC bất kỳ
// reply nào. Cùng tiêu chí "chỉ tin liên quan tôi" đang áp cho capture real-time (quyết định giữ
// nguyên s177/178) — quét lịch sử áp lại y hệt, không mở rộng phạm vi hơn.
function threadInvolvesUser(t: LarkThread, myOpenId: string): boolean {
  if (t.sender_open_id === myOpenId || t.mentions.some(m => m.id === myOpenId)) return true
  return t.replies.some(r => r.open_id === myOpenId || r.mentions.some(m => m.id === myOpenId))
}

const MAX_HISTORY_DAYS = 120

// Quét lịch sử 1 LẦN cho 1 group cụ thể — bù cho hạn chế "real-time capture không thấy được thread
// trước khi bot bắt đầu sống" (chỉ capture từ lúc deploy s173, KHÔNG backfill tự động). Dùng lại
// fetchRecentThreads (REST list toàn group, giống Cà Thread) thay vì capture log — chỉ nguồn phát
// hiện thread khác nhau, pipeline phân loại/lưu dùng chung 100% với quét real-time.
export async function runLarkHistoryScan(chatId: string, daysBack: number): Promise<ScanRunResult> {
  const bounded = Math.min(MAX_HISTORY_DAYS, Math.max(1, Math.floor(daysBack) || 30))
  const myOpenId = await getLarkUserOpenId()
  if (!myOpenId) {
    return { skipped: "Chưa Kết nối Lark cá nhân (Creator Settings) — cần để biết thread nào liên quan Hiếu", scanned: 0, classified: 0, inserted: 0, not_matched: 0, classify_errors: 0, backlog_remaining: 0, groups: [] }
  }

  const maxThreads = Math.min(150, bounded * 5)
  const allThreads = await fetchRecentThreads(chatId, bounded, maxThreads)
  const appToken = await getLarkToken()
  const chatName = await getChatName(chatId, appToken)
  const groups = [{ chat_id: chatId, chat_name: chatName, thread_count: allThreads.length }]

  const relevant = allThreads.filter(t => t.replies.length > 0 && threadInvolvesUser(t, myOpenId))
  if (relevant.length === 0) return { scanned: 0, classified: 0, inserted: 0, not_matched: 0, classify_errors: 0, backlog_remaining: 0, groups }

  const { data: existing } = await supabaseAdmin
    .from("okr_lark_events").select("message_id")
    .in("message_id", relevant.map(t => t.message_id))
  const seen = new Set((existing ?? []).map((r: any) => r.message_id))

  const toClassify = relevant.filter(t => !seen.has(t.message_id)).slice(0, MAX_NEW_THREADS_PER_RUN)
  const { inserted, notMatched, classifyErrors } = await classifyAndInsertThreads(toClassify)

  if (inserted > 0) {
    await sendLarkDM(myOpenId, `🤖 Quét lịch sử "${chatName}" xong — phát hiện ${inserted} case SLA/Vendor Speed mới, vào My Metrics duyệt nhé.`)
  }

  return {
    scanned: relevant.length, classified: toClassify.length, inserted, not_matched: notMatched,
    classify_errors: classifyErrors,
    backlog_remaining: relevant.length - seen.size - toClassify.length,
    groups,
  }
}
