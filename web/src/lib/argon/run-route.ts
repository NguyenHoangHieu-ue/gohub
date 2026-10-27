import { fold } from "./facts-pure"

// Router của một lượt hỏi Argon (ARGON-X, P1): quyết định đi ĐƯỜNG NHANH (tra cứu trong Kho, vài giây) hay ĐƯỜNG ĐẦY ĐỦ (số liệu, phân tích, nhiều bước).
// Thuần, không gọi model (0 ms, giải thích được, có test). Mặc định ĐẦY ĐỦ: chỉ đi nhanh khi câu ngắn, rõ ràng là tra cứu và KHÔNG có dấu hiệu cần số liệu/tính toán,
// nên không bao giờ làm kém đi một câu vốn cần phân tích. Hỏi sai nhanh thì anh bấm "Sâu" hoặc hỏi lại kèm "phân tích".
export type RunRoute = "fast" | "full"
export interface RunRouteDecision { route: RunRoute; reason: string }

export const FAST_MAX_CHARS = 180
export const MAX_FAST_TOOL_CALLS = 5
/** Công cụ được dùng ở đường nhanh: chỉ ĐỌC Kho/sổ/mail/file workspace. Không sql, run_code, số liệu hệ thống, ghi, hỏi, đề xuất sửa code. */
export const FAST_TOOL_NAMES: readonly string[] = ["lietKeNguon", "timTrongNguon", "docNguon", "traSuViec", "traMail", "traThucThe", "lietKeFile", "docFile"]

// Dấu hiệu cần SỐ LIỆU / TÍNH TOÁN / SUY LUẬN NHIỀU BƯỚC (đã bỏ dấu, có khoảng trắng hai đầu để khớp theo từ).
const FULL_HINTS = [
  "so sanh", "phan tich", "doanh thu", "loi nhuan", "margin", " cm1 ", " gp ", "ty le", "ty trong", "%", " top ", "xu huong", "tang truong", "giam bao nhieu", "tang bao nhieu",
  " kpi ", " quy ", " thang ", " tuan ", "ban duoc", "san luong", "don hang", "bao cao", "report", "bieu do", "chart", "excel", "xlsx", "bang tinh", "du bao", "du doan",
  "tai sao", "vi sao", "nguyen nhan", " tinh ", " tong ", "trung binh", " sql ", "truy van", "toi uu", "danh gia", "kiem tra so", "doi chieu", "soat ", "ke hoach", "de xuat",
  " viet ", " soan ", " tao ", "lam report", "lam bao cao",
  // cần công cụ ngoài Kho (ext-tools.ts): tìm web, đọc Lark Doc/Sheet/Base — đường nhanh không có
  // nhờ làm việc ra ngoài (deXuatThaoTac, act-tool.ts): đường nhanh không có công cụ đề xuất
  "gui tin", "nhan tin", "nhan cho", "tao task", "giao viec", "nhac toi", "nhac em", "dat lich", "len lich", "hen gio", "gui mail", "tao phieu", "tao doc", "tao sheet", "gui cho", " dm ",
  "portal", "mo trang", "doc trang", "xem trang", "tao anh", "ve anh", "banner", "thumbnail", "hinh anh",
  "supabase", " sku", "catalog", "bang gia", "ncc ", "wiki",
  "tren web", "tren mang", "internet", "google", "lark base", "bitable", "larksuite", "feishu", "http", " base ", "lark doc", "lark sheet",
  // ý định GHI/sửa (đường nhanh KHÔNG có công cụ ghi): phát hiện từ eval D3 — "Ghi vào sổ sự việc…" từng bị coi là tra cứu vì có chữ "sự việc"
  " ghi ", "ghi vao", " luu ", "cap nhat", " sua ", " xoa ", " bo di ", " nho ", "nho giup", "chuyen vao", "doi ten", "gan nhan",
]
// Dấu hiệu TRA CỨU thuần trong Kho (sự việc, mail, hạn, người, nơi).
const LOOKUP_HINTS = [
  "mail nao", "dang cho toi", "cho toi tra loi", "cho doi tac", "sap toi han", "sap het han", "het han", "han chot", "su viec", "hom nay co gi", "can quyet", "viec can duyet",
  " ai la ", " la ai ", " la gi ", " o dau ", "khi nao", "bao gio", "lien he", "phu trach", "thread nao", "luong thu", "vendor nao", "ngung ban", "doi gia", "moi nhat", "gan day", "co nhac gi", "nguon nao", "trong kho",
]

export function routeRun(prompt: string, o: { deep?: boolean; resume?: boolean; thinking?: string; mission?: boolean } = {}): RunRouteDecision {
  const p = prompt.trim()
  if (o.mission === false) return { route: "full", reason: "không phải sứ mệnh Kho" }
  if (o.resume) return { route: "full", reason: "tiếp tục lượt cũ" }
  if (o.deep) return { route: "full", reason: "đã chọn Sâu" }
  if (o.thinking === "high") return { route: "full", reason: "đã chọn suy luận cao" }
  if (p.length > FAST_MAX_CHARS || /\n/.test(p)) return { route: "full", reason: "câu dài, nhiều ý" }
  if (/^[🌙🔧]/u.test(p)) return { route: "full", reason: "việc tự động" }
  const t = ` ${fold(p)} `
  const full = FULL_HINTS.find(k => t.includes(k))
  if (full) return { route: "full", reason: `cần phân tích/số liệu ("${full.trim()}")` }
  const look = LOOKUP_HINTS.find(k => t.includes(k))
  if (look) return { route: "fast", reason: `tra cứu trong Kho ("${look.trim()}")` }
  return { route: "full", reason: "chưa rõ là tra cứu — chạy đầy đủ cho chắc" }
}
