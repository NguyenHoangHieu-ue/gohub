// Tách từ quarterly/page.tsx (s183 Phase 5 — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
import React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { fc, fck, pct, cm1Color, momColor } from "@/lib/quarterly-format"
import type { Channel } from "@/lib/quarterly-types"

export function PivotTable({ title, icon: Icon, channels, months, expanded, onToggle }:
  { title: string; icon: React.ElementType; channels: Channel[]; months: string[]; expanded: boolean; onToggle: () => void }) {
  const SUB = ["Revenue", "Gross Margin", "Ch.Cost", "CM1", "%CM1", "%MoM", "3HK Rev (%)"]
  const colCount = SUB.length
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set())
  const toggleRow = (name: string) => setExpandedRows(prev => {
    const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next
  })

  // Dùng chung cho hàng Channel chính VÀ hàng member (drill-down) — cùng bộ cột/công thức mỗi tháng.
  const monthCells = (ch: Channel) => months.flatMap(m => {
    const d = ch.months.find((x: any) => x.month === m)
    if (!d || d.revenue === 0) {
      return SUB.map((_, i) => (
        <td key={`${m}-${i}`} className={cn("px-2 py-2.5 text-right text-slate-300", i === 0 && "border-l border-slate-100")}>—</td>
      ))
    }
    const pr = (d as any).isProjected
    const dualC = (prVal: number, actVal: number | undefined, cls = "text-slate-700") => actVal != null ? (
      <div className="flex flex-col items-end leading-snug">
        <span className={cn("tabular-nums font-semibold text-[11px]", cls)}>{fck(prVal)}<sup className="text-[8px] font-bold text-blue-400 ml-0.5">PR</sup></span>
        <span className="tabular-nums font-semibold text-[10px] text-blue-600">{fck(actVal)}<sup className="text-[8px] font-bold text-blue-400 ml-0.5">Act</sup></span>
      </div>
    ) : <span className={cn("tabular-nums", cls)}>{fc(prVal)}</span>
    return [
      <td key="rev" className="px-2 py-2.5 text-right border-l border-slate-100">{dualC(d.revenue, pr ? (d as any).actualRevenue : undefined, "text-slate-700")}</td>,
      <td key="gm"  className="px-2 py-2.5 text-right">{dualC(d.gp, pr ? (d as any).actualGp : undefined, "text-slate-600")}</td>,
      <td key="cc"  className="px-2 py-2.5 text-right text-slate-500 tabular-nums">{d.channelCost > 0 ? (pr && (d as any).actualCc != null ? dualC(d.channelCost, (d as any).actualCc, "text-slate-500") : fc(d.channelCost)) : "—"}</td>,
      <td key="cm1" className={cn("px-2 py-2.5 text-right font-semibold", cm1Color(d.cm1))}>{dualC(d.cm1, pr ? (d as any).actualCm1 : undefined, cm1Color(d.cm1))}</td>,
      <td key="pct" className={cn("px-2 py-2.5 text-right", cm1Color(d.cm1))}>{pct(d.cm1Pct)}</td>,
      <td key="mom" className={cn("px-2 py-2.5 text-right font-medium", momColor(d.momPct))}>
        {d.momPct != null ? `${d.momPct >= 0 ? "+" : ""}${d.momPct.toFixed(1)}%` : "—"}
      </td>,
      <td key="3hk" className="px-2 py-2.5 text-right text-slate-500">
        {d.three_hk_pct != null ? pct(d.three_hk_pct) : "—"}
      </td>,
    ]
  })

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button className="w-full px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse" style={{ minWidth: `${Math.max(500, 160 + months.length * colCount * 72)}px` }}>
            <thead>
              <tr className="bg-[#0f4c81]">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-300 uppercase sticky left-0 bg-[#0f4c81] border-r border-[#0a3560] min-w-[160px]">Kênh</th>
                {months.map(m => {
                  const [y, mo] = m.split("-")
                  const isPr = channels[0]?.months.find((x: any) => x.month === m)?.isProjected ?? false
                  return (
                    <th key={m} colSpan={colCount} className="px-3 py-2.5 text-center text-[10px] font-semibold text-slate-300 border-l border-[#0a3560] whitespace-nowrap">
                      T{parseInt(mo)}/{y}{isPr ? " (PR)" : ""}
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-[#1565c0] text-[9px] text-blue-100 uppercase">
                <th className="px-4 py-1.5 sticky left-0 bg-[#1565c0] border-r border-[#2e7dd4]" />
                {months.flatMap(m => SUB.map((h, i) => (
                  <th key={`${m}-${h}`} className={cn("px-2 py-1.5 whitespace-nowrap font-medium text-right", i === 0 && "border-l border-[#2e7dd4]", h === "CM1" && "text-blue-300")}>
                    {h}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {channels.map((ch, ri) => {
                const hasMembers = !!ch.members && ch.members.length > 0
                const rowExpanded = hasMembers && expandedRows.has(ch.name)
                const rowBg = ri % 2 === 0 ? "#ffffff" : "#f8fafc"
                return (
                  <React.Fragment key={ch.name}>
                    <tr className={cn("border-b border-slate-100", ri % 2 === 0 ? "bg-white" : "bg-slate-50/60", "hover:bg-blue-50/30 transition-colors")}>
                      <td className="px-4 py-2.5 font-medium text-slate-700 sticky left-0 border-r border-slate-100" style={{ backgroundColor: rowBg }}>
                        {hasMembers ? (
                          <button type="button" onClick={() => toggleRow(ch.name)} className="flex items-center gap-1 text-left hover:text-[#0f4c81]">
                            <ChevronRight className={cn("w-3 h-3 text-slate-400 transition-transform shrink-0", rowExpanded && "rotate-90")} />
                            <span className="underline decoration-dotted decoration-slate-300 underline-offset-2">{ch.name}</span>
                          </button>
                        ) : ch.name}
                      </td>
                      {monthCells(ch)}
                    </tr>
                    {rowExpanded && ch.members!.map(member => (
                      <tr key={member.name} className="border-b border-sky-100 bg-sky-50 hover:bg-sky-100/70 transition-colors">
                        <td className="pl-9 pr-4 py-1.5 text-[10px] text-slate-600 sticky left-0 border-r border-sky-100 border-l-4 border-l-sky-300 truncate" style={{ backgroundColor: "#f0f9ff" }}>
                          {member.name}
                        </td>
                        {monthCells(member)}
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
