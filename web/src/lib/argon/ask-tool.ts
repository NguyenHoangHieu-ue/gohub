import { Type, type FunctionDeclaration } from "@google/genai"
import type { MissionPhase } from "./missions"
import { formatNotice } from "@/lib/notify-pure"
import type { ToolLogEntry } from "./tools"

// Công cụ `hoiHieu`: Argon gặp chỗ mơ hồ ngoài brief/kế hoạch thì HỎI Hiếu rồi DỪNG (không đoán). Câu hỏi hiện ở chat (thẻ có nút chọn) và nhắn Lark cho Hiếu.
// Lượt chạy kết thúc ngay sau lần gọi này (run-engine dừng vòng công cụ); Hiếu trả lời = lượt mới, Argon đọc lịch sử và làm tiếp.
export const ASK_TOOL_NAME = "hoiHieu"
const MAX_Q = 600, MAX_OPT = 6, MAX_OPT_LEN = 120

export const ASK_TOOL: FunctionDeclaration = {
  name: ASK_TOOL_NAME,
  description: "Hỏi Hiếu khi gặp chỗ MƠ HỒ ngoài brief.md/kế hoạch (thiếu dữ liệu, hai cách hiểu, việc có rủi ro hoặc khó hoàn tác). Gọi MỘT lần với câu hỏi rõ ràng và các lựa chọn (nếu có), sau đó DỪNG: không làm thêm gì trong lượt này. Hiếu sẽ được nhắn Lark và trả lời trong chat.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      cauHoi: { type: Type.STRING, description: "Câu hỏi ngắn gọn, nêu rõ vì sao cần hỏi" },
      luaChon: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Các lựa chọn gợi ý (tối đa 6), Hiếu bấm chọn một" },
    },
    required: ["cauHoi"],
  },
}

export interface PendingAsk { question: string; options: string[]; at: string }
const key = (missionId: string) => `argon_ask:${missionId}`
const db = async () => (await import("@/lib/supabase")).supabaseAdmin
export async function getPendingAsk(missionId: string): Promise<PendingAsk | null> {
  const { data } = await (await db()).from("app_settings").select("value").eq("key", key(missionId)).maybeSingle()
  if (!data?.value) return null
  try { return (typeof data.value === "string" ? JSON.parse(data.value) : data.value) as PendingAsk } catch { return null }
}
export async function setPendingAsk(missionId: string, ask: PendingAsk) {
  await (await db()).from("app_settings").upsert({ key: key(missionId), value: JSON.stringify(ask), category: "argon", label: "Câu hỏi Argon đang chờ Hiếu trả lời", updated_at: new Date().toISOString() }, { onConflict: "key" })
}
export async function clearPendingAsk(missionId: string) { await (await db()).from("app_settings").delete().eq("key", key(missionId)) }

export function normalizeAsk(args: Record<string, unknown>): { question: string; options: string[] } | { error: string } {
  const question = String(args.cauHoi ?? "").trim()
  if (!question) return { error: "Thiếu cauHoi" }
  const options = (Array.isArray(args.luaChon) ? args.luaChon : []).map(o => String(o).trim()).filter(Boolean).slice(0, MAX_OPT).map(o => o.slice(0, MAX_OPT_LEN))
  return { question: question.slice(0, MAX_Q), options }
}

/** Khối chữ thêm vào câu trả lời của lượt (để câu hỏi luôn hiện trong chat dù model không viết lại). */
export function askBlock(args: Record<string, unknown>): string {
  const a = normalizeAsk(args)
  if ("error" in a) return ""
  return `\n\n❓ **Cần anh quyết:** ${a.question}${a.options.length ? `\n${a.options.map(o => `- ${o}`).join("\n")}` : ""}\n`
}

/** Thực thi `hoiHieu`; không bao giờ ném lỗi. `deps` để test (lưu câu hỏi + nhắn Lark). */
export async function execAsk(
  args: Record<string, unknown>,
  ctx: { missionId: string; missionName: string; phase: MissionPhase; origin: string },
  deps: { save: (missionId: string, ask: PendingAsk) => Promise<void>; notify: (text: string) => Promise<void> },
): Promise<ToolLogEntry> {
  const at = new Date().toISOString()
  const done = (ok: boolean, result: string): ToolLogEntry => ({ name: ASK_TOOL_NAME, args, ok, chars: result.length, result, at })
  const a = normalizeAsk(args)
  if ("error" in a) return done(false, a.error)
  try {
    await deps.save(ctx.missionId, { question: a.question, options: a.options, at })
    await deps.notify(formatNotice({ kind: "Cần trả lời", source: "Argon", title: `Sứ mệnh "${ctx.missionName}" cần anh quyết`, priority: "high",
      body: `${a.question}${a.options.length ? `\n${a.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}` : ""}`, link: { label: "Trả lời tại", url: `${ctx.origin}/analytics/creator/argon` } })).catch(() => undefined)   // DM lỗi không được làm mất câu hỏi (vẫn hiện trong chat)
    return done(true, "Đã gửi câu hỏi cho Hiếu (chat + Lark). DỪNG lượt này ngay, không làm thêm; Hiếu trả lời thì làm tiếp.")
  } catch (e) { return done(false, `Không lưu được câu hỏi: ${(e as Error).message}`) }
}
