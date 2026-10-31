// Vẽ lại "card" style Dashboard/BOD/B2B/B2C/Vendor Performance bằng code (next/og ImageResponse — satori,
// built-in Next.js 14, KHÔNG cần Puppeteer/canvas). MỖI card LUÔN in rõ tên tab nguồn số liệu (yêu cầu Hiếu)
// để người đọc biết số lấy từ đâu, giống hệt việc chụp màn hình tab đó thật.
//
// Dùng React.createElement thay JSX (.ts thay .tsx) — file này chỉ chạy server-side trong 1 route, không
// cần cú pháp JSX; tránh phụ thuộc cấu hình jsx của bộ build đang chạy (Next SWC lúc production, vitest/esbuild
// lúc test) — createElement là hàm thuần, chạy giống nhau ở mọi nơi.
import { createElement as h, type ReactElement } from "react"
import { ImageResponse } from "next/og"

const BRAND = "#0f4c81"      // tailwind.config.ts brand-600 — token thật của app (KHÔNG tự đoán hex)
const INK = "#0f172a"        // slate-900
const SUB = "#64748b"        // slate-500
const BORDER = "#e2e8f0"     // slate-200
const POS = "#059669"        // emerald-600
const NEG = "#dc2626"        // rose-600
const CARD_W = 1180

export interface Stat {
  label: string
  value: string
  delta?: string
  deltaPositive?: boolean
}

export interface CardSection {
  label: string
  stats: Stat[]
}

