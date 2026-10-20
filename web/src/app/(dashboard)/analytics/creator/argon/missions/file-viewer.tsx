"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Eye, Loader2, Pencil, Save, Trash2 } from "lucide-react"
import { api, fmtBytes, jsonInit } from "../argon-types"
import { ArgonMarkdown } from "../argon-markdown"
import { PROTECTED_FILES, type WsFile } from "./mission-types"

// Xem / sửa 1 file chữ trong workspace. File .md xem dạng đã dựng, bấm Sửa để chỉnh. Hiếu ghi mọi lúc (không phụ thuộc pha); mỗi lần lưu tăng phiên bản.
export function FileViewer({ missionId, path, reloadKey, onSaved, onDeleted, onError }: {
  missionId: string
  path: string
  reloadKey: number                       // đổi khi Argon vừa ghi file → tải lại nếu đang không sửa dở
  onSaved: () => void
  onDeleted: () => void
  onError: (m: string) => void
}) {
  const [file, setFile] = useState<WsFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const url = `/api/creator/argon/missions/${missionId}/files`

  const load = useCallback(async (keepEditing: boolean) => {
    setLoading(true)
    try {
      const r = await api<{ file: WsFile }>(`${url}?path=${encodeURIComponent(path)}`)
      setFile(r.file)
      if (!keepEditing) setText(r.file.content ?? "")
    } catch (e) { setFile(null); onError((e as Error).message) } finally { setLoading(false) }
  }, [url, path, onError])

  useEffect(() => { setEditing(false) }, [path])
  useEffect(() => { void load(editingRef.current) }, [load, reloadKey])
  const editingRef = useRef(false)
  editingRef.current = editing

  async function save() {
    setSaving(true)
    try { await api(url, jsonInit("PUT", { path, content: text })); setEditing(false); await load(false); onSaved() }
    catch (e) { onError((e as Error).message) } finally { setSaving(false) }
  }
  async function remove() {
    if (!window.confirm(`Xoá file ${path}?`)) return
    try { await api(`${url}?path=${encodeURIComponent(path)}`, { method: "DELETE" }); onDeleted() } catch (e) { onError((e as Error).message) }
  }

  if (loading && !file) return <div className="p-6 text-sm text-gray-400 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Đang tải…</div>
  if (!file) return <div className="p-6 text-sm text-gray-400">Không mở được file.</div>
  const isMd = /\.md$/i.test(file.path)
  const binary = file.content == null
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-slate-700 text-sm">
        <span className="font-mono text-xs truncate">{file.path}</span>
        <span className="text-[11px] text-gray-500 shrink-0">v{file.version} · {fmtBytes(file.size_bytes)} · {file.author === "argon" ? "Argon ghi" : "Hiếu ghi"}</span>
        <span className="ml-auto flex items-center gap-1">
          {!binary && (editing
            ? <>
                <button type="button" onClick={() => { setEditing(false); setText(file.content ?? "") }} className="px-2.5 py-1 text-xs border border-gray-300 dark:border-slate-600 rounded-lg inline-flex items-center gap-1"><Eye size={12} />Huỷ</button>
                <button type="button" onClick={save} disabled={saving} className="px-2.5 py-1 text-xs bg-violet-600 text-white rounded-lg disabled:opacity-50 inline-flex items-center gap-1"><Save size={12} />{saving ? "Đang lưu…" : "Lưu"}</button>
              </>
            : <button type="button" onClick={() => { setText(file.content ?? ""); setEditing(true) }} className="px-2.5 py-1 text-xs border border-gray-300 dark:border-slate-600 rounded-lg inline-flex items-center gap-1"><Pencil size={12} />Sửa</button>)}
          {!PROTECTED_FILES.includes(file.path) && <button type="button" onClick={remove} title="Xoá file" className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {binary
          ? <div className="p-6 text-sm text-gray-500">File nhị phân ({fmtBytes(file.size_bytes)}), chưa xem được trong trình duyệt.</div>
          : editing
            ? <textarea value={text} onChange={e => setText(e.target.value)} spellCheck={false} aria-label={`Nội dung ${file.path}`} className="w-full h-full min-h-[300px] p-4 font-mono text-[13px] leading-relaxed bg-transparent text-gray-800 dark:text-slate-100 resize-none outline-none" />
            : isMd
              ? <div className="p-4 max-w-3xl"><ArgonMarkdown text={file.content ?? ""} /></div>
              : <pre className="p-4 text-[13px] leading-relaxed font-mono whitespace-pre-wrap break-words text-gray-800 dark:text-slate-100">{file.content}</pre>}
      </div>
    </div>
  )
}
