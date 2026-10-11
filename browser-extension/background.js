// GoHub Gấu Pro Bridge 1.3.0 — background service worker.
// Poll /api/creator-ai/bridge/next định kỳ, thực thi lệnh NGAY (Auto — Hiếu chọn bỏ bước Duyệt), hiện notification + khung viền
// trên trang kèm nút DỪNG, rồi POST kết quả về /api/creator-ai/bridge/result.
// 1.3.0 (plan docs/plans/browser-upgrade.md): click/gõ/phím TIN CẬY qua chrome.debugger (CDP), snapshot có mã tham chiếu (ref) xuyên
// shadow DOM + iframe cùng origin, chụp ảnh, chờ, quản lý tab (nhóm "Gấu Pro"), chặn trang nhạy cảm, "wake" từ trang web.

const TINY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const WRITE_ACTIONS = new Set(["click", "fill", "key", "select", "navigate", "open_tab", "close_tab"])
const POLL_INTERVAL_MS = 15000
// Vừa có lệnh (hoặc trang web báo wake) → hỏi 1s/lần trong 60s, rồi về 15s.
const BURST_INTERVAL_MS = 1000
const BURST_WINDOW_MS = 60000
const DEBUGGER_IDLE_MS = 30000
const BLOCK_MSG = "Trang nhạy cảm (ngân hàng/thanh toán/đổi mật khẩu/trình quản lý mật khẩu…) — Gấu Pro KHÔNG được đọc hoặc thao tác. Người dùng có thể cho phép trang này trong popup extension."
let lastCommandAt = 0
const EXT_VERSION = chrome.runtime.getManifest().version

let pollTimer = null
let infoSent = false
let polling = false

// ─── Cấu hình, thiết bị, API ────────────────────────────────────────────────────────────────────────────────────────

async function getDeviceId() {
  const { deviceId } = await chrome.storage.local.get("deviceId")
  if (deviceId) return deviceId
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ deviceId: id })
  return id
}

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

// ─── An toàn: chặn trang nhạy cảm (quy tắc ở safety-rules.json, trùng bản trên server) ─────────────────────────────────

let rulesCache = null
async function loadRules() {
  if (rulesCache) return rulesCache
  try { rulesCache = await (await fetch(chrome.runtime.getURL("safety-rules.json"))).json() }
  catch { rulesCache = { schemes: ["chrome:", "chrome-extension:", "file:"], hostPatterns: [], pathPatterns: [] } }
  rulesCache._host = (rulesCache.hostPatterns || []).map(p => new RegExp(p, "i"))
  rulesCache._path = (rulesCache.pathPatterns || []).map(p => new RegExp(p, "i"))
  return rulesCache
}
const splitList = (s) => String(s || "").split(/[\s,;]+/).map(x => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean)
const hostMatches = (host, d) => host === d || host.endsWith("." + d)

async function isBlocked(url) {
  if (!url) return false
  const rules = await loadRules()
  let u
  try { u = new URL(url) } catch { return true }
  if ((rules.schemes || []).includes(u.protocol)) return true
  const host = u.hostname.toLowerCase()
  const { allowDomains, blockDomains } = await chrome.storage.local.get(["allowDomains", "blockDomains"])
  if (splitList(allowDomains).some(d => hostMatches(host, d))) return false
  if (splitList(blockDomains).some(d => hostMatches(host, d))) return true
  if (rules._host.some(re => re.test(host))) return true
  if (rules._path.some(re => re.test(u.pathname.toLowerCase()))) return true
  return false
}

async function tabFor(tabId) {
  if (!tabId) throw new Error("Thiếu tab_id — gọi list_tabs trước.")
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab) throw new Error(`Không còn tab ${tabId} (đã đóng?) — gọi list_tabs lại.`)
  if (await isBlocked(tab.url)) throw new Error(BLOCK_MSG)
  return tab
}

// ─── chrome.debugger (CDP): chỉ gắn khi cần, tự tháo sau DEBUGGER_IDLE_MS để dải "đang gỡ lỗi" không treo mãi ──────────────

