// GoHub Gấu Pro Bridge — background service worker.
// Poll /api/creator-ai/bridge/next định kỳ, thực thi lệnh (đọc ngay; click/fill/navigate xin Duyệt qua
// chrome.notifications trước), POST kết quả về /api/creator-ai/bridge/result.

const TINY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const WRITE_ACTIONS = new Set(["click", "fill", "navigate"])
const POLL_INTERVAL_MS = 15000
const CONFIRM_TIMEOUT_MS = 30000

let pollTimer = null
const pendingConfirms = new Map()

async function getConfig() {
  const { serverUrl, token, enabled } = await chrome.storage.local.get(["serverUrl", "token", "enabled"])
  return { serverUrl: (serverUrl || "").replace(/\/$/, ""), token: token || "", enabled: !!enabled }
}

async function apiFetch(path, opts = {}) {
  const { serverUrl, token } = await getConfig()
  if (!serverUrl || !token) throw new Error("Chưa cấu hình Server URL / Token trong popup")
  return fetch(`${serverUrl}${path}`, {
    ...opts,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  })
}

async function readTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({ title: document.title, text: document.body ? document.body.innerText : "" }),
  })
  return { title: result.title, content: (result.text || "").slice(0, 15000) }
}

async function execAction(action, payload) {
  if (action === "list_tabs") {
    const tabs = await chrome.tabs.query({})
    return tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }))
  }

  if (action === "read_tab") {
    let tabId = payload.tab_id
    if (!tabId) {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!active) throw new Error("Không tìm thấy tab đang active")
      tabId = active.id
    }
    return await readTab(tabId)
  }

  if (action === "scroll") {
    await chrome.scripting.executeScript({
      target: { tabId: payload.tab_id },
      func: () => window.scrollBy(0, window.innerHeight),
    })
    return { ok: true }
  }

  if (action === "click") {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: payload.tab_id },
      func: (selector) => {
        const el = document.querySelector(selector)
        if (!el) return { ok: false, error: "Không tìm thấy selector" }
        el.click()
        return { ok: true }
      },
      args: [payload.selector],
    })
    if (!result.ok) throw new Error(result.error)
    return { ok: true }
  }

  if (action === "fill") {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: payload.tab_id },
      func: (selector, value) => {
        const el = document.querySelector(selector)
        if (!el) return { ok: false, error: "Không tìm thấy selector" }
        // React (Lark/Sapo web) không nhận .value gán trực tiếp — phải dùng native setter rồi
        // dispatch event 'input' để trigger đúng onChange của React.
        const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
        if (setter) setter.call(el, value); else el.value = value
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
        return { ok: true }
      },
      args: [payload.selector, payload.value],
    })
    if (!result.ok) throw new Error(result.error)
    return { ok: true }
  }

  if (action === "navigate") {
    await chrome.tabs.update(payload.tab_id, { url: payload.url })
    return { ok: true }
  }

  throw new Error(`Action không hỗ trợ: ${action}`)
}

function describeAction(action, payload) {
  if (action === "click") return `Click "${payload.selector}"`
  if (action === "fill") return `Điền "${payload.value}" vào "${payload.selector}"`
  if (action === "navigate") return `Điều hướng tới ${payload.url}`
  return action
}

function askConfirm(command) {
  return new Promise((resolve) => {
    const notifId = `bridge-confirm-${command.id}`
    pendingConfirms.set(notifId, resolve)
    chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: TINY_ICON,
      title: "Gấu Pro xin phép thao tác",
      message: describeAction(command.action, command.payload || {}),
      buttons: [{ title: "Duyệt" }, { title: "Từ chối" }],
      requireInteraction: true,
    })
    setTimeout(() => {
      if (pendingConfirms.has(notifId)) {
        pendingConfirms.delete(notifId)
        chrome.notifications.clear(notifId)
        resolve(false)
      }
    }, CONFIRM_TIMEOUT_MS)
  })
}

chrome.notifications.onButtonClicked.addListener((notifId, buttonIndex) => {
  const resolve = pendingConfirms.get(notifId)
  if (!resolve) return
  pendingConfirms.delete(notifId)
  chrome.notifications.clear(notifId)
  resolve(buttonIndex === 0)
})

async function processCommand(command) {
  try {
    if (WRITE_ACTIONS.has(command.action)) {
      const approved = await askConfirm(command)
      if (!approved) {
        await apiFetch("/api/creator-ai/bridge/result", {
          method: "POST",
          body: JSON.stringify({ id: command.id, error: "Hiếu từ chối hoặc không phản hồi kịp." }),
        })
        return
      }
    }
    const result = await execAction(command.action, command.payload || {})
    await apiFetch("/api/creator-ai/bridge/result", { method: "POST", body: JSON.stringify({ id: command.id, result }) })
  } catch (e) {
    await apiFetch("/api/creator-ai/bridge/result", {
      method: "POST",
      body: JSON.stringify({ id: command.id, error: String(e?.message || e) }),
    }).catch(() => {})
  }
}

async function pollOnce() {
  const { enabled } = await getConfig()
  if (!enabled) return
  try {
    const res = await apiFetch("/api/creator-ai/bridge/next")
    if (!res.ok) return
    const data = await res.json()
    if (data.command) await processCommand(data.command)
  } catch {
    // im lặng — thử lại ở lần poll kế tiếp (chưa cấu hình / mất mạng tạm thời)
  }
}

function scheduleNext() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(async () => { await pollOnce(); scheduleNext() }, POLL_INTERVAL_MS)
}

// setTimeout đệ quy ~15s giữ service worker "sống" — mỗi fetch tính là hoạt động nên Chrome không
// suspend worker ở ngưỡng idle mặc định (~30s). Tránh phụ thuộc chrome.alarms làm vòng lặp chính (Chrome
// ép tối thiểu 1 phút/lần cho alarm định kỳ → latency quá chậm cho việc này).
chrome.runtime.onStartup.addListener(scheduleNext)
chrome.runtime.onInstalled.addListener(scheduleNext)
scheduleNext()

// Lưới an toàn: nếu worker lỡ bị Chrome kill (máy ngủ lâu, v.v.), alarm 1 phút khởi động lại vòng lặp.
chrome.alarms.create("bridge-heartbeat", { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "bridge-heartbeat") scheduleNext()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) scheduleNext()
})
