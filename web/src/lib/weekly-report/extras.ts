// Weekly Report — số liệu thêm theo mẫu "Company Weekly Performance" mới (s245): tiến độ QUÝ (Revenue/CM1/3HK vs target quý)
// và phân tích B2B theo Tier → Organization. Tái dùng ĐÚNG số của Quarter Report bằng cách gọi nội bộ 2 route
// `quarterly-report` + `quarterly-b2b-customers` (xác thực Bearer CRON_SECRET như kpi-watch) — KHÔNG viết lại công thức.
import { tursoQuery } from "@/lib/turso"

async function getJson<T>(origin: string, path: string): Promise<T> {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error("thiếu CRON_SECRET")
  const res = await fetch(origin + path, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`${path.split("?")[0]} HTTP ${res.status}`)
  return (await res.json()) as T
}

// ── Tiến độ quý ──────────────────────────────────────────────────────────────
export interface QuarterSeg {
  revRaw: number; revPr: number; revTarget: number
  cm1Raw: number; cm1Pr: number; cm1Target: number
  thkAct: number; thkPr: number; thkPctAct: number; thkTargetPct: number; thkTargetRev: number
}
export interface QuarterProgress {
  label: string; prevLabel: string
  b2b: QuarterSeg; b2c: QuarterSeg; total: QuarterSeg
  prevRev: number; prevCm1: number
  prevB2bCm1: number; prevB2cCm1: number
}

interface MonthStat { revenue?: number; actualRevenue?: number; cm1?: number; actualCm1?: number; actualHk3?: number }
interface MonthSummaryIn { elapsed: number; dim: number; b2b: MonthStat; b2c: MonthStat }
interface QuarterReportIn {
  summary?: MonthSummaryIn[]; quarter_days?: number
  prevQuarterTotals?: { b2bRevenue: number; b2bCm1: number; b2cRevenue: number; b2cCm1: number }
}

/** Thuần: dựng tiến độ quý từ response quarterly-report + target quý — cùng công thức trang Quarter Report (kpiPrFactor, futureScale). */
export function computeQuarterProgress(
  report: QuarterReportIn,
  tg: { b2bRev: number; b2bCm1: number; b2bThk: number; b2cRev: number; b2cCm1: number; b2cThk: number },
  label: string, prevLabel: string,
): QuarterProgress {
  const summary = report.summary ?? []
  const kpiPrFactor = (m: MonthSummaryIn) => (m.elapsed > 0 && m.elapsed < m.dim ? m.dim / m.elapsed : 1)
  const existingDays = summary.reduce((s, m) => s + m.dim, 0)
  const futureScale = existingDays > 0 ? (report.quarter_days ?? existingDays) / existingDays : 1
  const seg = (k: "b2b" | "b2c", revTarget: number, cm1Target: number, thkTargetPct: number): QuarterSeg => {
    const revRaw = summary.reduce((s, m) => s + (m[k].actualRevenue ?? m[k].revenue ?? 0), 0)
    const cm1Raw = summary.reduce((s, m) => s + (m[k].actualCm1 ?? m[k].cm1 ?? 0), 0)
    const revPr = Math.round(summary.reduce((s, m) => s + (m[k].actualRevenue ?? m[k].revenue ?? 0) * kpiPrFactor(m), 0) * futureScale)
    const cm1Pr = Math.round(summary.reduce((s, m) => s + (m[k].actualCm1 ?? m[k].cm1 ?? 0) * kpiPrFactor(m), 0) * futureScale)
    const thkAct = summary.reduce((s, m) => s + (m[k].actualHk3 ?? 0), 0)
    return {
      revRaw, revPr, revTarget, cm1Raw, cm1Pr, cm1Target,
      thkAct, thkPr: revRaw > 0 ? thkAct * (revPr / revRaw) : 0, thkPctAct: revRaw > 0 ? (thkAct / revRaw) * 100 : 0,
      thkTargetPct, thkTargetRev: revTarget * (thkTargetPct / 100),
    }
  }
  const b2b = seg("b2b", tg.b2bRev, tg.b2bCm1, tg.b2bThk)
  const b2c = seg("b2c", tg.b2cRev, tg.b2cCm1, tg.b2cThk)
  const thkTargetRev = b2b.thkTargetRev + b2c.thkTargetRev
  const totRevTarget = b2b.revTarget + b2c.revTarget
  const total: QuarterSeg = {
    revRaw: b2b.revRaw + b2c.revRaw, revPr: b2b.revPr + b2c.revPr, revTarget: totRevTarget,
    cm1Raw: b2b.cm1Raw + b2c.cm1Raw, cm1Pr: b2b.cm1Pr + b2c.cm1Pr, cm1Target: b2b.cm1Target + b2c.cm1Target,
    thkAct: b2b.thkAct + b2c.thkAct, thkPr: b2b.thkPr + b2c.thkPr,
    thkPctAct: b2b.revRaw + b2c.revRaw > 0 ? ((b2b.thkAct + b2c.thkAct) / (b2b.revRaw + b2c.revRaw)) * 100 : 0,
    thkTargetPct: totRevTarget > 0 ? (thkTargetRev / totRevTarget) * 100 : 0, thkTargetRev,
  }
  const p = report.prevQuarterTotals
  return {
    label, prevLabel, b2b, b2c, total,
    prevRev: (p?.b2bRevenue ?? 0) + (p?.b2cRevenue ?? 0), prevCm1: (p?.b2bCm1 ?? 0) + (p?.b2cCm1 ?? 0),
    prevB2bCm1: p?.b2bCm1 ?? 0, prevB2cCm1: p?.b2cCm1 ?? 0,
  }
}

