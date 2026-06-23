"use client"

import { getPresetRange, type DatePreset } from "@/lib/analytics-formatters"

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "week",    label: "Tuần này" },
  { key: "month",   label: "Tháng này" },
  { key: "quarter", label: "Quý này" },
  { key: "year",    label: "Năm nay" },
]

// Preset "kỳ hiện tại → hôm qua". onSelect nhận (startDate, endDate) dạng YYYY-MM-DD.
// variant="buttons" (mặc định) = hàng nút; "dropdown" = 1 select gọn (cho chỗ chật như header b2b).
export function DatePresets({
  onSelect,
  className = "",
  variant = "buttons",
}: {
  onSelect: (startDate: string, endDate: string) => void
  className?: string
  variant?: "buttons" | "dropdown"
}) {
  if (variant === "dropdown") {
    return (
      <select
        value=""
        onChange={(e) => {
          if (!e.target.value) return
          const r = getPresetRange(e.target.value as DatePreset)
          onSelect(r.startDate, r.endDate)
          e.target.value = ""
        }}
        className={`text-xs font-semibold rounded-md border border-slate-200 bg-slate-100 text-slate-600 px-2 py-1.5 outline-none cursor-pointer focus:ring-2 focus:ring-blue-500/20 ${className}`}
      >
        <option value="">Nhanh…</option>
        {PRESETS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>
    )
  }
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