const attached = new Map()   // tabId → timer
const attaching = new Map()  // tabId → Promise (tránh 2 lệnh song song cùng gắn)
async function attachOnce(tabId) {
  try { await chrome.debugger.attach({ tabId }, "1.3") }
  catch (e) {
    // Service worker vừa khởi động lại: debugger CỦA MÌNH vẫn gắn từ trước nhưng bộ nhớ đã mất → tháo rồi gắn lại.
    // Nếu là DevTools/extension khác đang gắn thì detach không làm gì và lần attach sau ném lỗi thật → caller dùng cách dự phòng.
    try { await chrome.debugger.detach({ tabId }) } catch { /* không phải của mình */ }
    await chrome.debugger.attach({ tabId }, "1.3")
  }
  attached.set(tabId, null)
}
async function ensureDebugger(tabId) {
  if (!attached.has(tabId)) {
    if (!attaching.has(tabId)) attaching.set(tabId, attachOnce(tabId).finally(() => attaching.delete(tabId)))
    await attaching.get(tabId)
  }
  clearTimeout(attached.get(tabId))
  attached.set(tabId, setTimeout(() => detachDebugger(tabId), DEBUGGER_IDLE_MS))
  await chrome.storage.session.set({ [`dbg:${tabId}`]: Date.now() }).catch(() => {})
}
async function detachDebugger(tabId) {
  clearTimeout(attached.get(tabId))
  attached.delete(tabId)
  await chrome.storage.session.remove(`dbg:${tabId}`).catch(() => {})
  try { await chrome.debugger.detach({ tabId }) } catch { /* đã tháo */ }
}
chrome.debugger.onDetach.addListener((src) => {
  if (src.tabId != null) { clearTimeout(attached.get(src.tabId)); attached.delete(src.tabId) }
})
async function cdp(tabId, method, params = {}) {
  await ensureDebugger(tabId)
  return chrome.debugger.sendCommand({ tabId }, method, params)
}
// Lưới an toàn: service worker bị Chrome tắt giữa chừng thì timer mất → tháo các tab đã gắn quá hạn.
async function sweepDebuggers() {
  const all = await chrome.storage.session.get(null).catch(() => ({}))
  for (const [k, ts] of Object.entries(all)) {
    if (!k.startsWith("dbg:")) continue
    if (Date.now() - ts > DEBUGGER_IDLE_MS + 10000) {
      const tabId = Number(k.slice(4))
      try { await chrome.debugger.detach({ tabId }) } catch { /* đã tháo */ }
      await chrome.storage.session.remove(k).catch(() => {})
    }
  }
}

// ─── Hàm chạy TRONG trang (được serialize qua chrome.scripting) — phải tự đủ, không dùng biến ngoài ───────────────────────

