"use client"

import { useCallback, useEffect, useState } from "react"
import { FileText, Loader2, Trash2, X } from "lucide-react"
import { api } from "../argon-types"

// "Tài liệu của tôi": danh sách tài liệu người dùng đã đưa cho trợ lý (Kho của CHÍNH họ) — chỉ xem tên/ngày và xoá. Gọn cho người ít rành công nghệ; việc xếp thư mục, tóm tắt, thực thể do trợ lý tự lo.
interface Doc { id: string; name: string; kind: string; updated_at: string }
const fmt = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })

export function MyDocs({ onClose, refreshKey, onError }: { onClose: () => void; refreshKey: unknown; onError: (m: string) => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => api<{ sources: Doc[] }>("/api/creator/argon/kho").then(r => setDocs([...(r.sources ?? [])].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))))).catch(e => { onError((e as Error).message); setDocs([]) }), [onError])
  useEffect(() => { void load() }, [load, refreshKey])

  async function remove(d: Doc) {
    if (!confirm(`Xoá tài liệu “${d.name}”? Trợ lý sẽ không còn dùng tài liệu này nữa.`)) return
    setBusy(d.id)
    try { await api(`/api/creator/argon/sources/${d.id}`, { method: "DELETE" }); setDocs(list => (list ?? []).filter(x => x.id !== d.id)) } catch (e) { onError((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-label="Tài liệu của tôi" className="w-full sm:max-w-lg max-h-[80vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-800">
          <FileText size={16} className="text-violet-600" />
          <span className="text-[15px] font-semibold text-gray-900 dark:text-slate-100">Tài liệu của tôi</span>
          <button type="button" onClick={onClose} aria-label="Đóng" className="ml-auto rounded-md p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"><X size={16} /></button>
        </div>
        <p className="px-4 pt-2 text-[12.5px] text-gray-500 dark:text-slate-400">Đây là những tài liệu bạn đã đưa cho trợ lý. Chỉ mình bạn thấy. Bấm “Thêm tài liệu” ở khung chat để thêm.</p>
        <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
          {docs === null && <div className="flex items-center gap-2 px-3 py-6 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" />Đang tải…</div>}
          {docs?.length === 0 && <p className="px-3 py-8 text-center text-sm text-gray-400">Chưa có tài liệu nào.</p>}
          {docs?.map(d => (
            <div key={d.id} className="group flex items-center gap-2.5 rounded-lg px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800">
              <FileText size={15} className="shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-gray-800 dark:text-slate-100">{d.name}</span><span className="text-[11.5px] text-gray-400">{fmt(d.updated_at)}</span></span>
              <button type="button" onClick={() => void remove(d)} disabled={busy === d.id} aria-label={`Xoá ${d.name}`} className="rounded-md p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50">{busy === d.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} />}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
