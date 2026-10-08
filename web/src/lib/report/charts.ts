import path from "node:path"
import fs from "node:fs"
import { BRAND, PALETTE, compact, toNumber, type ReportChart } from "./spec"

// Biểu đồ vẽ ở server (U2) — SVG tự dựng (cột, cột chồng, đường, tròn) theo màu thương hiệu; PNG qua resvg + font Be Vietnam Pro
// (Vercel không có font hệ thống → phải kèm file .ttf, xem next.config outputFileTracingIncludes).

export const CHART_W = 960
export const CHART_H = 480
const FONT = "Be Vietnam Pro"

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s)

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

export function chartSvg(c: ReportChart): string {
  const data = (c.data ?? []).slice(0, c.type === "pie" ? 8 : 24)
  const series = c.series.length ? c.series : [{ key: "value", label: "Giá trị" }]
  const W = CHART_W, H = CHART_H
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="#FFFFFF"/>
<text x="24" y="38" font-size="20" font-weight="700" fill="${BRAND.text}">${esc(cut(c.title, 70))}</text>`
  if (!data.length) return `${head}<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="16" fill="#64748B">Không có dữ liệu</text></svg>`

  if (c.type === "pie") {
    const s = series[0]
    const vals = data.map(r => Math.max(0, toNumber(r[s.key])))
    const total = vals.reduce((a, b) => a + b, 0) || 1
    const cx = 300, cy = 265, r = 170
    let a0 = -Math.PI / 2, out = ""
    vals.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2
      const large = a1 - a0 > Math.PI ? 1 : 0
      const p = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`
      out += vals.length === 1
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PALETTE[0]}"/>`
        : `<path d="M${cx},${cy} L${p(a0)} A${r},${r} 0 ${large} 1 ${p(a1)} Z" fill="${PALETTE[i % PALETTE.length]}" stroke="#fff" stroke-width="2"/>`
      a0 = a1
    })
    const legend = data.map((row, i) => `<rect x="540" y="${110 + i * 36}" width="16" height="16" rx="3" fill="${PALETTE[i % PALETTE.length]}"/>
<text x="566" y="${123 + i * 36}" font-size="15" fill="${BRAND.text}">${esc(cut(String(row[c.x] ?? ""), 26))} — ${(vals[i] / total * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</text>`).join("")
    return `${head}${out}${legend}</svg>`
  }

  const L = 96, R = 24, T = series.length > 1 ? 92 : 64, B = 96
  const pw = W - L - R, ph = H - T - B
  const stacked = c.type === "stacked"
  const values = data.map(r => series.map(s => toNumber(r[s.key])))
  const rawMax = stacked ? Math.max(...values.map(v => v.reduce((a, b) => a + Math.max(0, b), 0))) : Math.max(...values.flat(), 0)
  const yMax = niceMax(rawMax)
  const y = (v: number) => T + ph - (Math.max(0, v) / yMax) * ph
  let grid = ""
  for (let i = 0; i <= 4; i++) {
    const v = (yMax / 4) * i, yy = y(v)
    grid += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#E2E8F0"/><text x="${L - 10}" y="${yy + 5}" text-anchor="end" font-size="13" fill="#64748B">${esc(compact(v))}</text>`
  }
  const band = pw / data.length
  const rot = data.length > 8
  const labels = data.map((r, i) => {
    const x = L + band * i + band / 2, t = esc(cut(String(r[c.x] ?? ""), rot ? 16 : 14))
    return rot
      ? `<text transform="translate(${x},${T + ph + 16}) rotate(-35)" text-anchor="end" font-size="12" fill="#334155">${t}</text>`
      : `<text x="${x}" y="${T + ph + 24}" text-anchor="middle" font-size="13" fill="#334155">${t}</text>`
  }).join("")
  let marks = ""
  if (c.type === "line") {
    series.forEach((s, si) => {
      const pts = values.map((v, i) => `${L + band * i + band / 2},${y(v[si])}`)
      marks += `<polyline points="${pts.join(" ")}" fill="none" stroke="${PALETTE[si % PALETTE.length]}" stroke-width="3"/>`
      marks += pts.map(p => `<circle cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="4" fill="${PALETTE[si % PALETTE.length]}"/>`).join("")
    })
  } else {
    const gap = band * 0.2
    values.forEach((v, i) => {
      if (stacked) {
        let acc = 0
        v.forEach((val, si) => {
          const h = (Math.max(0, val) / yMax) * ph
          marks += `<rect x="${L + band * i + gap / 2}" y="${y(acc + Math.max(0, val))}" width="${band - gap}" height="${h}" fill="${PALETTE[si % PALETTE.length]}"/>`
          acc += Math.max(0, val)
        })
      } else {
        const bw = (band - gap) / series.length
        v.forEach((val, si) => {
          const yy = y(val)
          marks += `<rect x="${L + band * i + gap / 2 + bw * si}" y="${yy}" width="${Math.max(1, bw - 2)}" height="${T + ph - yy}" rx="2" fill="${PALETTE[si % PALETTE.length]}"/>`
          if (data.length <= 8 && series.length <= 2) marks += `<text x="${L + band * i + gap / 2 + bw * si + bw / 2}" y="${yy - 6}" text-anchor="middle" font-size="12" fill="#334155">${esc(compact(val))}</text>`
        })
      }
    })
  }
  // Chú thích nằm dưới tiêu đề (không chung dòng → tiêu đề dài không bị đè).
  const legend = series.length > 1 ? series.map((s, si) => `<rect x="${24 + 190 * si}" y="54" width="14" height="14" rx="3" fill="${PALETTE[si % PALETTE.length]}"/>
<text x="${44 + 190 * si}" y="66" font-size="14" fill="${BRAND.text}">${esc(cut(s.label, 22))}</text>`).join("") : ""
  return `${head}${grid}<line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" stroke="#94A3B8"/>${marks}${labels}${legend}</svg>`
}

let fontFiles: string[] | null = null
function fonts(): string[] {
  if (!fontFiles) {
    const dir = path.join(process.cwd(), "src/lib/report/fonts")
    fontFiles = ["BeVietnamPro-Regular.ttf", "BeVietnamPro-Bold.ttf"].map(f => path.join(dir, f)).filter(f => fs.existsSync(f))
  }
  return fontFiles
}

export async function chartPng(c: ReportChart): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js")
  const r = new Resvg(chartSvg(c), { font: { fontFiles: fonts(), loadSystemFonts: false, defaultFontFamily: FONT }, fitTo: { mode: "width", value: CHART_W * 2 } })
  return Buffer.from(r.render().asPng())
}
