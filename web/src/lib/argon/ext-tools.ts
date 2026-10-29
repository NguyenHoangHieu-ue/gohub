import { Type, type FunctionDeclaration } from "@google/genai"
import type { ToolLogEntry } from "./tools"
import { gateWrite } from "./run-safety"

// Công cụ ĐỌC đưa từ Gấu Pro sang Gấu Prime (ARGON-X mục 15, Đợt 1). timTrenWeb/docLark/docLarkBase là bậc L1 (nội dung do người/trang ngoài viết); traBangSupabase là L0 (dữ liệu nội bộ, bảng không nhạy cảm):
// kết quả bị bọc + quét chỉ dẫn lạ và lượt chạy bị đánh dấu "nhiễm" (run-safety.ts). Chỉ Creator (member bị chặn ở access-pure.ts): Lark dùng quyền tài khoản của Creator.
export const WEB_NAME = "timTrenWeb", LARK_DOC_NAME = "docLark", LARK_BASE_NAME = "docLarkBase", SUPABASE_NAME = "traBangSupabase"
export const TASK_NAME = "docViecLark", GA4_NAME = "docGA4", GSC_NAME = "docGSC", VIDEO_NAME = "taoVideo", VIDEO_CHECK_NAME = "kiemTraVideo", HISTORY_NAME = "timHoiThoaiCu", GOOGLE_NAME = "docGoogle"
export const TAB_NAME = "docTabTrinhDuyet", CONTROL_NAME = "thaoTacTrinhDuyet", FILES_NAME = "docTepMay"   // Bridge (extension trên máy người dùng) — chỉ Creator
export const EXT_TOOL_NAMES: readonly string[] = [WEB_NAME, LARK_DOC_NAME, LARK_BASE_NAME, SUPABASE_NAME, TASK_NAME, GA4_NAME, GSC_NAME, VIDEO_NAME, VIDEO_CHECK_NAME, HISTORY_NAME, GOOGLE_NAME, TAB_NAME, CONTROL_NAME, FILES_NAME]
export const EXT_LIMITS: Readonly<Record<string, number>> = { [WEB_NAME]: 5, [LARK_DOC_NAME]: 10, [LARK_BASE_NAME]: 6, [SUPABASE_NAME]: 15, [TASK_NAME]: 8, [GA4_NAME]: 6, [GSC_NAME]: 6, [VIDEO_NAME]: 2, [VIDEO_CHECK_NAME]: 6, [HISTORY_NAME]: 5, [GOOGLE_NAME]: 8, [TAB_NAME]: 15, [CONTROL_NAME]: 40, [FILES_NAME]: 15 }   // số lần tối đa mỗi tên trong một lượt chạy
const MAX_CHARS = 40_000

