import { Type, type FunctionDeclaration } from "@google/genai"
import type { ToolLogEntry } from "./tools"

// Nguồn của sứ mệnh (thread Lark, mail, file…) có thể vượt cửa sổ ngữ cảnh. Hai lớp: (1) `pickByBudget` chọn nguồn đưa THẲNG vào ngữ cảnh trong ngân sách token (ghim trước, rồi mới cập nhật gần nhất);
// (2) công cụ lietKeNguon / docNguon / timTrongNguon cho Argon tự tìm và đọc phần còn lại theo nhu cầu (kể cả nguồn bị bỏ khỏi ngữ cảnh). Chỉ đọc, chỉ nguồn thuộc sứ mệnh này.
export const SOURCE_TOKEN_BUDGET = 650_000      // chừa chỗ cho sổ tay sứ mệnh, lịch sử, công cụ và câu trả lời trong cửa sổ 1M
export const LIST_NAME = "lietKeNguon", READ_NAME = "docNguon", SEARCH_NAME = "timTrongNguon"
export const MAX_READ_CHARS = 60_000
export const MAX_HITS = 20
const SNIP = 260

export const SOURCE_TOOLS: FunctionDeclaration[] = [
  { name: LIST_NAME, description: "Liệt kê nguồn của sứ mệnh (thread Lark, mail, file, ghi chú đã gắn): id, tên, loại, số token, ngày cập nhật, có nằm sẵn trong ngữ cảnh không. Dùng khi nguồn nhiều và bạn cần biết có gì.", parameters: { type: Type.OBJECT, properties: {} } },
  { name: SEARCH_NAME, description: "Tìm từ khoá trong NỘI DUNG mọi nguồn của sứ mệnh (kể cả nguồn không nằm sẵn trong ngữ cảnh). Trả tối đa 20 đoạn trích kèm tên nguồn và id. Dùng để lần theo một khách, mã SKU, tên người, quyết định qua nhiều thread/mail.", parameters: { type: Type.OBJECT, properties: { tuKhoa: { type: Type.STRING, description: "Từ khoá (không phân biệt hoa thường), tối thiểu 2 ký tự" } }, required: ["tuKhoa"] } },
  { name: READ_NAME, description: "Đọc toàn văn 1 nguồn theo id (lấy từ lietKeNguon hoặc timTrongNguon), tối đa ~60.000 ký tự.", parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING, description: "Id nguồn" } }, required: ["id"] } },
]

export interface PickableSource { id: string; name: string; tokens: number; pinned: boolean; updated_at: string }

/** Chọn nguồn vào ngữ cảnh trong ngân sách: ghim trước, rồi cập nhật gần nhất; nguồn vừa không còn chỗ thì BỎ QUA (nguồn nhỏ hơn phía sau vẫn có thể vào). Thuần. */
export function pickByBudget<T extends PickableSource>(all: T[], budget = SOURCE_TOKEN_BUDGET): { keep: T[]; dropped: T[]; usedTokens: number } {
  const sorted = [...all].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
  const keep: T[] = [], dropped: T[] = []
  let used = 0
  for (const s of sorted) {
    if (used + s.tokens > budget) { dropped.push(s); continue }
    used += s.tokens; keep.push(s)
  }
  return { keep, dropped, usedTokens: used }
}

/** Cảnh báo đưa cho Hiếu/Argon khi có nguồn bị bỏ khỏi ngữ cảnh. */
export function droppedWarning(dropped: PickableSource[], budget = SOURCE_TOKEN_BUDGET): string | null {
  if (!dropped.length) return null
  const tok = dropped.reduce((n, s) => n + s.tokens, 0)
  return `Nguồn của sứ mệnh vượt ngân sách ${Math.round(budget / 1000)}k token: ${dropped.length} nguồn (~${Math.round(tok / 1000)}k token) không nằm sẵn trong ngữ cảnh (cũ nhất/không ghim bị bỏ trước). Argon vẫn đọc được bằng timTrongNguon / docNguon. Ghim nguồn quan trọng ở Kho nguồn để luôn được đọc.`
}

/** Đoạn trích quanh lần xuất hiện đầu của từ khoá (thuần). */
export function snippet(text: string, kw: string, width = SNIP): string {
  const i = text.toLowerCase().indexOf(kw.toLowerCase())
  if (i < 0) return text.slice(0, width).replace(/\s+/g, " ")
  const from = Math.max(0, i - Math.floor(width / 3)), to = Math.min(text.length, i + kw.length + Math.floor((width * 2) / 3))
  return `${from > 0 ? "…" : ""}${text.slice(from, to).replace(/\s+/g, " ")}${to < text.length ? "…" : ""}`
}

export interface SrcRow { id: string; name: string; kind: string; tokens: number; updated_at: string; extracted_text?: string | null }
export interface SourceDeps {
  list: () => Promise<(SrcRow & { inContext: boolean })[]>
  search: (kw: string) => Promise<SrcRow[]>
  read: (id: string) => Promise<SrcRow | null>
}
const done = (name: string, args: Record<string, unknown>) => (ok: boolean, result: string): ToolLogEntry => ({ name, args, ok, chars: result.length, result, at: new Date().toISOString() })

/** Thực thi 1 trong 3 công cụ nguồn; không bao giờ ném lỗi. */
export async function execSourceTool(name: string, args: Record<string, unknown>, deps: SourceDeps): Promise<ToolLogEntry> {
  const d = done(name, args)
  try {
    if (name === LIST_NAME) {
      const rows = await deps.list()
      if (!rows.length) return d(true, "(sứ mệnh chưa có nguồn nào; gắn nguồn từ Kho nguồn ở cột trái)")
      return d(true, `${rows.length} nguồn:\n` + rows.slice(0, 200).map(r => `${r.id} · ${r.kind} · ${r.tokens} token · ${r.updated_at.slice(0, 10)} · ${r.inContext ? "trong ngữ cảnh" : "NGOÀI ngữ cảnh (đọc bằng docNguon)"} · ${r.name}`).join("\n") + (rows.length > 200 ? `\n…(còn ${rows.length - 200} nguồn, dùng timTrongNguon)` : ""))
    }
    if (name === SEARCH_NAME) {
      const kw = String(args.tuKhoa ?? "").trim()
      if (kw.length < 2) return d(false, "tuKhoa tối thiểu 2 ký tự")
      const hits = (await deps.search(kw)).slice(0, MAX_HITS)
      if (!hits.length) return d(true, `Không nguồn nào chứa "${kw}".`)
      return d(true, `${hits.length} nguồn chứa "${kw}":\n` + hits.map(h => `- ${h.id} · ${h.name} (${h.kind}, ${h.updated_at.slice(0, 10)})\n  ${snippet(h.extracted_text ?? "", kw)}`).join("\n"))
    }
    if (name === READ_NAME) {
      const id = String(args.id ?? "").trim()
      const s = id ? await deps.read(id) : null
      if (!s) return d(false, `Không có nguồn "${id}" trong sứ mệnh này. Gọi lietKeNguon để xem id.`)
      const t = s.extracted_text ?? ""
      if (!t) return d(false, `"${s.name}" không có văn bản đọc được (file nhị phân/ảnh chưa trích chữ).`)
      return d(true, `# ${s.name}\n${t.length > MAX_READ_CHARS ? `${t.slice(0, MAX_READ_CHARS)}\n…(đã cắt ${t.length - MAX_READ_CHARS} ký tự)` : t}`)
    }
    return d(false, `Công cụ không có: ${name}`)
  } catch (e) { return d(false, `Lỗi nguồn: ${(e as Error).message}`) }
}
