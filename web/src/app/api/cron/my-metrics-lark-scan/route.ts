// Cron — quét 1 group Lark (config Hiếu tự nhập ở /analytics/my-metrics), tự đề xuất cặp
// request/completion cho SLA (Product Request) và Vendor Selection Speed bằng Gemini, ghi vào
// okr_lark_events với status='pending_review'. Hiếu duyệt tay trong My Metrics trước khi tính vào KPI
// — bot KHÔNG tự quyết số báo cáo hiệu suất một mình.
import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { isCronReq } from "@/lib/analytics-helpers"
import { alertCronFailure } from "@/lib/cron-alert"
import { fetchRecentThreads } from "@/lib/lark-thread-scan"
import { classifyLarkThread } from "@/lib/okr-lark-classify"
import { sendLarkDM, getLarkUserOpenId } from "@/lib/lark"
import { currentQuarterLabel } from "@/lib/okr-helpers"

const CONFIG_KEY = "my_metrics_lark_scan_config"
const MAX_NEW_THREADS_PER_RUN = 20

interface ScanConfig { enabled: boolean; chat_id: string; days_back: number }

function normalizeConfig(raw: any): ScanConfig {
  return {
    enabled: raw?.enabled === true,
    chat_id: typeof raw?.chat_id === "string" ? raw.chat_id : "",
    days_back: Number(raw?.days_back) > 0 ? Number(raw.days_back) : 3,
  }
}

export async function GET(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
    const config = normalizeConfig(data?.value ? JSON.parse(data.value) : null)

    if (!config.enabled || !config.chat_id) {
      return NextResponse.json({ ok: true, skipped: "chưa bật hoặc chưa cấu hình chat_id" })
    }

    const threads = await fetchRecentThreads(config.chat_id, config.days_back, 50)
      .then(list => list.filter(t => t.replies.length > 0))   // chưa có reply → chưa có gì để phân loại

    if (threads.length === 0) return NextResponse.json({ ok: true, scanned: 0, inserted: 0 })

    const { data: existing } = await supabaseAdmin
      .from("okr_lark_events").select("message_id")
      .in("message_id", threads.map(t => t.message_id))
    const seen = new Set((existing ?? []).map((r: any) => r.message_id))

    const toClassify = threads.filter(t => !seen.has(t.message_id)).slice(0, MAX_NEW_THREADS_PER_RUN)
    const quarter = currentQuarterLabel()
    let inserted = 0

    for (const t of toClassify) {
      const result = await classifyLarkThread(t)
      if (!result || !result.is_match || !result.metric) continue

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

    return NextResponse.json({ ok: true, scanned: threads.length, classified: toClassify.length, inserted })
  } catch (e: any) {
    await alertCronFailure("my-metrics-lark-scan", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
