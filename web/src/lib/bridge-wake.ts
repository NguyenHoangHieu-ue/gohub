// Báo cho extension Bridge (content.js trên chính trang này) "Gấu Pro vừa gọi tool browser" → extension poll NGAY thay vì chờ tới 15s.
// Không có extension thì postMessage không ai nghe — vô hại. Chỉ gửi trong CÙNG origin.
export function wakeBridge(): void {
  if (typeof window === "undefined") return
  try { window.postMessage({ source: "gau-web", type: "bridge-wake" }, window.location.origin) } catch { /* bỏ qua */ }
}

/** Dòng status của Gấu Pro nhắc tới browser của người dùng → đánh thức extension. */
export function wakeBridgeIfBrowserStatus(text: string | undefined): void {
  if (text && /browser của bạn/i.test(text)) wakeBridge()
}
