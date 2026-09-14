// Dark mode BI Strict Lock (s196+21, quyết định Hiếu 2026-09-14): tab BI (`/analytics/*`) hiện 0% support
// dark mode (chỉ Gấu Pro `/analytics/creator/*` có, kế thừa từ Bé Gấu/chatbot) — bật dark mode ở đây làm
// UI vỡ (card sáng cứng trên nền tối). Hiếu chọn hướng "khoá lại, chỉ light mode" thay vì mở rộng dần.
// Dùng CHUNG logic này ở root layout.tsx (inline script, chạy trước paint) và theme-toggle.tsx (React) —
// sửa 1 chỗ này, đổi cả 2.
export function isDarkModeLocked(pathname: string): boolean {
  if (pathname.startsWith("/analytics/creator")) return false
  return pathname === "/analytics" || pathname.startsWith("/analytics/")
}

// Bản JS thuần (không import được) để nhúng vào <script> inline chạy trước khi React mount — PHẢI giữ
// đúng logic y hệt hàm trên.
export const DARK_LOCK_INLINE_JS =
  `(p.startsWith('/analytics/creator')?false:(p==='/analytics'||p.startsWith('/analytics/')))`
