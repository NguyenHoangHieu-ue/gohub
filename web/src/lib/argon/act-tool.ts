import { Type, type FunctionDeclaration } from "@google/genai"
import type { ToolLogEntry } from "./tools"
import { describeAction } from "@/lib/agents/creator/tool-policy"

// ARGON-X Đợt 2 — HÀNH ĐỘNG QUA THẺ DUYỆT. Argon KHÔNG tự gửi/tạo/ghi ra ngoài: công cụ này chỉ tạo một "hành động chờ duyệt" (bảng gp_pending_actions, kênh "argon")
// hiện ở Việc cần duyệt; chỉ khi anh bấm Duyệt thì hệ thống chạy ĐÚNG công cụ + tham số đã lưu (cùng đường chạy với Gấu Pro, có nhật ký). Bậc L3 (run-safety.ts), chỉ Creator.
export const ACT_NAME = "deXuatThaoTac"
export const MAX_PROPOSALS_PER_RUN = 5

const DOC_WRITE = new Set(["create_doc", "append_doc", "create_sheet", "write_sheet", "append_sheet"])
const GOOGLE_READ = new Set(["search", "read", "list"])
/** Công cụ Gấu Pro được phép đề xuất (localFiles: chỉ ghi/sửa file trên máy qua daemon). Điều khiển trình duyệt đi qua thaoTacTrinhDuyet, không qua thẻ duyệt. */
/** Thành viên (không phải Creator) chỉ đề xuất được đúng việc thành viên làm được ở Gấu Pro: task Lark của chính họ, lịch/nhắc, phiếu sửa code. Không gửi tin Lark, Lark Doc, Google, tệp máy. */
export const MEMBER_ACT_TOOLS: readonly string[] = ["createLarkTask", "updateLarkTask", "scheduleTask", "devTicket"]
export const ACT_TOOLS: readonly string[] = ["sendLarkMessage", "createLarkTask", "updateLarkTask", "scheduleTask", "larkDocs", "googleWorkspace", "devTicket", "localFiles"]

