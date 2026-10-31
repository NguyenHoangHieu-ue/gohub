import { rq } from "./client"
import { b2bFilterSql } from "./filters"
import { diffRows } from "./quarter"

// Bản rollup của ba truy vấn trong /api/analytics/b2b/trend (tổng theo ngày/tuần/tháng, các nhóm-tháng có dữ liệu, doanh thu theo khách × nhóm). Một truy vấn rollup (nhóm × khách × tháng) đủ dựng cả ba.
export type TrendGranularity = "day" | "week" | "month"
export interface TrendArgs { basis: "ful" | "sal"; start: string; end: string; granularity: TrendGranularity; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }
export interface TrendTriple { result: Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
   groupGrouped: Record<string, string>[]; custGrouped: Record<string, string>[] }

// Tuần của Postgres DATE_TRUNC('week') bắt đầu thứ Hai.
const BUCKET: Record<TrendGranularity, string> = {
  day: "r.day",
  week: "date(r.day, '-' || ((CAST(strftime('%w', r.day) AS INTEGER) + 6) % 7) || ' days')",
  month: "substr(r.day, 1, 7)",
}

export async function fetchTrendRollup(a: TrendArgs): Promise<TrendTriple> {
  const f = b2bFilterSql({ includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, inactive: true, excludedCustomers: a.excludedCustomers })
  const rows = await rq(`SELECT ${BUCKET[a.granularity]} AS bucket, r.customer AS customer_code, substr(r.day, 1, 7) AS month, SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS margin
    FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer
    WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2B'${f} GROUP BY 1, 2, 3`, [a.basis, a.start, a.end])
  const byBucket = new Map<string, { revenue: number; margin: number; months: Set<string> }>()
  const gg = new Set<string>()
  const custGrouped: Record<string, string>[] = []
  for (const r of rows) {
    const b = String(r.bucket), m = String(r.month)
    let o = byBucket.get(b)
    if (!o) { o = { revenue: 0, margin: 0, months: new Set() }; byBucket.set(b, o) }
    o.revenue += Number(r.revenue ?? 0); o.margin += Number(r.margin ?? 0); o.months.add(m)
    gg.add(`${b}|${m}`)
    custGrouped.push({ group_date: b, customer_code: String(r.customer_code ?? ""), revenue: String(Number(r.revenue ?? 0)), month: m })
  }
  return {
    result: [...byBucket.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([name, o]) => ({ name, revenue: String(o.revenue), margin: String(o.margin), months: [...o.months].sort() })),
    groupGrouped: [...gg].map(k => { const [group_date, month] = k.split("|"); return { group_date, group_name: "B2B", month } }),
    custGrouped,
  }
}

export function diffTrend(raw: TrendTriple, ru: TrendTriple) {
  const q1 = diffRows(raw.result as Record<string, string>[], ru.result as Record<string, string>[], r => String(r.name), ["revenue", "margin"])
  const rm = new Map(ru.result.map(r => [String(r.name), (r.months as string[]).slice().sort().join(",")] as const))
  let monthsMismatch = 0
  for (const r of raw.result) if (rm.has(String(r.name)) && rm.get(String(r.name)) !== ((r.months as string[]) ?? []).slice().sort().join(",")) monthsMismatch++
  const key2 = (r: Record<string, string>) => `${r.group_date}|${r.month}`
  const a2 = new Set(raw.groupGrouped.map(key2)), b2 = new Set(ru.groupGrouped.map(key2))
  const only2 = [...a2].filter(k => !b2.has(k)).length + [...b2].filter(k => !a2.has(k)).length
  const q3 = diffRows(raw.custGrouped, ru.custGrouped, r => `${r.group_date}|${r.customer_code}|${r.month}`, ["revenue"])
  return { ok: q1.ok && !monthsMismatch && !only2 && q3.ok, q1, monthsMismatch, only2, q3 }
}
