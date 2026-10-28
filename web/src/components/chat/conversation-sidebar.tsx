"use client"

import { useMemo, useState } from "react"
import { Check, MessageSquare, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { group, type ConvItem } from "./conversation-switcher"

// Danh sách cuộc trò chuyện dạng CỘT BÊN TRÁI (như ChatGPT/Gấu Pro): cuộc mới, tìm, nhóm theo ngày, đổi tên tại chỗ (Enter lưu, Esc huỷ), xoá. `locked` = không đổi tên/xoá.
export function ConversationSidebar({ conversations, activeId, onSelect, onNew, onRename, onDelete, disabled, className }: {
  conversations: ConvItem[]
  activeId: string | null
  onSelect: (c: ConvItem) => void
  onNew: () => void
  onRename?: (id: string, title: string) => void | Promise<void>
  onDelete?: (id: string) => void
  disabled?: boolean
  className?: string
}) {
  const [q, setQ] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const groups = useMemo(() => {
    const k = q.trim().toLowerCase()
    return group(k ? conversations.filter(c => c.title.toLowerCase().includes(k)) : conversations)
  }, [conversations, q])
  const commit = async (c: ConvItem) => {
    const t = draft.trim().slice(0, 80)
    setEditId(null)
    if (t && t !== c.title) await onRename?.(c.id, t)
  }
  return (
    <nav aria-label="Cuộc trò chuyện" className={`flex flex-col min-h-0 ${className ?? ""}`}>
      <div className="p-2 space-y-2 border-b border-gray-100 dark:border-slate-700">
        <button type="button" onClick={onNew} disabled={disabled}
          className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium rounded-xl text-violet-700 dark:text-violet-200 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-50">
          <Plus size={15} />Cuộc trò chuyện mới
        </button>
        <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800 text-gray-400">
          <Search size={13} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm cuộc trò chuyện…" className="flex-1 min-w-0 bg-transparent text-[12.5px] text-gray-700 dark:text-slate-200 outline-none placeholder:text-gray-400" />
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-2" role="listbox">
        {!groups.length && <p className="text-xs text-gray-400 text-center py-6">{q ? "Không tìm thấy" : "Chưa có cuộc trò chuyện nào"}</p>}
        {groups.map(g => (
          <div key={g.label}>
            <p className="px-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{g.label}</p>
            {g.items.map(c => (
              <div key={c.id} role="option" aria-selected={c.id === activeId}
                onClick={() => { if (editId !== c.id && !disabled) onSelect(c) }}
                className={`group flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer text-[12.5px] ${c.id === activeId ? "bg-violet-100/80 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100" : "hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300"} ${disabled && c.id !== activeId ? "opacity-60 cursor-not-allowed" : ""}`}>
                <MessageSquare size={13} className="shrink-0 mt-0.5 text-gray-400" />
                {editId === c.id ? (
                  <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus maxLength={80} aria-label="Tên cuộc trò chuyện" onClick={e => e.stopPropagation()}
                    onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") void commit(c); else if (e.key === "Escape") setEditId(null) }}
                    onBlur={() => void commit(c)}
                    className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-violet-300 bg-white dark:bg-slate-800 text-xs text-gray-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-violet-400" />
                ) : <span className="flex-1 min-w-0 leading-snug line-clamp-2 break-words">{c.title}</span>}
                {onRename && !c.locked && (
                  <button type="button" title={editId === c.id ? "Lưu tên" : "Đổi tên"} aria-label="Đổi tên cuộc trò chuyện" onMouseDown={e => e.preventDefault()}
                    onClick={e => { e.stopPropagation(); if (editId === c.id) void commit(c); else { setDraft(c.title); setEditId(c.id) } }}
                    className={`${editId === c.id ? "" : "opacity-0 group-hover:opacity-100"} focus:opacity-100 shrink-0 p-0.5 text-gray-400 hover:text-violet-600`}>
                    {editId === c.id ? <Check size={12} /> : <Pencil size={12} />}
                  </button>
                )}
                {onDelete && !c.locked && (
                  <button type="button" title="Xoá" aria-label="Xoá cuộc trò chuyện" onClick={e => { e.stopPropagation(); onDelete(c.id) }}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-0.5 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </nav>
  )
}
