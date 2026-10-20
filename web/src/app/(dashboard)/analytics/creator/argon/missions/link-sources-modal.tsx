"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, X } from "lucide-react"
import { api, fmtTokens, jsonInit } from "../argon-types"

interface Candidate { id: string; name: string; kind: string; tokens: number; enabled: boolean; project_id: string; projectName: string; linked: boolean }
const KIND: Record<string, string> = { file: "File", lark: "Lark", mail: "Mail", note: "Ghi chú" }

// Gắn/gỡ nguồn từ Kho nguồn (các dự án thường) vào sứ mệnh. Đổi có hiệu lực ngay; nguồn gốc không bị xoá hay sửa khi gỡ.
export function LinkSourcesModal({ missionId, onClose, onChanged, onError }: { missionId: string; onClose: () => void; onChanged: () => void; onError: (m: string) => void }) {
  const [items, setItems] = useState<Candidate[] | null>(null)
  const [q, setQ] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const url = `/api/creator/argon/missions/${missionId}/sources`

  useEffect(() => { api<{ candidates: Candidate[] }>(`${url}?available=1`).then(r => setItems(r.candidates)).catch(e => { onError((e as Error).message); setItems([]) }) }, [url]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(c: Candidate) {
    setBusyId(c.id)
    try {
      if (c.linked) await api(`${url}?sourceId=${c.id}`, { method: "DELETE" })
      else await api(url, jsonInit("POST", { sourceId: c.id }))
      setItems(prev => (prev ?? []).map(x => (x.id === c.id ? { ...x, linked: !c.linked } : x)))
      onChanged()
    } catch (e) { onError((e as Error).message) } finally { setBusyId(null) }
  }

  async function toggleGroup(list: Candidate[], link: boolean) {
    const ids = list.filter(c => c.linked !== link).map(c => c.id)
    if (!ids.length) return
    setBusyId("group")
    try {
      if (link) await api(url, jsonInit("POST", { sourceIds: ids }))
      else await api(`${url}?sourceIds=${ids.join(",")}`, { method: "DELETE" })
      const set = new Set(ids)
      setItems(prev => (prev ?? []).map(x => (set.has(x.id) ? { ...x, linked: link } : x)))
      onChanged()
    } catch (e) { onError((e as Error).message) } finally { setBusyId(null) }
  }

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const m = new Map<string, Candidate[]>()
    for (const c of items ?? []) {
      if (term && !`${c.name} ${c.projectName}`.toLowerCase().includes(term)) continue
      m.set(c.projectName, [...(m.get(c.projectName) ?? []), c])
    }
    return [...m.entries()]
  }, [items, q])
  const linkedTokens = (items ?? []).filter(c => c.linked && c.enabled).reduce((n, c) => n + c.tokens, 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Gắn nguồn từ Kho nguồn" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <div className="font-semibold">Gắn nguồn từ Kho nguồn</div>
          <span className="text-xs text-gray-500">Đã gắn ~{fmtTokens(linkedTokens)} token (chỉ nguồn đang bật)</span>
          <button type="button" onClick={onClose} aria-label="Đóng" className="ml-auto text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-700">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo tên nguồn hoặc dự án…" aria-label="Tìm nguồn" className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {items === null && <div className="p-6 text-sm text-gray-400 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Đang tải…</div>}
          {items !== null && groups.length === 0 && <div className="p-6 text-sm text-gray-400 text-center">{items.length ? "Không có nguồn khớp." : "Kho nguồn trống. Thêm nguồn ở trang Kho nguồn trước."}</div>}
          {groups.map(([project, list]) => (
            <div key={project} className="mb-2">
              <div className="flex items-center gap-2 px-2 py-1">
                <span className="text-[11px] uppercase tracking-wide text-gray-500">{project}</span>
                <span className="text-[11px] text-gray-400">{list.filter(c => c.linked).length}/{list.length} đã gắn</span>
                <span className="ml-auto flex gap-1">
                  <button type="button" disabled={busyId !== null || list.every(c => c.linked)} onClick={() => void toggleGroup(list, true)} className="px-2 py-0.5 text-[11px] rounded-md border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 disabled:opacity-40 hover:bg-violet-50 dark:hover:bg-violet-950/40">Gắn tất cả</button>
                  <button type="button" disabled={busyId !== null || !list.some(c => c.linked)} onClick={() => void toggleGroup(list, false)} className="px-2 py-0.5 text-[11px] rounded-md border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700">Gỡ tất cả</button>
                </span>
              </div>
              {list.map(c => (
                <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-sm cursor-pointer">
                  <input type="checkbox" checked={c.linked} disabled={busyId === c.id} onChange={() => void toggle(c)} className="accent-violet-600" />
                  <span className="truncate flex-1" title={c.name}>{c.name}</span>
                  <span className="text-[10px] px-1.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">{KIND[c.kind] ?? c.kind}</span>
                  {!c.enabled && <span className="text-[10px] text-amber-600">đang tắt</span>}
                  <span className="text-[11px] text-gray-400 w-14 text-right">{fmtTokens(c.tokens)}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-gray-200 dark:border-slate-700 text-xs leading-relaxed text-gray-500">Muốn Argon đọc hiểu thread hoặc mail: nạp chúng ở <b>Kho nguồn</b> (dự án mẫu “Ngữ cảnh thread Lark” / “Hộp thư Lark”), rồi bấm “Gắn tất cả” ở đây. Cả thread (tin gốc + mọi trả lời) và cả luồng mail đều thành nguồn đọc được. Nguồn đang tắt ở Kho nguồn thì Argon không đọc dù đã gắn. Gỡ nguồn không xoá nguồn gốc.</div>
      </div>
    </div>
  )
}
