"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

// Pager dùng chung cho các bảng danh sách — 20 hàng/trang
export const PAGE_ROWS = 20

export function Pager({ page, total, pageSize = PAGE_ROWS, onPage, label = "dòng" }: {
  page: number
  total: number
  pageSize?: number
  onPage: (p: number) => void
  label?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50/40">
      <span className="text-xs text-slate-500">
        {from.toLocaleString("vi-VN")}–{to.toLocaleString("vi-VN")} / {total.toLocaleString("vi-VN")} {label}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Trước
        </button>
        <span className="text-xs font-semibold text-slate-600 px-2">Trang {page}/{totalPages}</span>
        <button
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Sau <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
