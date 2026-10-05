// GoHub Gấu Pro Bridge — background service worker.
// Poll /api/creator-ai/bridge/next định kỳ, thực thi lệnh NGAY (Auto — Hiếu chọn bỏ bước Duyệt vì
// thói quen luôn bấm Duyệt khiến bước xác nhận vô nghĩa), hiện notification KHÔNG chặn để biết Gấu Pro
// vừa làm gì, rồi POST kết quả về /api/creator-ai/bridge/result.

const TINY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const WRITE_ACTIONS = new Set(["click", "fill", "navigate"])
const POLL_INTERVAL_MS = 15000
// 1.2.0: vừa có lệnh → hỏi 1s/lần trong 60s (Gấu thường làm nhiều bước liên tiếp; 15s/lần làm mỗi bước chờ ~7-15s), rồi về 15s.
const BURST_INTERVAL_MS = 1000
const BURST_WINDOW_MS = 60000
let lastCommandAt = 0
const EXT_VERSION = chrome.runtime.getManifest().version

let pollTimer = null
let infoSent = false

// Device ID cố định cho mỗi máy/profile Chrome (sinh 1 lần) — server lưu để truy vết thiết bị khi có sự cố.
async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get("deviceId")
  if (deviceId) return deviceId
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ deviceId: id })
  return id
}

// Thông tin thiết bị gửi kèm (Chrome extension không đọc được tên máy tính). Gửi 1 lần mỗi lần worker khởi động.
async function collectDeviceInfo() {
  const plat = await chrome.runtime.getPlatformInfo().catch(() => ({}))
  const prof = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }).catch(() => ({}))
  const ua = navigator.userAgent || ""
  const m = ua.match(/Chrome\/([\d.]+)/)
  return {
    os: plat.os, arch: plat.arch, user_agent: ua, browser_version: m ? m[1] : "",
    ext_version: EXT_VERSION, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language, cpu_cores: navigator.hardwareConcurrency,
    memory_gb: navigator.deviceMemory, chrome_email: prof.email || "",
  }
}

function b64(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  let bin = ""
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

async function getConfig() {
  const { serverUrl, token, enabled } = await chrome.storage.local.get(["serverUrl", "token", "enabled"])
  return { serverUrl: (serverUrl || "").replace(/\/$/, ""), token: token || "", enabled: !!enabled }
}

async function apiFetch(path, opts = {}) {
  const { serverUrl, token } = await getConfig()
  if (!serverUrl || !token) throw new Error("Chưa cấu hình Server URL / Token trong popup")
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "X-Device-Id": await getDeviceId() }
  if (!infoSent) headers["X-Device-Info"] = b64(await collectDeviceInfo())
  const res = await fetch(`${serverUrl}${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } })
  if (res.ok) infoSent = true
  return res
}

async function readTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    // 1.2.0: kèm danh sách phần tử tương tác + selector DÙNG ĐƯỢC — trước chỉ trả innerText nên Gấu phải đoán selector
    // (QA s223: đoán id cũ của DuckDuckGo → "Không tìm thấy selector").
    func: () => {
      const q = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : v.replace(/"/g, '\\"'))
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" }
      const unique = (sel) => { try { return document.querySelectorAll(sel).length === 1 } catch { return false } }
      const selectorOf = (el) => {
        const tag = el.tagName.toLowerCase()
        if (el.id && unique(`#${q(el.id)}`)) return `#${q(el.id)}`
        for (const attr of ["name", "aria-label", "placeholder", "data-testid", "title"]) {
          const v = el.getAttribute(attr)
          if (v) { const s = `${tag}[${attr}="${v.replace(/"/g, '\\"')}"]`; if (unique(s)) return s }
        }
        const parts = []
        let cur = el
        while (cur && cur.nodeType === 1 && parts.length < 6) {
          if (cur.id && unique(`#${q(cur.id)}`)) { parts.unshift(`#${q(cur.id)}`); break }
          const t = cur.tagName.toLowerCase()
          const sib = cur.parentElement ? [...cur.parentElement.children].filter(c => c.tagName === cur.tagName) : []
          parts.unshift(sib.length > 1 ? `${t}:nth-of-type(${sib.indexOf(cur) + 1})` : t)
          cur = cur.parentElement
        }
        return parts.join(" > ")
      }
      const els = [...document.querySelectorAll('input:not([type=hidden]), textarea, select, button, a[href], [role=button], [role=textbox], [contenteditable=""], [contenteditable=true]')]
        .filter(visible)
        // Ô nhập/chọn trước, rồi nút, link sau cùng — trang nhiều link không đẩy mất ô nhập khỏi giới hạn 150.
        .map(el => [el, /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || el.getAttribute("role") === "textbox" ? 0 : el.tagName === "A" ? 2 : 1])
        .sort((a, b) => a[1] - b[1]).map(([el]) => el).slice(0, 150)
        .map(el => ({
          sel: selectorOf(el),
          tag: el.tagName.toLowerCase() + (el.type ? `:${el.type}` : ""),
          label: (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.innerText || el.value || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 60),
        }))
      return { title: document.title, url: location.href, text: document.body ? document.body.innerText : "", elements: els }
    },
  })
  return { title: result.title, url: result.url, content: (result.text || "").slice(0, 12000), elements: result.elements || [] }
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
      func: (selector, value, pressEnter) => {
        const el = document.querySelector(selector)
        if (!el) return { ok: false, error: "Không tìm thấy selector" }
        // React (Lark/Sapo web) không nhận .value gán trực tiếp — phải dùng native setter rồi
        // dispatch event 'input' để trigger đúng onChange của React.
        const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
        if (setter) setter.call(el, value); else el.value = value
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
        if (pressEnter) {
          // Nhiều ô nhập nhanh kiểu spreadsheet/quick-add chỉ COMMIT giá trị khi nhận phím Enter thật,
          // không đủ nếu chỉ có 'input'/'change'. keyCode/which không set được qua constructor options
          // (browser giữ readonly) → phải defineProperty đè lên để code cũ (check e.keyCode===13) vẫn nhận.
          for (const type of ["keydown", "keypress", "keyup"]) {
            const ev = new KeyboardEvent(type, { key: "Enter", code: "Enter", bubbles: true, cancelable: true })
            Object.defineProperty(ev, "keyCode", { get: () => 13 })
            Object.defineProperty(ev, "which", { get: () => 13 })
            el.dispatchEvent(ev)
          }
        }
        return { ok: true }
      },
      args: [payload.selector, payload.value, !!payload.press_enter],
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

function notifyAction(command) {
  // Thông báo KHÔNG chặn — chỉ để biết Gấu Pro vừa làm gì, tự biến mất, không cần bấm gì.
  chrome.notifications.create(`bridge-info-${command.id}`, {
    type: "basic",
    iconUrl: TINY_ICON,
    title: "Gấu Pro vừa thao tác",
    message: describeAction(command.action, command.payload || {}),
    requireInteraction: false,
  })
}

async function processCommand(command) {
  try {
    if (WRITE_ACTIONS.has(command.action)) notifyAction(command)
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
    if (data.command) { lastCommandAt = Date.now(); await processCommand(data.command) }
  } catch {
    // im lặng — thử lại ở lần poll kế tiếp (chưa cấu hình / mất mạng tạm thời)
  }
}

function scheduleNext() {
  if (pollTimer) clearTimeout(pollTimer)
  const delay = Date.now() - lastCommandAt < BURST_WINDOW_MS ? BURST_INTERVAL_MS : POLL_INTERVAL_MS
  pollTimer = setTimeout(async () => { await pollOnce(); scheduleNext() }, delay)
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