function pageOp(op, a) {
  a = a || {}
  const INTERACTIVE = 'a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=textbox], [role=searchbox], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=option], [role=switch], [role=combobox], [role=treeitem], [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"]), [onclick]'
  if (!window.__gauRefs) { window.__gauRefs = new Map(); window.__gauRefOf = new WeakMap(); window.__gauRefN = 0 }

  // Mọi "root" cần tìm: document + iframe cùng origin (≤4 tầng) + shadow root mở. Giới hạn số phần tử quét để trang khổng lồ không treo.
  const frames = []
  const roots = []
  const crossFrames = []
  let scanned = 0
  const addRoot = (root, doc, depth) => {
    roots.push({ root, doc })
    const all = root.querySelectorAll ? root.querySelectorAll("*") : []
    for (const el of all) {
      if (++scanned > 20000) return
      if (el.shadowRoot) addRoot(el.shadowRoot, doc, depth)
      if ((el.tagName === "IFRAME" || el.tagName === "FRAME") && depth < 4) {
        let cd = null
        try { cd = el.contentDocument } catch { /* khác origin */ }
        if (cd && cd.documentElement) { frames.push(cd); addRoot(cd, cd, depth + 1) }
        else { const r = el.getBoundingClientRect(); crossFrames.push({ src: (el.src || "").slice(0, 120), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }) }
      }
    }
  }
  addRoot(document, document, 0)

  const frameOffset = (doc) => {
    let ox = 0, oy = 0, d = doc
    for (let i = 0; i < 6; i++) {
      const fe = d.defaultView && d.defaultView.frameElement
      if (!fe) break
      const r = fe.getBoundingClientRect(); ox += r.left; oy += r.top; d = fe.ownerDocument
    }
    return { ox, oy }
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    const s = (el.ownerDocument.defaultView || window).getComputedStyle(el)
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) !== 0
  }
  const refFor = (el) => {
    let ref = window.__gauRefOf.get(el)
    if (!ref) { ref = "e" + (++window.__gauRefN); window.__gauRefOf.set(el, ref); window.__gauRefs.set(ref, new WeakRef(el)) }
    return ref
  }
  const uniqueSel = (el, doc) => {
    const q = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : v.replace(/"/g, '\\"'))
    const unique = (s) => { try { return doc.querySelectorAll(s).length === 1 } catch { return false } }
    const tag = el.tagName.toLowerCase()
    if (el.id && unique(`#${q(el.id)}`)) return `#${q(el.id)}`
    for (const attr of ["name", "aria-label", "placeholder", "data-testid", "title"]) {
      const v = el.getAttribute(attr)
      if (v) { const s = `${tag}[${attr}="${v.replace(/"/g, '\\"')}"]`; if (unique(s)) return s }
    }
    return ""
  }
  const roleOf = (el) => {
    const r = el.getAttribute("role"); if (r) return r
    const t = el.tagName.toLowerCase()
    if (t === "a") return "link"
    if (t === "button" || t === "summary") return "button"
    if (t === "select") return "combobox"
    if (t === "textarea") return "textbox"
    if (t === "input") { const ty = (el.type || "text").toLowerCase(); return ty === "checkbox" ? "checkbox" : ty === "radio" ? "radio" : /^(button|submit|reset|image)$/.test(ty) ? "button" : "textbox" }
    return el.isContentEditable ? "textbox" : "generic"
  }
  const nameOf = (el) => {
    const aria = el.getAttribute("aria-label"); if (aria) return aria
    const lb = el.getAttribute("aria-labelledby")
    if (lb) { const t = lb.split(/\s+/).map(id => (el.ownerDocument.getElementById(id) || {}).innerText || "").join(" ").trim(); if (t) return t }
    if (el.labels && el.labels.length) { const t = [...el.labels].map(l => l.innerText).join(" ").trim(); if (t) return t }
    const own = el.getAttribute("placeholder") || el.getAttribute("alt") || el.getAttribute("title") || (el.innerText || "").trim()
    if (own) return own
    return el.type !== "password" && typeof el.value === "string" ? el.value : ""
  }
  const findEl = () => {
    if (a.ref) { const w = window.__gauRefs.get(a.ref); const el = w && w.deref(); if (el && el.isConnected) return el }
    if (a.selector) {
      for (const { root } of roots) { try { const el = root.querySelector(a.selector); if (el) return el } catch { /* selector hỏng */ } }
    }
    return null
  }
  const missing = () => ({ ok: false, error: `Không thấy phần tử ${a.ref || a.selector || ""} — trang đã đổi, gọi snapshot lại để lấy ref mới.` })

  if (op === "snapshot") {
    const vw = window.innerWidth, vh = window.innerHeight
    const items = []
    for (const { root, doc } of roots) {
      let list = []
      try { list = root.querySelectorAll(INTERACTIVE) } catch { /* bỏ */ }
      for (const el of list) {
        if (!visible(el)) continue
        const r = el.getBoundingClientRect()
        const { ox, oy } = frameOffset(doc)
        const x = r.left + ox, y = r.top + oy
        const prio = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable ? 0 : el.tagName === "A" ? 2 : 1
        items.push({ el, doc, x, y, w: r.width, h: r.height, prio, inView: x + r.width > 0 && y + r.height > 0 && x < vw && y < vh })
      }
    }
    items.sort((p, q) => (q.inView - p.inView) || (p.prio - q.prio) || (p.y - q.y) || (p.x - q.x))
    const out = items.slice(0, 200).map(({ el, doc, x, y, w, h, inView }) => {
      const role = roleOf(el)
      const e = { ref: refFor(el), role, name: nameOf(el).trim().replace(/\s+/g, " ").slice(0, 80), tag: el.tagName.toLowerCase(), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), inView }
      const sel = uniqueSel(el, doc); if (sel) e.sel = sel
      if (el.tagName === "A" && el.href) e.href = el.href.slice(0, 200)
      if (el.type && el.tagName === "INPUT") e.type = el.type
      if (el.type === "password") e.value = "••••"
      else if (typeof el.value === "string" && el.value && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) e.value = el.value.slice(0, 80)
      if (el.checked === true || el.getAttribute("aria-checked") === "true") e.checked = true
      if (el.disabled || el.getAttribute("aria-disabled") === "true") e.disabled = true
      if (el.tagName === "SELECT") e.options = [...el.options].slice(0, 25).map(o => (o.label || o.text || o.value).trim().slice(0, 40))
      return e
    })
    const text = document.body ? document.body.innerText : ""
    return {
      title: document.title, url: location.href, readyState: document.readyState,
      viewport: { w: vw, h: vh, scrollY: Math.round(window.scrollY), scrollMax: Math.max(0, Math.round(document.documentElement.scrollHeight - vh)) },
      content: text.slice(0, 12000), elements: out, totalInteractive: items.length,
      sameOriginFrames: frames.length, crossOriginFrames: crossFrames.slice(0, 10),
    }
  }

  if (op === "locate") {
    const el = findEl(); if (!el) return missing()
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const { ox, oy } = frameOffset(el.ownerDocument)
    const hit = el.ownerDocument.elementFromPoint(cx, cy)
    // Quan hệ cha-con XUYÊN shadow DOM (elementFromPoint trả về host chứ không phải phần tử bên trong shadow).
    const composedContains = (anc, node) => { for (let n = node; n; n = n.parentNode || n.host) if (n === anc) return true; return false }
    const covered = !!hit && !composedContains(hit, el) && !composedContains(el, hit)
    return {
      ok: true, x: ox + cx, y: oy + cy, w: Math.round(r.width), h: Math.round(r.height), tag: el.tagName.toLowerCase(),
      disabled: !!(el.disabled || el.getAttribute("aria-disabled") === "true"),
      covered, coveredBy: covered ? `${hit.tagName.toLowerCase()} "${(hit.innerText || "").trim().slice(0, 40)}"` : undefined,
    }
  }

  if (op === "focus_select") {
    const el = findEl(); if (!el) return missing()
    el.focus()
    if (a.noSelect) return { ok: true }
    if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && typeof el.select === "function") { try { el.select() } catch { /* type không hỗ trợ */ } }
    else if (el.isContentEditable) {
      const d = el.ownerDocument, sel = d.getSelection(), rg = d.createRange()
      rg.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(rg)
    }
    return { ok: true }
  }

  if (op === "click_synthetic") {
    const el = findEl(); if (!el) return missing()
    el.click(); return { ok: true }
  }

  if (op === "set_value") {
    const el = findEl(); if (!el) return missing()
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, "value") && Object.getOwnPropertyDescriptor(proto, "value").set
    if (setter) setter.call(el, a.value); else el.value = a.value
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    if (a.pressEnter) {
      for (const type of ["keydown", "keypress", "keyup"]) {
        const ev = new KeyboardEvent(type, { key: "Enter", code: "Enter", bubbles: true, cancelable: true })
        Object.defineProperty(ev, "keyCode", { get: () => 13 }); Object.defineProperty(ev, "which", { get: () => 13 })
        el.dispatchEvent(ev)
      }
    }
    return { ok: true }
  }

  if (op === "select_option") {
    const el = findEl(); if (!el) return missing()
    if (el.tagName !== "SELECT") return { ok: false, error: "Phần tử không phải <select> — dùng click để mở danh sách rồi click lựa chọn." }
    const want = String(a.value ?? "").trim().toLowerCase()
    const opt = [...el.options].find(o => o.value.toLowerCase() === want) || [...el.options].find(o => (o.label || o.text).trim().toLowerCase() === want)
      || [...el.options].find(o => (o.label || o.text).trim().toLowerCase().includes(want))
    if (!opt) return { ok: false, error: `Không có lựa chọn "${a.value}". Có: ${[...el.options].slice(0, 15).map(o => (o.label || o.text).trim()).join(" | ")}` }
    el.value = opt.value
    el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }))
    return { ok: true, selected: (opt.label || opt.text).trim() }
  }

  if (op === "scroll") {
    const el = a.ref || a.selector ? findEl() : null
    if ((a.ref || a.selector) && !el) return missing()
    const target = el || window
    const dir = a.direction || "down"
    const page = (el ? el.clientHeight : window.innerHeight) * 0.85 * (Number(a.amount) || 1)
    if (dir === "top") target.scrollTo({ top: 0 })
    else if (dir === "bottom") target.scrollTo({ top: el ? el.scrollHeight : document.documentElement.scrollHeight })
    else target.scrollBy({ top: dir === "up" ? -page : page })
    return { ok: true, scrollY: Math.round(el ? el.scrollTop : window.scrollY), scrollMax: Math.round(el ? el.scrollHeight - el.clientHeight : document.documentElement.scrollHeight - window.innerHeight) }
  }

  if (op === "wait") {
    const timeout = Math.min(Math.max(Number(a.timeout_ms) || 8000, 200), 20000)
    const t0 = Date.now()
    const check = () => {
      let present
      if (a.text) present = (document.body ? document.body.innerText : "").includes(a.text)
      else if (a.ref || a.selector) { const el = findEl(); present = !!el && visible(el) }
      else return true
      return a.gone ? !present : present
    }
    return new Promise((resolve) => {
      const tick = () => {
        if (check()) return resolve({ ok: true, waited_ms: Date.now() - t0 })
        if (Date.now() - t0 > timeout) return resolve({ ok: false, error: `Hết ${timeout}ms mà ${a.gone ? "chưa biến mất" : "chưa xuất hiện"}: ${a.text || a.ref || a.selector}` })
        setTimeout(tick, 250)
      }
      if (!a.text && !a.ref && !a.selector) setTimeout(() => resolve({ ok: true, waited_ms: timeout < 1000 ? timeout : Math.min(timeout, Number(a.timeout_ms) || 1000) }), Math.min(timeout, Number(a.timeout_ms) || 1000))
      else tick()
    })
  }

  return { ok: false, error: `pageOp không hỗ trợ ${op}` }
}

