"use client"

import { useCallback, useEffect, useState } from "react"
import { Pin, Trash2, X, Loader2 } from "lucide-react"

// Panel "Trí nhớ của Gấu" (G3): người dùng tự xem/sửa/ghim/quên điều Gấu Pro nhớ về mình (kể cả mục Gấu tự rút).
interface Mem { id: number; kind: string; content: string; pinned: boolean; source: string | null; updated_at: string }
const KIND_LABEL: Record<string, string> = {
  profile: "Hồ sơ", preference: "Sở thích", project: "Dự án", person: "Người", decision: "Quyết định", other: "Khác",
}

export function MemoryPanel({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Mem[] | null>(null)
  const [err, setErr] = useState("")
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [newText, setNewText] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch("/api/creator-ai/memory").then(r => r.json()).catch(e => ({ error: e.message }))
    setRows(d.memories ?? []); setErr(d.error ?? (d.enabled === false ? "Trí nhớ cá nhân chưa bật cho tài khoản này." : ""))
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    const d = await fetch("/api/creator-ai/memory", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).catch(e => ({ error: e.message }))
    setBusy(false)
    if (d.error) setErr(d.error)
    await load()
  }

  return (
    <div className="absolute right-0 top-full mt-1 w-[440px] max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Trí nhớ của Gấu {rows ? `(${rows.length})` : ""}</span>
        <div className="flex items-center gap-1">
          {busy && <Loader2 size={12} className="animate-spin text-gray-400" />}
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={12} /></button>
        </div>
      </div>
      {err && <div className="px-3 py-2 text-amber-600">{err}</div>}
      <div className="flex gap-2 px-3 py-2 border-b border-gray-100 dark:border-slate-800">
        <input value={newText} onChange={e => setNewText(e.target.value)} placeholder="Thêm điều Gấu nên nhớ..."
          className="flex-1 px-2 py-1 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent" />
        <button disabled={!newText.trim() || busy} onClick={async () => { await act({ action: "save", content: newText.trim() }); setNewText("") }}
          className="px-2.5 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">Thêm</button>
      </div>
      {rows === null ? <div className="p-4 text-center text-gray-400">Đang tải...</div>
        : rows.length === 0 ? <div className="p-4 text-center text-gray-400">Chưa nhớ gì.</div> : (
        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {rows.map(m => (
            <div key={m.id} className="px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <span>{KIND_LABEL[m.kind] ?? m.kind}</span>
                {m.source?.startsWith("auto") && <span className="text-violet-500">Gấu tự nhớ</span>}
                <span className="ml-auto">{new Date(m.updated_at).toLocaleDateString("vi-VN")}</span>
                <button title={m.pinned ? "Bỏ ghim" : "Ghim (luôn nạp trước)"} onClick={() => act({ action: "update", id: m.id, pinned: !m.pinned })}
                  className={m.pinned ? "text-violet-600" : "hover:text-violet-600"}><Pin size={11} /></button>
                <button title="Quên" onClick={() => act({ action: "forget", id: m.id })} className="hover:text-rose-500"><Trash2 size={11} /></button>
              </div>
              {editing === m.id ? (
                <div className="flex gap-2 mt-1">
                  <input value={draft} onChange={e => setDraft(e.target.value)} className="flex-1 px-2 py-1 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent" />
                  <button onClick={async () => { await act({ action: "update", id: m.id, content: draft }); setEditing(null) }} className="text-violet-600">Lưu</button>
                  <button onClick={() => setEditing(null)} className="text-gray-400">Huỷ</button>
                </div>
              ) : (
                <div onClick={() => { setEditing(m.id); setDraft(m.content) }} title="Bấm để sửa"
                  className="mt-0.5 text-gray-700 dark:text-slate-200 cursor-text break-words">{m.content}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
