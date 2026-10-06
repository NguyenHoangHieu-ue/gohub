// Logic quét Lark thật — dùng chung giữa cron tự động (api/cron/my-metrics-lark-scan), nút "Quét ngay"
// (api/analytics/my-metrics/lark-config/scan-now), quét lịch sử 1 group và lệnh "Note đi" trong thread.
//
// s225 (Hiếu chốt): bỏ để AI tự quyết "có phải case / xong chưa" (sai ~57%, tin gốc còn bị đọc rỗng). Nay theo LUẬT đánh dấu
// của Hiếu — xem lib/okr-lark-rules.ts: chỉ group Telecom Product (Private), thread người khác đăng, tính từ lúc tag Hiếu,
// YES = thảo luận xong; YES + Typing trên câu trả lời của Hiếu = xong (tự tính); YES mà chưa Typing = nhắc Hiếu QUA DM (gộp 1 tin/lượt
// quét, mỗi thread 1 lần — Hiếu: nhắc vào thread gây spam mọi người);
// chưa YES = đang thảo luận, quét lại hằng ngày, từ ngày 25 DM cảnh báo. AI chỉ còn phân loại SLA hay Vendor Speed.
// Case đã được Hiếu duyệt tay (reviewed_by không bắt đầu bằng "auto:") thì KHÔNG đụng lại.
import { supabaseAdmin } from "@/lib/supabase"
import { fetchThreadsFromCapturedLog, fetchRecentThreads, fetchThreadByMessageId, getChatName, type LarkThread } from "@/lib/lark-thread-scan"
import { classifyLarkThread, type LarkClassifyResult } from "@/lib/okr-lark-classify"
import { sendLarkDM, getLarkUserOpenId, getLarkToken } from "@/lib/lark"
import { quarterLabelForDate } from "@/lib/okr-helpers"
import { evaluateThread, isMonthEndWarning, larkThreadLink, DEFAULT_CASE_GROUPS, type RuleMessage, type RuleOutcome } from "@/lib/okr-lark-rules"

const CONFIG_KEY = "my_metrics_lark_scan_config"
const OPEN_RECHECK_DAYS = 45   // case còn mở được đọc lại tối đa ngần này ngày kể từ lúc được tag

interface ScanConfig { enabled: boolean; days_back: number; case_groups: string[] }

function normalizeConfig(raw: any): ScanConfig {
  return {
    enabled: raw?.enabled === true,
    days_back: Number(raw?.days_back) > 0 ? Number(raw.days_back) : 3,
    case_groups: Array.isArray(raw?.case_groups) && raw.case_groups.length ? raw.case_groups.map(String) : DEFAULT_CASE_GROUPS,
  }
}

async function loadConfig(): Promise<ScanConfig> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
  return normalizeConfig(data?.value ? JSON.parse(data.value) : null)
}

export interface ScanRunResult {
  skipped?: string
  scanned: number; classified: number; inserted: number; not_matched: number
  classify_errors: number
  backlog_remaining: number
  groups: { chat_id: string; chat_name: string; thread_count: number }[]
  self_initiated: number
  done?: number; open?: number; needs_mark?: number
}

const empty = (skipped?: string): ScanRunResult => ({ skipped, scanned: 0, classified: 0, inserted: 0, not_matched: 0, classify_errors: 0, backlog_remaining: 0, groups: [], self_initiated: 0 })

const toRule = (t: LarkThread, chatName: string): { chat_name: string; root: RuleMessage; replies: RuleMessage[] } => ({
  chat_name: chatName,
  root: { message_id: t.message_id, sender_open_id: t.sender_open_id, create_time: t.create_time, content: t.content, mentionIds: t.mentions.map(m => m.id), reactions: t.reactions ?? [], fromApp: t.sender_type === "app" },
  replies: t.replies.map(r => ({ message_id: r.message_id, sender_open_id: r.open_id, create_time: r.create_time, content: r.content, mentionIds: r.mentions.map(m => m.id), reactions: r.reactions ?? [], fromApp: r.sender_type === "app" })),
})