async function page(tabId, op, args) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: pageOp, args: [op, args || {}] })
  return result
}

// ─── Khung viền + nút DỪNG trên trang khi Gấu đang thao tác ──────────────────────────────────────────────────────────────

async function showOverlay(tabId, text) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (msg) => {
        let box = document.getElementById("__gau_overlay")
        if (!box) {
          box = document.createElement("div"); box.id = "__gau_overlay"
          box.style.cssText = "position:fixed;inset:0;border:3px solid #f59e0b;z-index:2147483646;pointer-events:none;box-sizing:border-box"
          const bar = document.createElement("div")
          bar.style.cssText = "position:fixed;bottom:14px;right:14px;z-index:2147483647;pointer-events:auto;background:#1e293b;color:#fff;font:12px/1.4 system-ui,sans-serif;padding:8px 10px;border-radius:10px;display:flex;gap:10px;align-items:center;box-shadow:0 4px 16px rgba(0,0,0,.35)"
          const label = document.createElement("span"); label.id = "__gau_overlay_text"
          const btn = document.createElement("button"); btn.textContent = "⛔ DỪNG"
          btn.style.cssText = "background:#dc2626;color:#fff;border:0;border-radius:8px;padding:5px 9px;font-weight:700;cursor:pointer"
          btn.onclick = () => { try { chrome.runtime.sendMessage({ type: "gau-stop" }) } catch { /* extension reload */ } box.remove() }
          bar.append(label, btn); box.append(bar); document.documentElement.append(box)
        }
        box.querySelector("#__gau_overlay_text").textContent = "🐻 Gấu Pro: " + msg
        clearTimeout(window.__gauOvTimer)
        window.__gauOvTimer = setTimeout(() => { const b = document.getElementById("__gau_overlay"); if (b) b.remove() }, 6000)
      },
      args: [text],
    })
  } catch { /* trang không cho chèn script — bỏ qua */ }
}

