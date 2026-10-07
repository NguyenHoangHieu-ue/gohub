// "Đánh giá hôm nay" của My Metrics (M4, plan my-metrics-plan-quy.md): KPI so mục tiêu + nhịp tới hôm nay, việc kế hoạch chậm/quá hạn,
// cảnh báo thị trường/SKU, thread Lark chưa chốt. Logic thuần (không I/O) — dùng chung khối trên trang và Lark DM 8:30.
import { OTHER_MARKET, type MarketData } from "@/lib/market-breakdown"
import { WEIGHTS, type OkrTargets } from "@/lib/my-metrics-types"
import type { PlanStatus } from "@/lib/okr-plan"

export type KpiStatus = "ok" | "watch" | "behind" | "no_data"
export interface KpiReview { key: string; label: string; value: number | null; target: number; ach: number; status: KpiStatus; text: string }

const clamp = (x: number) => Math.max(0, Math.min(100, x))
const achUp = (a: number, t: number) => t > 0 ? clamp(a / t * 100) : 0
const achDown = (a: number | null, t: number) => a == null || t <= 0 ? 0 : clamp(100 - (a - t) / t * 100)
const n1 = (x: number) => Number.isInteger(x) ? String(x) : x.toFixed(1)

export interface KpiValues { sla: number | null; vendor: number | null; skuDelta: number | null; datapool: number; begau: number }

/** `elapsed` = phần quý đã qua (0–1) tính tới ngày dữ liệu. Công thức điểm giống hệt trang My Metrics (WEIGHTS, ach*). */
export function reviewKpis(v: KpiValues, t: OkrTargets, elapsed: number): { kpis: KpiReview[]; score: number } {
  const down = (key: string, label: string, val: number | null, target: number, unit: string): KpiReview => {
    if (val == null) return { key, label, value: null, target, ach: 0, status: "no_data", text: `${label}: chưa có case đã xác nhận (mục tiêu ≤ ${n1(target)} ${unit})` }
    const status: KpiStatus = val <= target ? "ok" : val <= target * 1.2 ? "watch" : "behind"
    return { key, label, value: val, target, ach: achDown(val, target), status, text: `${label} TB ${n1(val)} ${unit} (mục tiêu ≤ ${n1(target)} ${unit})` }
  }
  const up = (key: string, label: string, val: number | null, target: number, unit: string): KpiReview => {
    if (val == null) return { key, label, value: null, target, ach: 0, status: "no_data", text: `${label}: chưa đo được` }
    const status: KpiStatus = val >= target ? "ok" : val >= target * 0.75 ? "watch" : "behind"
    return { key, label, value: val, target, ach: achUp(val, target), status, text: `${label} ${n1(val)}${unit} (mục tiêu ${n1(target)}${unit})` }
  }
  // Bé Gấu là số đếm cộng dồn → so với mức lẽ ra phải đạt tới hôm nay, nói rõ cần thêm bao nhiêu mỗi tuần.
  const expected = Math.round(t.begau * elapsed)
  const weeksLeft = Math.max(1, (1 - elapsed) * 13)
  const perWeek = Math.ceil(Math.max(0, t.begau - v.begau) / weeksLeft)
  const begau: KpiReview = {
    key: "begau", label: "Task Bé Gấu", value: v.begau, target: t.begau, ach: achUp(v.begau, t.begau),
    status: v.begau >= t.begau ? "ok" : v.begau >= expected ? "ok" : v.begau >= expected * 0.8 ? "watch" : "behind",
    text: `Task Bé Gấu ${v.begau}/${t.begau} — lẽ ra ~${expected} tới hôm nay${v.begau < t.begau ? `, cần ~${perWeek} task/tuần để kịp` : ""}`,
  }
  const kpis = [
    down("sla", "SLA xử lý yêu cầu", v.sla, t.sla_hours, "giờ"),
    down("vendor_speed", "Tốc độ so giá vendor", v.vendor, t.vendor_speed, "phút"),
    up("sku_gm", "SKU GM delta", v.skuDelta, t.gm_delta, "%"),
    up("hk3", "%Datapool", v.datapool, t.hk3_pct, "%"),
    begau,
  ]
  const w: Record<string, number> = { sla: WEIGHTS.sla, vendor_speed: WEIGHTS.vendor_speed, sku_gm: WEIGHTS.sku_gm, hk3: WEIGHTS.hk3, begau: WEIGHTS.begau }
  const score = kpis.reduce((s, k) => s + k.ach * w[k.key], 0) / 100
  return { kpis, score: +score.toFixed(1) }
}

const daysInMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate() }
const pct = (x: number) => `${x.toFixed(0)}%`

