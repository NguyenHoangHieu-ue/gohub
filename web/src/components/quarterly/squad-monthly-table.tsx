"use client"

import { cn } from "@/lib/utils"
import { fc } from "@/lib/quarterly-format"

// Bảng "Performance theo tháng" của từng Squad: trái = thực tế quý đang xem (tháng đang chạy hiện Pro-rata),
// phải = target 3 tháng quý sau + %QoQ. Số liệu do route squad-progress trả (`monthly`, `next_targets`, `*_pr`).

type Metric = "rev" | "gp" | "cm1" | "hk3"
type Vals = Partial<Record<Metric, number>>

interface MonthlyRow {
  month: string
  status: "done" | "current"
  rev: number; gp: number; cm1: number; hk3: number
  rev_pr: number; gp_pr: number; cm1_pr: number; hk3_pr: number
}

interface SquadLike {
  name: string
  leader?: string
  monthly?: MonthlyRow[]
  revenue_pr: number; gp_pr: number; cm1_pr: number; hk3_pr: number
  next_targets?: { rev: number[]; gp: number[]; cm1: number[]; hk3rev: number[] }
}

interface Props {
  squads: SquadLike[]
  quarterLabel: string
  quarterMonths: string[]
  nextQuarter: { label: string; months: string[] }
  leaderName?: (username?: string) => string | undefined
}

const ROWS: { key: string; label: string; metric?: Metric; num?: Metric }[] = [
  { key: "rev",     label: "Revenue",       metric: "rev" },
  { key: "gp",      label: "GP",            metric: "gp" },
  { key: "gp_pct",  label: "GP%",           num: "gp" },
  { key: "cm1",     label: "CM1",           metric: "cm1" },
  { key: "cm1_pct", label: "CM1%",          num: "cm1" },
  { key: "hk3",     label: "3HK/Datapool",  metric: "hk3" },
  { key: "hk3_pct", label: "3HK%",          num: "hk3" },
]

