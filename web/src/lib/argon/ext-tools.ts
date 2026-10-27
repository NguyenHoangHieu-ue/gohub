import { Type, type FunctionDeclaration } from "@google/genai"
import type { ToolLogEntry } from "./tools"

// Công cụ ĐỌC đưa từ Gấu Pro sang Gấu Prime (ARGON-X mục 15, Đợt 1). timTrenWeb/docLark/docLarkBase là bậc L1 (nội dung do người/trang ngoài viết); traBangSupabase là L0 (dữ liệu nội bộ, bảng không nhạy cảm):
// kết quả bị bọc + quét chỉ dẫn lạ và lượt chạy bị đánh dấu "nhiễm" (run-safety.ts). Chỉ Creator (member bị chặn ở access-pure.ts): Lark dùng quyền tài khoản của Creator.
export const WEB_NAME = "timTrenWeb", LARK_DOC_NAME = "docLark", LARK_BASE_NAME = "docLarkBase", SUPABASE_NAME = "traBangSupabase"
export const EXT_TOOL_NAMES: readonly string[] = [WEB_NAME, LARK_DOC_NAME, LARK_BASE_NAME, SUPABASE_NAME]
export const EXT_LIMITS: Readonly<Record<string, number>> = { [WEB_NAME]: 5, [LARK_DOC_NAME]: 10, [LARK_BASE_NAME]: 6, [SUPABASE_NAME]: 15 }   // số lần tối đa mỗi tên trong một lượt chạy
const MAX_CHARS = 40_000

export const EXT_TOOLS: FunctionDeclaration[] = [
  { name: WEB_NAME, description: "Tìm trên WEB thông tin bên ngoài: tin tức, tài liệu kỹ thuật, quy định, đối thủ, giá thị trường, mẹo vận hành. KHÔNG dùng cho số liệu/tài liệu nội bộ GoHub (dùng Kho và số liệu hệ thống). KHÔNG đưa tên khách hay số liệu nội bộ vào câu tìm. Trả lời kèm URL nguồn; luôn nêu nguồn khi dùng.", parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Câu tìm (tiếng Anh thường cho kết quả rộng hơn)" } }, required: ["query"] } },
  { name: LARK_DOC_NAME, description: "ĐỌC tài liệu LARK (Docs/Sheets/Wiki trong Lark Drive) bằng tài khoản Lark của Hiếu. action=search: tìm tài liệu theo từ khoá (query). action=read: đọc toàn văn Doc hoặc Sheet từ link/token (url_or_token; Sheet có thể kèm range, vd A1:D50). Chỉ đọc — không tạo/sửa. Muốn lưu tài liệu vào Kho thì dùng Kho nguồn.", parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "search | read" }, query: { type: Type.STRING, description: "Từ khoá tìm (search)" }, url_or_token: { type: Type.STRING, description: "Link tài liệu Lark hoặc token (read)" }, range: { type: Type.STRING, description: "Range Sheet, vd A1:D50 hoặc <sheetId>!A1:D50 (read)" } }, required: ["action"] } },
  { name: SUPABASE_NAME, description: "ĐỌC bảng Supabase (danh mục sản phẩm/SKU/listing, bảng giá NCC 3HK/WorldMove/Datapool, tham chiếu nước/vendor, wiki/KB tài liệu, KPI tháng đã tính sẵn, chi phí kênh). KHÔNG phải số liệu bán hàng chi tiết (đơn, doanh thu theo ngày: dùng sql / layDuLieuHeThong). action=ds: liệt kê bảng + mô tả; action=doc: đọc dòng của bảng (table, columns, filters [{column,op,value}] op ∈ eq,neq,gt,gte,lt,lte,like,ilike,in,is; order, ascending, limit ≤200, countOnly). Không đọc được bảng người dùng/cấu hình/hội thoại.", parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "ds | doc" }, table: { type: Type.STRING, description: "Tên bảng (doc)" }, columns: { type: Type.STRING, description: "Cột, cách nhau dấu phẩy; mặc định *" }, filters: { type: Type.ARRAY, description: "Điều kiện lọc", items: { type: Type.OBJECT, properties: { column: { type: Type.STRING }, op: { type: Type.STRING }, value: { type: Type.STRING } }, required: ["column", "op", "value"] } }, order: { type: Type.STRING }, ascending: { type: Type.BOOLEAN }, limit: { type: Type.NUMBER }, countOnly: { type: Type.BOOLEAN } }, required: ["action"] } },
  { name: LARK_BASE_NAME, description: "ĐỌC dữ liệu Lark Base (bảng: ticket CS, tồn kho, tracking…). Cần app_token (mã sau '/base/' trong link Base — hỏi Hiếu nếu chưa có). Chỉ app_token → liệt kê các bảng; thêm table_id → đọc dòng (filter Lark tuỳ chọn, page_size tối đa 200). Chỉ đọc.", parameters: { type: Type.OBJECT, properties: { app_token: { type: Type.STRING, description: "Mã Base sau '/base/' trong link" }, table_id: { type: Type.STRING, description: "Table ID (bỏ trống để liệt kê bảng)" }, filter: { type: Type.STRING, description: "Công thức lọc Lark, vd CurrentValue.[Status]=\"Open\"" }, page_size: { type: Type.NUMBER, description: "Số dòng tối đa (mặc định 50, tối đa 200)" } }, required: ["app_token"] } },
]

