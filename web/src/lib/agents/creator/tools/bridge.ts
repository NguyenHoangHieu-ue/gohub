import { supabaseAdmin } from "@/lib/supabase"
import { isBridgeBlockedUrl, BRIDGE_BLOCK_MESSAGE } from "@/lib/bridge-safety"

// Action đổi trạng thái tab (khác đọc thuần) — Hiếu chọn bỏ bước "Duyệt" (thói quen luôn bấm Duyệt khiến
// bước xác nhận vô nghĩa), extension thực thi NGAY + hiện notification không chặn để biết. Cột
// `requires_confirm` vẫn lưu để phân biệt/log — không còn chặn thực thi phía extension.
const WRITE_ACTIONS = new Set(["click", "fill", "key", "select", "navigate", "open_tab", "close_tab"])

// Lệnh file trên máy user (daemon local-agent/daemon.mjs) đi CHUNG hàng đợi browser_bridge_commands với tiền tố
// "fs_" — route bridge/next tách luồng theo header X-Agent-Kind nên extension không bao giờ nhận lệnh file.
export const LOCAL_PREFIX = "fs_"
const LOCAL_WRITE_ACTIONS = new Set(["fs_write", "fs_edit"])

const POLL_MS = 1000   // s223: 2s → 1s — extension 1.2.0 chạy lệnh trong ~1s khi đang dồn dập
const TTL_SECONDS = 60

type OnEvent = ((e: { type: "status"; text: string }) => void) | undefined

// s195+3: multi-tenant — mỗi user 1 hàng đợi riêng (owner_username), khớp đúng token/extension họ tự pair
// ở /analytics/creator/bridge. Không còn 1 token global = 1 browser Hiếu.
async function enqueueAndPoll(
  action: string,
  payload: any,
  username: string,
  onEvent?: OnEvent,
): Promise<{ result?: any; error?: string; image?: { mime: string; data: string } }> {
  if (!username) return { error: "Thiếu username — không xác định được browser cần thao tác." }

  const isLocal = action.startsWith(LOCAL_PREFIX)
  const isWrite = WRITE_ACTIONS.has(action) || LOCAL_WRITE_ACTIONS.has(action)

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

  // Hỏi kết quả dày lúc đầu (lệnh đọc/click thường xong < 2s), thưa dần về POLL_MS.
  const deadline = Date.now() + TTL_SECONDS * 1000
  for (let i = 0; Date.now() < deadline; i++) {
    await new Promise(r => setTimeout(r, i < 10 ? 200 : i < 20 ? 400 : POLL_MS))

    const { data: row } = await supabaseAdmin
      .from("browser_bridge_commands")
      .select("status,result,error")
      .eq("id", id)
      .maybeSingle()

    if (!row) continue
    if (row.status === "done") {
      // Ảnh chụp màn hình (base64) chỉ cần cho lượt này: tách ra trả về, xoá khỏi DB để bảng lệnh không phình.
      const img = (row.result as any)?.image
      if (img?.data) {
        const { image: _drop, ...rest } = row.result as any
        void supabaseAdmin.from("browser_bridge_commands").update({ result: { ...rest, image: { mime: img.mime, stripped: true } } }).eq("id", id)
        return { result: rest, image: { mime: String(img.mime || "image/jpeg"), data: String(img.data) } }
      }
      return { result: row.result }
    }
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

export type ReadAction = "list_tabs" | "read_tab" | "snapshot" | "screenshot"
export type ControlAction = "click" | "fill" | "key" | "select" | "hover" | "scroll" | "scroll_to" | "wait_for" | "navigate" | "open_tab" | "close_tab" | "activate_tab"
const READ_ACTIONS: ReadAction[] = ["list_tabs", "read_tab", "snapshot", "screenshot"]
const CONTROL_ACTIONS: ControlAction[] = ["click", "fill", "key", "select", "hover", "scroll", "scroll_to", "wait_for", "navigate", "open_tab", "close_tab", "activate_tab"]
const NEEDS_TARGET = new Set<ControlAction>(["click", "fill", "select", "hover", "scroll_to"])

export async function runReadMyBrowser(
  args: { action: ReadAction; tab_id?: number; max_width?: number },
  username: string,
  onEvent?: OnEvent,
): Promise<{ result?: any; error?: string; image?: { mime: string; data: string } }> {
  if (!READ_ACTIONS.includes(args.action)) return { error: `action phải là ${READ_ACTIONS.join(", ")}.` }
  if (args.action === "screenshot" && !args.tab_id) return { error: "screenshot cần tab_id — gọi list_tabs trước." }
  return enqueueAndPoll(args.action, { tab_id: args.tab_id, max_width: args.max_width }, username, onEvent)
}

export interface ControlArgs {
  action: ControlAction; tab_id?: number; ref?: string; selector?: string; value?: string; url?: string; press_enter?: boolean
  keys?: string; repeat?: number; direction?: string; amount?: number; text?: string; gone?: boolean; timeout_ms?: number
  background?: boolean; force?: boolean; double?: boolean; append?: boolean; x?: number; y?: number
}

export async function runControlMyBrowser(
  args: ControlArgs,
  username: string,
  onEvent?: OnEvent,
): Promise<{ result?: any; error?: string }> {
  if (!CONTROL_ACTIONS.includes(args.action)) return { error: `action phải là ${CONTROL_ACTIONS.join(", ")}.` }
  if (args.action !== "open_tab" && !args.tab_id) return { error: "Thiếu tab_id — gọi readMyBrowser action=list_tabs trước để lấy tab_id." }
  const hasXY = Number.isFinite(args.x) && Number.isFinite(args.y)
  if (NEEDS_TARGET.has(args.action) && !args.ref && !args.selector && !(hasXY && (args.action === "click" || args.action === "hover")))
    return { error: `${args.action} cần ref (lấy từ readMyBrowser action=snapshot) hoặc selector${args.action === "click" || args.action === "hover" ? " (hoặc x,y toạ độ trên ảnh chụp cho canvas)" : ""}.` }
  if ((args.action === "fill" || args.action === "select") && typeof args.value !== "string") return { error: `${args.action} cần value.` }
  if (args.action === "key" && !args.keys) return { error: "key cần keys (vd Enter, Tab, ctrl+a)." }
  if (args.action === "wait_for" && !args.text && !args.ref && !args.selector && !args.timeout_ms) return { error: "wait_for cần text, ref/selector hoặc timeout_ms." }
  if ((args.action === "navigate" || args.action === "open_tab")) {
    if (!args.url) return { error: `${args.action} cần url.` }
    if (isBridgeBlockedUrl(args.url)) return { error: BRIDGE_BLOCK_MESSAGE }
  }
  const { action, ...payload } = args
  const r = await enqueueAndPoll(action, payload, username, onEvent)
  return { result: r.result, error: r.error }
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
