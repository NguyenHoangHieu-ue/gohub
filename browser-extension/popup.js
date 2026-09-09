const $serverUrl = document.getElementById("serverUrl")
const $token = document.getElementById("token")
const $enabled = document.getElementById("enabled")
const $save = document.getElementById("save")
const $statusText = document.getElementById("statusText")

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
