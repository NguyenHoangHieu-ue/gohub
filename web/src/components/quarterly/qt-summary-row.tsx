// Tách từ quarterly/page.tsx (s183 Phase 5 — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
import { cn } from "@/lib/utils"
import { fc, pct, cm1Color, prColor } from "@/lib/quarterly-format"

// ─── Quarter summary row — actual (raw) values ────────────────────────────────
export function QtSummaryRow({ label, actRev, prRev, gmRaw, ccRaw, gcRaw, cm1Raw, prCm1, hk3Pct, hk3Rev = 0, qoqPct }:
  { label: string; actRev: number; prRev: number; gmRaw: number; ccRaw: number; gcRaw: number; cm1Raw: number; prCm1: number; hk3Pct: number; hk3Rev?: number; qoqPct?: number | null }) {
  const gmPct  = actRev > 0 ? gmRaw  / actRev * 100 : 0
  const cm1Pct = actRev > 0 ? cm1Raw / actRev * 100 : 0
  const qoqCls = qoqPct == null ? "text-slate-300" : qoqPct >= 0 ? "text-green-600 font-bold" : "text-red-500 font-bold"
  return (
    <tr className="border-b border-slate-100 bg-white hover:bg-slate-50 text-[11px]">
      <td className="px-2 py-2 font-semibold text-slate-800">{label}</td>
      <td className="px-2 py-2 text-right font-semibold text-slate-800 tabular-nums">{fc(actRev)}</td>
      <td className={cn("px-2 py-2 text-right tabular-nums", prColor)}>{fc(prRev)}</td>
      <td className="px-2 py-2 text-right text-slate-700 tabular-nums">{fc(gmRaw)}</td>
      <td className="px-2 py-2 text-right text-slate-500">{pct(gmPct)}</td>
      <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{ccRaw > 0 ? fc(ccRaw) : "—"}</td>
      <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{gcRaw > 0 ? fc(gcRaw) : "—"}</td>
      <td className={cn("px-2 py-2 text-right font-bold tabular-nums text-[12px]", cm1Color(cm1Raw))}>{fc(cm1Raw)}</td>
      <td className={cn("px-2 py-2 text-right tabular-nums", prColor)}>{fc(prCm1)}</td>
      <td className={cn("px-2 py-2 text-right font-semibold", cm1Color(cm1Raw))}>{pct(cm1Pct)}</td>
      <td className="px-2 py-2 text-right text-slate-500 whitespace-nowrap">{hk3Rev > 0 ? <>{fc(hk3Rev)} <span className="text-[10px] text-slate-400">({pct(hk3Pct)})</span></> : pct(hk3Pct)}</td>
      <td className={cn("px-2 py-2 text-right tabular-nums", qoqCls)}>
        {qoqPct != null ? `${qoqPct >= 0 ? "+" : ""}${qoqPct.toFixed(1)}%` : "—"}
      </td>
    </tr>
  )
}
