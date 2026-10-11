// Chạy trên các trang GoHub Intel: trang web báo "wake" khi Gấu Pro vừa gọi tool browser → extension poll NGAY (thay vì chờ tới 15s).
// Chỉ nhận message từ chính trang (e.source === window) với nhãn riêng; không đọc/ghi gì khác trên trang.
window.addEventListener("message", (e) => {
  if (e.source !== window) return
  const d = e.data
  if (!d || d.source !== "gau-web") return
  if (d.type === "bridge-wake") {
    try { chrome.runtime.sendMessage({ type: "wake" }).catch(() => {}) } catch { /* extension vừa reload */ }
  } else if (d.type === "bridge-ping") {
    window.postMessage({ source: "gau-ext", type: "bridge-pong", version: chrome.runtime.getManifest().version }, window.location.origin)
  }
})
