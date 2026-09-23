import { supabaseAdmin } from "@/lib/supabase"

// Action đổi trạng thái tab (khác đọc thuần) — Hiếu chọn bỏ bước "Duyệt" (thói quen luôn bấm Duyệt khiến
// bước xác nhận vô nghĩa), extension thực thi NGAY + hiện notification không chặn để biết. Cột
// `requires_confirm` vẫn lưu để phân biệt/log — không còn chặn thực thi phía extension.
const WRITE_ACTIONS = new Set(["click", "fill", "navigate"])

// Lệnh file trên máy user (daemon local-agent/daemon.mjs) đi CHUNG hàng đợi browser_bridge_commands với tiền tố
// "fs_" — route bridge/next tách luồng theo header X-Agent-Kind nên extension không bao giờ nhận lệnh file.
export const LOCAL_PREFIX = "fs_"
const LOCAL_WRITE_ACTIONS = new Set(["fs_write", "fs_edit"])

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

  const isLocal = action.startsWith(LOCAL_PREFIX)
  const isWrite = WRITE_ACTIONS.has(action) || LOCAL_WRITE_ACTIONS.has(action)
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
    text: isLocal
      ? (isWrite ? "✍️ Đang ghi file trên máy bạn..." : "📂 Đang đọc file trên máy bạn...")
      : (isWrite ? "🖱️ Đang thao tác trên browser của bạn..." : "👀 Đang đọc từ browser của bạn..."),
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
      return { error: isLocal ? "Lệnh hết hạn — daemon local chưa kịp nhận." : "Lệnh hết hạn — extension chưa kịp nhận." }
    }
  }

  if (isLocal) return { error: "Daemon local chưa phản hồi. Kiểm tra máy đã bật và đang chạy `node local-agent/daemon.mjs`." }
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

export async function runLocalFiles(
  args: { action: "list" | "read" | "write" | "edit"; path?: string; content?: string; find?: string; replace?: string },
  username: string,
  onEvent?: OnEvent,
): Promise<{ result?: any; error?: string }> {
  if (!["list", "read", "write", "edit"].includes(args.action)) return { error: "action phải là list, read, write hoặc edit." }
  if (args.action !== "list" && !args.path) return { error: "Thiếu path." }
  if (args.action === "write" && typeof args.content !== "string") return { error: "write cần content." }
  if (args.action === "edit" && (!args.find || typeof args.replace !== "string")) return { error: "edit cần find + replace." }
  return enqueueAndPoll(`${LOCAL_PREFIX}${args.action}`, {
    path: args.path, content: args.content, find: args.find, replace: args.replace,
  }, username, onEvent)
}
