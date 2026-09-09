import { supabaseAdmin } from "@/lib/supabase"

// Action đổi trạng thái tab (khác đọc thuần) — Hiếu chọn bỏ bước "Duyệt" (thói quen luôn bấm Duyệt khiến
// bước xác nhận vô nghĩa), extension thực thi NGAY + hiện notification không chặn để biết. Cột
// `requires_confirm` vẫn lưu để phân biệt/log — không còn chặn thực thi phía extension.
const WRITE_ACTIONS = new Set(["click", "fill", "navigate"])

const POLL_MS = 2000
const TTL_SECONDS = 60

type OnEvent = ((e: { type: "status"; text: string }) => void) | undefined

// s195+3: multi-tenant — mỗi user 1 hàng đợi riêng (owner_username), khớp đúng token/extension họ tự pair
// ở /analytics/creator/bridge. Không còn 1 token global = 1 browser Hiếu.
async function enqueueAndPoll(
  action: string,
  payload: any,
  username: string,
  onEvent?: OnEvent,
): Promise<{ result?: any; error?: string }> {
  if (!username) return { error: "Thiếu username — không xác định được browser cần thao tác." }

  const isWrite = WRITE_ACTIONS.has(action)
  const maxPolls = Math.ceil((TTL_SECONDS * 1000) / POLL_MS)

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("browser_bridge_commands")
    .insert({
      action,
      payload,
      owner_username: username,
      requires_confirm: isWrite,
      expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
    })
    .select("id")
    .single()

  if (insertErr || !inserted) return { error: `Không tạo được lệnh: ${insertErr?.message}` }

  const id = inserted.id
  onEvent?.({
    type: "status",
    text: isWrite ? "🖱️ Đang thao tác trên browser của bạn..." : "👀 Đang đọc từ browser của bạn...",
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
      return { error: "Lệnh hết hạn — extension chưa kịp nhận." }
    }
  }

  return {
    error: "Bridge chưa phản hồi. Kiểm tra: Chrome đã cài extension, đã dán đúng token của bạn, và đã bật toggle Bridge ON chưa.",
  }
}

export async function runReadMyBrowser(
  args: { action: "list_tabs" | "read_tab"; tab_id?: number },
  username: string,
  onEvent?: OnEvent,
): Promise<{ result?: any; error?: string }> {
  if (args.action !== "list_tabs" && args.action !== "read_tab") {
    return { error: "action phải là list_tabs hoặc read_tab." }
  }
  return enqueueAndPoll(args.action, { tab_id: args.tab_id }, username, onEvent)
}

export async function runControlMyBrowser(
  args: { action: "click" | "fill" | "navigate" | "scroll"; tab_id: number; selector?: string; value?: string; url?: string; press_enter?: boolean },
  username: string,
  onEvent?: OnEvent,
): Promise<{ result?: any; error?: string }> {
  if (!["click", "fill", "navigate", "scroll"].includes(args.action)) {
    return { error: "action phải là click, fill, navigate hoặc scroll." }
  }
  if (!args.tab_id) return { error: "Thiếu tab_id — gọi readMyBrowser action=list_tabs trước để lấy tab_id." }
  return enqueueAndPoll(args.action, {
    tab_id: args.tab_id, selector: args.selector, value: args.value, url: args.url, press_enter: args.press_enter,
  }, username, onEvent)
}