export async function fetchQuarterProgress(origin: string, cutoffDate: string): Promise<QuarterProgress> {
  const year = Number(cutoffDate.slice(0, 4))
  const q = Math.floor((Number(cutoffDate.slice(5, 7)) - 1) / 3) + 1
  const prevQ = q === 1 ? 4 : q - 1
  const prevYear = q === 1 ? year - 1 : year
  const n = (v: unknown) => parseFloat(String(v ?? 0)) || 0
  const [report, rows] = await Promise.all([
    getJson<QuarterReportIn>(origin, `/api/analytics/quarterly-report?quarter=Q${q}&year=${year}&companyCode=ALL`),
    tursoQuery<{ channel: string; target_revenue: string | number; target_cm1: string | number; target_three_hk_pct: string | number }>(
      `SELECT channel, target_revenue, target_cm1, target_three_hk_pct FROM target_planning_quarter WHERE quarter = ?`, [`Q${q}-${year}`]),
  ])
  const b2b = rows.find(r => r.channel === "B2B"), b2c = rows.find(r => r.channel === "B2C")
  return computeQuarterProgress(report, {
    b2bRev: n(b2b?.target_revenue), b2bCm1: n(b2b?.target_cm1), b2bThk: n(b2b?.target_three_hk_pct),
    b2cRev: n(b2c?.target_revenue), b2cCm1: n(b2c?.target_cm1), b2cThk: n(b2c?.target_three_hk_pct),
  }, `Q${q}/${year}`, `Q${prevQ}/${prevYear}`)
}

// ── Phân tích B2B theo Tier → Organization ───────────────────────────────────
export interface OrgChild { name: string; prorata: number; prev: number; pct: number | null }
export interface OrgRow { name: string; mtd: number; prorata: number; prev: number; pct: number | null; children: OrgChild[] }
export interface TierAnalysis { tier: string; mtd: number; prorata: number; prev: number; pct: number | null; orgs: OrgRow[] }

interface CustIn {
  code: string; name: string; orgKey?: string; orgName?: string
  prevMonthRevenue?: number
  monthSummary?: Record<string, { revenue?: number; actualRevenue?: number }>
}
interface TierIn { tier: string; customers?: CustIn[] }

const pctOf = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : null)

/** Thuần: gom khách theo Tier → Organization; MTD = số thực tế tháng hiện tại, pro-rata = MTD × projFactor, prev = thực tế tháng trước. */
export function computeTierAnalysis(tiers: TierIn[], month: string, prevMonth: string, projFactor: number): TierAnalysis[] {
  const out: TierAnalysis[] = []
  for (const t of tiers) {
    const orgs = new Map<string, OrgRow>()
    for (const c of t.customers ?? []) {
      const cur = c.monthSummary?.[month]
      const mtd = cur?.actualRevenue ?? cur?.revenue ?? 0
      const prevInQuarter = c.monthSummary?.[prevMonth]
      const prev = prevInQuarter ? (prevInQuarter.actualRevenue ?? prevInQuarter.revenue ?? 0) : (c.prevMonthRevenue ?? 0)
      if (mtd === 0 && prev === 0) continue
      const key = c.orgKey || c.code
      const row = orgs.get(key) ?? { name: c.orgName || c.name || key, mtd: 0, prorata: 0, prev: 0, pct: null, children: [] }
      row.mtd += mtd; row.prev += prev
      row.children.push({ name: c.name || c.code, prorata: mtd * projFactor, prev, pct: pctOf(mtd * projFactor, prev) })
      orgs.set(key, row)
    }
    const list = [...orgs.values()].map(o => ({ ...o, prorata: o.mtd * projFactor, pct: pctOf(o.mtd * projFactor, o.prev), children: o.children.sort((a, b) => b.prorata - a.prorata) }))
      .sort((a, b) => Math.max(b.prorata, b.prev) - Math.max(a.prorata, a.prev))
    const mtd = list.reduce((s, o) => s + o.mtd, 0), prev = list.reduce((s, o) => s + o.prev, 0)
    out.push({ tier: t.tier, mtd, prorata: mtd * projFactor, prev, pct: pctOf(mtd * projFactor, prev), orgs: list })
  }
  return out
}

export async function fetchTierAnalysis(origin: string, cutoffDate: string, monthStart: string, projFactor: number): Promise<TierAnalysis[]> {
  const year = Number(cutoffDate.slice(0, 4))
  const q = Math.floor((Number(cutoffDate.slice(5, 7)) - 1) / 3) + 1
  const res = await getJson<{ tiers?: TierIn[] }>(origin, `/api/analytics/quarterly-b2b-customers?quarter=Q${q}&year=${year}&companyCode=ALL`)
  const month = monthStart.slice(0, 7)
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1))
  const prevMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  return computeTierAnalysis(res.tiers ?? [], month, prevMonth, projFactor)
}