// ─── Chuột / phím tin cậy qua CDP ─────────────────────────────────────────────────────────────────────────────────────────

async function mouseClick(tabId, x, y, count) {
  await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y })
  for (let i = 1; i <= count; i++) {
    await cdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: i })
    await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: i })
  }
}

const KEYS = {
  enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" }, tab: { key: "Tab", code: "Tab", vk: 9 },
  escape: { key: "Escape", code: "Escape", vk: 27 }, esc: { key: "Escape", code: "Escape", vk: 27 },
  backspace: { key: "Backspace", code: "Backspace", vk: 8 }, delete: { key: "Delete", code: "Delete", vk: 46 },
  arrowup: { key: "ArrowUp", code: "ArrowUp", vk: 38 }, arrowdown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  arrowleft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 }, arrowright: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  home: { key: "Home", code: "Home", vk: 36 }, end: { key: "End", code: "End", vk: 35 },
  pageup: { key: "PageUp", code: "PageUp", vk: 33 }, pagedown: { key: "PageDown", code: "PageDown", vk: 34 },
  space: { key: " ", code: "Space", vk: 32, text: " " },
}
const EDIT_COMMANDS = { a: "selectAll", c: "copy", x: "cut", v: "paste", z: "undo", y: "redo" }

function parseKey(spec) {
  const parts = String(spec).split("+").map(s => s.trim()).filter(Boolean)
  const name = (parts.pop() || "").toLowerCase()
  let modifiers = 0
  for (const m of parts.map(s => s.toLowerCase())) { if (m === "alt") modifiers |= 1; else if (m === "ctrl" || m === "control") modifiers |= 2; else if (m === "meta" || m === "cmd") modifiers |= 4; else if (m === "shift") modifiers |= 8 }
  let def = KEYS[name]
  if (!def && name.length === 1) {
    const up = name.toUpperCase()
    def = { key: modifiers & 8 ? up : name, code: /[a-z]/.test(name) ? `Key${up}` : /\d/.test(name) ? `Digit${name}` : "", vk: up.charCodeAt(0), text: modifiers & 6 ? undefined : (modifiers & 8 ? up : name) }
  }
  if (!def) throw new Error(`Phím không hỗ trợ: ${spec}`)
  const commands = modifiers & 6 && name.length === 1 && EDIT_COMMANDS[name] ? [EDIT_COMMANDS[name]] : undefined
  return { ...def, modifiers, commands }
}

