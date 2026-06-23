"use client"

import { getPresetRange, type DatePreset } from "@/lib/analytics-formatters"

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "week",    label: "Tuần này" },
  { key: "month",   label: "Tháng này" },
  { key: "quarter", label: "Quý này" },
  { key: "year",    label: "Năm nay" },
]

// Hàng nút preset "kỳ hiện tại → hôm qua". onSelect nhận (startDate, endDate) dạng YYYY-MM-DD.
export function DatePresets({
  onSelect,
  className = "",
}: {
  onSelect: (startDate: string, endDate: string) => void
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => {
            const r = getPresetRange(p.key)
            onSelect(r.startDate, r.endDate)
          }}
          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