/** Cảnh báo tự động từ doanh thu theo SKU × tháng: thị trường top 10 tụt doanh thu/ngày, SKU bán nhiều tụt biên lãi. */
export function marketAlerts(data: MarketData, today: string): string[] {
  const month = today.slice(0, 7)
  const mi = data.months.indexOf(month)
  if (mi <= 0) return []
  const prevMonth = data.months[mi - 1]
  const day = Number(today.slice(8, 10))
  if (day < 7) return []                                   // đầu tháng quá ít ngày → nhịp chưa đáng tin
  const out: string[] = []

  const mk = new Map<string, { cur: number; prev: number }>()
  const sku = new Map<number, { rev: number; gp: number; revP: number; gpP: number }>()
  for (const [si, m, rev, gp] of data.cells) {
    if (m !== mi && m !== mi - 1) continue
    const c = data.skus[si].country
    if (c !== OTHER_MARKET) {
      const a = mk.get(c) ?? { cur: 0, prev: 0 }
      if (m === mi) a.cur += rev; else a.prev += rev
      mk.set(c, a)
    }
    const s = sku.get(si) ?? { rev: 0, gp: 0, revP: 0, gpP: 0 }
    if (m === mi) { s.rev += rev; s.gp += gp } else { s.revP += rev; s.gpP += gp }
    sku.set(si, s)
  }
  const dPrev = daysInMonth(prevMonth)
  ;[...mk.entries()].sort((a, b) => b[1].prev - a[1].prev).slice(0, 10).forEach(([c, a]) => {
    if (a.prev <= 0) return
    const change = (a.cur / day) / (a.prev / dPrev) * 100 - 100
    if (change <= -20) out.push(`${c}: doanh thu mỗi ngày tháng này giảm ${pct(-change)} so với tháng trước`)
  })
  ;[...sku.entries()].filter(([, s]) => s.rev >= 5e6 && s.revP > 0).sort((a, b) => b[1].rev - a[1].rev).slice(0, 30)
    .map(([si, s]) => ({ sku: data.skus[si], gm: s.gp / s.rev * 100, gmP: s.gpP / s.revP * 100 }))
    .filter(x => x.gmP - x.gm >= 5).slice(0, 5)
    .forEach(x => out.push(`SKU ${x.sku.sku} (${x.sku.country}, ${x.sku.vendor}): biên lãi ${x.gm.toFixed(1)}% — tháng trước ${x.gmP.toFixed(1)}%`))
  return out
}

export interface PlanIssue { title: string; status: PlanStatus; message: string }

export interface DailyReview {
  quarter: string; today: string; elapsed: number; dayOfQuarter: number; quarterDays: number
  score: number; kpis: KpiReview[]
  plan: { total: number; done: number; issues: PlanIssue[] }
  alerts: string[]
  lark: { open: number; yesNoTyping: number; monthEnd: boolean; lines: string[] }
  pendingQuotes: number | null
  targetNote: string | null
}

const ICON: Record<KpiStatus, string> = { ok: "✅", watch: "🟡", behind: "🔴", no_data: "⚪" }

/** Nội dung Lark DM 8:30 — ngắn, mỗi ý 1 dòng, link về trang. */
export function reviewText(r: DailyReview, link: string): string {
  const lines: string[] = [
    `📊 Đánh giá My Metrics ${r.today.slice(8, 10)}/${r.today.slice(5, 7)} — ${r.quarter} (ngày ${r.dayOfQuarter}/${r.quarterDays})`,
    `Điểm OKR hiện tại: ${r.score.toFixed(1)}%${r.targetNote ? ` (${r.targetNote})` : ""}`,
    ...r.kpis.map(k => `${ICON[k.status]} ${k.text}`),
  ]
  if (r.plan.total) {
    lines.push("", `📝 Kế hoạch quý: ${r.plan.done}/${r.plan.total} việc đã xong`)
    r.plan.issues.slice(0, 6).forEach(i => lines.push(`• ${i.status === "overdue" ? "Quá hạn" : "Chậm"}: ${i.title} — ${i.message}`))
  } else lines.push("", "📝 Kế hoạch quý chưa có việc nào — vào tab Kế hoạch quý xem đề xuất của hệ thống.")
  if (r.alerts.length) { lines.push("", "⚠️ Cảnh báo:"); r.alerts.slice(0, 8).forEach(a => lines.push(`• ${a}`)) }
  if (r.pendingQuotes) lines.push("", `📥 ${r.pendingQuotes} báo giá vendor đang chờ quyết (tab Thị trường & Báo giá).`)
  if (r.lark.open) {
    lines.push("", `💬 Lark: ${r.lark.open} thread được tag tháng này chưa chốt${r.lark.yesNoTyping ? ` (${r.lark.yesNoTyping} đã YES, chưa Typing)` : ""}.`)
    if (r.lark.monthEnd) { lines.push("Gần hết tháng — các thread cần chốt:"); r.lark.lines.slice(0, 15).forEach((l, i) => lines.push(`${i + 1}. ${l}`)) }
  }
  lines.push("", link)
  return lines.join("\n")
}
