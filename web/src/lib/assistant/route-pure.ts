// Ô "Hỏi / Tìm" của Trợ lý: gợi ý câu hỏi nên đi qua chế độ nào. Phần THUẦN (luật từ khoá, không gọi model — rẻ, tức thì, có thể giải thích được).
//  - "argon":   đọc hiểu/tham mưu trên Kho (tài liệu, thread, mail, sổ sự việc), số liệu hệ thống, so sánh, tổng hợp — CHỈ ĐỌC.
//  - "gau_pro": thao tác — tạo/sửa việc Lark, gửi tin, đặt lịch/nhắc, duyệt web/portal, ghi nhớ, phiếu sửa code, file trên máy/Drive.
// Gợi ý, không ép: người dùng luôn bấm đổi được. Câu vừa hỏi vừa nhờ làm (có động từ thao tác) ưu tiên Gấu Pro vì Argon không có công cụ thao tác.
import { fold } from "@/lib/argon/facts-pure"

export type AssistantMode = "argon" | "gau_pro"
export interface RouteDecision { mode: AssistantMode; reason: string; confidence: "high" | "low" }

// Cụm từ (đã bỏ dấu, chữ thường) cho thấy cần THAO TÁC.
const ACTION = [
  "tao task", "tao viec", "giao viec", "nhac toi", "nhac em", "nhac anh", "dat lich", "hen gio", "len lich",
  "gui tin", "nhan tin", "nhan cho", "gui mail", "tra loi mail", "soan mail", "dm cho", "gui cho",
  "mo trang", "vao portal", "dang nhap", "duyet web", "tren trinh duyet", "bam nut", "dien form", "tai file", "tai ve",
  "ghi nho", "nho giup", "luu vao kb", "cap nhat kb", "xoa ", "sua code", "tao phieu", "mo pr", "deploy",
  "tao file", "tao doc", "tao bao cao tren lark", "tao sheet", "xuat ra lark", "len google", "drive cua anh", "file tren may",
]
// Cụm từ cho thấy HỎI/TÌM trong Kho + số liệu.
const KNOWLEDGE = [
  "gia ", "bao gia", "vendor", "nha cung cap", "han chot", "het han", "khuyen mai", "ngung ban", "doi gia", "thi truong", "san pham",
  "thread", "mail nao", "luong thu", "ai noi", "ai gui", "o dau", "nam o dau", "tai lieu", "hop dong", "so sanh", "tong hop", "doanh thu",
  "bao nhieu", "tai sao", "vi sao", "ke hoach", "muc tieu", "tac dong", "rui ro", "de xuat", "tom tat", "co gi moi", "thay doi",
]

// ───────── Làn (Gấu Prime, ARGON-X mục 15.1): chia câu theo MỤC ĐÍCH rồi gợi ý mức model. Cũng luật từ khoá, không gọi model.
// `here` = làn này Gấu Prime làm được; `approval` = làm qua thẻ duyệt (Argon chỉ đề xuất — Đợt 2). Làn trình duyệt vẫn qua Gấu Pro cho tới Đợt 3 của lộ trình hợp nhất.
export type Lane = "hoi_kho" | "so_lieu" | "soan_tao" | "hanh_dong" | "trinh_duyet"
export interface LaneDecision { lane: Lane; n: number; label: string; tier: "fast" | "deep"; here: boolean; approval: boolean; reason: string; confidence: "high" | "low" }
const LANE_LABEL: Record<Lane, { n: number; label: string }> = {
  hoi_kho: { n: 1, label: "Hỏi Kho" }, so_lieu: { n: 2, label: "Phân tích số liệu" }, soan_tao: { n: 3, label: "Soạn và tạo" },
  hanh_dong: { n: 4, label: "Hành động" }, trinh_duyet: { n: 5, label: "Trình duyệt" },
}
const BROWSER = ["mo trang", "vao portal", "portal ", "dang nhap", "duyet web", "tren trinh duyet", "bam nut", "dien form", "tai file", "tai ve", "file tren may", "o dia may"]
const CREATE = [
  "viet bao cao", "lam bao cao", "tao bao cao", "bao cao html", "lam slide", "tao slide", "lam powerpoint", "soan bai", "soan van ban", "viet bai", "viet email", "viet thu",
  "xuat excel", "xuat docx", "xuat file", "xuat pdf", "ve hinh", "tao hinh", "tao anh", "tao video", "ve bieu do", "lam bieu do",
]
const NUMBERS = [
  "doanh thu", "cm1", "gp ", "loi nhuan", "target", "tang truong", "so voi thang", "so voi quy", "theo kenh", "theo thang", "theo quy", "top khach", "kenh nao",
  "ty le", "bao nhieu don", "so don", "khach nao", "nhan vien nao", "pic nao", "% ",
]
const DEEP = ["phan tich", "so sanh", "tai sao", "vi sao", "du bao", "de xuat", "danh gia", "chien luoc", "tong hop", "nguyen nhan", "uu tien"]