const entry = (name: string, args: Record<string, unknown>, ok: boolean, result: string): ToolLogEntry => ({ name, args, ok, chars: result.length, result, at: new Date().toISOString() })
const json = (v: unknown) => { const s = typeof v === "string" ? v : JSON.stringify(v, null, 1); return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}\n…(cắt bớt, còn ${s.length - MAX_CHARS} ký tự; thu hẹp range/filter để đọc phần còn lại)` : s }

/** `used` = số lần công cụ CÙNG TÊN đã chạy trong lượt (tính từ nhật ký) để áp EXT_LIMITS. */
export async function execExtTool(name: string, args: Record<string, unknown>, used: number): Promise<ToolLogEntry> {
  const cap = EXT_LIMITS[name]
  if (cap && used >= cap) return entry(name, args, false, `Đã dùng hết ${cap} lần ${name} trong lượt này`)
  try {
    if (name === WEB_NAME) {
      const q = String(args.query ?? "").trim()
      if (q.length < 3) return entry(name, args, false, "Thiếu câu tìm (query ≥ 3 ký tự)")
      const { runWebSearch } = await import("@/lib/web-search")   // nạp lười: kéo theo Supabase/Lark, không để vòng lặp Argon phải nạp khi chưa dùng
      const { result, sources } = await runWebSearch(q)
      return entry(name, args, true, json(result + (sources.length ? "\n\nNguồn:\n" + sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`).join("\n") : "")))
    }
    if (name === LARK_DOC_NAME) {
      const action = String(args.action ?? "")
      if (action !== "search" && action !== "read") return entry(name, args, false, 'Chỉ hỗ trợ action "search" hoặc "read" (không tạo/sửa tài liệu)')
      const { runLarkDocs } = await import("@/lib/agents/creator/tools/lark-docs")
      const r = await runLarkDocs({ action, query: args.query as string | undefined, url_or_token: args.url_or_token as string | undefined, range: args.range as string | undefined })
      return r.error ? entry(name, args, false, r.error) : entry(name, args, true, json(r.result))
    }
    if (name === SUPABASE_NAME) {
      const { SUPABASE_TABLES } = await import("@/lib/agents/data-explorer")
      if (String(args.action) === "ds") return entry(name, args, true, json(SUPABASE_TABLES))
      const { runQuerySupabase } = await import("@/lib/agents/creator/tools/supabase")
      const r = await runQuerySupabase(args, false)   // false = chỉ nhóm bảng không nhạy cảm (không app_settings/users/hội thoại)
      return r?.error ? entry(name, args, false, String(r.error)) : entry(name, args, true, json(r))
    }
    if (name === LARK_BASE_NAME) {
      if (!String(args.app_token ?? "").trim()) return entry(name, args, false, "Thiếu app_token (mã sau '/base/' trong link Base)")
      const { runLarkBase } = await import("@/lib/agents/creator/tools/lark")
      const r = await runLarkBase({ app_token: args.app_token, table_id: args.table_id, filter: args.filter, page_size: args.page_size }, { isCreator: true })
      return r?.error ? entry(name, args, false, String(r.error)) : entry(name, args, true, json(r))
    }
    return entry(name, args, false, `Công cụ ${name} không thuộc nhóm ngoài`)
  } catch (e) { return entry(name, args, false, `Lỗi: ${(e as Error).message}`) }
}
