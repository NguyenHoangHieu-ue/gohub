// Tách từ quarterly/page.tsx (s183 Phase 5 — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
import React from "react"
import { cn } from "@/lib/utils"
import { pct, cm1Color, fck } from "@/lib/quarterly-format"

// ─── KPI Progress Card — big % = PR CM1/Target, 3-row table (Rev/CM1/3HK) ────
// Dùng số compact ("18.7 Tỷ") thay số đầy đủ để tránh chồng lấn trong grid.
export function KpiCard({ label, icon: Icon, actual, prRev, target, cm1Actual, prCm1, cm1Target, hk3Pct, hk3Rev = 0, hk3Target, accent = "#0f4c81" }:
  { label: string; icon: React.ElementType; actual: number; prRev: number; target: number; cm1Actual: number; prCm1: number; cm1Target: number; hk3Pct: number; hk3Rev?: number; hk3Target: number; expectedPct?: number; accent?: string }) {

  const cm1PrPct = cm1Target > 0 ? (prCm1 / cm1Target) * 100 : 0
  const revPrPct = target    > 0 ? (prRev / target)    * 100 : 0

  // Cùng ngưỡng với bảng Squad Progress: ≥100% xanh, ≥85% vàng, còn lại đỏ (so dự phóng cả quý với target).
  const tone = (p: number) => p >= 100 ? "good" : p >= 85 ? "warn" : "bad"
  const colorFor = (p: number) => ({ good: "text-emerald-600", warn: "text-amber-600", bad: "text-red-500" })[tone(p)]

  const badge = (p: number) => (
    <span className={cn("px-1 py-0.5 rounded text-[11.5px] font-bold tabular-nums whitespace-nowrap",
      { good: "bg-emerald-100 text-emerald-700", warn: "bg-amber-100 text-amber-700", bad: "bg-red-100 text-red-600" }[tone(p)])}>
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
          <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest leading-tight">
            {label}<br /><span className="text-slate-400 font-semibold">Tiến độ CM1</span>
          </span>
        </div>
        <div className="text-right">
          <span className={cn("text-3xl font-extrabold tabular-nums block leading-none", colorFor(cm1PrPct))}>
            {cm1Target > 0 ? pct(cm1PrPct) : "—"}
          </span>
          {cm1Target > 0 && (
            <span className={cn("inline-block mt-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-semibold",
              { good: "bg-emerald-100 text-emerald-700", warn: "bg-amber-100 text-amber-700", bad: "bg-red-100 text-red-600" }[tone(cm1PrPct)])}>
              {cm1PrPct >= 100 ? "Đạt" : cm1PrPct >= 85 ? "Gần đạt" : "Chậm tiến độ"}
            </span>
          )}
        </div>
      </div>

      {/* Thanh 3 lớp: thực tế (đậm) · dự phóng cuối quý (nhạt) · target (vạch đen ở cuối). Tất cả tính trên CM1 so với target. */}
      {(() => {
        const acPct = cm1Target > 0 ? Math.max(0, (cm1Actual / cm1Target) * 100) : 0
        return (
          <div className="mb-3">
            <div className="relative h-3.5 bg-slate-100 rounded-full mt-3 mb-1.5" role="img" aria-label={`CM1 thực tế ${pct(acPct)} target, dự phóng ${pct(cm1PrPct)} target`}>
              <div className="absolute inset-y-0 left-0 rounded-full" title={`Dự phóng cả quý: ${pct(cm1PrPct)} target`}
                style={{ width: `${Math.min(Math.max(cm1PrPct, 0), 100)}%`, background: accent, opacity: 0.28 }} />
              <div className="absolute inset-y-0 left-0 rounded-full" title={`Thực tế đến hôm qua: ${pct(acPct)} target`}
                style={{ width: `${Math.min(acPct, 100)}%`, background: accent }} />
              <div className="absolute -top-1 -bottom-1 right-0 w-[2px] bg-slate-800 rounded" title="Target" />
            </div>
            <div className="flex items-center gap-3 text-[11.5px] text-slate-500">
              <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: accent }} />Thực tế {pct(acPct)}</span>
              <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: accent, opacity: 0.28 }} />Dự phóng {pct(cm1PrPct)}</span>
              <span className="inline-flex items-center gap-1 ml-auto"><i className="w-[3px] h-2.5 bg-slate-800 inline-block" />Target</span>
            </div>
          </div>
        )
      })()}

      {/* Table: 2 hàng header + 3 hàng data — mỗi hàng: label | Actual | Pro-rata | Target | % */}
      <div className="text-[11.5px]">
        {/* Header */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_46px] gap-x-1.5 mb-1 pb-1 border-b border-slate-100">
          <span />
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">Actual</span>
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">Pro-rata</span>
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">Target</span>
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">%</span>
        </div>
        {/* Revenue */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_46px] gap-x-1.5 py-1 border-b border-slate-50 items-center">
          <span className="font-bold text-slate-400 uppercase text-[12px]">Rev</span>
          <span className="text-right text-slate-700 font-semibold tabular-nums">{fck(actual)}</span>
          <span className="text-right text-slate-600 tabular-nums">{fck(prRev)}</span>
          <span className="text-right text-slate-500 tabular-nums">{target > 0 ? fck(target) : "—"}</span>
          <span className="text-right">{target > 0 ? badge(revPrPct) : <span className="text-slate-300">—</span>}</span>
        </div>
        {/* CM1 */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_46px] gap-x-1.5 py-1 border-b border-slate-50 items-center">
          <span className="font-bold text-slate-400 uppercase text-[12px]">CM1</span>
          <span className={cn("text-right font-semibold tabular-nums", cm1Color(cm1Actual))}>{fck(cm1Actual)}</span>
          <span className={cn("text-right tabular-nums", cm1Color(prCm1))}>{fck(prCm1)}</span>
          <span className="text-right text-slate-500 tabular-nums">{cm1Target > 0 ? fck(cm1Target) : "—"}</span>
          <span className="text-right">{cm1Target > 0 ? badge(cm1PrPct) : <span className="text-slate-300">—</span>}</span>
        </div>
        {/* 3HK% + 3HK Rev */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_46px] gap-x-1.5 py-1 items-center">
          <span className="font-bold text-slate-400 uppercase text-[12px]">3HK</span>
          <span className="text-right text-slate-700 font-semibold tabular-nums">
            {hk3Rev > 0 && <span className="block text-[11.5px]">{fck(hk3Rev)}</span>}
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
