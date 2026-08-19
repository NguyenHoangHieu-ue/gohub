import { NextRequest, NextResponse } from "next/server"
import { getLarkToken } from "@/lib/lark"
import { supabaseAdmin } from "@/lib/supabase"

const LARK = "https://open.larksuite.com/open-apis"
const CONFIG_KEY = "ca_thread_config"

function normalizeGroups(raw: any): { chat_id: string; emoji_type?: string; days_back?: number; my_open_id?: string; name?: string }[] {
  if (!raw || typeof raw !== "object") return []
  if (Array.isArray(raw.groups)) return raw.groups
  if (raw.chat_id) return [raw]
  return []
}

async function countRootMsgs(chatId: string, daysBack: number, appToken: string): Promise<number> {
  const since = Date.now() - daysBack * 86400 * 1000
  let count = 0
  let pageToken: string | undefined

  for (let page = 0; page < 3; page++) {
    const url = `${LARK}/im/v1/messages?container_id=${encodeURIComponent(chatId)}&container_id_type=chat&page_size=50&sort_type=ByCreateTimeDesc${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${appToken}` } })
    const data = await res.json()
    if (data.code !== 0) break
    const items: any[] = data.data?.items ?? []
    if (items.length === 0) break

    const inWindow = items.filter((m: any) => !m.root_id && parseInt(m.create_time) >= since)
    count += inWindow.length

    if (inWindow.length < items.length || !data.data?.has_more || !data.data?.page_token) break
    pageToken = data.data.page_token
  }
  return count
}

async function sendLarkDM(userId: string, text: string, appToken: string) {
  await fetch(`${LARK}/im/v1/messages?receive_id_type=open_id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${appToken}` },
    body: JSON.stringify({
      receive_id: userId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
  })
}

export async function GET(req: NextRequest) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const recipientId = process.env.LARK_CREATOR_USER_ID
  if (!recipientId) return NextResponse.json({ skipped: "LARK_CREATOR_USER_ID not set" })

  try {
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", CONFIG_KEY).maybeSingle()
    const raw = data?.value ? JSON.parse(data.value) : null
    const groups = normalizeGroups(raw)
    if (groups.length === 0) return NextResponse.json({ skipped: "no groups configured" })

    const appToken = await getLarkToken()
    const results: string[] = []

    for (const g of groups) {
      if (!g.chat_id) continue
      const daysBack = g.days_back ?? 7
      const count = await countRootMsgs(g.chat_id, daysBack, appToken)
      if (count > 0) {
        const label = g.name || g.chat_id.slice(0, 12)
        results.push(`• ${label}: ~${count} thread trong ${daysBack} ngày qua`)
      }
    }

    if (results.length === 0) return NextResponse.json({ ok: true, notified: false, reason: "no threads" })

    const msg = `🐾 Nhắc cà thread:\n${results.join("\n")}\n\nVào Creator → Cà Thread để quét và nhắc.`
    await sendLarkDM(recipientId, msg, appToken)
    return NextResponse.json({ ok: true, notified: true, details: results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
