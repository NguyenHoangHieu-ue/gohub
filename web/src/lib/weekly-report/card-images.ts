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
