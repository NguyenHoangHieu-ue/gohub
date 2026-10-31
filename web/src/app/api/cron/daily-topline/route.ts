import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { sendLarkCardToChat } from "@/lib/lark"
import { buildDailyTopline, buildDailyToplineCard } from "@/lib/scheduled-report-data"

// Bản mẫu card Daily Toplines (chưa nối vào lịch tự động). Bearer CRON_SECRET.
//   GET ?                      → trả JSON số liệu + card, KHÔNG gửi
//   GET ?send=1&chat=<chat_id>  → gửi card bằng bot vào group đó
//   GET ?send=1&to=<tên lịch>  → gửi card vào webhook của scheduled message có tên đó (vd "Test Daily")
export const dynamic = "force-dynamic"
export const maxDuration = 120

const DASHBOARD_URL = "https://intel-v2.gohub.cloud/analytics/bod"

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const q = req.nextUrl.searchParams
  try {
    const topline = await buildDailyTopline()
    let keyword: string | undefined
    let webhook: string | undefined
    const chat = q.get("chat")
    if (q.get("send") === "1" && chat) {
      await sendLarkCardToChat(chat, buildDailyToplineCard(topline, DASHBOARD_URL))
      return NextResponse.json({ sent: true, chat, topline })
    }
    if (q.get("send") === "1") {
      const { data } = await supabaseAdmin.from("lark_scheduled_messages")
        .select("lark_webhook_url,lark_keyword").eq("name", q.get("to") || "").maybeSingle()
      if (!data?.lark_webhook_url) return NextResponse.json({ error: "Không có webhook cho lịch này" }, { status: 400 })
      webhook = data.lark_webhook_url; keyword = data.lark_keyword || undefined
    }
    const card = buildDailyToplineCard(topline, DASHBOARD_URL, keyword)
    if (!webhook) return NextResponse.json({ topline, card })
    const res = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg_type: "interactive", card }) })
    const body = await res.json().catch(() => null)
    return NextResponse.json({ sent: res.ok && (body?.code ?? body?.StatusCode ?? 0) === 0, lark: body, topline })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
