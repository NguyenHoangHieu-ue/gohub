// Chạy trên các trang GoHub Intel (xem content_scripts.matches trong manifest). Chỉ nhận message từ chính trang (e.source === window) với nhãn riêng; không đọc/ghi gì khác trên trang.
//  - bridge-wake : trang báo Gấu vừa gọi tool browser → extension poll NGAY (thay vì chờ tới 15s).
//  - bridge-ping : trả bản, và đã ghép nối chưa (paired) + 6 ký tự cuối token (tokenTail) để trang biết cần ghép lại hay không.
//  - bridge-pair : (1.4.0) TỰ GHÉP NỐI — trang (đã đăng nhập) gửi token của chính người dùng, extension lưu cùng địa chỉ máy chủ = origin của trang. Khỏi mở popup, khỏi dán token.
const TOKEN_RE = /^[a-f0-9]{48}$/   // randomBytes(24).toString("hex") ở /api/creator-ai/bridge/token

window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== window.location.origin) return
  const d = e.data
  if (!d || d.source !== "gau-web") return
  if (d.type === "bridge-wake") {
    try { chrome.runtime.sendMessage({ type: "wake" }).catch(() => {}) } catch { /* extension vừa reload */ }
  } else if (d.type === "bridge-ping") {
    chrome.storage.local.get(["serverUrl", "token", "enabled"], (cfg) => {
      const paired = !!cfg.token && (cfg.serverUrl || "").replace(/\/$/, "") === window.location.origin
      window.postMessage({ source: "gau-ext", type: "bridge-pong", version: chrome.runtime.getManifest().version, paired, enabled: !!cfg.enabled, tokenTail: paired ? String(cfg.token).slice(-6) : null }, window.location.origin)
    })
  } else if (d.type === "bridge-pair") {
    if (typeof d.token !== "string" || !TOKEN_RE.test(d.token)) return
    chrome.storage.local.set({ serverUrl: window.location.origin, token: d.token, enabled: true }, () => {
      try { chrome.runtime.sendMessage({ type: "wake" }).catch(() => {}) } catch { /* bỏ qua */ }
      window.postMessage({ source: "gau-ext", type: "bridge-paired", version: chrome.runtime.getManifest().version }, window.location.origin)
    })
  }
})
