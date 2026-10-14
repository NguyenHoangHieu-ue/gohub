"use client"

import { useRef, useState } from "react"
import { FileText, FileSpreadsheet, Image as ImageIcon, Film, Music, File as FileIcon, StickyNote, Link2, Mail, Pin, PinOff, Trash2, Upload, Eye, Plus, Loader2, FileType2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import { api, jsonInit, fmtBytes, fmtTokens, CONTEXT_LIMIT, type Source } from "./argon-types"

function iconFor(s: Source) {
  const m = s.mime ?? ""
  if (s.kind === "note") return StickyNote
  if (s.kind === "lark") return Link2
  if (s.kind === "mail") return Mail
  if (m.includes("spreadsheet") || m.includes("csv") || /\.xlsx?$/i.test(s.name)) return FileSpreadsheet
  if (m.includes("word") || /\.docx?$/i.test(s.name)) return FileType2
  if (m.startsWith("image/")) return ImageIcon
  if (m.startsWith("video/")) return Film
  if (m.startsWith("audio/")) return Music
  if (m === "application/pdf") return FileText
  return FileIcon
}

export function SourcesPanel({ projectId, sources, setSources, onOpen, onError }: {
  projectId: string
  sources: Source[]
  setSources: (fn: (prev: Source[]) => Source[]) => void
  onOpen: (s: Source) => void
  onError: (msg: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState({ name: "", text: "" })

  const total = sources.filter(s => s.enabled).reduce((n, s) => n + s.tokens, 0)

  async function upload(files: File[]) {
    if (!files.length) return
    setBusy(`Đang tải ${files.length} file…`)
    try {
      const prep = await api<{ bucket: string; uploads: { name: string; path: string; token: string }[] }>(
        `/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "prepare", files: files.map(f => ({ name: f.name, size: f.size })) }))
      const items: { path: string; name: string; mime: string; size: number }[] = []
      for (let i = 0; i < files.length; i++) {
        const up = prep.uploads[i]
        const { error } = await supabase.storage.from(prep.bucket).uploadToSignedUrl(up.path, up.token, files[i])
        if (error) throw new Error(`Tải "${files[i].name}" lỗi: ${error.message}`)
        items.push({ path: up.path, name: files[i].name, mime: files[i].type, size: files[i].size })
      }
      setBusy("Đang đọc và đếm token…")
      const r = await api<{ sources: Source[]; errors: string[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "register", items }))
      setSources(prev => [...prev, ...r.sources])
      if (r.errors.length) onError(r.errors.join("\n"))
    } catch (e) { onError((e as Error).message) }
    setBusy(null)
  }

  async function addNote() {
    if (!note.text.trim()) return
    setBusy("Đang lưu ghi chú…")
    try {
      const r = await api<{ sources: Source[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "note", name: note.name, text: note.text }))
      setSources(prev => [...prev, ...r.sources])
      setNote({ name: "", text: "" }); setNoteOpen(false)
    } catch (e) { onError((e as Error).message) }
    setBusy(null)
  }

  async function patch(s: Source, body: Record<string, unknown>) {
    setSources(prev => prev.map(x => (x.id === s.id ? { ...x, ...body } as Source : x)))
    try {
      const r = await api<{ source: Source }>(`/api/creator/argon/sources/${s.id}`, jsonInit("PATCH", body))
      setSources(prev => prev.map(x => (x.id === s.id ? r.source : x)))
    } catch (e) { onError((e as Error).message); setSources(prev => prev.map(x => (x.id === s.id ? s : x))) }
  }

  async function remove(s: Source) {
    if (!confirm(`Xoá nguồn "${s.name}" khỏi dự án (kèm mọi phiên bản)?`)) return
    try { await api(`/api/creator/argon/sources/${s.id}`, { method: "DELETE" }); setSources(prev => prev.filter(x => x.id !== s.id)) }
    catch (e) { onError((e as Error).message) }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-700 dark:text-slate-200">Nguồn ({sources.length})</span>
          <span className={cn("tabular-nums", total > CONTEXT_LIMIT * 0.8 ? "text-red-600 font-semibold" : "text-gray-500")}>{fmtTokens(total)} / 1M token</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
          <div className={cn("h-full", total > CONTEXT_LIMIT * 0.8 ? "bg-red-500" : "bg-violet-500")} style={{ width: `${Math.min(100, (total / CONTEXT_LIMIT) * 100)}%` }} />
        </div>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); void upload(Array.from(e.dataTransfer.files)) }}
        className={cn("m-3 rounded-xl border-2 border-dashed px-3 py-3 text-center text-xs transition-colors", drag ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-gray-300 dark:border-slate-600")}
      >
        <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { void upload(Array.from(e.target.files ?? [])); e.target.value = "" }} />
        <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300 font-medium hover:underline disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{busy ?? "Tải file lên hoặc kéo thả"}
        </button>
        <div className="text-gray-500 mt-1">docx · xlsx · pptx · pdf · ảnh · video · âm thanh · md/csv/json — tối đa 20MB/file</div>
        <button onClick={() => setNoteOpen(v => !v)} className="mt-2 inline-flex items-center gap-1 text-gray-600 dark:text-slate-300 hover:underline"><Plus size={12} />Thêm ghi chú / dán văn bản</button>
      </div>

      {noteOpen && (
        <div className="mx-3 mb-3 space-y-2">
          <input value={note.name} onChange={e => setNote(n => ({ ...n, name: e.target.value }))} placeholder="Tên ghi chú" className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
          <textarea value={note.text} onChange={e => setNote(n => ({ ...n, text: e.target.value }))} rows={6} placeholder="Dán văn bản, email, số liệu…" className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
          <button onClick={addNote} disabled={!!busy || !note.text.trim()} className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg disabled:opacity-50">Lưu ghi chú</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
        {sources.length === 0 && <div className="text-xs text-gray-400 text-center py-6">Chưa có nguồn nào. Argon chỉ trả lời dựa trên nguồn bật ở đây.</div>}
        {sources.map(s => {
          const Icon = iconFor(s)
          return (
            <div key={s.id} className={cn("group rounded-lg border px-2 py-1.5 text-sm", s.enabled ? "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800" : "border-dashed border-gray-300 dark:border-slate-700 opacity-60")}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={s.enabled} onChange={e => patch(s, { enabled: e.target.checked })} title="Đưa vào ngữ cảnh" className="accent-violet-600" />
                <Icon size={15} className="text-gray-500 shrink-0" />
                <button onClick={() => onOpen(s)} className="flex-1 min-w-0 text-left truncate hover:underline" title={s.name}>{s.name}</button>
                <button onClick={() => patch(s, { pinned: !s.pinned })} title={s.pinned ? "Bỏ ghim" : "Ghim lên đầu ngữ cảnh"} className={cn("shrink-0", s.pinned ? "text-violet-600" : "text-gray-400 opacity-0 group-hover:opacity-100")}>{s.pinned ? <Pin size={13} /> : <PinOff size={13} />}</button>
                <button onClick={() => onOpen(s)} title="Xem" className="shrink-0 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100"><Eye size={13} /></button>
                <button onClick={() => remove(s)} title="Xoá" className="shrink-0 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button>
              </div>
              <div className="pl-6 text-[11px] text-gray-500 flex gap-2">
                <span>{fmtTokens(s.tokens)} token</span>{s.size_bytes ? <span>{fmtBytes(s.size_bytes)}</span> : null}
                {s.version > 1 ? <span>v{s.version}</span> : null}{s.meta?.edited ? <span className="text-amber-600">đã sửa</span> : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
