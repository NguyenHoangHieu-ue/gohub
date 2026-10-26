import { execKhoTool } from "@/lib/argon/kho-tools"
import { searchAssistant } from "./search"

// P3c — Gấu Pro dùng CHUNG Kho với Argon (chỉ đọc): cùng hàm tra sổ sự việc / mail / graph / tìm theo ý nghĩa mà Argon dùng, không viết lại.
export const KHO_LOOKUP_KINDS = ["suViec", "mail", "thucThe", "timKiem"] as const
export type KhoLookupKind = (typeof KHO_LOOKUP_KINDS)[number]

/** Đổi tham số của công cụ Gấu Pro `traCuuKho` sang công cụ Kho tương ứng. Thuần (có test). */
export function mapKhoCall(args: { loai?: unknown; ten?: unknown; tuKhoa?: unknown; trangThai?: unknown }): { tool: "traSuViec" | "traMail" | "traThucThe"; args: Record<string, unknown> } | { search: string } | { error: string } {
  const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 300) : "")
  const loai = s(args.loai)
  if (loai === "suViec") return { tool: "traSuViec", args: { tuKhoa: s(args.tuKhoa) || s(args.ten) } }
  if (loai === "mail") return { tool: "traMail", args: { trangThai: s(args.trangThai) || "cho_minh", tuKhoa: s(args.tuKhoa) } }
  if (loai === "thucThe") return s(args.ten) ? { tool: "traThucThe", args: { ten: s(args.ten) } } : { error: "thucThe cần ten (tên hoặc bí danh thực thể)." }
  if (loai === "timKiem") return s(args.tuKhoa) || s(args.ten) ? { search: s(args.tuKhoa) || s(args.ten) } : { error: "timKiem cần tuKhoa (câu cần tìm)." }
  return { error: `loai phải là ${KHO_LOOKUP_KINDS.join(" | ")}.` }
}

export async function lookupKho(username: string, args: Record<string, unknown>): Promise<{ ketQua?: string; error?: string }> {
  if (!username) return { error: "Thiếu người dùng." }
  const m = mapKhoCall(args)
  if ("error" in m) return { error: m.error }
  if ("tool" in m) { const r = await execKhoTool(m.tool, m.args, username); return r.ok ? { ketQua: r.result } : { error: r.result } }
  const r = await searchAssistant(username, m.search)
  const lines = [
    ...r.facts.map(f => `[sự việc] ${f.line}`), ...r.entities.map(e => `[thực thể] ${e.name} (${e.kind}, ${e.mentions} nguồn)`),
    ...r.threads.map(t => `[mail ${t.status}] ${t.line}`), ...r.chunks.map(c => `[${c.sourceName}] ${c.text}`),
  ]
  return { ketQua: lines.length ? lines.join("\n") : "Kho không có gì khớp." }
}