/** Phân loại làn + mức model gợi ý (Nhanh/Sâu). Ưu tiên: trình duyệt > hành động > soạn/tạo > số liệu > hỏi Kho. Câu dài hoặc cần phân tích/so sánh → Sâu. */
export function routeLane(text: string): LaneDecision {
  const t = ` ${fold(text)} `
  const mk = (lane: Lane, reason: string, confidence: "high" | "low", here: boolean): LaneDecision => {
    const deep = lane === "soan_tao" || has(t, DEEP).length > 0 || text.length > 280
    return { lane, ...LANE_LABEL[lane], tier: here && deep ? "deep" : "fast", here, approval: lane === "hanh_dong", reason, confidence }
  }
  const br = has(t, BROWSER)
  if (br.length) return mk("trinh_duyet", `Cần thao tác trên trình duyệt ("${br[0].trim()}") — hiện qua Gấu Pro`, "high", false)
  const act = has(t, ACTION)
  if (act.length) return mk("hanh_dong", `Cần thao tác ("${act[0].trim()}") — Argon tạo đề xuất, anh duyệt ở Việc cần duyệt`, has(t, KNOWLEDGE).length ? "low" : "high", true)
  const cr = has(t, CREATE)
  if (cr.length) return mk("soan_tao", `Soạn/tạo nội dung ("${cr[0].trim()}")`, "high", true)
  const nu = has(t, NUMBERS)
  if (nu.length) return mk("so_lieu", `Số liệu hệ thống ("${nu[0].trim()}")`, "high", true)
  const kn = has(t, KNOWLEDGE)
  if (kn.length) return mk("hoi_kho", `Hỏi về Kho ("${kn[0].trim()}")`, "high", true)
  return mk("hoi_kho", "Mặc định: hỏi Kho (chỉ đọc)", "low", true)
}

const words = (q: string) => fold(q).split(" ").filter(w => w.length >= 2)
/** Khớp nếu MỌI từ của câu tìm đều nằm trong văn bản (đã bỏ dấu, không phân biệt hoa thường). */
export const matchesAll = (q: string, text: string) => { const w = words(q), h = fold(text); return w.length > 0 && w.every(x => h.includes(x)) }

const has = (hay: string, list: string[]) => list.filter(k => hay.includes(k))

export function routeQuestion(text: string): RouteDecision {
  const t = ` ${fold(text)} `
  const act = has(t, ACTION), know = has(t, KNOWLEDGE)
  if (act.length && !know.length) return { mode: "gau_pro", reason: `Cần thao tác ("${act[0].trim()}") — Gấu Pro làm được, Argon chỉ đọc`, confidence: "high" }
  if (act.length && know.length) return { mode: "gau_pro", reason: `Vừa hỏi vừa nhờ làm ("${act[0].trim()}") — dùng Gấu Pro; muốn chỉ hỏi thì chọn Argon`, confidence: "low" }
  if (know.length) return { mode: "argon", reason: `Hỏi về Kho/số liệu ("${know[0].trim()}") — Argon đọc Kho và sổ sự việc`, confidence: "high" }
  return { mode: "argon", reason: "Mặc định: Argon (chỉ đọc, an toàn); cần thao tác thì chọn Gấu Pro", confidence: "low" }
}
