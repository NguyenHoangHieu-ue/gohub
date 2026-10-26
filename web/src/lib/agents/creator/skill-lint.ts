// Kiểm tra tĩnh (không gọi model) một skill tự học TRƯỚC khi Creator duyệt: bắt chỉ dẫn cố ý/vô tình phá quy tắc an toàn (bỏ qua duyệt, gửi dữ liệu ra ngoài, nhúng khoá bí mật…).
// Skill chỉ là CHỮ nạp vào prompt (không thêm tool/quyền) nhưng một skill xấu vẫn có thể dặn model bỏ qua luật hoặc làm hại dữ liệu → "block" chặn hẳn việc duyệt, "warn" nhắc người duyệt đọc kỹ.
// Thuần (có test).
export type LintLevel = "ok" | "warn" | "block"
export interface LintFinding { level: "warn" | "block"; message: string }
export interface LintResult { level: LintLevel; findings: LintFinding[] }

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase()

const BLOCK: { re: RegExp; message: string }[] = [
  { re: /(bo qua|phot lo|ignore|disregard|override|vo hieu hoa|tat|bypass|lach)\s+(moi |tat ca |all |cac )?(previous |prior |above |truoc do |truoc day )?(quy tac|luat|huong dan|instruction|rule|cong duyet|buoc duyet|xac nhan|guardrail|safety|an toan)/, message: "Dặn bỏ qua/vô hiệu hoá quy tắc, cổng duyệt hoặc an toàn" },
  { re: /(khong can|dung|khong duoc|khong bao gio)\s+(hoi|xin)\s+(duyet|phep|xac nhan|nguoi dung|hieu)/, message: "Dặn không hỏi duyệt/xác nhận người dùng" },
  { re: /(tu duyet|tu dong (duyet|dong y|approve)|tu minh (duyet|dong y)|auto[- ]?approve)/, message: "Dặn tự duyệt hành động" },
  { re: /(gui|chuyen|tai len|upload|post|exfil|leak|forward|send)\s+.{0,40}(mat khau|password|token|api[ _-]?key|secret|cookie|khoa bi mat|credential|du lieu khach|danh sach khach)/, message: "Dặn gửi mật khẩu/token/dữ liệu nhạy cảm ra ngoài" },
  { re: /\b(curl|wget|invoke-webrequest|webhook\.site|ngrok|pastebin)\b/, message: "Có lệnh/dịch vụ gửi dữ liệu ra ngoài (curl, webhook, pastebin…)" },
  { re: /(system prompt|prompt he thong|developer message|jailbreak|dan mode)/, message: "Nhắc tới system prompt/jailbreak" },
  { re: /(xoa|delete|drop|truncate)\s+(het|toan bo|tat ca|all|database|bang|table)/, message: "Dặn xoá hàng loạt dữ liệu" },
]
const SECRET_PATTERNS: { re: RegExp; message: string }[] = [
  { re: /AIza[0-9A-Za-z_-]{30,}/, message: "Có khoá API Google" },
  { re: /\bsk-[A-Za-z0-9_-]{20,}/, message: "Có khoá API dạng sk-…" },
  { re: /\bBearer\s+[A-Za-z0-9._-]{20,}/, message: "Có token Bearer" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, message: "Có khoá riêng" },
  { re: /\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, message: "Có token GitHub" },
  { re: /\b[0-9a-f]{40,}\b/i, message: "Có chuỗi hex dài (giống khoá/token)" },
]
const WARN: { re: RegExp; message: string }[] = [
  { re: /https?:\/\/[^\s)]+/, message: "Chứa đường link — kiểm tra link đáng tin" },
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/, message: "Chứa địa chỉ email — kiểm tra có phải người nhận đúng" },
  { re: /(gui tin|nhan tin|gui mail|gui email|dm cho|dang len|public)/, message: "Liên quan gửi tin/đăng bài ra ngoài — việc gửi vẫn phải qua duyệt" },
  { re: /(thanh toan|chuyen tien|payment|checkout|dat hang tu dong|mua hang)/, message: "Liên quan thanh toán/chuyển tiền" },
  { re: /(mat khau|password|dang nhap|login|otp|2fa)/, message: "Nhắc tới mật khẩu/đăng nhập — Gấu Pro không được xử lý thông tin này" },
  { re: /(ghi de|overwrite|xoa)/, message: "Có thao tác xoá/ghi đè — nên giới hạn phạm vi rõ ràng" },
]

export function lintSkill(a: { name?: unknown; description?: unknown; instructions?: unknown }): LintResult {
  const text = `${String(a.name ?? "")}\n${String(a.description ?? "")}\n${String(a.instructions ?? "")}`
  const f = fold(text)
  const findings: LintFinding[] = []
  const seen = new Set<string>()
  const add = (level: "warn" | "block", message: string) => { if (!seen.has(message)) { seen.add(message); findings.push({ level, message }) } }
  for (const b of BLOCK) if (b.re.test(f)) add("block", b.message)
  for (const s of SECRET_PATTERNS) if (s.re.test(text)) add("block", `${s.message} — không được lưu bí mật trong skill`)
  for (const w of WARN) if (w.re.test(f)) add("warn", w.message)
  const instr = String(a.instructions ?? "").trim()
  if (instr.length > 4500) add("warn", "Chỉ dẫn rất dài (>4500 ký tự) — khó kiểm soát, nên tách thành skill nhỏ")
  if (!/\n|\d\.|•|-\s/.test(instr)) add("warn", "Chỉ dẫn không chia bước/gạch đầu dòng — dễ bị hiểu sai")
  return { level: findings.some(x => x.level === "block") ? "block" : findings.length ? "warn" : "ok", findings }
}
