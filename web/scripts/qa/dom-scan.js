// G0.1 (bổ sung) — Quét DOM thật của trang đang mở để đối chiếu với inventory.mjs.
// Dán vào console/javascript_tool của tab đã đăng nhập, rồi đọc kết quả: JSON.stringify(await QADOM.scan())
// Trả: nút, ô nhập, hộp chọn, tiêu đề cột bảng, số bảng, đề mục — kèm cờ hiển thị (visible) và điều kiện khoá (disabled).
;(function () {
  const txt = el => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim()
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" }
  const scan = (root = document.querySelector("main") || document.body) => {
    const buttons = [...root.querySelectorAll("button,[role=button],[role=tab]")].map(b => ({ t: (txt(b) || b.getAttribute("aria-label") || b.title || "(icon)").slice(0, 60), aria: b.getAttribute("aria-label") || "", disabled: b.disabled || b.getAttribute("aria-disabled") === "true", v: vis(b), tab: b.getAttribute("role") === "tab" ? (b.getAttribute("aria-selected") === "true") : undefined }))
    const inputs = [...root.querySelectorAll("input,textarea")].map(i => ({ type: i.type, ph: i.placeholder || "", val: i.type === "checkbox" || i.type === "radio" ? i.checked : (i.value || "").slice(0, 30), label: (i.closest("label") ? txt(i.closest("label")) : "").slice(0, 40), disabled: i.disabled, v: vis(i) }))
    const selects = [...root.querySelectorAll("select")].map(s => ({ val: s.value, opts: [...s.options].map(o => o.text.trim()).slice(0, 16), disabled: s.disabled, v: vis(s) }))
    const tables = [...root.querySelectorAll("table")].map(t => ({ heads: [...t.querySelectorAll("thead th")].map(h => txt(h).slice(0, 40)), rows: t.querySelectorAll("tbody tr").length, v: vis(t) }))
    const headings = [...root.querySelectorAll("h1,h2,h3,h4")].map(h => txt(h).slice(0, 70)).filter(Boolean)
    return {
      url: location.pathname + location.search, buttons, inputs, selects, tables, headings,
      counts: { buttons: buttons.length, buttonsVisible: buttons.filter(b => b.v).length, inputs: inputs.length, selects: selects.length, tables: tables.length },
    }
  }
  window.QADOM = { scan }
})()
