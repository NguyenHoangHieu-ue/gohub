const $serverUrl = document.getElementById("serverUrl")
const $token = document.getElementById("token")
const $enabled = document.getElementById("enabled")
const $save = document.getElementById("save")
const $statusText = document.getElementById("statusText")

// 1.2.2: báo bản mới (server trả latest_version qua bridge/next, background lưu vào storage).
const newer = (a, b) => {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number)
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) }
  return false
}
const current = chrome.runtime.getManifest().version
document.getElementById("ver").textContent = "v" + current
chrome.storage.local.get(["latestVersion", "serverUrl"], (cfg) => {
  if (!cfg.latestVersion || !newer(cfg.latestVersion, current)) return
  const box = document.getElementById("update")
  const base = (cfg.serverUrl || "").replace(/\/$/, "")
  box.innerHTML = `⬆️ Có bản mới <b>${cfg.latestVersion}</b> (đang dùng ${current}).<br>` +
    (base ? `<a href="${base}/downloads/gau-pro-bridge.zip" target="_blank">Tải bản mới</a> → giải nén ĐÈ lên thư mục extension hiện tại → ` : "Tải bản mới ở trang Bridge → giải nén đè → ") +
    `vào chrome://extensions bấm ↻.`
  box.style.display = "block"
})

function renderStatus() {
  $statusText.textContent = $enabled.checked ? "Đang bật" : "Đang tắt"
  $statusText.className = "status " + ($enabled.checked ? "on" : "off")
}

chrome.storage.local.get(["serverUrl", "token", "enabled"], (cfg) => {
  $serverUrl.value = cfg.serverUrl || ""
  $token.value = cfg.token || ""
  $enabled.checked = !!cfg.enabled
  renderStatus()
})

$enabled.addEventListener("change", renderStatus)

$save.addEventListener("click", () => {
  chrome.storage.local.set({
    serverUrl: $serverUrl.value.trim(),
    token: $token.value.trim(),
    enabled: $enabled.checked,
  }, () => {
    $save.textContent = "Đã lưu ✓"
    setTimeout(() => { $save.textContent = "Lưu" }, 1500)
  })
})
