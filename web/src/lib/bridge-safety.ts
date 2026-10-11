// Trang NHẠY CẢM mà Gấu Pro không được mở/điều hướng qua Bridge (ngân hàng, thanh toán, đổi mật khẩu, trình quản lý mật khẩu…).
// Extension kiểm cùng bộ quy tắc ở browser-extension/safety-rules.json (test bridge-safety.test.ts bắt buộc 2 bản trùng nhau);
// server kiểm thêm cho URL do model đưa ra (navigate/open_tab) để từ chối sớm, không phụ thuộc phiên bản extension trên máy người dùng.
export const BRIDGE_SAFETY_RULES = {
  version: 1,
  schemes: ["chrome:", "chrome-extension:", "edge:", "about:", "file:", "devtools:", "view-source:"],
  hostPatterns: [
    "(^|\\.)(vietcombank|vcbdigibank|techcombank|bidv|vietinbank|mbbank|acb|tpb|tpbank|sacombank|agribank|vpbank|hdbank|shb|ocb|msb|vib|eximbank|scb|seabank|lpbank|lienvietpostbank|namabank|abbank|bacabank|pvcombank|kienlongbank|baovietbank|timo|cake)\\.(com|vn|com\\.vn|net\\.vn)$",
    "(^|\\.)(ebanking|internetbanking|ibanking|digibank|onlinebanking|netbanking)\\.",
    "(^|\\.)(paypal|wise|payoneer|alipay|vnpay|momo|zalopay|payos)\\.(com|vn|me)$",
    "^pay\\.google\\.com$",
    "^checkout\\.stripe\\.com$",
    "^accounts\\.google\\.com$",
    "^myaccount\\.google\\.com$",
    "^(login\\.microsoftonline|login\\.live|account\\.microsoft)\\.com$",
    "^appleid\\.apple\\.com$",
    "(^|\\.)(1password|bitwarden|lastpass|dashlane|nordpass|keepersecurity)\\.com$",
  ],
  pathPatterns: [
    "(^|/)(checkout|payment|payments|thanh-toan|change-password|doi-mat-khau|reset-password|forgot-password|two-factor|2fa)(/|$)",
  ],
}

const HOST_RE = BRIDGE_SAFETY_RULES.hostPatterns.map(p => new RegExp(p, "i"))
const PATH_RE = BRIDGE_SAFETY_RULES.pathPatterns.map(p => new RegExp(p, "i"))

export const BRIDGE_BLOCK_MESSAGE =
  "Trang nhạy cảm (ngân hàng/thanh toán/đổi mật khẩu/trình quản lý mật khẩu…) — Gấu Pro không được mở hoặc thao tác. Người dùng tự làm trên trang này, hoặc tự cho phép tên miền trong popup extension."

/** true = URL thuộc nhóm bị chặn mặc định. URL không đọc được coi là chặn (an toàn hơn). */
export function isBridgeBlockedUrl(url: string | undefined | null): boolean {
  if (!url) return false
  let u: URL
  try { u = new URL(url) } catch { return true }
  if (BRIDGE_SAFETY_RULES.schemes.includes(u.protocol)) return true
  if (HOST_RE.some(re => re.test(u.hostname.toLowerCase()))) return true
  return PATH_RE.some(re => re.test(u.pathname.toLowerCase()))
}
