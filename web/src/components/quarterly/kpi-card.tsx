// Tách từ quarterly/page.tsx (s183 Phase 5 — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
import React from "react"
import { cn } from "@/lib/utils"
import { pct, cm1Color, fck } from "@/lib/quarterly-format"

// ─── KPI Progress Card — big % = PR CM1/Target, 3-row table (Rev/CM1/3HK) ────
// Dùng số compact ("18.7 Tỷ") thay số đầy đủ để tránh chồng lấn trong grid.
export function KpiCard({ label, icon: Icon, actual, prRev, target, cm1Actual, prCm1, cm1Target, hk3Pct, hk3Rev = 0, hk3Target, expectedPct = 0, accent = "#0f4c81" }:
  { label: string; icon: React.ElementType; actual: number; prRev: number; target: number; cm1Actual: number; prCm1: number; cm1Target: number; hk3Pct: number; hk3Rev?: number; hk3Target: number; expectedPct?: number; accent?: string }) {

  const cm1PrPct = cm1Target > 0 ? (prCm1 / cm1Target) * 100 : 0
  const revPrPct = target    > 0 ? (prRev / target)    * 100 : 0

  const colorFor = (p: number) =>
    p >= 100 ? "text-green-600" : (expectedPct > 0 ? p >= expectedPct : p >= 75) ? "text-brand-700" : "text-amber-600"

  const badge = (p: number) => (
    <span className={cn("px-1 py-0.5 rounded text-[10px] font-bold tabular-nums whitespace-nowrap",
      p >= 100 ? "bg-green-100 text-green-700"
               : (expectedPct > 0 ? p >= expectedPct : p >= 75) ? "bg-brand-100 text-brand-700"
               : "bg-amber-50 text-amber-600")}>
      {pct(p)}
    </span>
  )

  return (
    <div className="relative bg-white border border-slate-200 rounded-xl p-5 overflow-hidden shadow-sm">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accent }} />

      {/* Header: icon + label + big CM1% */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${accent}1a` }}>
            <Icon className="w-4 h-4" style={{ color: accent }} />
          </div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-tight">
            {label}<br /><span className="text-slate-400 font-semibold">CM1 Progress</span>
          </span>
        </div>
        <span className={cn("text-3xl font-extrabold tabular-nums", colorFor(cm1PrPct))}>
          {cm1Target > 0 ? pct(cm1PrPct) : "—"}
        </span>
      </div>

      {/* Progress bar: PR CM1 / Target CM1 */}
      <div className="relative h-2 bg-slate-100 rounded-full mb-3">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(Math.max(cm1PrPct, 0), 100)}%`, background: accent }} />
        {expectedPct > 0 && (
          <div className="absolute -top-1 -bottom-1 w-[2px] bg-slate-700 rounded"
            style={{ left: `${Math.min(expectedPct, 100)}%` }}
            title={`Kỳ vọng pro-rata: ${pct(expectedPct)}`} />
        )}
      </div>

      {/* Table: 2 hàng header + 3 hàng data — mỗi hàng: label | Actual | Pro-rata | Target | % */}
      <div className="text-[10px]">
        {/* Header */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_36px] gap-x-1.5 mb-1 pb-1 border-b border-slate-100">
          <span />
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">Actual</span>
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">Pro-rata</span>
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">Target</span>
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">%</span>
        </div>
        {/* Revenue */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_36px] gap-x-1.5 py-1 border-b border-slate-50 items-center">
          <span className="font-bold text-slate-400 uppercase text-[9px]">Rev</span>
          <span className="text-right text-slate-700 font-semibold tabular-nums">{fck(actual)}</span>
          <span className="text-right text-slate-600 tabular-nums">{fck(prRev)}</span>
          <span className="text-right text-slate-500 tabular-nums">{target > 0 ? fck(target) : "—"}</span>
          <span className="text-right">{target > 0 ? badge(revPrPct) : <span className="text-slate-300">—</span>}</span>
        </div>
        {/* CM1 */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_36px] gap-x-1.5 py-1 border-b border-slate-50 items-center">
          <span className="font-bold text-slate-400 uppercase text-[9px]">CM1</span>
          <span className={cn("text-right font-semibold tabular-nums", cm1Color(cm1Actual))}>{fck(cm1Actual)}</span>
          <span className={cn("text-right tabular-nums", cm1Color(prCm1))}>{fck(prCm1)}</span>
          <span className="text-right text-slate-500 tabular-nums">{cm1Target > 0 ? fck(cm1Target) : "—"}</span>
          <span className="text-right">{cm1Target > 0 ? badge(cm1PrPct) : <span className="text-slate-300">—</span>}</span>
        </div>
        {/* 3HK% + 3HK Rev */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_36px] gap-x-1.5 py-1 items-center">
          <span className="font-bold text-slate-400 uppercase text-[9px]">3HK</span>
          <span className="text-right text-slate-700 font-semibold tabular-nums">
            {hk3Rev > 0 && <span className="block text-[10px]">{fck(hk3Rev)}</span>}
            <span className="text-slate-500 font-normal">{pct(hk3Pct)}</span>
          </span>
          <span className="text-right text-slate-300">—</span>
          <span className="text-right text-slate-500 tabular-nums">{hk3Target > 0 ? pct(hk3Target) : "—"}</span>
          <span className="text-right text-slate-300">—</span>
        </div>
      </div>
    </div>
  )
}
