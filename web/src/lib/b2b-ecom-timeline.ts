// VN Ecom theo thời gian (Tháng / Tuần / Quý) — logic THUẦN dùng bởi api/analytics/b2b/ecom-timeline.
// SQL chỉ trả số theo NGÀY × (KH, loại SIM, người tạo đơn); mọi cách gom kỳ + chiếu (Est.) + CH.Cost pro-rata
// nằm ở đây để test được và để 3 chế độ xem dùng chung 1 công thức.
import { getDaysInMonth } from "@/lib/analytics-engine/date-math"
import { calcChCostForPeriod, type CostRecord } from "@/lib/analytics-engine/cost-engine"

// Gohub/Nobrand theo người tạo đơn (Hiếu chốt 2026-09-22) — dùng chung với ecom-breakdown.
export const SHOP_STAFF: Record<string, "Gohub" | "Nobrand"> = {
  "HUỲNH LÊ MINH": "Gohub",
  "KIEU ANH": "Nobrand",
}

export type Granularity = "month" | "week" | "quarter"

export interface Period {
  key: string
  label: string
  sub: string
  start: string
  end: string
  days: number
  elapsed: number
  isCurrent: boolean
  projected: boolean
  factor: number
}

// Ngưỡng ngày tối thiểu để chiếu kỳ đang chạy (tránh factor quá lớn đầu kỳ → số nhảy). Tuần ngắn nên ngưỡng thấp hơn.
const MIN_PROJECT_DAYS: Record<Granularity, number> = { month: 7, quarter: 7, week: 3 }

