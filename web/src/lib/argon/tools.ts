import { Type, type FunctionDeclaration } from "@google/genai"
import { PACKS, RANGE_PACKS, buildPack } from "./data-packs"

// Công cụ đọc dữ liệu CÓ KIỂM SOÁT của Argon. Chỉ 1 công cụ, chỉ đọc, chỉ gọi các báo cáo có trong danh mục gói dữ liệu (cùng endpoint, cùng số với tab analytics):
// không SQL tự do, không ghi, không gửi tin. Mỗi lượt chạy tối đa MAX_TOOL_CALLS lần gọi, kết quả cắt ở MAX_RESULT_CHARS, toàn bộ được ghi lại để Hiếu xem.
export const MAX_TOOL_CALLS = 8
export const MAX_RESULT_CHARS = 60_000
const MAX_RANGE_DAYS = 400

export interface ToolLogEntry { name: string; args: Record<string, unknown>; ok: boolean; chars: number; result: string; at: string }

const REPORTS = PACKS.filter(p => p.id !== "wiki-business").map(p => p.id)

export const ARGON_TOOLS: FunctionDeclaration[] = [{
  name: "layDuLieuHeThong",
  description: `Lấy số liệu MỚI NHẤT của hệ thống GoHub (chỉ đọc). Báo cáo: ${PACKS.filter(p => p.id !== "wiki-business").map(p => `"${p.id}" (${p.label})`).join("; ")}. ` +
    `Báo cáo theo quý: truyền quarter dạng "Q4-2026". Riêng ${RANGE_PACKS.map(i => `"${i}"`).join(" và ")} có thể truyền startDate + endDate (YYYY-MM-DD) thay cho quarter. Dùng khi cần số mà tài liệu trong dự án không có hoặc đã cũ; không bịa số.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      report: { type: Type.STRING, enum: REPORTS, description: "Mã báo cáo" },
      quarter: { type: Type.STRING, description: 'Quý, vd "Q4-2026" (bỏ trống nếu dùng startDate/endDate)' },
      startDate: { type: Type.STRING, description: "Ngày bắt đầu YYYY-MM-DD (chỉ period-overview/channels)" },
      endDate: { type: Type.STRING, description: "Ngày kết thúc YYYY-MM-DD (chỉ period-overview/channels)" },
    },
    required: ["report"],
  },
}]

const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

/** Kiểm tham số (thuần, có test) — trả lỗi chữ nếu không hợp lệ. */
export function validateToolArgs(args: Record<string, unknown>, now = new Date()): { report: string; quarter: string; range?: { start: string; end: string } } | { error: string } {
  const report = String(args.report ?? "")
  if (!REPORTS.includes(report)) return { error: `Báo cáo không có: "${report}". Chỉ dùng: ${REPORTS.join(", ")}` }
  const hasRange = args.startDate != null || args.endDate != null
  if (hasRange) {
    if (!RANGE_PACKS.includes(report)) return { error: `"${report}" chỉ theo quý (quarter), không theo khoảng ngày` }
    if (!isYmd(args.startDate) || !isYmd(args.endDate)) return { error: "startDate và endDate phải đủ, dạng YYYY-MM-DD" }
    const s = Date.parse(args.startDate), e = Date.parse(args.endDate)
    if (e < s) return { error: "endDate phải sau startDate" }
    if ((e - s) / 86_400_000 > MAX_RANGE_DAYS) return { error: `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày` }
    const yesterdayVn = new Date(now.getTime() + 7 * 3600_000 - 86_400_000).toISOString().slice(0, 10)
    return { report, quarter: "", range: { start: args.startDate, end: args.endDate > yesterdayVn ? yesterdayVn : args.endDate } }
  }
  const quarter = String(args.quarter ?? "")
  if (!/^Q[1-4]-\d{4}$/.test(quarter)) return { error: 'Thiếu quarter dạng "Q4-2026" (hoặc startDate + endDate)' }
  return { report, quarter }
}

/** Chạy 1 lần gọi công cụ; không bao giờ ném lỗi (lỗi trả về dạng chữ cho model đọc). */
export async function execArgonTool(name: string, args: Record<string, unknown>, origin: string): Promise<ToolLogEntry> {
  const at = new Date().toISOString()
  const done = (ok: boolean, result: string): ToolLogEntry => ({ name, args, ok, chars: result.length, result, at })
  if (name !== "layDuLieuHeThong") return done(false, `Công cụ không có: ${name}`)
  const v = validateToolArgs(args)
  if ("error" in v) return done(false, v.error)
  try {
    const pack = await buildPack(v.report, v.quarter, origin, v.range)
    const text = `${pack.title}\n${pack.text}`
    return done(true, text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(đã cắt ${text.length - MAX_RESULT_CHARS} ký tự — hỏi hẹp hơn để lấy đủ)` : text)
  } catch (e) {
    return done(false, `Lỗi lấy số liệu: ${(e as Error).message}`)
  }
}