async function renderPng(el: ReactElement, width: number, height: number): Promise<Buffer> {
  const res = new ImageResponse(el, { width, height })
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

function statTile(s: Stat) {
  return h("div", {
    style: {
      display: "flex", flexDirection: "column", flex: 1, minWidth: 0,
      background: "#f8fafc", border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: "14px 16px", marginRight: 12,
    },
  }, [
    h("div", { key: "l", style: { display: "flex", fontSize: 15, color: SUB, fontWeight: 600, marginBottom: 6 } }, s.label),
    h("div", { key: "v", style: { display: "flex", fontSize: 26, color: INK, fontWeight: 800 } }, s.value),
    s.delta
      ? h("div", { key: "d", style: { display: "flex", fontSize: 14, fontWeight: 700, marginTop: 4, color: s.deltaPositive === false ? NEG : POS } }, s.delta)
      : null,
  ])
}

function header(tabName: string, subtitle: string) {
  return h("div", { style: { display: "flex", alignItems: "center", marginBottom: 18 } }, [
    h("div", {
      key: "icon",
      style: {
        display: "flex", width: 40, height: 40, borderRadius: 10, background: BRAND,
        color: "white", fontSize: 20, fontWeight: 800, alignItems: "center", justifyContent: "center", marginRight: 12,
      },
    }, "G"),
    h("div", { key: "txt", style: { display: "flex", flexDirection: "column" } }, [
      h("div", { key: "t", style: { display: "flex", fontSize: 22, fontWeight: 800, color: INK } }, tabName),
      h("div", { key: "s", style: { display: "flex", fontSize: 14, color: SUB } }, subtitle),
    ]),
  ])
}

function sectionLabel(text: string) {
  return h("div", { style: { display: "flex", fontSize: 13, fontWeight: 700, color: BRAND, letterSpacing: 1, marginBottom: 10, marginTop: 14 } }, text.toUpperCase())
}

/** Card 1 hàng stat, dùng cho KPI card thường (Dashboard KPI, Vendor Performance actual row...) */
export async function renderKpiCard(tabName: string, subtitle: string, stats: Stat[]): Promise<Buffer> {
  const height = 210
  const el = h("div", {
    style: {
      display: "flex", flexDirection: "column", width: CARD_W, height, background: "white",
      border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, fontFamily: "sans-serif",
    },
  }, [
    header(tabName, subtitle),
    h("div", { key: "stats", style: { display: "flex" } }, stats.map((s, i) => h("div", { key: i, style: { display: "flex", flex: 1 } }, statTile(s)))),
  ])
  return renderPng(el, CARD_W, height)
}

/** Card nhiều section (vd B2B/B2C Performance Summary: MTD Actual + Full Period Forecast) */
export async function renderSectionedCard(tabName: string, subtitle: string, sections: CardSection[]): Promise<Buffer> {
  const height = 150 + sections.length * 140
  const el = h("div", {
    style: {
      display: "flex", flexDirection: "column", width: CARD_W, height, background: "white",
      border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, fontFamily: "sans-serif",
    },
  }, [
    header(tabName, subtitle),
    ...sections.map((sec, i) => h("div", { key: i, style: { display: "flex", flexDirection: "column" } }, [
      sectionLabel(sec.label),
      h("div", { key: "row", style: { display: "flex" } }, sec.stats.map((s, j) => h("div", { key: j, style: { display: "flex", flex: 1 } }, statTile(s)))),
    ])),
  ])
  return renderPng(el, CARD_W, height)
}

/** Banner xanh "Month-End Projection (Pro-rata)" — dùng trước card actual, giống Vendor/B2C Performance */
export async function renderProjectionBanner(subtitle: string, stats: Stat[]): Promise<Buffer> {
  const height = 170
  const el = h("div", {
    style: {
      display: "flex", flexDirection: "column", width: CARD_W, height, background: BRAND,
      borderRadius: 16, padding: 22, fontFamily: "sans-serif",
    },
  }, [
    h("div", { key: "t", style: { display: "flex", fontSize: 18, fontWeight: 800, color: "white", marginBottom: 4 } }, "↗ Month-End Projection (Pro-rata)"),
    h("div", { key: "s", style: { display: "flex", fontSize: 13, color: "#cfe0ef", marginBottom: 14 } }, subtitle),
    h("div", { key: "row", style: { display: "flex" } }, stats.map((s, i) => h("div", { key: i, style: { display: "flex", flexDirection: "column", flex: 1, marginRight: 12 } }, [
      h("div", { key: "l", style: { display: "flex", fontSize: 13, color: "#cfe0ef", fontWeight: 600, marginBottom: 4 } }, s.label),
      h("div", { key: "v", style: { display: "flex", fontSize: 24, color: "white", fontWeight: 800 } }, s.value),
      s.delta ? h("div", { key: "d", style: { display: "flex", fontSize: 13, fontWeight: 700, marginTop: 2, color: "#bfe3d0" } }, s.delta) : null,
    ]))),
  ])
  return renderPng(el, CARD_W, height)
}

// ── Card "Tiến độ CM1" kiểu tab Quarter Report (3 thẻ B2B / B2C / Tổng) ──────────
export interface ProgressRow { label: string; actual: number; prorata: number | null; target: number; pct: number | null; actualSub?: string; targetSub?: string }
export interface ProgressCard { title: string; accent: string; cm1PctPr: number | null; cm1PctAct: number | null; rows: ProgressRow[] }

const money = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 1 : 1)} Tỷ`
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)} Tr`
  return Math.round(n).toLocaleString("en-US")
}
const tone = (p: number) => (p >= 100 ? { fg: POS, bg: "#d1fae5" } : p >= 85 ? { fg: "#d97706", bg: "#fef3c7" } : { fg: NEG, bg: "#fee2e2" })