async function pressKey(tabId, spec, repeat) {
  const k = parseKey(spec)
  for (let i = 0; i < Math.min(Math.max(repeat || 1, 1), 50); i++) {
    const base = { modifiers: k.modifiers, key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk }
    await cdp(tabId, "Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", ...base, text: k.text, unmodifiedText: k.text, commands: k.commands })
    await cdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...base })
  }
}

// ─── Tab, chờ tải ─────────────────────────────────────────────────────────────────────────────────────────────────────

function waitComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(on); clearTimeout(t); resolve() }
    const on = (id, info) => { if (id === tabId && info.status === "complete") finish() }
    chrome.tabs.onUpdated.addListener(on)
    const t = setTimeout(finish, timeoutMs)
    chrome.tabs.get(tabId).then(tab => { if (tab.status === "complete") setTimeout(finish, 300) }).catch(finish)
  })
}

async function ownedTabs() { return (await chrome.storage.local.get("gauTabs")).gauTabs || [] }
async function rememberTab(id) {
  const list = (await ownedTabs()).filter(x => x !== id).slice(-30); list.push(id)
  await chrome.storage.local.set({ gauTabs: list })
}
async function afterState(tabId) {
  const t = await chrome.tabs.get(tabId).catch(() => null)
  return t ? { url: t.url, title: t.title } : null
}

