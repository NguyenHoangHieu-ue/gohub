"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"

// U4: nút ⋯ trên thanh khung chat — gom các chức năng ít dùng (Trực tiếp, Dịch, Ghi âm cuộc họp, Việc nền…). Chấm đỏ khi có mục cần chú ý.
export interface MenuItem { key: string; label: string; icon?: ReactNode; onClick: () => void; badge?: number; hint?: string; disabled?: boolean }

export function OverflowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc) }
  }, [open])
  if (!items.length) return null
  const alert = items.some(i => (i.badge ?? 0) > 0)
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open} title="Thêm"
        className="relative w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-slate-800">
        <MoreHorizontal size={18} />
        {alert && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-40 min-w-[14rem] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl p-1">
          {items.map(i => (
            <button key={i.key} type="button" role="menuitem" disabled={i.disabled}
              onClick={() => { setOpen(false); i.onClick() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-40">
              <span className="w-4 flex justify-center text-gray-500">{i.icon}</span>
              <span className="flex-1">
                {i.label}
                {i.hint && <span className="block text-[11px] text-gray-400">{i.hint}</span>}
              </span>
              {(i.badge ?? 0) > 0 && <span className="min-w-[1.25rem] px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] text-center">{i.badge}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
