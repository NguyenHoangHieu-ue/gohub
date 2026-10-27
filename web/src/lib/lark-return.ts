// Quay lại đúng trang sau khi cấp quyền Lark (OAuth). Chỉ nhận đường dẫn TƯƠNG ĐỐI trong app — chặn open redirect. Thuần.
export function safeReturnPath(p: string | null | undefined): string | null {
  if (!p) return null
  const v = p.trim()
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\r\n]/.test(v) || v.length > 200) return null
  if (/^\/(api|_next)\//.test(v)) return null
  return v
}

/** URL đích sau OAuth: `back` (nếu hợp lệ) hoặc trang Gấu Pro như trước, kèm ?lark=<kết quả> (giữ query sẵn có). */
export function returnUrl(base: string, back: string | null, status: string): string {
  const path = back ?? "/analytics/creator/ai"
  return `${base}${path}${path.includes("?") ? "&" : "?"}lark=${status}`
}