// ─── Thực thi lệnh ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function execAction(action, p) {
  if (action === "list_tabs") {
    const tabs = await chrome.tabs.query({})
    const owned = new Set(await ownedTabs())
    const out = []
    for (const t of tabs) {
      if (await isBlocked(t.url)) out.push({ id: t.id, title: "(trang nhạy cảm — đã ẩn)", url: "", blocked: true, active: t.active })
      else out.push({ id: t.id, title: t.title, url: t.url, active: t.active, gau_tab: owned.has(t.id) })
    }
    return out
  }

  if (action === "read_tab" || action === "snapshot") {
    let tabId = p.tab_id
    if (!tabId) {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!active) throw new Error("Không tìm thấy tab đang active")
      tabId = active.id
    }
    await tabFor(tabId)
    return await page(tabId, "snapshot")
  }

  if (action === "screenshot") {
    const tab = await tabFor(p.tab_id)
    const m = await cdp(tab.id, "Page.getLayoutMetrics")
    const vp = m.cssVisualViewport || m.visualViewport
    const scale = Math.min(1, (Number(p.max_width) || 1000) / vp.clientWidth)
    const shot = await Promise.race([
      cdp(tab.id, "Page.captureScreenshot", { format: "jpeg", quality: 55, clip: { x: vp.pageX, y: vp.pageY, width: vp.clientWidth, height: vp.clientHeight, scale } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("Chụp ảnh quá lâu — tab có thể đang ẩn, dùng activate_tab rồi chụp lại.")), 10000)),
    ])
    return { image: { mime: "image/jpeg", data: shot.data }, viewport: { w: Math.round(vp.clientWidth), h: Math.round(vp.clientHeight) }, url: tab.url, title: tab.title }
  }

  if (action === "click" || action === "hover") {
    const tab = await tabFor(p.tab_id)
    const loc = await page(tab.id, "locate", { ref: p.ref, selector: p.selector })
    if (!loc.ok) throw new Error(loc.error)
    if (loc.disabled) throw new Error("Phần tử đang bị vô hiệu (disabled).")
    if (loc.covered && !p.force) throw new Error(`Phần tử bị che bởi ${loc.coveredBy} — đóng popup/cuộn rồi thử lại (hoặc force=true).`)
    try {
      if (action === "hover") { await cdp(tab.id, "Input.dispatchMouseEvent", { type: "mouseMoved", x: loc.x, y: loc.y }); return { ok: true } }
      await mouseClick(tab.id, loc.x, loc.y, p.double ? 2 : 1)
      await new Promise(r => setTimeout(r, 200))
      return { ok: true, method: "trusted", after: await afterState(tab.id) }
    } catch (e) {
      if (action === "hover") throw e
      const r = await page(tab.id, "click_synthetic", { ref: p.ref, selector: p.selector })   // không gắn được debugger (DevTools đang mở?) → click thường
      if (!r.ok) throw new Error(r.error)
      return { ok: true, method: "synthetic", note: `Click thường (không gắn được debugger: ${String(e.message || e).slice(0, 80)})`, after: await afterState(tab.id) }
    }
  }

  if (action === "fill") {
    const tab = await tabFor(p.tab_id)
    const loc = await page(tab.id, "locate", { ref: p.ref, selector: p.selector })
    if (!loc.ok) throw new Error(loc.error)
    const value = String(p.value ?? "")
    try {
      await page(tab.id, "focus_select", { ref: p.ref, selector: p.selector, noSelect: !!p.append })
      if (value === "") await pressKey(tab.id, "Backspace", 1)
      else await cdp(tab.id, "Input.insertText", { text: value })
      if (p.press_enter) await pressKey(tab.id, "Enter", 1)
      return { ok: true, method: "trusted" }
    } catch (e) {
      const r = await page(tab.id, "set_value", { ref: p.ref, selector: p.selector, value, pressEnter: !!p.press_enter })
      if (!r.ok) throw new Error(r.error)
      return { ok: true, method: "synthetic", note: `Điền thường (không gắn được debugger: ${String(e.message || e).slice(0, 80)})` }
    }
  }

  if (action === "key") {
    const tab = await tabFor(p.tab_id)
    if (p.ref || p.selector) { const f = await page(tab.id, "focus_select", { ref: p.ref, selector: p.selector }); if (!f.ok) throw new Error(f.error) }
    await pressKey(tab.id, p.keys, p.repeat)
    return { ok: true, after: await afterState(tab.id) }
  }

  if (action === "select") {
    const tab = await tabFor(p.tab_id)
    const r = await page(tab.id, "select_option", { ref: p.ref, selector: p.selector, value: p.value })
    if (!r.ok) throw new Error(r.error)
    return r
  }

  if (action === "scroll" || action === "scroll_to") {
    const tab = await tabFor(p.tab_id)
    if (action === "scroll_to") { const r = await page(tab.id, "locate", { ref: p.ref, selector: p.selector }); if (!r.ok) throw new Error(r.error); return { ok: true } }
    const r = await page(tab.id, "scroll", { ref: p.ref, selector: p.selector, direction: p.direction, amount: p.amount })
    if (!r.ok) throw new Error(r.error)
    return r
  }

  if (action === "wait_for") {
    const tab = await tabFor(p.tab_id)
    const r = await page(tab.id, "wait", { text: p.text, ref: p.ref, selector: p.selector, gone: !!p.gone, timeout_ms: p.timeout_ms })
    if (!r.ok) throw new Error(r.error)
    return r
  }

  if (action === "navigate") {
    await tabFor(p.tab_id)
    if (await isBlocked(p.url)) throw new Error(BLOCK_MSG)
    await chrome.tabs.update(p.tab_id, { url: p.url })
    await waitComplete(p.tab_id, 15000)
    return { ok: true, after: await afterState(p.tab_id) }
  }

  if (action === "open_tab") {
    if (await isBlocked(p.url)) throw new Error(BLOCK_MSG)
    const tab = await chrome.tabs.create({ url: p.url, active: p.background === false })
    await rememberTab(tab.id)
    try {
      const { gauGroup } = await chrome.storage.local.get("gauGroup")
      const gid = await chrome.tabs.group(gauGroup ? { tabIds: [tab.id], groupId: gauGroup } : { tabIds: [tab.id] }).catch(() => chrome.tabs.group({ tabIds: [tab.id] }))
      await chrome.tabGroups.update(gid, { title: "🐻 Gấu Pro", color: "orange" })
      await chrome.storage.local.set({ gauGroup: gid })
    } catch { /* nhóm tab không bắt buộc */ }
    await waitComplete(tab.id, 15000)
    return { ok: true, tab_id: tab.id, after: await afterState(tab.id) }
  }

  if (action === "close_tab") {
    if (!(await ownedTabs()).includes(p.tab_id)) throw new Error("Chỉ đóng được tab do Gấu Pro mở (open_tab). Tab của người dùng giữ nguyên.")
    await detachDebugger(p.tab_id)
    await chrome.tabs.remove(p.tab_id)
    return { ok: true }
  }

  if (action === "activate_tab") {
    const tab = await tabFor(p.tab_id)
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {})
    return { ok: true }
  }

  throw new Error(`Action không hỗ trợ: ${action}`)
}

