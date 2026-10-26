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