function progressCard(c: ProgressCard) {
  const t = c.cm1PctPr == null ? null : tone(c.cm1PctPr)
  const cell = (text: string, opts: { bold?: boolean; color?: string; w: number; align?: "flex-end" | "flex-start" }) =>
    h("div", { style: { display: "flex", width: opts.w, justifyContent: opts.align ?? "flex-end", fontSize: 13, fontWeight: opts.bold ? 800 : 500, color: opts.color ?? INK } }, text)
  return h("div", {
    style: { display: "flex", flexDirection: "column", flex: 1, background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, marginRight: 12, borderTop: `5px solid ${c.accent}` },
  }, [
    h("div", { key: "hd", style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, [
      h("div", { key: "t", style: { display: "flex", flexDirection: "column" } }, [
        h("div", { key: "a", style: { display: "flex", fontSize: 16, fontWeight: 800, color: INK } }, c.title),
        h("div", { key: "b", style: { display: "flex", fontSize: 12, fontWeight: 700, color: SUB } }, "TIẾN ĐỘ CM1"),
      ]),
      h("div", { key: "p", style: { display: "flex", flexDirection: "column", alignItems: "flex-end" } }, [
        h("div", { key: "n", style: { display: "flex", fontSize: 30, fontWeight: 800, color: t?.fg ?? SUB } }, c.cm1PctPr == null ? "—" : `${c.cm1PctPr.toFixed(1)}%`),
        t ? h("div", { key: "bd", style: { display: "flex", fontSize: 11, fontWeight: 700, color: t.fg, background: t.bg, borderRadius: 10, padding: "2px 8px" } }, c.cm1PctPr! >= 100 ? "Đạt" : c.cm1PctPr! >= 85 ? "Gần đạt" : "Chậm tiến độ") : null,
      ]),
    ]),
    h("div", { key: "bar", style: { display: "flex", position: "relative", height: 12, background: "#f1f5f9", borderRadius: 6, marginTop: 12, marginBottom: 6 } }, [
      h("div", { key: "pr", style: { display: "flex", position: "absolute", left: 0, top: 0, height: 12, width: `${Math.min(Math.max(c.cm1PctPr ?? 0, 0), 100)}%`, background: c.accent, opacity: 0.3, borderRadius: 6 } }),
      h("div", { key: "ac", style: { display: "flex", position: "absolute", left: 0, top: 0, height: 12, width: `${Math.min(Math.max(c.cm1PctAct ?? 0, 0), 100)}%`, background: c.accent, borderRadius: 6 } }),
    ]),
    h("div", { key: "lg", style: { display: "flex", fontSize: 11, color: SUB, marginBottom: 8 } }, `Thực tế ${(c.cm1PctAct ?? 0).toFixed(1)}%  ·  Dự phóng ${(c.cm1PctPr ?? 0).toFixed(1)}%`),
    h("div", { key: "th", style: { display: "flex", borderBottom: `1px solid ${BORDER}`, paddingBottom: 4, marginBottom: 4 } }, [
      cell("", { w: 40 }), cell("ACTUAL", { w: 80, color: SUB, bold: true }), cell("PRO-RATA", { w: 80, color: SUB, bold: true }), cell("TARGET", { w: 80, color: SUB, bold: true }), cell("%", { w: 56, color: SUB, bold: true }),
    ]),
    ...c.rows.map((r, i) => h("div", { key: `r${i}`, style: { display: "flex", alignItems: "center", paddingTop: 3, paddingBottom: 3 } }, [
      cell(r.label, { w: 40, color: SUB, bold: true, align: "flex-start" }),
      cell(money(r.actual) + (r.actualSub ? ` (${r.actualSub})` : ""), { w: 80, bold: true }),
      cell(r.prorata == null ? "—" : money(r.prorata), { w: 80, color: "#1d4ed8" }),
      cell(r.target > 0 ? (r.targetSub ?? money(r.target)) : "—", { w: 80, color: SUB }),
      r.pct == null ? cell("—", { w: 56, color: SUB }) : h("div", { style: { display: "flex", width: 56, justifyContent: "flex-end" } }, h("div", { style: { display: "flex", fontSize: 12, fontWeight: 800, color: tone(r.pct).fg, background: tone(r.pct).bg, borderRadius: 6, padding: "1px 5px" } }, `${r.pct.toFixed(1)}%`)),
    ])),
  ])
}

export async function renderProgressCards(cards: ProgressCard[]): Promise<Buffer> {
  const height = 330
  const el = h("div", { style: { display: "flex", width: CARD_W, height, padding: 4, background: "#f8fafc", fontFamily: "sans-serif" } }, cards.map((c, i) => h("div", { key: i, style: { display: "flex", flex: 1 } }, progressCard(c))))
  return renderPng(el, CARD_W, height)
}