const isManual = (reviewedBy: string | null | undefined) => !!reviewedBy && !reviewedBy.startsWith("auto:")
const REMINDED = "auto:reminded"   // đã nhắc Hiếu (DM) đánh dấu Typing cho thread này — chỉ nhắc 1 lần/thread
const nameOf = (t: LarkThread, openId: string) => openId === t.sender_open_id ? t.sender_name : (t.replies.find(r => r.open_id === openId)?.name ?? openId)

/** Áp luật cho 1 thread rồi ghi okr_lark_events. Trả kết quả để báo lại (lệnh "Note đi"). */
async function applyRules(t: LarkThread, chatName: string, hieuId: string, caseGroups: string[], existing: { metric: string; reviewed_by: string | null }[], remindLines?: string[]):
  Promise<{ outcome: RuleOutcome; wrote: boolean; classifyError: boolean }> {
  const outcome = evaluateThread(toRule(t, chatName), hieuId, caseGroups)
  if (existing.some(e => isManual(e.reviewed_by))) return { outcome, wrote: false, classifyError: false }   // Hiếu đã duyệt tay → giữ nguyên

  const startMs = Number(outcome.kind === "skip" ? t.create_time : outcome.start.create_time)
  const base = {
    quarter: quarterLabelForDate(new Date(startMs)), chat_id: t.chat_id, thread_id: t.thread_id, message_id: t.message_id,
    request_time: new Date(startMs).toISOString(), request_snippet: t.content.slice(0, 300), request_sender: t.sender_name,
    is_self_initiated: t.sender_open_id === hieuId,
  }

  if (outcome.kind === "skip") {
    await supabaseAdmin.from("okr_lark_events").delete().eq("message_id", t.message_id).neq("metric", "none")
    await supabaseAdmin.from("okr_lark_events").upsert({ ...base, metric: "none", ai_reason: outcome.reason, status: "not_matched",
      completion_time: null, completion_snippet: null, completion_sender: null, duration_value: null, reviewed_by: "auto:rule", reviewed_at: new Date().toISOString() },
      { onConflict: "message_id,metric" })
    return { outcome, wrote: true, classifyError: false }
  }

  // Loại việc: giữ loại đã có, chưa có thì hỏi AI (chỉ phân loại SLA / Vendor Speed — mặc định SLA).
  let metric = existing.find(e => e.metric !== "none")?.metric
  let aiNote = ""
  let classifyError = false
  if (!metric) {
    const r = await classifyLarkThread(t)
    if (!r) classifyError = true
    metric = r?.metric === "vendor_speed" ? "vendor_speed" : "sla"
    aiNote = r?.reason ? ` · AI: ${r.reason}` : ""
  }
  const done = outcome.kind === "done" ? outcome.done : null
  const durationUnit = metric === "sla" ? 3_600_000 : 60_000
  // Đã YES mà chưa có Typing → thêm vào DM nhắc Hiếu (gộp, 1 lần/thread); Hiếu thả Typing rồi tag bot "Note đi" trong thread.
  let reviewedBy: string | null = outcome.kind === "done" ? "auto:typing" : null
  if (outcome.kind === "needs_mark") {
    reviewedBy = existing.some(e => e.reviewed_by === REMINDED) ? REMINDED : null
    if (!reviewedBy && remindLines) {
      remindLines.push(`${t.sender_name}: ${t.content.replace(/\s+/g, " ").slice(0, 70)} — ${larkThreadLink(t.chat_id, t.message_id)}`)
      reviewedBy = REMINDED
    }
  }
  await supabaseAdmin.from("okr_lark_events").delete().eq("message_id", t.message_id).neq("metric", metric)
  await supabaseAdmin.from("okr_lark_events").upsert({
    ...base, metric,
    completion_time: done ? new Date(Number(done.create_time)).toISOString() : null,
    completion_snippet: done ? done.content.slice(0, 300) : null,
    completion_sender: done ? nameOf(t, done.sender_open_id) : null,
    duration_value: done ? +((Number(done.create_time) - startMs) / durationUnit).toFixed(2) : null,
    ai_reason: `${outcome.reason}${outcome.start.message_id !== t.message_id ? " · tính từ lúc được tag giữa thread" : ""}${aiNote}`,
    status: outcome.kind === "done" ? "confirmed" : "pending_review",
    reviewed_by: reviewedBy,
    reviewed_at: outcome.kind === "done" ? new Date().toISOString() : null,
  }, { onConflict: "message_id,metric" })
  return { outcome, wrote: true, classifyError }
}

