// SINH TỰ ĐỘNG bởi web/scripts/pack_bridge_extension.py từ browser-extension/background.js (hàm pageOp) — không sửa tay.
window.pageOp = function pageOp(op, a) {
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
