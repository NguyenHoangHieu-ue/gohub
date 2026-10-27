import { randomBytes } from "crypto"
import { supabaseAdmin } from "@/lib/supabase"
import { dispatchTool } from "./tools/dispatch"
import { grantDailyAutoApprove } from "./auto-approve"

// Hàng chờ duyệt hành động Gấu Pro (bảng gp_pending_actions, migration v64). Xem tool-policy.ts.
const EXPIRE_MS = 24 * 3600_000
const MIGRATION_HINT = "Chưa có bảng gp_pending_actions — Hiếu cần chạy migration web/db/migrations/v64_gp_pending_actions.sql rồi Reload schema."
const missingTable = (msg?: string) => !!msg && /gp_pending_actions/.test(msg) && /(does not exist|schema cache|Could not find)/i.test(msg)

export interface PendingAction { id: string; code: string; tool: string; summary: string; reason: string }

const newCode = () => randomBytes(4).toString("hex").slice(0, 6)

/** Lưu hành động chờ duyệt. Lỗi (chưa chạy migration...) → trả error, hành động KHÔNG chạy (fail-closed). */
export async function createPendingAction(
  p: { username: string; tool: string; args: unknown; reason: string; summary: string; channel: string },
): Promise<{ action?: PendingAction; error?: string }> {
  const code = newCode()
  const { data, error } = await supabaseAdmin.from("gp_pending_actions")
    .insert({ code, username: p.username, tool: p.tool, args: p.args ?? {}, reason: p.reason, channel: p.channel })
    .select("id").single()
  if (error) return { error: missingTable(error.message) ? MIGRATION_HINT : error.message }
  return { action: { id: data.id as string, code, tool: p.tool, summary: p.summary, reason: p.reason } }
}

// decided = CHÍNH lần gọi này vừa duyệt/từ chối (lần gọi lặp lại trên hành động đã xử lý → false, không gửi câu nối nữa).
export interface DecideResult { ok: boolean; decided?: boolean; autoApprove?: boolean; status?: string; tool?: string; code?: string; result?: unknown; error?: string }

/** Duyệt/từ chối theo id (web) hoặc code (Lark). Chỉ chủ hành động; chuyển trạng thái nguyên tử để không chạy 2 lần. */
export async function decidePendingAction(
  p: { username: string; isCreator: boolean; id?: string; code?: string; approve: boolean; onlyChannel?: string },
): Promise<DecideResult> {
  let q = supabaseAdmin.from("gp_pending_actions").select("id,code,tool,args,status,created_at,channel").eq("username", p.username)
  q = p.id ? q.eq("id", p.id) : q.eq("code", (p.code ?? "").toLowerCase())
  if (p.onlyChannel) q = q.eq("channel", p.onlyChannel)   // thành viên Gấu Prime (không có quyền Gấu Pro) chỉ duyệt được đề xuất do Gấu Prime tạo
  const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(1)
  if (error) return { ok: false, error: missingTable(error.message) ? MIGRATION_HINT : error.message }
  const row = rows?.[0]
  if (!row) return { ok: false, error: "Không tìm thấy hành động chờ duyệt này." }
  if (row.status !== "pending") return { ok: false, status: row.status, tool: row.tool, code: row.code, error: `Hành động đã ở trạng thái "${row.status}".` }

  const now = new Date().toISOString()
  if (Date.now() - new Date(row.created_at).getTime() > EXPIRE_MS) {
    await supabaseAdmin.from("gp_pending_actions").update({ status: "expired", decided_at: now }).eq("id", row.id).eq("status", "pending")
    return { ok: false, status: "expired", tool: row.tool, code: row.code, error: "Hành động đã hết hạn (quá 24 giờ) — yêu cầu lại." }
  }

  const next = p.approve ? "approved" : "rejected"
  const { data: claimed } = await supabaseAdmin.from("gp_pending_actions")
    .update({ status: next, decided_at: now }).eq("id", row.id).eq("status", "pending").select("id")
  if (!claimed?.length) return { ok: false, error: "Hành động vừa được xử lý ở nơi khác." }
  if (!p.approve) return { ok: true, decided: true, status: "rejected", tool: row.tool, code: row.code }

  // Duyệt 1 lần → hôm nay (giờ VN) các hành động chỉ cần duyệt vì lượt "nhiễm" tự chạy (xem auto-approve.ts). Chỉ Creator; lỗi ghi cờ không chặn việc đã duyệt.
  let autoApprove = false
  // Đề xuất do Argon tạo (channel "argon") không bật cờ này: nó chỉ có nghĩa cho các lượt Gấu Pro "nhiễm", không phải cho Argon.
  if (p.isCreator && row.channel !== "argon") { try { await grantDailyAutoApprove(p.username); autoApprove = true } catch { /* bỏ qua */ } }

  // Chạy đúng tool + tham số đã lưu (dispatchTool tự ghi audit log như mọi lần gọi tool ghi).
  let response: any
  try {
    const out = await dispatchTool({ name: row.tool, args: row.args }, undefined, [], { username: p.username, isCreator: p.isCreator, gauPro: true })
    response = out.functionResponse.response
  } catch (e: any) {
    response = { error: e?.message || "Tool lỗi" }
  }
  const failed = !!response?.error
  await supabaseAdmin.from("gp_pending_actions")
    .update({ status: failed ? "failed" : "executed", result: response ?? null }).eq("id", row.id)
  return { ok: !failed, decided: true, autoApprove, status: failed ? "failed" : "executed", tool: row.tool, code: row.code, result: response, error: failed ? String(response.error) : undefined }
}

/** Câu nối gửi lại cho Gấu Pro sau khi người dùng quyết định — để agent làm tiếp việc dở. */
export function followupMessage(r: DecideResult): string {
  const tag = `#${r.code ?? "?"} (${r.tool ?? "?"})`
  if (r.status === "rejected") return `[Đã TỪ CHỐI hành động ${tag}] Không thực hiện hành động đó. Làm tiếp phần việc còn lại nếu có, không thử lại hành động này.`
  let res = ""
  try { res = JSON.stringify(r.result ?? r.error ?? null).slice(0, 1500) } catch { /* bỏ qua */ }
  const auto = r.autoApprove ? " Hôm nay (giờ VN) các hành động ghi/gửi khác tự chạy luôn dù đã đọc nội dung ngoài; gửi Lark người khác, phiếu sửa code và URL lạ vẫn hỏi — nhắc người dùng 1 câu ngắn." : ""
  return r.ok
    ? `[Đã DUYỆT và đã chạy hành động ${tag}] Kết quả: ${res}. Báo ngắn kết quả và làm tiếp phần việc còn lại nếu có.${auto}`
    : `[Đã duyệt nhưng hành động ${tag} lỗi] ${res}. Báo lỗi + cách sửa.`
}