export const EXT_TOOLS: FunctionDeclaration[] = [
  { name: WEB_NAME, description: "Tìm trên WEB thông tin bên ngoài: tin tức, tài liệu kỹ thuật, quy định, đối thủ, giá thị trường, mẹo vận hành. KHÔNG dùng cho số liệu/tài liệu nội bộ GoHub (dùng Kho và số liệu hệ thống). KHÔNG đưa tên khách hay số liệu nội bộ vào câu tìm. Trả lời kèm URL nguồn; luôn nêu nguồn khi dùng.", parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING, description: "Câu tìm (tiếng Anh thường cho kết quả rộng hơn)" } }, required: ["query"] } },
  { name: LARK_DOC_NAME, description: "ĐỌC tài liệu LARK (Docs/Sheets/Wiki trong Lark Drive) bằng tài khoản Lark của Hiếu. action=search: tìm tài liệu theo từ khoá (query). action=read: đọc toàn văn Doc hoặc Sheet từ link/token (url_or_token; Sheet có thể kèm range, vd A1:D50). Chỉ đọc — không tạo/sửa. Muốn lưu tài liệu vào Kho thì dùng Kho nguồn.", parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "search | read" }, query: { type: Type.STRING, description: "Từ khoá tìm (search)" }, url_or_token: { type: Type.STRING, description: "Link tài liệu Lark hoặc token (read)" }, range: { type: Type.STRING, description: "Range Sheet, vd A1:D50 hoặc <sheetId>!A1:D50 (read)" } }, required: ["action"] } },
  { name: SUPABASE_NAME, description: "ĐỌC bảng Supabase (danh mục sản phẩm/SKU/listing, bảng giá NCC 3HK/WorldMove/Datapool, tham chiếu nước/vendor, wiki/KB tài liệu, KPI tháng đã tính sẵn, chi phí kênh). KHÔNG phải số liệu bán hàng chi tiết (đơn, doanh thu theo ngày: dùng sql / layDuLieuHeThong). action=ds: liệt kê bảng + mô tả; action=doc: đọc dòng của bảng (table, columns, filters [{column,op,value}] op ∈ eq,neq,gt,gte,lt,lte,like,ilike,in,is; order, ascending, limit ≤200, countOnly). Không đọc được bảng người dùng/cấu hình/hội thoại.", parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "ds | doc" }, table: { type: Type.STRING, description: "Tên bảng (doc)" }, columns: { type: Type.STRING, description: "Cột, cách nhau dấu phẩy; mặc định *" }, filters: { type: Type.ARRAY, description: "Điều kiện lọc", items: { type: Type.OBJECT, properties: { column: { type: Type.STRING }, op: { type: Type.STRING }, value: { type: Type.STRING } }, required: ["column", "op", "value"] } }, order: { type: Type.STRING }, ascending: { type: Type.BOOLEAN }, limit: { type: Type.NUMBER }, countOnly: { type: Type.BOOLEAN } }, required: ["action"] } },
  { name: TASK_NAME, description: "ĐỌC task Lark của anh (bằng tài khoản Lark của Hiếu). action=lists: liệt kê Danh sách công việc (guid + tên). action=list: liệt kê task (tasklist_guid tuỳ chọn; page_size ≤ 50). action=get: chi tiết 1 task (task_guid: tên, mô tả, hạn, trạng thái, việc con). Chỉ đọc — tạo/sửa task thì dùng deXuatThaoTac.", parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "lists | list | get" }, tasklist_guid: { type: Type.STRING }, task_guid: { type: Type.STRING }, page_size: { type: Type.NUMBER } }, required: ["action"] } },
  { name: GA4_NAME, description: "ĐỌC Google Analytics 4 của website GoHub: sessions, users, pageviews, revenue, conversions… theo chiều (dimensions) tuỳ chọn. Ngày dạng YYYY-MM-DD hoặc '30daysAgo'/'today'. Dùng cho câu hỏi lưu lượng/hiệu quả website; số bán hàng thì dùng sql.", parameters: { type: Type.OBJECT, properties: { startDate: { type: Type.STRING }, endDate: { type: Type.STRING }, metrics: { type: Type.ARRAY, items: { type: Type.STRING } }, dimensions: { type: Type.ARRAY, items: { type: Type.STRING } }, siteId: { type: Type.STRING }, limit: { type: Type.NUMBER } }, required: ["startDate", "endDate", "metrics"] } },
  { name: GSC_NAME, description: "ĐỌC Google Search Console của website GoHub: clicks, impressions, CTR, vị trí trung bình, từ khoá hàng đầu (dimensions mặc định query).", parameters: { type: Type.OBJECT, properties: { startDate: { type: Type.STRING }, endDate: { type: Type.STRING }, dimensions: { type: Type.ARRAY, items: { type: Type.STRING } }, siteId: { type: Type.STRING }, rowLimit: { type: Type.NUMBER } }, required: ["startDate", "endDate"] } },
  { name: VIDEO_NAME, description: "TẠO video ngắn (~8 giây, có âm thanh) bằng Google Veo từ mô tả. Chỉ dùng khi anh nhờ làm video/clip/TikTok/Reels. Dựng ~1 phút: nếu chưa xong trả task_id → gọi kiemTraVideo sau 1–2 phút. Trả markdown có link video — chép nguyên vào câu trả lời. Tốn chi phí; không dùng được trong lượt đã đọc nội dung từ bên ngoài. Tối đa 2 video/lượt.", parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING, description: "Mô tả chi tiết: chủ thể, hành động, bối cảnh, góc máy, ánh sáng, âm thanh/lời thoại" }, negative_prompt: { type: Type.STRING }, aspect_ratio: { type: Type.STRING, description: "16:9 (mặc định) | 9:16" }, quality: { type: Type.STRING, description: "standard (mặc định) | high (chậm, đắt hơn)" } }, required: ["prompt"] } },
  { name: VIDEO_CHECK_NAME, description: "Kiểm tra video đang dựng khi taoVideo trả task_id. Gọi sau 1–2 phút để lấy link.", parameters: { type: Type.OBJECT, properties: { task_id: { type: Type.STRING } }, required: ["task_id"] } },
  { name: HISTORY_NAME, description: "TÌM trong lịch sử các cuộc trò chuyện CŨ của anh: các cuộc ở Gấu Prime (khớp từ khoá không phân biệt dấu) và hội thoại cũ ở Gấu Pro/Bé Gấu (tìm theo ý nghĩa). Dùng khi anh hỏi 'hôm trước mình bàn gì về…', 'lần trước em trả lời sao'. Trả các lượt khớp kèm tên cuộc trò chuyện và ngày.", parameters: { type: Type.OBJECT, properties: { tuKhoa: { type: Type.STRING, description: "Từ khoá (≥ 2 ký tự)" } }, required: ["tuKhoa"] } },
  { name: GOOGLE_NAME, description: "ĐỌC Google Drive/Docs/Sheets của Hiếu (tài khoản Google đã kết nối; chỉ Creator). action=search: tìm file theo tên/nội dung (query). action=read: đọc Doc (ra văn bản), Sheet (range tuỳ chọn, mặc định sheet đầu) hoặc file văn bản theo file_id (lấy từ search hoặc phần giữa /d/ và /edit trong link). Chỉ đọc — tạo/sửa tài liệu thì dùng deXuatThaoTac.", parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "search | read" }, query: { type: Type.STRING }, file_id: { type: Type.STRING }, range: { type: Type.STRING, description: "Range A1 của Sheet, vd 'Sheet1'!A1:D20" } }, required: ["action"] } },
  { name: TAB_NAME, description: "NHÌN tab Chrome THẬT trên máy của anh (dùng phiên đăng nhập sẵn của anh) qua extension Bridge. action=list_tabs: liệt kê tab (id, tiêu đề, URL; trang nhạy cảm bị ẩn). action=snapshot: đọc nội dung chữ + các phần tử bấm được (kèm ref) của một tab (bỏ trống tab_id = tab đang mở). Chỉ đọc. Bridge chưa kết nối thì báo anh cài/ghép nối ở trang Bridge.", parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "list_tabs | snapshot" }, tab_id: { type: Type.NUMBER, description: "ID tab (từ list_tabs)" } }, required: ["action"] } },
  { name: CONTROL_NAME, description: "THAO TÁC trên tab Chrome THẬT của anh (click/gõ/phím là thao tác thật, thực thi NGAY với phiên đăng nhập thật của anh) nên LUÔN nói ngắn bạn sắp làm gì TRƯỚC khi gọi, từng bước nhỏ, không tự gửi/đặt hàng/xoá/thanh toán nếu anh chưa nói rõ. action: click | fill | key | select | hover | scroll | scroll_to | wait_for | navigate | open_tab | close_tab | activate_tab. Dùng ref từ docTabTrinhDuyet snapshot để chỉ phần tử. KHÔNG dùng được trong lượt đã đọc nội dung từ bên ngoài (mail/thread/web/Lark): hỏi lại ở lượt mới. Tối đa 40 thao tác mỗi lượt.", parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING }, tab_id: { type: Type.NUMBER }, ref: { type: Type.STRING, description: "ref từ snapshot" }, selector: { type: Type.STRING }, value: { type: Type.STRING, description: "Chữ cần gõ (fill) hoặc giá trị chọn (select)" }, url: { type: Type.STRING, description: "URL (navigate/open_tab)" }, keys: { type: Type.STRING, description: "Phím (key), vd Enter" }, timeout_ms: { type: Type.NUMBER } }, required: ["action"] } },
  { name: FILES_NAME, description: "ĐỌC file trên MÁY TÍNH của anh qua daemon local (chỉ các thư mục anh đã cho phép). action=list: liệt kê thư mục (bỏ trống path = các thư mục gốc được phép). action=read: đọc file văn bản theo đường dẫn tuyệt đối. Ghi/sửa file thì dùng deXuatThaoTac (tool localFiles, action write/edit) để anh duyệt.", parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, description: "list | read" }, path: { type: Type.STRING, description: "Đường dẫn tuyệt đối trên máy anh" } }, required: ["action"] } },
  { name: LARK_BASE_NAME, description: "ĐỌC dữ liệu Lark Base (bảng: ticket CS, tồn kho, tracking…). Cần app_token (mã sau '/base/' trong link Base — hỏi Hiếu nếu chưa có). Chỉ app_token → liệt kê các bảng; thêm table_id → đọc dòng (filter Lark tuỳ chọn, page_size tối đa 200). Chỉ đọc.", parameters: { type: Type.OBJECT, properties: { app_token: { type: Type.STRING, description: "Mã Base sau '/base/' trong link" }, table_id: { type: Type.STRING, description: "Table ID (bỏ trống để liệt kê bảng)" }, filter: { type: Type.STRING, description: "Công thức lọc Lark, vd CurrentValue.[Status]=\"Open\"" }, page_size: { type: Type.NUMBER, description: "Số dòng tối đa (mặc định 50, tối đa 200)" } }, required: ["app_token"] } },
]

