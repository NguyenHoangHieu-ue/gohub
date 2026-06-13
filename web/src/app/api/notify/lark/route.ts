import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin }            from "@/lib/supabase"
import { sendLarkMessage }          from "@/lib/lark"

function formatLarkText(notif: any): string {
  const changes: any[] = notif.data?.changes ?? []

  if (notif.type === "sync" && changes.length > 0) {
    const header = `🔄 *${notif.title}*\n\n`
    const rows = changes
      .slice(0, 20)
      .map(c => `▸ ${c.changed} | ${c.sku_code} | ${c.product_code} | ${c.status}`)
      .join("\n")
    const more = changes.length > 20 ? `\n...và ${changes.length - 20} thay đổi khác` : ""
    return header + rows + more
  }

  if (notif.type === "kb_doc")
    return `📄 *${notif.title}*${notif.body ? "\n" + notif.body : ""}`

  if (notif.type === "wiki")
    return `📝 *${notif.title}*${notif.body ? "\n" + notif.body : ""}`

  return `${notif.title}${notif.body ? "\n" + notif.body : ""}`
}

export async function POST(req: NextRequest) {
  // Auth via MCP_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== process.env.MCP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get lark_notify_chat_id from app_settings
  const { data: setting } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "lark_notify_chat_id")
    .maybeSingle()

  if (!setting?.value) {
    return NextResponse.json({ error: "lark_notify_chat_id not set — bot chưa nhận group message nào" }, { status: 400 })
  }

  const chatId = setting.value

  // Get unsent notifications (visibility='all' only — no price changes to Lark)
  const { data: pending } = await supabaseAdmin
    .from("notifications")
    .select("id, type, title, body, data")
    .eq("sent_to_lark", false)
    .eq("visibility", "all")
    .order("created_at", { ascending: true })
    .limit(10)

  if (!pending?.length) return NextResponse.json({ sent: 0 })

  const sent: number[] = []
  for (const notif of pending) {
    try {
      await sendLarkMessage(chatId, "chat_id", formatLarkText(notif))
      sent.push(notif.id)
    } catch (e: any) {
      console.error("[notify/lark] send failed:", e?.message)
    }
  }

  if (sent.length) {
    await supabaseAdmin.from("notifications").update({ sent_to_lark: true }).in("id", sent)
  }

  return NextResponse.json({ sent: sent.length })
}