async function warnOpenThisMonth(hieuId: string) {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 7 * 3_600_000).toISOString()   // 00:00 giờ VN
  const { data } = await supabaseAdmin.from("okr_lark_events").select("chat_id,message_id,request_time,request_snippet,request_sender,reviewed_by")
    .eq("status", "pending_review").gte("request_time", monthStart).order("request_time")
  if (!data?.length) return
  const lines = data.slice(0, 20).map((r, i) => `${i + 1}. ${r.reviewed_by === REMINDED ? "[đã YES, chưa Typing] " : ""}${r.request_sender ?? ""}: ${String(r.request_snippet ?? "").slice(0, 60)} — ${larkThreadLink(r.chat_id, r.message_id)}`)
  await sendLarkDM(hieuId, `⚠️ Gần hết tháng: còn ${data.length} thread anh được tag chưa chốt (chưa YES hoặc chưa Typing):\n${lines.join("\n")}${data.length > 20 ? `\n… và ${data.length - 20} thread khác (xem My Metrics)` : ""}`)
}

async function processThreads(threads: LarkThread[], hieuId: string, caseGroups: string[]): Promise<ScanRunResult> {
  const appToken = await getLarkToken()
  const names = new Map<string, string>()
  for (const id of Array.from(new Set(threads.map(t => t.chat_id)))) names.set(id, await getChatName(id, appToken))

  const { data: rows } = threads.length
    ? await supabaseAdmin.from("okr_lark_events").select("message_id,metric,reviewed_by").in("message_id", threads.map(t => t.message_id))
    : { data: [] as any[] }
  const byMsg = new Map<string, { metric: string; reviewed_by: string | null }[]>()
  for (const r of rows ?? []) byMsg.set(r.message_id, [...(byMsg.get(r.message_id) ?? []), r])

  const out: ScanRunResult = { ...empty(), done: 0, open: 0, needs_mark: 0 }
  const remindLines: string[] = []
  const groupCount = new Map<string, number>()
  for (const t of threads) {
    groupCount.set(t.chat_id, (groupCount.get(t.chat_id) ?? 0) + 1)
    out.scanned++
    const { outcome, wrote, classifyError } = await applyRules(t, names.get(t.chat_id) ?? t.chat_id, hieuId, caseGroups, byMsg.get(t.message_id) ?? [], remindLines)
    if (classifyError) out.classify_errors++
    if (!wrote) continue
    out.classified++
    if (outcome.kind === "skip") { out.not_matched++; if (t.sender_open_id === hieuId) out.self_initiated++ }
    else { out.inserted++; out[outcome.kind]! += 1 }
  }
  out.groups = Array.from(groupCount.entries()).map(([chat_id, thread_count]) => ({ chat_id, chat_name: names.get(chat_id) ?? chat_id, thread_count }))
  if (remindLines.length) {
    const shown = remindLines.slice(0, 25).map((l, i) => `${i + 1}. ${l}`)
    await sendLarkDM(hieuId, `🔖 ${remindLines.length} thread đã YES nhưng chưa có câu trả lời nào của anh được đánh dấu Typing:\n${shown.join("\n")}${remindLines.length > 25 ? `\n… và ${remindLines.length - 25} thread khác (xem My Metrics)` : ""}\nAnh thả Typing vào câu trả lời giải quyết rồi tag em "Note đi" trong thread nhé.`)
  }
  return out
}