function describeAction(action, p) {
  const t = p.ref || p.selector || ""
  if (action === "click") return `Click ${t}`
  if (action === "fill") return `Điền "${String(p.value ?? "").slice(0, 40)}" vào ${t}`
  if (action === "key") return `Nhấn phím ${p.keys}`
  if (action === "select") return `Chọn "${p.value}" ở ${t}`
  if (action === "navigate") return `Điều hướng tới ${p.url}`
  if (action === "open_tab") return `Mở tab mới ${p.url}`
  if (action === "close_tab") return `Đóng tab do Gấu mở`
  return action
}

function notifyAction(command, text) {
  chrome.notifications.create(`bridge-info-${command.id}`, { type: "basic", iconUrl: TINY_ICON, title: "Gấu Pro vừa thao tác", message: text, requireInteraction: false })
}

async function processCommand(command) {
  const p = command.payload || {}
  try {
    if (WRITE_ACTIONS.has(command.action)) {
      const text = describeAction(command.action, p)
      notifyAction(command, text)
      if (p.tab_id) showOverlay(p.tab_id, text)
    }
    const result = await execAction(command.action, p)
    await apiFetch("/api/creator-ai/bridge/result", { method: "POST", body: JSON.stringify({ id: command.id, result }) })
  } catch (e) {
    await apiFetch("/api/creator-ai/bridge/result", {
      method: "POST",
      body: JSON.stringify({ id: command.id, error: String(e?.message || e) }),
    }).catch(() => {})
  }
}

// ─── Vòng poll + wake + dừng khẩn cấp ───────────────────────────────────────────────────────────────────────────────────────

async function pollOnce() {
  const { enabled } = await getConfig()
  if (!enabled || polling) return
  polling = true
  try {
    const res = await apiFetch("/api/creator-ai/bridge/next")
    if (!res.ok) return
    const data = await res.json()
    if (data.latest_version) chrome.storage.local.set({ latestVersion: data.latest_version })
    if (data.command) { lastCommandAt = Date.now(); await processCommand(data.command) }
  } catch {
    // im lặng — thử lại ở lần poll kế tiếp (chưa cấu hình / mất mạng tạm thời)
  } finally { polling = false }
}

function scheduleNext() {
  if (pollTimer) clearTimeout(pollTimer)
  const delay = Date.now() - lastCommandAt < BURST_WINDOW_MS ? BURST_INTERVAL_MS : POLL_INTERVAL_MS
  pollTimer = setTimeout(async () => { await pollOnce(); scheduleNext() }, delay)
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "wake") {
    // Trang GoHub báo Gấu Pro vừa gọi tool browser → vào chế độ dồn dập + poll ngay.
    lastCommandAt = Date.now()
    pollOnce().finally(scheduleNext)
    sendResponse({ ok: true })
  } else if (msg && msg.type === "gau-stop") {
    // Nút DỪNG trên trang: tắt Bridge, tháo debugger. Lệnh đang chờ sẽ hết hạn.
    chrome.storage.local.set({ enabled: false })
    for (const id of [...attached.keys()]) detachDebugger(id)
    chrome.notifications.create("bridge-stop", { type: "basic", iconUrl: TINY_ICON, title: "Gấu Pro đã dừng", message: "Bridge đã tắt. Bật lại trong popup extension khi cần.", requireInteraction: false })
    sendResponse({ ok: true })
  }
  return false
})

chrome.runtime.onStartup.addListener(scheduleNext)
chrome.runtime.onInstalled.addListener(scheduleNext)
scheduleNext()

chrome.alarms.create("bridge-heartbeat", { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "bridge-heartbeat") { scheduleNext(); sweepDebuggers() }
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) scheduleNext()
})
