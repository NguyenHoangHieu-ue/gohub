import { Type, type FunctionDeclaration } from "@google/genai"
import type { MissionPhase } from "./missions"
import { formatNotice } from "@/lib/notify-pure"
import type { ToolLogEntry } from "./tools"

// Công cụ `deXuatSuaCode`: Argon phát hiện lỗi/việc cải tiến ở CODE của Intel (vd số liệu một tab lệch) thì soạn ĐỀ XUẤT SỬA CODE kèm bằng chứng. Argon KHÔNG tự sửa/đẩy code:
// đề xuất nằm ở trạng thái "chờ duyệt" cho tới khi Hiếu bấm Duyệt; khi đó hệ thống tạo phiếu `dev_tickets` (lib/dev-tickets.ts) → GitHub Actions chạy Claude Code → PR vào `staging`
// (không bao giờ vào main). Lưu `app_settings.argon_patches:<missionId>` (không migration).
export const PATCH_TOOL_NAME = "deXuatSuaCode"
export const MAX_PENDING_PATCHES = 3
const MAX_KEEP = 20, MAX_TITLE = 120, MAX_REQ = 6_000, MAX_PLAN = 3_000

export const PATCH_TOOL: FunctionDeclaration = {
  name: PATCH_TOOL_NAME,
  description: "Đề xuất SỬA CODE của hệ thống Intel khi bạn tìm thấy lỗi hoặc chỗ cần cải tiến có bằng chứng (vd số liệu một tab lệch so với nguồn gốc). Bạn KHÔNG tự sửa: đề xuất chờ Hiếu duyệt, duyệt xong Claude Code mới viết patch và mở PR vào nhánh staging. " +
    "yeuCau phải cụ thể và tự đủ để người khác làm được: tab/file nghi ngờ, hiện tượng đang thấy, kết quả mong đợi, số liệu bằng chứng kèm [#N]. Không đề xuất đụng secret, ghi dữ liệu production hay nhánh main. Tối đa 3 đề xuất đang chờ mỗi sứ mệnh; chỉ ở pha chạy.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      tieuDe: { type: Type.STRING, description: "Tiêu đề ngắn (≤120 ký tự)" },
      yeuCau: { type: Type.STRING, description: "Mô tả đủ để làm: vấn đề, bằng chứng [#N], hành vi mong đợi, phạm vi" },
      keHoach: { type: Type.STRING, description: "Gợi ý hướng sửa (tuỳ chọn)" },
    },
    required: ["tieuDe", "yeuCau"],
  },
}

export type PatchStatus = "pending" | "approved" | "rejected"
export interface PatchProposal { id: string; title: string; request: string; plan: string; at: string; status: PatchStatus; ticketId?: number; decidedAt?: string; error?: string }

export function normalizePatch(args: Record<string, unknown>): { title: string; request: string; plan: string } | { error: string } {
  const title = String(args.tieuDe ?? "").trim().slice(0, MAX_TITLE)
  const request = String(args.yeuCau ?? "").trim().slice(0, MAX_REQ)
  if (!title) return { error: "Thiếu tieuDe" }
  if (request.length < 40) return { error: "yeuCau quá ngắn: nêu tab/file, hiện tượng, bằng chứng và kết quả mong đợi" }
  return { title, request, plan: String(args.keHoach ?? "").trim().slice(0, MAX_PLAN) }
}

/** Thêm đề xuất mới (thuần). Từ chối khi đã đủ MAX_PENDING_PATCHES đang chờ hoặc trùng tiêu đề với đề xuất đang chờ. Giữ tối đa MAX_KEEP bản gần nhất. */
export function addProposal(list: PatchProposal[], p: { title: string; request: string; plan: string }, id: string, at: string): { list: PatchProposal[] } | { error: string } {
  const pending = list.filter(x => x.status === "pending")
  if (pending.length >= MAX_PENDING_PATCHES) return { error: `Đã có ${MAX_PENDING_PATCHES} đề xuất đang chờ Hiếu duyệt. Chờ Hiếu quyết rồi mới đề xuất thêm.` }
  if (pending.some(x => x.title.toLowerCase() === p.title.toLowerCase())) return { error: "Đã có đề xuất cùng tiêu đề đang chờ." }
  return { list: [...list, { id, ...p, at, status: "pending" as PatchStatus }].slice(-MAX_KEEP) }
}

