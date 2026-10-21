"use client"

import { useState } from "react"

/** Ô của bản xem trước: bấm đúp để sửa. Ô đã sửa tô vàng (bấm ↺ để hoàn tác). `locked` = ô khoá (mã). */
export function EditableCell({ value, edited, locked, title, extraClass, onCommit, onReset }: {
  value: string | number; edited: boolean; locked: boolean; title?: string; extraClass?: string
  onCommit: (v: string) => void; onReset: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft !== null) {
    return (
      <td className="px-1 py-0.5 bg-amber-50">
        <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== String(value)) onCommit(draft); setDraft(null) }}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setDraft(null) }}
          className="min-w-[8rem] px-1 py-0.5 text-xs border border-amber-400 rounded bg-white dark:bg-slate-900" style={{ width: `${Math.min(Math.max(String(value).length + 2, 10), 40)}ch` }} />
      </td>
    )
  }
  return (
    <td title={locked ? "Ô khoá (mã)" : title ?? "Bấm đúp để sửa"} onDoubleClick={() => { if (!locked) setDraft(String(value)) }}
      className={`px-2 py-1 whitespace-nowrap ${edited ? "bg-amber-100 dark:bg-amber-900/40 font-semibold" : ""} ${locked ? "text-gray-500" : "cursor-text"} ${extraClass ?? ""}`}>
      {String(value)}{edited && <button onClick={e => { e.stopPropagation(); onReset() }} className="ml-1 text-[11.5px] text-amber-700" title="Hoàn tác ô này">↺</button>}
    </td>
  )
}
