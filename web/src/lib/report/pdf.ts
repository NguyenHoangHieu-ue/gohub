import { chromium } from "playwright-core"
import { BRAND, formatValue, totalRow, type ReportSpec } from "./spec"
import { chartSvg } from "./charts"

// Bản PDF của báo cáo (U2): dựng HTML (biểu đồ SVG nhúng thẳng) rồi in qua browserless (cùng hạ tầng browseWeb).
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export function reportHtml(spec: ReportSpec): string {
  const isNum = (t?: string) => t === "number" || t === "money" || t === "percent"
  const today = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
  const sections = spec.sections.map(s => {
    const t = s.table
    const tot = t ? totalRow(t) : null
    return `<section><h2>${esc(s.heading)}</h2>
${s.text ? s.text.split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join("") : ""}
${s.kpis?.length ? `<div class="kpis">${s.kpis.map(k => `<div class="kpi"><div class="kl">${esc(k.label)}</div><div class="kv">${esc(typeof k.value === "number" ? formatValue(k.value, k.type) : k.value)}</div>${k.change !== undefined ? `<div class="${k.change >= 0 ? "up" : "down"}">${k.change >= 0 ? "▲" : "▼"} ${formatValue(Math.abs(k.change), "percent")}</div>` : ""}</div>`).join("")}</div>` : ""}
${s.bullets?.length ? `<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
${s.chart?.data?.length ? `<div class="chart">${chartSvg(s.chart)}</div>` : ""}
${t?.rows?.length ? `<table><thead><tr>${t.columns.map(c => `<th class="${isNum(c.type) ? "r" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead><tbody>
${t.rows.map(r => `<tr>${t.columns.map(c => `<td class="${isNum(c.type) ? "r" : ""}">${esc(formatValue(r[c.key], c.type))}</td>`).join("")}</tr>`).join("")}
${tot ? `<tr class="tot">${t.columns.map(c => `<td class="${isNum(c.type) ? "r" : ""}">${esc(formatValue(tot[c.key], c.type))}</td>`).join("")}</tr>` : ""}</tbody></table>` : ""}
</section>`
  }).join("")
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>
*{box-sizing:border-box} body{font-family:Arial,"Helvetica Neue",sans-serif;color:${BRAND.text};font-size:11pt;margin:0}
.cover{border-left:6px solid ${BRAND.primary};padding:4px 0 4px 16px;margin-bottom:18px}
.brand{color:${BRAND.primary};font-weight:700;letter-spacing:1px;font-size:10pt} h1{color:${BRAND.dark};font-size:24pt;margin:6px 0}
.meta{color:#64748B;font-size:9pt} h2{color:${BRAND.dark};font-size:15pt;margin:20px 0 8px;border-bottom:2px solid ${BRAND.bg};padding-bottom:4px}
.summary{background:${BRAND.bg};border-radius:8px;padding:10px 16px} li{margin:3px 0}
.kpis{display:flex;gap:8px;margin:8px 0} .kpi{flex:1;background:${BRAND.bg};border-radius:8px;padding:8px 10px}
.kl{color:#64748B;font-size:8.5pt} .kv{color:${BRAND.primary};font-weight:700;font-size:15pt} .up{color:#059669;font-size:8.5pt} .down{color:#DC2626;font-size:8.5pt}
.chart svg{width:100%;height:auto} table{width:100%;border-collapse:collapse;font-size:9pt;margin:8px 0;page-break-inside:auto}
th{background:${BRAND.primary};color:#fff;text-align:left;padding:5px 6px} td{border-bottom:1px solid #E2E8F0;padding:4px 6px}
tr:nth-child(even) td{background:#F8FAFC} tr.tot td{font-weight:700;background:#F1F5F9} .r{text-align:right} thead{display:table-header-group}
h2{break-after:avoid;page-break-after:avoid} .chart,.kpis,tr{break-inside:avoid;page-break-inside:avoid} .notes{color:#475569;font-size:9pt}
</style></head><body>
<div class="cover"><div class="brand">GOHUB · travel like a local</div><h1>${esc(spec.title)}</h1>
${spec.subtitle ? `<div>${esc(spec.subtitle)}</div>` : ""}<div class="meta">${spec.period ? `Kỳ dữ liệu: ${esc(spec.period)} · ` : ""}Ngày lập: ${today}</div></div>
${spec.summary.length ? `<h2>Kết luận</h2><div class="summary"><ul>${spec.summary.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}
${sections}
${spec.actions?.length ? `<h2>Việc nên làm</h2><ul>${spec.actions.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
${spec.notes?.length ? `<h2>Nguồn & ghi chú</h2><div class="notes">${spec.notes.map(n => `<p>${esc(n)}</p>`).join("")}</div>` : ""}
</body></html>`
}

export async function buildReportPdf(spec: ReportSpec): Promise<Buffer> {
  const wsUrl = process.env.BROWSERLESS_WS_URL, token = process.env.BROWSERLESS_TOKEN
  if (!wsUrl || !token) throw new Error("Chưa cấu hình browserless (BROWSERLESS_WS_URL/TOKEN) để in PDF.")
  const browser = await chromium.connectOverCDP(`${wsUrl}${wsUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`, { timeout: 90_000 })   // browserless gói free ngủ — khởi động lại ~30–60s
  try {
    const page = await browser.newPage()
    await page.setContent(reportHtml(spec), { waitUntil: "load" })
    return Buffer.from(await page.pdf({
      format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true, headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:8px;color:#94A3B8;width:100%;text-align:center">${esc(spec.title)} — Trang <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    }))
  } finally { await browser.close().catch(() => {}) }
}
