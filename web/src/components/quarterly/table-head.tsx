// Tách từ quarterly/page.tsx (s183 Phase 5 — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
import { cn } from "@/lib/utils"
import { ColInfo } from "./col-info"

export function TableHead({ cols, compact = false }: { cols: { label: string; tip?: string }[]; compact?: boolean }) {
  return (
    <tr className="bg-[#0f4c81]">
      {cols.map((col, i) => {
        const h = col.label
        const tip = col.tip
        return (
          <th key={h} className={cn(
            compact ? "px-2 py-2" : "px-4 py-2.5",
            "text-[10px] font-semibold text-slate-300 uppercase tracking-wider whitespace-nowrap",
            i === 0 ? "text-left" : "text-right"
          )}>
            {h}{tip && <ColInfo tip={tip} />}
          </th>
        )
      })}
    </tr>
  )
}