const entry = (name: string, args: Record<string, unknown>, ok: boolean, result: string): ToolLogEntry => ({ name, args, ok, chars: result.length, result, at: new Date().toISOString() })
const json = (v: unknown) => { const s = typeof v === "string" ? v : JSON.stringify(v, null, 1); return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}\n…(cắt bớt, còn ${s.length - MAX_CHARS} ký tự; thu hẹp range/filter để đọc phần còn lại)` : s }

/** `used` = số lần công cụ CÙNG TÊN đã chạy trong lượt (tính từ nhật ký) để áp EXT_LIMITS. */
export async function execExtTool(name: string, args: Record<string, unknown>, used: number, o: { tainted?: boolean; externalTaint?: boolean; username?: string; member?: boolean } = {}): Promise<ToolLogEntry> {
  // Thành viên (không phải Creator) dùng Lark bằng TOKEN CỦA CHÍNH HỌ (đã bấm "Cho phép"): chỉ thấy tài liệu/task/Base họ có quyền xem. Creator dùng token của Creator.
  const larkCtx = { isCreator: !o.member, username: o.username }
  const cap = EXT_LIMITS[name]
  if (cap && used >= cap) return entry(name, args, false, `Đã dùng hết ${cap} lần ${name} trong lượt này`)
  try {
    if (name === WEB_NAME) {
      const q = String(args.query ?? "").trim()
      if (q.length < 3) return entry(name, args, false, "Thiếu câu tìm (query ≥ 3 ký tự)")
      const { runWebSearch } = await import("@/lib/web-search")   // nạp lười: kéo theo Supabase/Lark, không để vòng lặp Argon phải nạp khi chưa dùng
      const { result, sources } = await runWebSearch(q, { concise: true, timeoutMs: 40_000 })
      return entry(name, args, true, json(result + (sources.length ? "\n\nNguồn (BẮT BUỘC ghi URL nguồn trong câu trả lời):\n" + sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`).join("\n") : "")))
    }
    if (name === LARK_DOC_NAME) {
      const action = String(args.action ?? "")
      if (action !== "search" && action !== "read") return entry(name, args, false, 'Chỉ hỗ trợ action "search" hoặc "read" (không tạo/sửa tài liệu)')
      const docArgs = { action, query: args.query as string | undefined, url_or_token: args.url_or_token as string | undefined, range: args.range as string | undefined }
      const larkDocs = await import("@/lib/agents/creator/tools/lark-docs")
      if (o.member) {
        const { getLarkUserToken } = await import("@/lib/lark")
        const token = o.username ? await getLarkUserToken(o.username) : null
        if (!token) return entry(name, args, false, "Chưa cấp quyền Lark cho Gấu Prime. Nhờ người dùng bấm “Cho phép” ở cửa sổ xin quyền Lark (hiện khi mở Gấu Prime) rồi hỏi lại.")
        try { return entry(name, args, true, json(await larkDocs.runLarkDocsWithToken(token, docArgs))) } catch (e) { return entry(name, args, false, (e as Error).message) }
      }
      const r = await larkDocs.runLarkDocs(docArgs)
      return r.error ? entry(name, args, false, r.error) : entry(name, args, true, json(r.result))
    }
    if (name === TASK_NAME) {
      const action = String(args.action ?? "")
      const map: Record<string, string> = { lists: "listLarkTasklists", list: "listLarkTasks", get: "getLarkTask" }
      if (!map[action]) return entry(name, args, false, 'Chỉ hỗ trợ action "lists", "list" hoặc "get"')
      if (action === "get" && !String(args.task_guid ?? "").trim()) return entry(name, args, false, "get cần task_guid")
      const { runLarkTask } = await import("@/lib/agents/creator/tools/lark")
      const r = await runLarkTask(map[action], { tasklist_guid: args.tasklist_guid, task_guid: args.task_guid, page_size: Math.min(Number(args.page_size) || 20, 50) }, larkCtx)
      return r?.error ? entry(name, args, false, String(r.error)) : entry(name, args, true, json(r))
    }
    if (name === TAB_NAME || name === CONTROL_NAME || name === FILES_NAME) {
      if (!o.username) return entry(name, args, false, "Không xác định người dùng")   // Bridge luôn là máy/trình duyệt CỦA CHÍNH người hỏi (theo username), kể cả đọc tệp máy
      const m = await import("@/lib/agents/creator/tools/bridge")
      if (name === TAB_NAME) {
        const action = String(args.action ?? "")
        if (action !== "list_tabs" && action !== "snapshot") return entry(name, args, false, 'Chỉ hỗ trợ action "list_tabs" hoặc "snapshot" (ảnh chụp màn hình dùng ở Gấu Pro)')
        const r = await m.runReadMyBrowser({ action: action as "list_tabs" | "snapshot", tab_id: typeof args.tab_id === "number" ? args.tab_id : undefined }, o.username)
        return r.error ? entry(name, args, false, r.error) : entry(name, args, true, json(r.result))
      }
      if (name === CONTROL_NAME) {
        if (o.externalTaint) return entry(name, args, false, "Lượt này đã đọc nội dung từ bên ngoài (mail/thread/web/Lark) nên không điều khiển trình duyệt: có thể bị điều khiển ngầm. Anh nhờ lại ở một lượt mới chỉ dựa trên điều anh nói.")
        const r = await m.runControlMyBrowser(args as never, o.username)
        return r.error ? entry(name, args, false, r.error) : entry(name, args, true, json(r.result))
      }
      const action = String(args.action ?? "")
      if (action !== "list" && action !== "read") return entry(name, args, false, 'Chỉ hỗ trợ action "list" hoặc "read" (ghi/sửa file dùng deXuatThaoTac)')
      const r = await m.runLocalFiles({ action: action as "list" | "read", path: typeof args.path === "string" ? args.path : undefined }, o.username)
      return r.error ? entry(name, args, false, r.error) : entry(name, args, true, json(r.result))
    }
    if (name === GOOGLE_NAME) {
      const action = String(args.action ?? "")
      if (action !== "search" && action !== "read") return entry(name, args, false, 'Chỉ hỗ trợ action "search" hoặc "read" (không tạo/sửa tài liệu)')
      if (action === "read" && !String(args.file_id ?? "").trim()) return entry(name, args, false, "read cần file_id")
      if (action === "search" && !String(args.query ?? "").trim()) return entry(name, args, false, "search cần query")
      const { runGoogleWorkspace } = await import("@/lib/agents/creator/tools/google")
      const r = await runGoogleWorkspace({ action, query: args.query as string | undefined, file_id: args.file_id as string | undefined, range: args.range as string | undefined } as never)
      return r.error ? entry(name, args, false, r.error) : entry(name, args, true, json(r.result))
    }
    if (name === GA4_NAME || name === GSC_NAME) {
      if (!String(args.startDate ?? "").trim() || !String(args.endDate ?? "").trim()) return entry(name, args, false, "Thiếu startDate/endDate")
      const m = await import("@/lib/agents/creator/tools/analytics")
      const r = name === GA4_NAME ? await m.runQueryGA4(args) : await m.runQueryGSC(args)
      return r?.error ? entry(name, args, false, String(r.error)) : entry(name, args, true, json(r))
    }
    if (name === VIDEO_NAME) {
      const g = gateWrite(VIDEO_NAME, !!o.tainted)
      if (g.mode === "deny") return entry(name, args, false, g.note ?? "Không tạo video trong lượt đã đọc nội dung ngoài")
      const { runGenerateVideo } = await import("@/lib/agents/creator/tools/video")
      const r = await runGenerateVideo({ prompt: String(args.prompt ?? ""), negative_prompt: args.negative_prompt as string | undefined, aspect_ratio: args.aspect_ratio as string | undefined, quality: args.quality as string | undefined }, undefined, 45_000)
      return r.error ? entry(name, args, false, r.error) : entry(name, args, true, JSON.stringify({ markdown: r.markdown, task_id: r.task_id, instruction: r.task_id ? "Chưa dựng xong: báo anh và gọi kiemTraVideo với task_id sau 1–2 phút." : "Chép NGUYÊN trường markdown vào câu trả lời." }))
    }
    if (name === VIDEO_CHECK_NAME) {
      const { runCheckVideoStatus } = await import("@/lib/agents/creator/tools/video")
      const r = await runCheckVideoStatus({ task_id: String(args.task_id ?? "") })
      return r.error ? entry(name, args, false, r.error) : entry(name, args, true, JSON.stringify({ markdown: r.markdown }))
    }
    if (name === HISTORY_NAME) {
      const q = String(args.tuKhoa ?? "").trim().replace(/[%,()*]/g, " ").trim()
      if (q.length < 2) return entry(name, args, false, "tuKhoa tối thiểu 2 ký tự")
      if (!o.username) return entry(name, args, false, "Không xác định người dùng")
      const { searchChatHistory } = await import("./chat-history")
      return entry(name, args, true, json(await searchChatHistory(o.username, q)))
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
      const r = await runLarkBase({ app_token: args.app_token, table_id: args.table_id, filter: args.filter, page_size: args.page_size }, { ...larkCtx, gauPro: !!o.member })
      return r?.error ? entry(name, args, false, String(r.error)) : entry(name, args, true, json(r))
    }
    return entry(name, args, false, `Công cụ ${name} không thuộc nhóm ngoài`)
  } catch (e) { return entry(name, args, false, `Lỗi: ${(e as Error).message}`) }
}