export const ACT_TOOL: FunctionDeclaration = {
  name: ACT_NAME,
  description: `ĐỀ XUẤT một hành động ra ngoài để anh duyệt — bạn KHÔNG tự thực hiện được. Hành động chờ ở "Việc cần duyệt"; anh bấm Duyệt thì hệ thống mới chạy. Dùng khi anh nhờ: gửi tin Lark (DM/nhóm), tạo/sửa task Lark, đặt lịch/nhắc (scheduleTask), tạo/sửa Lark Doc/Sheet hoặc Google Doc/Sheet, tạo phiếu sửa code (devTicket). tool một trong: ${ACT_TOOLS.join(", ")}. argsJson = chuỗi JSON tham số ĐÚNG như công cụ đó nhận (vd sendLarkMessage: {"lark_id":"ou_…","content":"…"} hoặc {"chat_id":"oc_…","content":"…"}; createLarkTask: {"summary":"…","due":"2026-10-30"}; larkDocs: {"action":"create_doc","title":"…","content":"markdown"}). Viết nội dung hoàn chỉnh, đúng ý anh; không bịa người nhận/mã — thiếu thì hỏi anh (hoiHieu). Sau khi gọi, nói rõ với anh là đã tạo đề xuất và đang chờ duyệt, KHÔNG nói là đã gửi/đã làm. Tối đa ${MAX_PROPOSALS_PER_RUN} đề xuất mỗi lượt.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      tool: { type: Type.STRING, description: `Một trong: ${ACT_TOOLS.join(" | ")}` },
      argsJson: { type: Type.STRING, description: "Tham số của công cụ đó, dạng chuỗi JSON" },
      lyDo: { type: Type.STRING, description: "Vì sao đề xuất việc này (1–2 câu, hiện trên thẻ duyệt)" },
    },
    required: ["tool", "argsJson"],
  },
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/** Kiểm tham số tối thiểu để thẻ duyệt không chứa hành động chắc chắn lỗi. Thuần. Trả thông báo lỗi hoặc null. */
export function validateProposal(tool: string, a: Record<string, unknown>, member = false): string | null {
  if (member && !MEMBER_ACT_TOOLS.includes(tool)) return `Thành viên chỉ đề xuất được: ${MEMBER_ACT_TOOLS.join(", ")}. "${tool}" chỉ Creator làm được — nói với người hỏi nhờ Creator`
  switch (tool) {
    case "sendLarkMessage": return !str(a.content) ? "sendLarkMessage cần content" : !str(a.chat_id) && !str(a.lark_id) ? "sendLarkMessage cần chat_id hoặc lark_id (không đoán người nhận)" : null
    case "createLarkTask": return str(a.summary) ? null : "createLarkTask cần summary"
    case "updateLarkTask": return str(a.task_guid) ? null : "updateLarkTask cần task_guid"
    case "scheduleTask": return !str(a.action) || str(a.action) === "list" ? "scheduleTask cần action tạo/sửa/xoá (không phải list)" : null
    case "larkDocs": return DOC_WRITE.has(str(a.action)) ? null : `larkDocs chỉ đề xuất ghi: ${[...DOC_WRITE].join(", ")} (đọc thì dùng docLark)`
    case "googleWorkspace": return !str(a.action) || GOOGLE_READ.has(str(a.action)) ? "googleWorkspace chỉ đề xuất hành động ghi/tạo (đọc không cần duyệt)" : null
    case "localFiles": return ["write", "edit"].includes(str(a.action)) && str(a.path) ? (str(a.action) === "write" ? (typeof a.content === "string" ? null : "localFiles write cần content") : (str(a.find) ? null : "localFiles edit cần find (và replace)")) : "localFiles chỉ đề xuất write/edit kèm path (đọc thì dùng docTepMay)"
    case "devTicket": return str(a.action) === "create" && str(a.title) && str(a.plan) ? null : "devTicket cần action=create, title, plan"
    default: return `Công cụ "${tool}" không nằm trong danh sách đề xuất được (${ACT_TOOLS.join(", ")})`
  }
}

const entry = (args: Record<string, unknown>, ok: boolean, result: string): ToolLogEntry => ({ name: ACT_NAME, args, ok, chars: result.length, result, at: new Date().toISOString() })

/** `used` = số đề xuất đã tạo trong lượt (từ nhật ký); `tainted` = lượt đã đọc nội dung ngoài → ghi rõ trên thẻ để anh kiểm kỹ. */
export async function execActTool(args: Record<string, unknown>, o: { username: string; used: number; tainted: boolean; member?: boolean }): Promise<ToolLogEntry> {
  if (o.used >= MAX_PROPOSALS_PER_RUN) return entry(args, false, `Đã tạo ${MAX_PROPOSALS_PER_RUN} đề xuất trong lượt này — chờ anh duyệt rồi hãy đề xuất tiếp`)
  const tool = str(args.tool)
  let parsed: Record<string, unknown>
  try { const v = JSON.parse(str(args.argsJson) || "{}"); if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("không phải object"); parsed = v as Record<string, unknown> }
  catch (e) { return entry(args, false, `argsJson không phải JSON object hợp lệ (${(e as Error).message})`) }
  const bad = validateProposal(tool, parsed, o.member)
  if (bad) return entry(args, false, bad)
  try {
    const { createPendingAction } = await import("@/lib/agents/creator/approvals")   // nạp lười: kéo theo Supabase + toàn bộ dispatcher của Gấu Pro
    const lyDo = str(args.lyDo).slice(0, 300)
    const reason = [`Argon đề xuất${lyDo ? `: ${lyDo}` : ""}.`, o.tainted ? "Lượt này Argon đã đọc nội dung từ bên ngoài (mail/thread/web/Lark) — kiểm kỹ người nhận và nội dung trước khi duyệt." : ""].filter(Boolean).join(" ")
    const r = await createPendingAction({ username: o.username, tool, args: parsed, reason, summary: describeAction({ name: tool, args: parsed }), channel: "argon" })
    if (r.error || !r.action) return entry(args, false, r.error ?? "Không tạo được đề xuất")
    return entry(args, true, `Đã tạo đề xuất #${r.action.code}: ${r.action.summary}. CHƯA thực hiện — đang chờ anh duyệt ở Việc cần duyệt. Báo anh đúng như vậy, không nói là đã làm.`)
  } catch (e) { return entry(args, false, `Lỗi: ${(e as Error).message}`) }
}