const pad2 = (n: number) => String(n).padStart(2, "0")
const toOrd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000) }
const fromOrd = (o: number) => { const dt = new Date(o * 86400000); return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}` }
const monthStr = (y: number, m: number) => `${y}-${pad2(m)}`
const lastDay = (y: number, m: number) => fromOrd(toOrd(`${monthStr(y, m)}-01`) + getDaysInMonth(monthStr(y, m)) - 1)

function makePeriod(g: Granularity, key: string, label: string, sub: string, start: string, end: string, asOf: string): Period | null {
  if (start > asOf) return null // kỳ chưa bắt đầu
  const days = toOrd(end) - toOrd(start) + 1
  const elapsed = Math.min(toOrd(end), toOrd(asOf)) - toOrd(start) + 1
  const isCurrent = end > asOf
  const projected = isCurrent && elapsed >= MIN_PROJECT_DAYS[g] && elapsed < days
  return { key, label, sub, start, end, days, elapsed, isCurrent, projected, factor: projected ? days / elapsed : 1 }
}

/** Các kỳ đã bắt đầu (tính đến `asOf` = hôm qua). Tuần = Thứ 2–CN cắt theo tháng `month` (1–12). */
export function buildPeriods(g: Granularity, year: number, month: number, asOf: string): Period[] {
  const out: (Period | null)[] = []
  if (g === "month") {
    for (let m = 1; m <= 12; m++) out.push(makePeriod(g, monthStr(year, m), `T${m}`, String(year), `${monthStr(year, m)}-01`, lastDay(year, m), asOf))
  } else if (g === "quarter") {
    for (let q = 1; q <= 4; q++) {
      const m1 = q * 3 - 2
      out.push(makePeriod(g, `${year}-Q${q}`, `Q${q}`, `T${m1}–T${m1 + 2}`, `${monthStr(year, m1)}-01`, lastDay(year, m1 + 2), asOf))
    }
  } else {
    const endOrd = toOrd(lastDay(year, month))
    let cur = toOrd(`${monthStr(year, month)}-01`)
    let idx = 1
    while (cur <= endOrd) {
      const dow = (new Date(cur * 86400000).getUTCDay() + 6) % 7 // Mon=0
      const end = Math.min(endOrd, cur + (6 - dow))
      const s = fromOrd(cur), e = fromOrd(end)
      const sub = s === e ? `${s.slice(8)}/${pad2(month)}` : `${s.slice(8)}–${e.slice(8)}/${pad2(month)}`
      out.push(makePeriod(g, `${monthStr(year, month)}-W${idx}`, `W${idx}`, sub, s, e, asOf))
      cur = end + 1; idx++
    }
  }
  return out.filter((p): p is Period => p !== null)
}

/** Khoảng ngày cần query để phủ mọi kỳ (cắt ở `asOf` vì chưa có dữ liệu sau đó). null nếu chưa kỳ nào bắt đầu. */
export function periodsRange(periods: Period[], asOf: string): { start: string; end: string } | null {
  if (periods.length === 0) return null
  const last = periods[periods.length - 1]
  return { start: periods[0].start, end: last.end < asOf ? last.end : asOf }
}

export interface DayRow {
  customer_name: string
  sim_type: string | null
  staff_name: string | null
  d: string
  revenue: string
  margin: string
  units: string
  orders: string
}

export interface Metric { revenue: number; margin: number; units: number; orders: number; chCost: number; cm1: number }
export interface PeriodMetric extends Metric { est: Metric }
export interface TimelineRow {
  id: string
  level: 0 | 1 | 2
  name: string
  customer: string
  shop: string
  subshop: string
  metrics: PeriodMetric[]
  total: PeriodMetric
}

const zero = (): Metric => ({ revenue: 0, margin: 0, units: 0, orders: 0, chCost: 0, cm1: 0 })
const scale = (m: Metric, f: number): Metric => ({
  revenue: m.revenue * f, margin: m.margin * f, units: m.units * f, orders: m.orders * f, chCost: m.chCost * f, cm1: m.cm1 * f,
})
const addInto = (a: Metric, b: Metric) => {
  a.revenue += b.revenue; a.margin += b.margin; a.units += b.units; a.orders += b.orders; a.chCost += b.chCost; a.cm1 += b.cm1
}
const withEst = (m: Metric, p: Period): PeriodMetric => ({ ...m, est: p.projected ? scale(m, p.factor) : { ...m } })

type Day = { revenue: number; margin: number; units: number; orders: number }
interface Node { level: 0 | 1 | 2; customer: string; shop: string; subshop: string; days: Map<string, Day> }

export type CostLookup = (month: string, customer: string, shop: string, subshop: string) => CostRecord | undefined

export function buildTimeline(rows: DayRow[], periods: Period[], asOf: string, getCost: CostLookup) {
  const nodes = new Map<string, Node>()
  const touch = (customer: string, shop: string, subshop: string, level: 0 | 1 | 2, r: DayRow) => {
    const id = `${customer}::${shop}::${subshop}`
    let n = nodes.get(id)
    if (!n) { n = { level, customer, shop, subshop, days: new Map() }; nodes.set(id, n) }
    const day = n.days.get(r.d) ?? { revenue: 0, margin: 0, units: 0, orders: 0 }
    day.revenue += parseFloat(r.revenue || "0")
    day.margin += parseFloat(r.margin || "0")
    day.units += parseFloat(r.units || "0")
    day.orders += parseInt(r.orders || "0", 10)
    n.days.set(r.d, day)
  }

  for (const r of rows) {
    const shop = r.sim_type === "eSIM" ? "eSIM" : r.sim_type === "SIM" ? "SIM" : "Khác"
    touch(r.customer_name, "", "", 0, r)
    touch(r.customer_name, shop, "", 1, r)
    if (r.customer_name === "VN Ecom Shopee" && shop === "SIM") {
      touch(r.customer_name, shop, SHOP_STAFF[(r.staff_name || "").trim().toUpperCase()] || "Khác", 2, r)
    }
  }

  const measure = (n: Node): { metrics: PeriodMetric[]; total: PeriodMetric } => {
    const metrics = periods.map(p => {
      const m = zero()
      const monthRev = new Map<string, number>()
      n.days.forEach((v, d) => {
        if (d < p.start || d > p.end) return
        m.revenue += v.revenue; m.margin += v.margin; m.units += v.units; m.orders += v.orders
        const mo = d.slice(0, 7)
        monthRev.set(mo, (monthRev.get(mo) ?? 0) + v.revenue)
      })
      // CH.Cost pro-rata theo số ngày của kỳ nằm trong từng tháng (amount × ngày/dim; percent × doanh thu tháng đó).
      // Chỉ tính tháng có phát sinh dòng bán hàng — giống ecom-breakdown (khớp số bảng cũ).
      monthRev.forEach((rev, mo) => {
        const rec = getCost(mo, n.customer, n.shop, n.subshop)
        if (!rec) return
        const [y, mm] = mo.split("-").map(Number)
        const segStart = Math.max(toOrd(p.start), toOrd(`${mo}-01`))
        const segEnd = Math.min(toOrd(p.end), toOrd(asOf), toOrd(lastDay(y, mm)))
        const dayRatio = segEnd >= segStart ? (segEnd - segStart + 1) / getDaysInMonth(mo) : 0
        m.chCost += calcChCostForPeriod(rec, rev, dayRatio)
      })
      m.cm1 = m.margin - m.chCost
      return withEst(m, p)
    })
    const actual = zero(), est = zero()
    metrics.forEach(pm => { addInto(actual, pm); addInto(est, pm.est) })
    return { metrics, total: { ...actual, est } }
  }

  const sortKey = (n: Node) => { let s = 0; n.days.forEach(v => { s += v.revenue }); return s }
  const all = [...nodes.values()]
  const byRev = (a: Node, b: Node) => sortKey(b) - sortKey(a)
  const custs = all.filter(n => n.level === 0).sort(byRev)
  const out: TimelineRow[] = []
  const push = (n: Node, name: string) => out.push({
    id: `${n.customer}::${n.shop}::${n.subshop}`, level: n.level, name,
    customer: n.customer, shop: n.shop, subshop: n.subshop, ...measure(n),
  })
  for (const c of custs) {
    push(c, c.customer)
    const shops = all.filter(n => n.level === 1 && n.customer === c.customer).sort(byRev)
    for (const s of shops) {
      push(s, s.shop)
      all.filter(n => n.level === 2 && n.customer === c.customer && n.shop === s.shop).sort(byRev).forEach(sub => push(sub, sub.subshop))
    }
  }

  const totalMetrics = periods.map((p, i) => {
    const m = zero(), e = zero()
    out.filter(r => r.level === 0).forEach(r => { addInto(m, r.metrics[i]); addInto(e, r.metrics[i].est) })
    return { ...m, est: e }
  })
  const tActual = zero(), tEst = zero()
  totalMetrics.forEach(pm => { addInto(tActual, pm); addInto(tEst, pm.est) })
  return { rows: out, totals: { metrics: totalMetrics, total: { ...tActual, est: tEst } as PeriodMetric } }
}
