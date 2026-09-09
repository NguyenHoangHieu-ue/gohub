/**
 * Cron failure alerting — gửi Lark message khi cron fail.
 * Dùng lark_notify_chat_id từ app_settings (cùng chat_id với system notifications).
 */
import { supabaseAdmin } from "@/lib/supabase"
import { sendLarkMessage } from "@/lib/lark"

export async function alertCronFailure(cronName: string, error: unknown): Promise<void> {
  const msg = error instanceof Error ? error.message : String(error)
  console.error(`[cron/${cronName}] FAILED:`, msg)
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "lark_notify_chat_id")
      .maybeSingle()
    if (!data?.value) return
    const time = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    await sendLarkMessage(
      data.value,
      "chat_id",
      `⚠️ *Cron FAILED: ${cronName}*\nThời gian: ${time}\nLỗi: ${msg.slice(0, 300)}`,
    )
  } catch (e) {
    console.error("[cron-alert] could not send Lark alert:", e)
  }
}
