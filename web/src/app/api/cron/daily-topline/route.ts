import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { sendLarkCardToChat, getLarkToken } from "@/lib/lark"
import { buildDailyTopline, buildDailyToplineCard, getToplineAssessmentCached } from "@/lib/scheduled-report-data"

// Bản mẫu card Daily Toplines (chưa nối vào lịch tự động). Bearer CRON_SECRET.
//   GET ?                      → trả JSON số liệu + card, KHÔNG gửi
//   GET ?send=1&chat=<chat_id>  → gửi card bằng bot vào group đó (thêm &recall=1 để thu hồi các card Daily cũ của bot trong group trước khi gửi)
//   GET ?send=1&to=<tên lịch>  → gửi card vào webhook của scheduled message có tên đó (vd "Test Daily")
export const dynamic = "force-dynamic"
export const maxDuration = 120

const LARK_API = "https://open.larksuite.com/open-apis"

// Thu hồi (xoá) các card Daily Revenue do CHÍNH bot đã gửi trong 1 group — bot chỉ xoá được tin của mình; lọc theo tiêu đề card để không đụng tin khác.
async function recallDailyCards(chatId: string): Promise<{ found: number; deleted: number; failed: number }> {
  const token = await getLarkToken()
  const h = { Authorization: "Bearer " + token }
  let pageToken = "", found = 0, deleted = 0, failed = 0
  for (let page = 0; page < 10; page++) {
    const url = LARK_API + "/im/v1/messages?container_id_type=chat&container_id=" + encodeURIComponent(chatId) + "&page_size=50&sort_type=ByCreateTimeDesc" + (pageToken ? "&page_token=" + pageToken : "")
    const res = await fetch(url, { headers: h })
    const j = await res.json() as { code?: number; msg?: string; data?: { items?: any[]; has_more?: boolean; page_token?: string } }
    if (j.code) throw new Error("Lark list lỗi " + j.code + ": " + j.msg)
    for (const m of j.data?.items ?? []) {
      if (m.sender?.sender_type !== "app" || m.msg_type !== "interactive" || m.deleted) continue
      if (!JSON.stringify(m.body?.content ?? "").includes("Daily Revenue")) continue
      found++
      const d = await fetch(LARK_API + "/im/v1/messages/" + m.message_id, { method: "DELETE", headers: h })
      const dj = await d.json().catch(() => null) as { code?: number } | null
      if (d.ok && !dj?.code) deleted++; else failed++
    }
    if (!j.data?.has_more) break
    pageToken = j.data.page_token ?? ""
  }
  return { found, deleted, failed }
}

const DASHBOARD_URL = "https://intel-v2.gohub.cloud/analytics"

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const q = req.nextUrl.searchParams
  try {
    const topline = await buildDailyTopline()
    const assessment = await getToplineAssessmentCached(topline)
    let keyword: string | undefined
    let webhook: string | undefined
    const chat = q.get("chat")
    if (q.get("send") === "1" && chat) {
      const recall = q.get("recall") === "1" ? await recallDailyCards(chat) : undefined   // thu hồi card cũ TRƯỚC khi gửi card mới
      await sendLarkCardToChat(chat, buildDailyToplineCard(topline, DASHBOARD_URL, { assessment }))
      return NextResponse.json({ sent: true, chat, recall, topline })
    }
    if (q.get("send") === "1") {
      const { data } = await supabaseAdmin.from("lark_scheduled_messages")
        .select("lark_webhook_url,lark_keyword").eq("name", q.get("to") || "").maybeSingle()
      if (!data?.lark_webhook_url) return NextResponse.json({ error: "Không có webhook cho lịch này" }, { status: 400 })
      webhook = data.lark_webhook_url; keyword = data.lark_keyword || undefined
    }
    const card = buildDailyToplineCard(topline, DASHBOARD_URL, { keyword, assessment })
    if (!webhook) return NextResponse.json({ topline, card })
    const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg_type: "interactive", card }) })
    const body = await res.json().catch(() => null)
    return NextResponse.json({ sent: res.ok && (body?.code ?? body?.StatusCode ?? 0) === 0, lark: body, topline })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
