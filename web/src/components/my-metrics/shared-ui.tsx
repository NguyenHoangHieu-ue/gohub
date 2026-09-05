"use client"

// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import React, { useState, useEffect } from "react"
import { Info, ChevronUp, ChevronDown, BookOpen, X, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NoteSection } from "@/lib/my-metrics-types"

export function ProgressBar({ actual, target }: { actual: number; target: number }) {
  const p = target > 0 ? Math.min((actual / target) * 100, 100) : 0
  const color = p >= 100 ? "bg-emerald-500" : p >= 75 ? "bg-brand-600" : "bg-amber-400"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${p}%` }} />
      </div>
      <span className={cn("text-xs font-black w-12 text-right", p >= 100 ? "text-emerald-600" : p >= 75 ? "text-brand-600" : "text-amber-600")}>
        {p.toFixed(1)}%
      </span>
    </div>
  )
}

export function SourceBox({ type, table, filter }: { type: "auto"|"manual"|"context"; table: string; filter?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors">
        <Info className="w-3 h-3" />
        Nguồn dữ liệu
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-1.5 pl-2.5 border-l-2 border-slate-200 text-[11px] font-mono text-slate-500 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-wide">{type}</span>
            <span className="font-bold text-slate-600">{table}</span>
          </div>
          {filter && <div className="text-slate-400 break-all">{filter}</div>}
        </div>
      )}
    </div>
  )
}

// ─── Notes Drawer — mọi ghi chú/công thức/giải thích gộp vào 1 nơi, ẩn mặc định ──
// Trước đây các đoạn text này nằm rải rác luôn-hiện trong từng card → rối mắt. Nay dồn hết vào đây,
// mở bằng 1 nút duy nhất trên header trang. Số liệu chính vẫn hiện ngay trên card; chỉ "vì sao/tính
// thế nào" mới cần bấm xem.
export function NotesDrawer({ sections, onClose }: { sections: NoteSection[]; onClose: () => void }) {
  const [openId, setOpenId] = useState<string | null>(sections[0]?.id ?? null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 animate-overlay-in" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-black text-slate-900">Cách tính &amp; ghi chú</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 space-y-2">
          {sections.map(s => (
            <div key={s.id} className="border border-slate-100 rounded-xl overflow-hidden">
              <button onClick={() => setOpenId(openId === s.id ? null : s.id)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors">
                <span className="text-xs font-black text-slate-700">{s.title}</span>
                {openId === s.id ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              </button>
              {openId === s.id && (
                <div className="px-3.5 pb-3.5 text-[11px] text-slate-500 leading-relaxed space-y-1.5">{s.body}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Generic data table — dùng cho mọi widget lấy số từ DB, theo yêu cầu "hiển thị dữ liệu bảng" ──
export function DataTable<T>({ columns, rows, rowKey, pageSize = 20, emptyLabel = "Chưa có dữ liệu." }: {
  columns: { key: string; label: string; align?: "left" | "right" | "center"; render: (row: T) => React.ReactNode }[]
  rows: T[]
  rowKey: (row: T) => string
  pageSize?: number
  emptyLabel?: string
}) {
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [rows.length])
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize)
  if (rows.length === 0) return <p className="text-[11px] text-slate-400 text-center py-4">{emptyLabel}</p>
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50">
            <tr>
              {columns.map(c => (
                <th key={c.key} className={cn("px-2.5 py-2 font-black text-slate-500 uppercase tracking-wider text-[9px] whitespace-nowrap",
                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={rowKey(row)} className={cn("border-t border-slate-50", i % 2 === 1 && "bg-slate-50/40")}>
                {columns.map(c => (
                  <td key={c.key} className={cn("px-2.5 py-1.5 text-slate-700 align-top",
                    c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : "text-left")}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-bold text-slate-500">{page + 1}/{pages} · {rows.length} dòng</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
