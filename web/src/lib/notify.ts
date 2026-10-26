import { supabaseAdmin } from "@/lib/supabase"
import { getCreatorLarkOpenId, sendLarkMessage } from "@/lib/lark"
import { formatNotice, isQuietHour, mergeQueued, type Notice, type QueuedNotice } from "@/lib/notify-pure"

export type { Notice } from "@/lib/notify-pure"

const QUEUE_KEY = "notify_queue"

async function readQueue(): Promise<QueuedNotice[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", QUEUE_KEY).maybeSingle()
  try { return data?.value ? (JSON.parse(data.value) as QueuedNotice[]) : [] } catch { return [] }
}

async function writeQueue(q: QueuedNotice[]): Promise<void> {
  await supabaseAdmin.from("app_settings").upsert(
    { key: QUEUE_KEY, value: JSON.stringify(q), category: "notify", label: "Tin Lark chờ gửi (giờ yên lặng)", updated_at: new Date().toISOString() },
    { onConflict: "key" },
  )
}

/**
 * Cửa DM Lark chuẩn: đầu tin `[Loại · Nguồn] Tiêu đề — dd/MM`. `to` là open_id, hoặc "creator" để gửi Hiếu.
 * Tin priority "low" rơi vào 22:00–07:00 (giờ VN) được xếp hàng, `flushNotifyQueue` gửi gộp sau 07:00.
 * Trả true nếu đã gửi hoặc đã xếp hàng; false nếu không gửi được (không có người nhận / Lark lỗi).
 */
export async function notify(to: string | "creator", n: Notice): Promise<boolean> {
  try {
    const openId = to === "creator" ? await getCreatorLarkOpenId() : to
    if (!openId) return false
    const text = formatNotice(n)
    if (n.priority === "low" && isQuietHour(Date.now())) {
      await writeQueue([...(await readQueue()), { to: openId, text, at: Date.now() }])
      return true
    }
    await sendLarkMessage(openId, "open_id", text)
    return true
  } catch (e) {
    console.error("[notify]", (e as Error).message)
    return false
  }
}

/** Gửi gộp các tin đã xếp hàng (gọi từ cron hằng giờ). Còn trong giờ yên lặng thì để nguyên. */
export async function flushNotifyQueue(now = Date.now()): Promise<{ sent: number; kept: number }> {
  if (isQuietHour(now)) return { sent: 0, kept: 0 }
  const queue = await readQueue()
  if (!queue.length) return { sent: 0, kept: 0 }
  const failed: QueuedNotice[] = []
  let sent = 0
  for (const m of mergeQueued(queue, now)) {
    try { await sendLarkMessage(m.to, "open_id", m.text); sent++ } catch { failed.push(...queue.filter(q => q.to === m.to)) }
  }
  await writeQueue(failed)
  return { sent, kept: failed.length }
}
