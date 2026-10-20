import type { MissionPhase, TreeNode } from "@/lib/argon/missions"
import type { Run, Source } from "../argon-types"

export type { MissionPhase, TreeNode }

export interface MissionRowUi {
  id: string; project_id: string; name: string; goal: string; phase: MissionPhase; committed_at: string | null; archived: boolean
  created_at: string; updated_at: string; spent_usd: number; runs: number; files: number; sources: number
}
export interface MissionUi { id: string; project_id: string; name: string; goal: string; phase: MissionPhase; committed_at: string | null; archived: boolean; updated_at: string }
export interface WsFileInfo { id: string; path: string; size_bytes: number; author: "user" | "argon"; version: number; updated_at: string }
export interface PendingAskUi { question: string; options: string[]; at: string }
export interface PatchUi { id: string; title: string; request: string; plan: string; at: string; status: "pending" | "approved" | "rejected"; ticketId?: number; error?: string }
export interface MissionDetail { mission: MissionUi; pendingAsk: PendingAskUi | null; patches: PatchUi[]; tree: TreeNode[]; files: WsFileInfo[]; sources: Source[]; runs: Run[]; spent_usd: number }
export interface WsFile { id: string; path: string; mime: string | null; content: string | null; storage_path: string | null; size_bytes: number; author: "user" | "argon"; version: number; updated_at: string }

export const PHASE_LABEL: Record<MissionPhase, string> = { clarify: "Làm rõ", plan: "Kế hoạch", run: "Đang chạy", done: "Đã xong", paused: "Tạm dừng" }
export const PHASE_PILL: Record<MissionPhase, string> = {
  clarify: "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200",
  plan: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  run: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  done: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  paused: "bg-gray-200 text-gray-600 dark:bg-slate-600 dark:text-slate-300",
}
export const BRIEF = "brief.md"
export const PROTECTED_FILES = ["brief.md", "decisions.md"]
export const fmtUsd = (n: number) => `$${n.toFixed(n >= 1 ? 2 : 3).replace(".", ",")}`

/** Chấm màu theo pha cho danh sách (đã qua = lục, hiện tại = tím/màu pha, chưa tới = xám). Thứ tự: làm rõ, kế hoạch, chạy. */
export const PHASE_DOT: Record<MissionPhase, string> = { clarify: "bg-gray-400", plan: "bg-amber-500", run: "bg-emerald-500", done: "bg-violet-500", paused: "bg-gray-400" }
export const phaseIndex = (p: MissionPhase) => (p === "clarify" ? 0 : p === "plan" ? 1 : 2)

/** Nhãn màu cho từng loại bước ở Bàn làm việc (khoá = tag của stepLabel). */
const TAG_BASE = "border-gray-300 text-gray-600 dark:border-slate-600 dark:text-slate-300"
export const TAG_STYLE: Record<string, string> = {
  SQL: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  PY: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  GHI: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  "ĐỌC": TAG_BASE, FILE: TAG_BASE,
  "SỐ": "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  "NGUỒN": "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  "HỎI": "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  "SỬA": "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  "DỰ ĐOÁN": "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  "CHẤM": "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
}
export const tagStyle = (tag: string) => TAG_STYLE[tag] ?? TAG_BASE

/** "vừa xong", "5 phút", "3 giờ", "2 ngày" — tính từ chuỗi thời gian ISO. */
export function relTime(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (!Number.isFinite(s)) return ""
  if (s < 60) return "vừa xong"
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`
  if (s < 86_400) return `${Math.floor(s / 3600)} giờ trước`
  return `${Math.floor(s / 86_400)} ngày trước`
}

/** Mẫu khi tạo sứ mệnh: điền sẵn tên + mục tiêu (Argon sẽ hỏi làm rõ tiếp). Thread/mail đọc nguồn đã nạp ở Kho nguồn rồi gắn vào sứ mệnh. */
export interface MissionTemplate { id: string; icon: "thread" | "mail" | "chart" | "blank"; label: string; hint: string; name: string; goal: string }
export const MISSION_TEMPLATES: MissionTemplate[] = [
  { id: "thread", icon: "thread", label: "Đọc hiểu thread Lark", hint: "Đọc mọi thread + trả lời + file đính kèm để nắm bối cảnh", name: "Đọc hiểu thread: ", goal: "Đọc toàn bộ thread đã gắn từ Kho nguồn (tin gốc, mọi trả lời, file đính kèm) để nắm bối cảnh hiện tại: ai đang làm gì, việc nào đang chờ ai, quyết định nào đã chốt, điểm nào còn mâu thuẫn. Cập nhật khi có thread mới." },
  { id: "mail", icon: "mail", label: "Đọc hiểu hộp thư", hint: "Đọc các luồng mail (kèm đính kèm) để nắm tình hình đối tác", name: "Đọc hiểu mail: ", goal: "Đọc toàn bộ luồng mail đã gắn từ Kho nguồn (kể cả file đính kèm) để nắm tình hình hiện tại với từng đối tác: đề nghị, hạn, việc đang chờ phản hồi, điều cần anh quyết. Cập nhật khi có mail mới." },
  { id: "chart", icon: "chart", label: "Theo dõi một chỉ số", hint: "Đo lại thước đo hằng đêm, cảnh báo khi lệch mục tiêu", name: "Theo dõi: ", goal: "Theo dõi một chỉ số kinh doanh so với mục tiêu: đo bằng SQL/số liệu hệ thống, nêu xu hướng 7 ngày, cảnh báo khi lệch và đề xuất việc cần làm." },
  { id: "blank", icon: "blank", label: "Sứ mệnh trống", hint: "Tự mô tả mục tiêu, Argon sẽ hỏi làm rõ", name: "", goal: "" },
]
