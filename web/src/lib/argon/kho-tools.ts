import { Type, type FunctionDeclaration } from "@google/genai"
import type { ToolLogEntry } from "./tools"
import { cleanFolderPath, ensureFolderPath, ensureKhoProject, moveSources, userProjectIds } from "./kho"
const db = async () => (await import("@/lib/supabase")).supabaseAdmin   // nạp muộn: phần thuần test được không cần env Supabase

// Công cụ riêng của sứ mệnh "Thủ thư Kho": xếp thư mục, đổi tên/nhãn/ghim, lưu ghi chú. KHÔNG xoá gì, không đụng nội dung nguồn.
// Đọc/tìm nguồn dùng lietKeNguon / timTrongNguon / docNguon có sẵn (ở sứ mệnh Thủ thư, phạm vi = mọi nguồn của người dùng).
export const KHO_TOOL_NAMES = ["taoThuMuc", "chuyenNguon", "capNhatNguon", "luuGhiChu"] as const

export const KHO_TOOLS: FunctionDeclaration[] = [
  { name: "taoThuMuc", description: "Tạo thư mục trong Kho (tạo cả các cấp còn thiếu, tối đa 3 cấp). Vd \"Vendor/3HK/Bảng giá\". Đã có thì dùng lại.", parameters: { type: Type.OBJECT, properties: { duongDan: { type: Type.STRING, description: "Đường dẫn thư mục, cấp cách nhau bằng /" } }, required: ["duongDan"] } },
  { name: "chuyenNguon", description: "Chuyển một hoặc nhiều nguồn vào thư mục (tự tạo thư mục nếu chưa có). thuMuc rỗng = đưa về Chưa phân loại. Tối đa 100 nguồn mỗi lần. Id lấy từ lietKeNguon / timTrongNguon / mục lục Kho.", parameters: { type: Type.OBJECT, properties: { idNguon: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Danh sách id nguồn" }, thuMuc: { type: Type.STRING, description: "Đường dẫn thư mục đích, \"\" = Chưa phân loại" } }, required: ["idNguon", "thuMuc"] } },
  { name: "capNhatNguon", description: "Đổi tên, gắn nhãn (thay toàn bộ nhãn cũ) hoặc ghim/bỏ ghim một nguồn. Nguồn ghim luôn nằm sẵn trong ngữ cảnh mọi lượt nên chỉ ghim tài liệu cốt lõi.", parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, ten: { type: Type.STRING, description: "Tên mới (tuỳ chọn)" }, nhan: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Danh sách nhãn mới, tối đa 8 (tuỳ chọn)" }, ghim: { type: Type.BOOLEAN, description: "true = ghim, false = bỏ ghim (tuỳ chọn)" } }, required: ["id"] } },
  { name: "luuGhiChu", description: "Lưu một ghi chú/bản tổng hợp thành nguồn mới trong Kho (vd bảng so sánh báo giá, hồ sơ vendor, biên bản tóm tắt). Dùng khi kết quả đáng giữ lại cho lần sau.", parameters: { type: Type.OBJECT, properties: { ten: { type: Type.STRING }, noiDung: { type: Type.STRING, description: "Nội dung markdown" }, thuMuc: { type: Type.STRING, description: "Thư mục lưu (tuỳ chọn, mặc định Chưa phân loại)" } }, required: ["ten", "noiDung"] } },
]

const entry = (name: string, args: Record<string, unknown>, ok: boolean, result: string): ToolLogEntry => ({ name, args, ok, chars: result.length, result, at: new Date().toISOString() })

export async function execKhoTool(name: string, args: Record<string, unknown>, username: string): Promise<ToolLogEntry> {
  try {
    if (name === "taoThuMuc") {
      const segs = cleanFolderPath(String(args.duongDan ?? ""))
      if (!segs.length) return entry(name, args, false, "duongDan trống")
      await ensureFolderPath(username, segs.join("/"))
      return entry(name, args, true, `Thư mục sẵn sàng: ${segs.join("/")}`)
    }
    if (name === "chuyenNguon") {
      const ids = (Array.isArray(args.idNguon) ? args.idNguon : []).map(String).slice(0, 100)
      if (!ids.length) return entry(name, args, false, "idNguon trống")
      const path = cleanFolderPath(String(args.thuMuc ?? ""))
      const folderId = path.length ? await ensureFolderPath(username, path.join("/")) : null
      const r = await moveSources(username, ids, folderId)
      if (r.error) return entry(name, args, false, r.error)
      return entry(name, args, true, `Đã chuyển ${r.moved}/${ids.length} nguồn vào ${path.length ? path.join("/") : "Chưa phân loại"}${r.moved < ids.length ? " (số còn lại không thuộc Kho của anh hoặc id sai)" : ""}`)
    }
    if (name === "capNhatNguon") {
      const id = String(args.id ?? "")
      const pids = await userProjectIds(username)
      const { data: src } = pids.length ? await (await db()).from("argon_sources").select("id,name,meta").eq("id", id).in("project_id", pids).maybeSingle() : { data: null }
      if (!src) return entry(name, args, false, `Không có nguồn "${id}" trong Kho`)
      const patch: Record<string, unknown> = {}
      const done: string[] = []
      if (typeof args.ten === "string" && args.ten.trim()) { patch.name = args.ten.trim().slice(0, 160); done.push(`đổi tên → ${patch.name}`) }
      if (typeof args.ghim === "boolean") { patch.pinned = args.ghim; done.push(args.ghim ? "ghim" : "bỏ ghim") }
      if (Array.isArray(args.nhan)) {
        const tags = Array.from(new Set(args.nhan.map(t => String(t).trim().slice(0, 40)).filter(Boolean))).slice(0, 8)
        patch.meta = { ...((src.meta ?? {}) as Record<string, unknown>), tags }
        done.push(`nhãn: ${tags.join(", ") || "(xoá hết)"}`)
      }
      if (!done.length) return entry(name, args, false, "Không có gì để cập nhật (cần ten, nhan hoặc ghim)")
      const { error } = await (await db()).from("argon_sources").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)
      return error ? entry(name, args, false, error.message) : entry(name, args, true, `${src.name}: ${done.join("; ")}`)
    }
    if (name === "luuGhiChu") {
      const ten = String(args.ten ?? "").trim().slice(0, 160), text = String(args.noiDung ?? "")
      if (!ten || !text.trim()) return entry(name, args, false, "Cần ten và noiDung")
      const projectId = await ensureKhoProject(username)
      const path = cleanFolderPath(String(args.thuMuc ?? ""))
      const folderId = path.length ? await ensureFolderPath(username, path.join("/")) : null
      const { data: src, error } = await (await db()).from("argon_sources").insert({
        project_id: projectId, kind: "note", name: ten, mime: "text/markdown", extracted_text: text, size_bytes: Buffer.byteLength(text), folder_id: folderId, tokens: Math.ceil(text.length / 3), meta: { author: "argon" },
      }).select("id").single()
      if (error || !src) return entry(name, args, false, error?.message ?? "Lưu lỗi")
      await (await db()).from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: text, note: "Argon lưu ghi chú", author: "argon" })
      return entry(name, args, true, `Đã lưu ghi chú "${ten}" (id ${src.id}) vào ${path.length ? path.join("/") : "Chưa phân loại"}`)
    }
    return entry(name, args, false, `Công cụ không có: ${name}`)
  } catch (e) { return entry(name, args, false, `Lỗi Kho: ${(e as Error).message}`) }
}