// ignoreEnabled=true cho nút "Quét ngay". daysBack ghi đè cấu hình (vd quét lại cả Q3 sau khi mở lại quý).
export async function runLarkScan(ignoreEnabled = false, daysBack?: number): Promise<ScanRunResult> {
  const config = await loadConfig()
  if (!config.enabled && !ignoreEnabled) return empty("chưa bật quét tự động")
  const hieuId = await getLarkUserOpenId()
  if (!hieuId) return empty("Chưa Kết nối Lark cá nhân (Creator Settings) — cần để biết tin nào của anh")

  // Case còn mở (đang thảo luận / đã YES chờ Typing) → luôn đọc lại, kể cả cũ hơn daysBack.
  const { data: openRows } = await supabaseAdmin.from("okr_lark_events").select("message_id")
    .eq("status", "pending_review").or(`reviewed_by.is.null,reviewed_by.eq.${REMINDED}`)
    .gte("request_time", new Date(Date.now() - OPEN_RECHECK_DAYS * 86_400_000).toISOString())
  const days = daysBack ?? config.days_back
  const threads = await fetchThreadsFromCapturedLog(days, Math.min(400, days * 10 + (openRows?.length ?? 0)), true, (openRows ?? []).map(r => r.message_id))
  const result = await processThreads(threads, hieuId, config.case_groups)
  // Từ ngày 25 (giờ VN): DM cảnh báo thread trong tháng còn chưa chốt, kèm link thẳng thread. Chỉ cron (1 lần/ngày).
  if (!ignoreEnabled && isMonthEndWarning()) await warnOpenThisMonth(hieuId)
  return result
}

/** Lệnh "Note đi": đánh giá lại đúng 1 thread ngay lúc Hiếu tag bot. */
export async function evaluateThreadNow(rootMessageId: string): Promise<{ outcome: RuleOutcome | null; emojis: string[] }> {
  const config = await loadConfig()
  const hieuId = await getLarkUserOpenId()
  const t = await fetchThreadByMessageId(rootMessageId, true)
  if (!hieuId || !t) return { outcome: null, emojis: [] }
  const chatName = await getChatName(t.chat_id, await getLarkToken())
  const { data: rows } = await supabaseAdmin.from("okr_lark_events").select("message_id,metric,reviewed_by").eq("message_id", t.message_id)
  const { outcome } = await applyRules(t, chatName, hieuId, config.case_groups, rows ?? [])
  const emojis = Array.from(new Set([...(t.reactions ?? []), ...t.replies.flatMap(r => r.reactions ?? [])].filter(r => r.operatorId === hieuId).map(r => r.emoji)))
  return { outcome, emojis }
}

// Ghi 1 kết quả phân loại AI (luồng cũ) — chỉ còn dùng cho route "Vẫn tính case này" (override marker tự đăng).
export async function insertClassifiedEvent(
  t: LarkThread,
  result: LarkClassifyResult,
  isSelfInitiated = false,
): Promise<{ ok: boolean; matched: boolean }> {
  const quarter = quarterLabelForDate(new Date(parseInt(t.create_time)))
  if (!result.is_match || !result.metric) return { ok: true, matched: false }
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
    ai_reason: result.reason, status: "pending_review", is_self_initiated: isSelfInitiated,
  }, { onConflict: "message_id,metric" })
  return { ok: !error, matched: true }
}

const MAX_HISTORY_DAYS = 120

// Quét lịch sử 1 LẦN cho 1 group cụ thể (thread trước khi capture real-time chạy) — cùng bộ luật với quét thường.
export async function runLarkHistoryScan(chatId: string, daysBack: number): Promise<ScanRunResult> {
  const bounded = Math.min(MAX_HISTORY_DAYS, Math.max(1, Math.floor(daysBack) || 30))
  const config = await loadConfig()
  const hieuId = await getLarkUserOpenId()
  if (!hieuId) return empty("Chưa Kết nối Lark cá nhân (Creator Settings) — cần để biết thread nào liên quan anh")
  const all = await fetchRecentThreads(chatId, bounded, Math.min(150, bounded * 5))
  // fetchRecentThreads không lấy emoji từng reply → hydrate lại thread có liên quan anh với đủ emoji.
  const relevant = all.filter(t => t.mentions.some(m => m.id === hieuId) || t.replies.some(r => r.mentions.some(m => m.id === hieuId)))
  const full: LarkThread[] = []
  for (const t of relevant) { const f = await fetchThreadByMessageId(t.message_id, true); if (f) full.push(f) }
  return processThreads(full, hieuId, config.case_groups)
}
