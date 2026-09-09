// Tách từ quarterly/page.tsx (s183 Phase 5 — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
export function MomBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[8px] text-slate-300">N/A</span>
  const pos = v >= 0
  return (
    <span className={`text-[8px] font-bold leading-none ${pos ? "text-[#10B981]" : "text-[#EF4444]"}`}>
      {pos ? "▲" : "▼"} {Math.abs(v).toFixed(1)}%
    </span>
  )
}
