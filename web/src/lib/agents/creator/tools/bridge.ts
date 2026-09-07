import { supabaseAdmin } from "@/lib/supabase"

// Action nào bắt buộc Hiếu duyệt trên extension trước khi thực thi — set CỨNG ở đây (server), model
// không truyền được cờ này → không "lách" bỏ qua bước duyệt cho action đổi trạng thái session thật.
const CONFIRM_ACTIONS = new Set(["click", "fill", "navigate"])

const POLL_MS = 2000

type OnEvent = ((e: { type: "status"; text: string }) => void) | undefined

async function enqueueAndPoll(
  action: string,
  payload: any,
  onEvent?: OnEvent,
): Promise<{ result?: any; error?: string }> {
  const requiresConfirm = CONFIRM_ACTIONS.has(action)
  const ttlSeconds = requiresConfirm ? 120 : 60
  const maxPolls = Math.ceil((ttlSeconds * 1000) / POLL_MS)

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("browser_bridge_commands")
    .insert({
      action,
      payload,
      requires_confirm: requiresConfirm,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    })
    .select("id")
    .single()

  if (insertErr || !inserted) return { error: `Không tạo được lệnh: ${insertErr?.message}` }

  const id = inserted.id
  onEvent?.({
    type: "status",
    text: requiresConfirm
      ? "🖱️ Đã gửi lệnh — đợi Hiếu duyệt trên extension..."
      : "👀 Đang đọc từ browser Hiếu...",
  })

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, POLL_MS))

    const { data: row } = await supabaseAdmin
      .from("browser_bridge_commands")
      .select("status,result,error")
      .eq("id", id)
      .maybeSingle()

    if (!row) continue
    if (row.status === "done") return { result: row.result }
    if (row.status === "error") return { error: row.error || "Extension báo lỗi không rõ." }
    if (row.status === "expired") {
      return { error: "Lệnh hết hạn — extension chưa nhận hoặc Hiếu chưa duyệt kịp." }
    }
  }

  return {
    error: "Bridge chưa phản hồi. Kiểm tra: Chrome đã cài extension, đã dán đúng token, và đã bật toggle Bridge ON chưa.",
  }
}

export async function runReadMyBrowser(
  args: { action: "list_tabs" | "read_tab"; tab_id?: number },
  onEvent?: OnEvent,
): Promise<{ result?: any; error?: string }> {
  if (args.action !== "list_tabs" && args.action !== "read_tab") {
    return { error: "action phải là list_tabs hoặc read_tab." }
  }
  return enqueueAndPoll(args.action, { tab_id: args.tab_id }, onEvent)
}

export async function runControlMyBrowser(
  args: { action: "click" | "fill" | "navigate" | "scroll"; tab_id: number; selector?: string; value?: string; url?: string },
  onEvent?: OnEvent,
): Promise<{ result?: any; error?: string }> {
  if (!["click", "fill", "navigate", "scroll"].includes(args.action)) {
    return { error: "action phải là click, fill, navigate hoặc scroll." }
  }
  if (!args.tab_id) return { error: "Thiếu tab_id — gọi readMyBrowser action=list_tabs trước để lấy tab_id." }
  return enqueueAndPoll(args.action, {
    tab_id: args.tab_id, selector: args.selector, value: args.value, url: args.url,
  }, onEvent)
}