// Độ rộng cột CỐ ĐỊNH — mọi squad dùng chung nên các bảng thẳng hàng nhau (và cùng bố cục bảng ở tab Performance).
const LABEL_W = 160, MONTH_W = 104, TOTAL_W = 120, GAP_W = 10, QOQ_W = 96
const monthNum = (m: string) => String(parseInt(m.split("-")[1], 10))
const ratio = (num?: number, den?: number) => (num != null && den != null && den > 0 ? (num / den) * 100 : undefined)
const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}`

export function SquadMonthlyTable({ squads, quarterLabel, quarterMonths, nextQuarter, leaderName }: Props) {
  if (!squads.length) return null

  const anyNotDone = squads.some(sq => quarterMonths.some(m => sq.monthly?.find(x => x.month === m)?.status !== "done"))

  const th = "px-2 py-2 text-center text-[11px] font-bold whitespace-nowrap"
  const valueCls = (v: number | undefined, isCm1: boolean) =>
    v == null ? "text-slate-300" : isCm1 && v < 0 ? "text-red-600" : "text-slate-800"

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <h3 className="text-base font-bold text-slate-900">Performance theo tháng — từng Squad</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {quarterLabel}: thực tế theo tháng{anyNotDone ? " (tháng đang chạy hiện Pro-rata)" : ""} · {nextQuarter.label}: target theo tháng và %QoQ
        </p>
      </div>

      <div className="divide-y divide-slate-200">
        {squads.map(sq => {
          const cur = quarterMonths.map(m => {
            const x = sq.monthly?.find(r => r.month === m)
            if (!x) return { state: "none" as const, vals: {} as Vals, actual: undefined as Vals | undefined }
            return {
              state: x.status,
              vals: { rev: x.rev_pr, gp: x.gp_pr, cm1: x.cm1_pr, hk3: x.hk3_pr } as Vals,
              actual: { rev: x.rev, gp: x.gp, cm1: x.cm1, hk3: x.hk3 } as Vals,
            }
          })
          const curTotal: Vals = { rev: sq.revenue_pr, gp: sq.gp_pr, cm1: sq.cm1_pr, hk3: sq.hk3_pr }

          const nt = sq.next_targets
          const nextMonths: Vals[] = [0, 1, 2].map(i => ({
            rev: nt?.rev?.[i] || undefined, gp: nt?.gp?.[i] || undefined,
            cm1: nt?.cm1?.[i] || undefined, hk3: nt?.hk3rev?.[i] || undefined,
          }))
          const sum = (k: Metric) => {
            const vs = nextMonths.map(v => v[k])
            return vs.some(v => v != null) ? vs.reduce<number>((s, v) => s + (v ?? 0), 0) : undefined
          }
          const nextTotal: Vals = { rev: sum("rev"), gp: sum("gp"), cm1: sum("cm1"), hk3: sum("hk3") }

          const cellOf = (row: typeof ROWS[number], v: Vals) =>
            row.metric ? v[row.metric] : ratio(v[row.num!], v.rev)
          const fmt = (row: typeof ROWS[number], x: number | undefined) =>
            x == null ? "—" : row.metric ? fc(x) : `${x.toFixed(1)}%`

          const leader = leaderName?.(sq.leader)

          return (
            <div key={sq.name} className="overflow-x-auto">
              <table className="w-full border-collapse text-xs table-fixed" style={{ minWidth: LABEL_W + MONTH_W * 6 + TOTAL_W * 2 + GAP_W + QOQ_W }}>
                <colgroup>
                  <col style={{ width: LABEL_W }} />
                  {[0, 1, 2].map(i => <col key={`a${i}`} style={{ width: MONTH_W }} />)}
                  <col style={{ width: TOTAL_W }} />
                  <col style={{ width: GAP_W }} />
                  {[0, 1, 2].map(i => <col key={`b${i}`} style={{ width: MONTH_W }} />)}
                  <col style={{ width: TOTAL_W }} />
                  <col style={{ width: QOQ_W }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="sticky left-0 z-10 bg-amber-50 px-4 py-2 text-left text-[12px] font-bold text-slate-900 truncate">
                      {sq.name}
                      {leader && <span className="ml-2 text-[10px] font-medium text-slate-500">{leader}</span>}
                    </th>
                    {quarterMonths.map((m, i) => (
                      <th key={m} className={cn(th, "bg-amber-50 text-slate-700")}>
                        {monthNum(m)}
                        {cur[i].state === "current" && <span className="ml-1 text-[9px] font-semibold text-blue-600">(pro-rata)</span>}
                      </th>
                    ))}
                    <th className={cn(th, "bg-[#0f4c81]/10 text-[#0f4c81]")}>{quarterLabel}{anyNotDone ? " (PR)" : ""}</th>
                    <th className="w-3 bg-slate-100" aria-hidden />
                    {nextQuarter.months.map(m => (
                      <th key={m} className={cn(th, "bg-amber-50 text-slate-700")}>
                        {monthNum(m)} <span className="text-[9px] font-semibold text-amber-600">(target)</span>
                      </th>
                    ))}
                    <th className={cn(th, "bg-[#0f4c81]/10 text-[#0f4c81]")}>{nextQuarter.label}</th>
                    <th className={cn(th, "bg-[#0f4c81]/10 text-[#0f4c81]")}>Target +%QoQ</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(row => {
                    const isPct = !row.metric
                    const isCm1 = row.metric === "cm1" || row.num === "cm1"
                    const totalCur = cellOf(row, curTotal)
                    const totalNext = cellOf(row, nextTotal)
                    let qoq: string | null = null
                    let qoqUp: boolean | null = null
                    if (totalCur != null && totalNext != null) {
                      if (totalCur !== 0) { const d = ((totalNext - totalCur) / Math.abs(totalCur)) * 100; qoq = `${signed(d)}%`; qoqUp = d >= 0 }
                    }
                    return (
                      <tr key={row.key} className={cn("border-b border-slate-100", isPct ? "h-8 bg-slate-50/60" : "h-11")}>
                        <td className={cn("sticky left-0 z-10 px-4 py-2 font-semibold whitespace-nowrap bg-blue-50",
                          isPct ? "text-slate-500 pl-7 font-medium" : "text-slate-800")}>
                          {row.label}
                        </td>
                        {cur.map((c, i) => {
                          const v = c.state === "none" ? undefined : cellOf(row, c.vals)
                          const act = c.state === "current" && c.actual && row.metric ? c.actual[row.metric] : undefined
                          return (
                            <td key={i} className={cn("px-2 py-2 text-right tabular-nums whitespace-nowrap",
                              isPct ? "text-slate-500 text-[11px]" : valueCls(v, isCm1))}
                              title={c.state === "none" ? "Tháng chưa bắt đầu" : undefined}>
                              {fmt(row, v)}
                              {act != null && <div className="text-[9px] font-normal text-slate-400">TT {fc(act)}</div>}
                            </td>
                          )
                        })}
                        <td className={cn("px-2 py-2 text-right tabular-nums whitespace-nowrap font-bold bg-[#0f4c81]/5",
                          totalCur == null ? "text-slate-300" : isPct ? "text-slate-600 text-[11px]" : valueCls(totalCur, isCm1))}>
                          {fmt(row, totalCur)}
                        </td>
                        <td className="w-3 bg-slate-100" aria-hidden />
                        {nextMonths.map((v, i) => (
                          <td key={i} className={cn("px-2 py-2 text-right tabular-nums whitespace-nowrap",
                            isPct ? "text-slate-500 text-[11px]" : valueCls(cellOf(row, v), isCm1))}>
                            {fmt(row, cellOf(row, v))}
                          </td>
                        ))}
                        <td className={cn("px-2 py-2 text-right tabular-nums whitespace-nowrap font-bold bg-[#0f4c81]/5",
                          totalNext == null ? "text-slate-300" : isPct ? "text-slate-600 text-[11px]" : valueCls(totalNext, isCm1))}>
                          {fmt(row, totalNext)}
                        </td>
                        <td className={cn("px-2 py-2 text-right tabular-nums whitespace-nowrap font-bold bg-[#0f4c81]/5",
                          qoqUp == null ? "text-slate-300" : qoqUp ? "text-emerald-600" : "text-red-500")}>
                          {qoq ?? "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>

      <p className="px-5 py-2 text-[10px] text-slate-400 border-t border-slate-100">
        CM1 = GP − chi phí KH − group cost B2B (phân bổ theo tỷ trọng doanh thu quý). Cột {quarterLabel} = tổng Pro-rata cả quý, khớp thẻ Squad Progress.
        Target {nextQuarter.label} nhập ở nút <b className="text-slate-500">Target Squad</b> (admin/creator); %QoQ = (target − {quarterLabel}) / |{quarterLabel}|, tính tương đối cả với dòng %.
      </p>
    </div>
  )
}
