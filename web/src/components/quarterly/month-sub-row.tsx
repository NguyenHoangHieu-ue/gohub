// Tách từ quarterly/page.tsx (s183 Phase 5 — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
import { cn } from "@/lib/utils"
import { fc, pct, cm1Color } from "@/lib/quarterly-format"
import type { MonthStats } from "@/lib/quarterly-types"
import { MomBadge } from "./mom-badge"

// ─── Sub-row (B2B / B2C within a month) ──────────────────────────────────────
export function MonthSubRow({ label, stats, showPr = false, kpiFactor = 1, momRev, momCm1, qoqCm1 }: {
  label: string; stats: MonthStats; showPr?: boolean; kpiFactor?: number
  momRev?: number | null; momCm1?: number | null; qoqCm1?: number | null
}) {
  const actRev = stats.actualRevenue ?? stats.revenue
  const actGp  = stats.actualGp     ?? stats.gp
  const actCc  = stats.actualCc     ?? stats.channelCost
  const actGc  = stats.actualGc     ?? stats.groupCost
  const actCm1 = stats.actualCm1    ?? stats.cm1
  const prRev  = Math.round(actRev  * kpiFactor)
  const prCm1  = Math.round(actCm1  * kpiFactor)
  return (
    <tr className="border-b border-slate-100 bg-slate-50 text-[11px]">
      <td className="px-4 py-2 pl-9 text-slate-500 font-medium">↳ {label}</td>
      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{fc(actRev)}</td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-400">
        {showPr ? (
          <div className="flex flex-col items-end gap-0.5">
            {fc(prRev)}
            {momRev !== undefined && <MomBadge v={momRev ?? null} />}
          </div>
        ) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{fc(actGp)}</td>
      <td className="px-4 py-2 text-right text-slate-400">{pct(stats.gpPct)}</td>
      <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{actCc > 0 ? fc(actCc) : <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{actGc > 0 ? fc(actGc) : <span className="text-slate-300">—</span>}</td>
      <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", cm1Color(actCm1))}>{fc(actCm1)}</td>
      <td className={cn("px-4 py-2 text-right tabular-nums", cm1Color(prCm1))}>
        {showPr ? (
          <div className="flex flex-col items-end gap-0.5">
            {fc(prCm1)}
            {momCm1 !== undefined && <MomBadge v={momCm1 ?? null} />}
          </div>
        ) : <span className="text-slate-300">—</span>}
      </td>
      <td className={cn("px-4 py-2 text-right font-semibold", cm1Color(stats.cm1))}>{pct(stats.cm1Pct)}</td>
      <td className={cn("px-4 py-2 text-right text-[11px] font-bold tabular-nums",
        qoqCm1 == null ? "text-slate-300" : qoqCm1 >= 0 ? "text-green-600" : "text-red-500")}>
        {qoqCm1 != null ? `${qoqCm1 >= 0 ? "+" : ""}${qoqCm1.toFixed(1)}%` : "—"}
      </td>
      <td className="px-4 py-2 text-right text-slate-400 whitespace-nowrap">{fc((stats.hk3Rev as number | undefined) ?? 0)} <span className="text-[10px]">({pct((stats.hk3Pct as number | undefined) ?? 0)})</span></td>
    </tr>
  )
}
