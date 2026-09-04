// Tách từ quarterly/page.tsx (s183 Phase 5 — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
import { cn } from "@/lib/utils"
import { fc, pct } from "@/lib/quarterly-format"

// ─── Quarter target row ───────────────────────────────────────────────────────
// Layout: label | target_rev | Đạt PR (rev_pr/tgt) | Đạt TT (rev_act/tgt) | — | — | — | target_cm1 | Đạt PR (cm1_pr/tgt) | Đạt TT (cm1_act/tgt) | —
export function QtTargetRow({ label, targetRev, revPr, revAct, targetCm1, cm1Pr, cm1Act }:
  { label: string; targetRev: number; revPr: number; revAct: number; targetCm1: number; cm1Pr: number; cm1Act: number }) {
  const revPrPct  = targetRev > 0 ? revPr  / targetRev * 100 : 0
  const revActPct = targetRev > 0 ? revAct / targetRev * 100 : 0
  const cm1PrPct  = targetCm1 > 0 ? cm1Pr  / targetCm1 * 100 : 0
  const cm1ActPct = targetCm1 > 0 ? cm1Act / targetCm1 * 100 : 0
  const badge = (p: number) => (
    <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold",
      p >= 100 ? "bg-green-100 text-green-700" : p >= 75 ? "bg-blue-100 text-[#003B95]" : "bg-red-50 text-red-500")}>
      {pct(p)}
    </span>
  )
  return (
    <tr className="border-b border-dashed border-blue-100 bg-blue-50/20 text-[10px] text-slate-600">
      <td className="px-2 py-1.5 pl-6 italic text-slate-500">{label}</td>
      <td colSpan={3} className="px-2 py-1.5">
        <div className="flex items-center gap-1.5 justify-end flex-wrap">
          <span className="text-slate-500 tabular-nums">Rev: <b className="text-slate-700">{fc(targetRev)}</b></span>
          <span className="text-slate-400">PR {badge(revPrPct)}</span>
          <span className="text-slate-400">TT {badge(revActPct)}</span>
        </div>
      </td>
      <td className="px-2 py-1.5 text-right text-slate-300">—</td>
      <td className="px-2 py-1.5 text-right text-slate-300">—</td>
      <td className="px-2 py-1.5 text-right text-slate-300">—</td>
      <td colSpan={3} className="px-2 py-1.5">
        {targetCm1 > 0 ? (
          <div className="flex items-center gap-1.5 justify-end flex-wrap">
            <span className="text-slate-500 tabular-nums">CM1: <b className="text-slate-700">{fc(targetCm1)}</b></span>
            <span className="text-slate-400">PR {badge(cm1PrPct)}</span>
            <span className="text-slate-400">TT {badge(cm1ActPct)}</span>
          </div>
        ) : <span className="text-slate-300 float-right">—</span>}
      </td>
      <td className="px-2 py-1.5 text-right text-slate-300">—</td>
      <td className="px-2 py-1.5 text-right text-slate-300">—</td>
    </tr>
  )
}
