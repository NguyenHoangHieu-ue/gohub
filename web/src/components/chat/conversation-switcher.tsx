"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, MessageSquare, Plus, Search, Trash2 } from "lucide-react"

// U4 (plan be-gau-upgrade.md): thanh trên khung chat — bấm tên hội thoại mở danh sách lịch sử (tìm, "Cuộc mới", xoá). Thay cột lịch sử
// bên trái để khung chat rộng hơn. Dùng chung Bé Gấu + Gấu Pro.
export interface ConvItem { id: string; title: string; updated_at: string }

function group(convs: ConvItem[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const out: { label: string; items: ConvItem[] }[] = [
    { label: "Hôm nay", items: [] }, { label: "Hôm qua", items: [] }, { label: "7 ngày qua", items: [] }, { label: "Cũ hơn", items: [] },
  ]
  for (const c of convs) {
    const t = new Date(c.updated_at).getTime()
    out[t >= today ? 0 : t >= today - 86_400_000 ? 1 : t >= today - 7 * 86_400_000 ? 2 : 3].items.push(c)
  }
  return out.filter(g => g.items.length)
}

export function ConversationSwitcher({ conversations, activeId, title, onSelect, onNew, onDelete, disabled }: {
  conversations: ConvItem[]
  activeId: string | null
  title: string
  onSelect: (c: ConvItem) => void
  onNew: () => void
  onDelete?: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc) }
  }, [open])

  const groups = useMemo(() => {
    const k = q.trim().toLowerCase()
    return group(k ? conversations.filter(c => c.title.toLowerCase().includes(k)) : conversations)
  }, [conversations, q])

  return (
    <div ref={boxRef} className="relative min-w-0">
      <button type="button" onClick={() => setOpen(v => !v)} disabled={disabled} aria-expanded={open} aria-haspopup="listbox"
        title="Lịch sử trò chuyện"
        className="flex items-center gap-1.5 max-w-[60vw] md:max-w-md px-2 py-1 rounded-lg text-sm font-semibold text-gray-800 dark:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50">
        <span className="truncate">{title}</span>
        <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-[min(22rem,90vw)] max-h-[70vh] flex flex-col bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-slate-800 space-y-2">
            <button type="button" onClick={() => { onNew(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-800/30 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-800/50">
              <Plus size={15} />Cuộc trò chuyện mới
            </button>
            <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-slate-800 text-gray-400">
              <Search size={14} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm cuộc trò chuyện…" autoFocus
                className="flex-1 bg-transparent text-sm text-gray-700 dark:text-slate-200 outline-none placeholder:text-gray-400" />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-2" role="listbox">
            {!groups.length && <p className="text-xs text-gray-400 text-center py-6">{q ? "Không tìm thấy" : "Chưa có cuộc trò chuyện nào"}</p>}
            {groups.map(g => (
              <div key={g.label}>
                <p className="px-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{g.label}</p>
                {g.items.map(c => (
                  <div key={c.id} role="option" aria-selected={c.id === activeId}
                    onClick={() => { onSelect(c); setOpen(false) }}
                    className={`group flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer text-xs ${c.id === activeId
                      ? "bg-brand-100 dark:bg-brand-800/40 text-brand-800 dark:text-brand-200"
                      : "hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300"}`}>
                    <MessageSquare size={13} className="shrink-0 mt-0.5 text-gray-400" />
                    <span className="flex-1 leading-snug line-clamp-2">{c.title}</span>
                    {onDelete && (
                      <button type="button" title="Xoá" aria-label="Xoá cuộc trò chuyện"
                        onClick={e => { e.stopPropagation(); onDelete(c.id) }}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-0.5 text-gray-400 hover:text-red-500">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