/** Ghi quyết định của Hiếu (thuần). Chỉ đề xuất đang chờ mới đổi trạng thái được. */
export function decide(list: PatchProposal[], id: string, status: "approved" | "rejected", at: string, extra: { ticketId?: number; error?: string } = {}): { list: PatchProposal[]; proposal: PatchProposal } | { error: string } {
  const cur = list.find(x => x.id === id)
  if (!cur) return { error: "Không tìm thấy đề xuất" }
  if (cur.status !== "pending") return { error: "Đề xuất này đã được quyết rồi" }
  const next = { ...cur, status, decidedAt: at, ...extra }
  return { list: list.map(x => (x.id === id ? next : x)), proposal: next }
}

const key = (missionId: string) => `argon_patches:${missionId}`
const db = async () => (await import("@/lib/supabase")).supabaseAdmin
export async function getPatches(missionId: string): Promise<PatchProposal[]> {
  const { data } = await (await db()).from("app_settings").select("value").eq("key", key(missionId)).maybeSingle()
  try { return data?.value ? (JSON.parse(data.value) as PatchProposal[]) : [] } catch { return [] }
}
export async function savePatches(missionId: string, list: PatchProposal[]) {
  await (await db()).from("app_settings").upsert({ key: key(missionId), value: JSON.stringify(list), category: "argon", label: "Đề xuất sửa code của Argon", updated_at: new Date().toISOString() }, { onConflict: "key" })
}
export async function deletePatches(missionId: string) { await (await db()).from("app_settings").delete().eq("key", key(missionId)) }

/** Thực thi `deXuatSuaCode`; không bao giờ ném lỗi. `deps` để test (đọc/ghi danh sách + nhắn Hiếu). */
export async function execPropose(
  args: Record<string, unknown>,
  ctx: { missionId: string; missionName: string; phase: MissionPhase; origin: string },
  deps: { load: (id: string) => Promise<PatchProposal[]>; save: (id: string, l: PatchProposal[]) => Promise<void>; notify: (t: string) => Promise<void>; newId: () => string },
): Promise<ToolLogEntry> {
  const at = new Date().toISOString()
  const done = (ok: boolean, result: string): ToolLogEntry => ({ name: PATCH_TOOL_NAME, args, ok, chars: result.length, result, at })
  if (ctx.phase !== "run") return done(false, `Chỉ đề xuất sửa code ở pha chạy (sau khi Hiếu Chốt). Sứ mệnh đang ở pha "${ctx.phase}".`)
  const n = normalizePatch(args)
  if ("error" in n) return done(false, n.error)
  try {
    const r = addProposal(await deps.load(ctx.missionId), n, deps.newId(), at)
    if ("error" in r) return done(false, r.error)
    await deps.save(ctx.missionId, r.list)
    await deps.notify(formatNotice({ kind: "Cần duyệt", source: "Argon", title: `Đề xuất sửa code: ${n.title}`, priority: "high",
      body: `Sứ mệnh "${ctx.missionName}". Duyệt xong Claude Code mới viết patch và mở PR vào staging.`, link: { label: "Chờ anh duyệt tại", url: `${ctx.origin}/analytics/creator/argon` } })).catch(() => undefined)
    return done(true, `Đã ghi đề xuất "${n.title}" — CHỜ Hiếu duyệt. Bạn không tự sửa code; tiếp tục việc khác hoặc nêu đề xuất này trong tổng kết.`)
  } catch (e) { return done(false, `Không lưu được đề xuất: ${(e as Error).message}`) }
}
