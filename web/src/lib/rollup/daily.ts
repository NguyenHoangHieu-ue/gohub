import { rq } from "./client"
import { custFilterSql, type RollupFilter } from "./filters"

// Bản rollup của /api/analytics/quarterly-daily: doanh thu theo NGÀY của một khoảng, nhóm B2B + B2C, cùng bộ lọc loại trừ với quarterly-report.
export interface DailyRow { d: string; rev: number }
export async function fetchDailyRollup(a: RollupFilter & { start: string; end: string }): Promise<DailyRow[]> {
  const rows = await rq(`SELECT r.day AS d, SUM(r.revenue_vnd) AS rev FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source
    WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, 'OTHER')) IN ('B2B', 'B2C')${custFilterSql(a)} GROUP BY 1 ORDER BY 1`, [a.start, a.end])
  return rows.map(r => ({ d: String(r.d), rev: Number(r.rev) || 0 }))
}
export function diffDaily(raw: DailyRow[], ru: DailyRow[]): { ok: boolean; rawDays: number; ruDays: number; mismatches: string[] } {
  const b = new Map(ru.map(r => [r.d, r.rev] as const)), mism: string[] = []
  for (const r of raw) { const o = b.get(r.d) ?? 0; if (Math.abs(o - r.rev) > Math.max(0.5, Math.abs(r.rev) * 1e-9)) mism.push(`${r.d}: thô ${r.rev} ≠ rollup ${o}`) }
  for (const r of ru) if (!raw.some(x => x.d === r.d) && Math.abs(r.rev) > 0.5) mism.push(`${r.d}: chỉ rollup ${r.rev}`)
  return { ok: !mism.length, rawDays: raw.length, ruDays: ru.length, mismatches: mism.slice(0, 5) }
}
