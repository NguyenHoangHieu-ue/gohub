"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, CheckCircle2, ChevronDown, Folder, Link2, Loader2, Lightbulb, StickyNote, Upload } from "lucide-react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { cn } from "@/lib/utils"
import { folderPathOf, type DigestMeta, type FolderRow, type KhoSource } from "@/lib/argon/kho-pure"
import type { FactRow } from "@/lib/argon/facts-pure"
import { KhoFacts } from "./kho-facts"
import { KhoGraph } from "./kho-graph"
import { api, jsonInit, type Source } from "../argon-types"

// Cột phải của Kho: kéo thả / chọn file → tự đọc, tóm tắt nhanh, tự xếp thư mục; bên dưới là các nguồn mới nạp kèm tóm tắt và gợi ý.
interface Job { key: string; name: string; stage: "upload" | "read" | "summary" | "done" | "error"; error?: string }
const STAGE: Record<Job["stage"], string> = { upload: "Đang tải lên…", read: "Đang đọc nội dung…", summary: "Đang tóm tắt…", done: "Xong", error: "Lỗi" }
const fmtAgo = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)); return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước` }

export function KhoInbox({ projectId, folders, sources, facts, today, targetFolderId, onChanged, onMove, onOpen, onError }: {
  projectId: string; folders: FolderRow[]; sources: KhoSource[]; facts: FactRow[]; today: string; targetFolderId: string | null
  onChanged: () => Promise<void>; onMove: (ids: string[], folderId: string | null) => Promise<void>
  onOpen: (s: KhoSource) => void; onError: (m: string) => void
}) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [drag, setDrag] = useState(false)
  const [more, setMore] = useState(false)
  const [note, setNote] = useState({ name: "", text: "" })
  const [link, setLink] = useState("")
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<"new" | "facts" | "graph">("new")
  const fileRef = useRef<HTMLInputElement>(null)
  const setJob = (key: string, p: Partial<Job>) => setJobs(js => js.map(j => (j.key === key ? { ...j, ...p } : j)))
  const target = targetFolderId ? folderPathOf(targetFolderId, folders) : ""

  /** Tóm tắt nhanh các nguồn vừa nạp (mỗi lần ≤4). Thư mục được chọn ở cột trái thì xếp vào đó, không thì để Argon tự gợi ý và xếp. */
  async function summarize(ids: string[], keys: Record<string, string>) {
    for (let i = 0; i < ids.length; i += 4) {
      const part = ids.slice(i, i + 4)
      part.forEach(id => keys[id] && setJob(keys[id], { stage: "summary" }))
      try {
        await api("/api/creator/argon/kho", jsonInit("POST", { action: "digest", ids: part, autoFile: !targetFolderId }))
        part.forEach(id => keys[id] && setJob(keys[id], { stage: "done" }))
      } catch (e) { part.forEach(id => keys[id] && setJob(keys[id], { stage: "error", error: (e as Error).message })) }
    }
  }

  async function upload(files: File[]) {
    if (!files.length || busy) return
    setBusy(true)
    const items = files.map((f, i) => ({ key: `${Date.now()}-${i}`, f }))
    setJobs(js => [...items.map(x => ({ key: x.key, name: x.f.name, stage: "upload" as const })), ...js].slice(0, 12))
    try {
      for (let s = 0; s < items.length; s += 20) {
        const batch = items.slice(s, s + 20)
        const prep = await api<{ bucket: string; uploads: { name: string; path: string; token: string }[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "prepare", files: batch.map(x => ({ name: x.f.name, size: x.f.size })) }))
        const regs: { path: string; name: string; mime: string; size: number; key: string }[] = []
        for (let i = 0; i < batch.length; i++) {
          const { error } = await supabaseBrowser.storage.from(prep.bucket).uploadToSignedUrl(prep.uploads[i].path, prep.uploads[i].token, batch[i].f)
          if (error) { setJob(batch[i].key, { stage: "error", error: error.message }); continue }
          regs.push({ path: prep.uploads[i].path, name: batch[i].f.name, mime: batch[i].f.type, size: batch[i].f.size, key: batch[i].key })
          setJob(batch[i].key, { stage: "read" })
        }
        if (!regs.length) continue
        const r = await api<{ sources: Source[]; errors: string[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "register", items: regs.map(({ key: _k, ...x }) => (void _k, x)) }))
        const keyBySource: Record<string, string> = {}
        r.sources.forEach(src => { const k = regs.find(x => x.name === src.name)?.key; if (k) keyBySource[src.id] = k })
        regs.filter(x => !r.sources.some(src => src.name === x.name)).forEach(x => setJob(x.key, { stage: "error", error: r.errors.find(e => e.startsWith(x.name)) ?? "không đọc được" }))
        if (targetFolderId && r.sources.length) await onMove(r.sources.map(x => x.id), targetFolderId)
        await onChanged()
        await summarize(r.sources.map(x => x.id), keyBySource)
      }
    } catch (e) { onError((e as Error).message) }
    await onChanged()
    setBusy(false)
  }

  async function addNote() {
    if (!note.text.trim()) return
    setBusy(true)
    try {
      const r = await api<{ sources: Source[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "note", name: note.name || "Ghi chú", text: note.text }))
      setNote({ name: "", text: "" }); setMore(false)
      if (targetFolderId) await onMove(r.sources.map(x => x.id), targetFolderId)
      await onChanged(); await summarize(r.sources.map(x => x.id), {}); await onChanged()
    } catch (e) { onError((e as Error).message) }
    setBusy(false)
  }

  async function addLink() {
    if (!link.trim()) return
    setBusy(true)
    try {
      const r = await api<{ sources: Source[]; errors?: string[]; skipped?: string[]; folder?: unknown }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "lark", url: link, mode: "snapshot" }))
      if (r.folder) { onError("Đây là thư mục Lark: dùng trang \"Nguồn tự động\" ở dưới để chọn file trong thư mục."); setBusy(false); return }
      if (r.errors?.length) onError(r.errors.join("\n"))
      setLink("")
      if (targetFolderId && r.sources.length) await onMove(r.sources.map(x => x.id), targetFolderId)
      await onChanged(); await summarize(r.sources.map(x => x.id), {}); await onChanged()
    } catch (e) { onError((e as Error).message) }
    setBusy(false)
  }

  async function digestNow(s: KhoSource) {
    try { await api("/api/creator/argon/kho", jsonInit("POST", { action: "digest", ids: [s.id], autoFile: !s.folder_id })); await onChanged() } catch (e) { onError((e as Error).message) }
  }

  const recent = [...sources].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12)

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="p-3 space-y-2 border-b border-gray-200 dark:border-slate-700">
        <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); void upload(Array.from(e.dataTransfer.files)) }}
          onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") fileRef.current?.click() }}
          className={cn("rounded-xl border-2 border-dashed px-3 py-5 text-center cursor-pointer transition-colors", drag ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40" : "border-gray-300 dark:border-slate-600 hover:border-violet-400")}>
          {busy ? <Loader2 size={20} className="mx-auto animate-spin text-violet-600" /> : <Upload size={20} className="mx-auto text-violet-600" />}
          <div className="mt-1.5 text-[13px] font-medium text-gray-800 dark:text-slate-100">Kéo thả file vào đây</div>
          <div className="text-[11.5px] text-gray-500">hoặc bấm để chọn · PDF, Word, Excel, ảnh, video…</div>
          <input ref={fileRef} type="file" multiple hidden onChange={e => { void upload(Array.from(e.target.files ?? [])); e.target.value = "" }} />
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
          <Folder size={12} className="text-amber-500" />
          {target ? <>Nạp vào <b className="text-gray-700 dark:text-slate-200">{target}</b></> : "Argon tự xếp vào thư mục phù hợp"}
        </div>
        <button type="button" onClick={() => setMore(v => !v)} aria-expanded={more} className="w-full flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-slate-300">
          <StickyNote size={12} />Dán ghi chú / link Lark, YouTube<ChevronDown size={12} className={cn("ml-auto transition-transform", more && "rotate-180")} />
        </button>
        {more && (
          <div className="space-y-2">
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="Link tài liệu Lark hoặc YouTube" className="w-full px-2 py-1.5 text-[12.5px] rounded-lg border border-gray-200 dark:border-slate-600 bg-transparent" />
            <button type="button" onClick={addLink} disabled={busy || !link.trim()} className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-lg bg-violet-600 text-white disabled:opacity-40"><Link2 size={12} />Thêm link</button>
            <input value={note.name} onChange={e => setNote(n => ({ ...n, name: e.target.value }))} placeholder="Tên ghi chú" className="w-full px-2 py-1.5 text-[12.5px] rounded-lg border border-gray-200 dark:border-slate-600 bg-transparent" />
            <textarea value={note.text} onChange={e => setNote(n => ({ ...n, text: e.target.value }))} rows={4} placeholder="Dán nội dung (tin nhắn vendor, thông báo…)" className="w-full px-2 py-1.5 text-[12.5px] rounded-lg border border-gray-200 dark:border-slate-600 bg-transparent" />
            <button type="button" onClick={addNote} disabled={busy || !note.text.trim()} className="px-2.5 py-1 text-[12px] rounded-lg bg-violet-600 text-white disabled:opacity-40">Lưu ghi chú</button>
          </div>
        )}
      </div>

      <div className="flex border-b border-gray-200 dark:border-slate-700 text-[12.5px]" role="tablist">
        {([["new", "Mới nạp"], ["facts", `Sổ sự việc (${facts.filter(f => f.status === "active").length})`], ["graph", "Thực thể"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn("flex-1 py-2 font-medium border-b-2 -mb-px", tab === k ? "border-violet-600 text-violet-700 dark:text-violet-300" : "border-transparent text-gray-500 hover:text-gray-700")}>{label}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {jobs.filter(j => j.stage !== "done").map(j => (
          <div key={j.key} className="flex items-center gap-2 text-[12.5px] rounded-lg bg-gray-50 dark:bg-slate-900/50 px-2.5 py-1.5">
            {j.stage === "error" ? <AlertCircle size={13} className="text-red-500 shrink-0" /> : <Loader2 size={13} className="animate-spin text-violet-600 shrink-0" />}
            <span className="truncate flex-1">{j.name}</span><span className={cn("shrink-0 text-[11px]", j.stage === "error" ? "text-red-600" : "text-gray-500")} title={j.error}>{j.stage === "error" ? j.error?.slice(0, 40) : STAGE[j.stage]}</span>
          </div>
        ))}
        {tab === "facts" && <KhoFacts facts={facts} today={today} onChanged={onChanged} onError={onError} onOpenSource={id => { const s = sources.find(x => x.id === id); if (s) onOpen(s) }} />}
        {tab === "graph" && <KhoGraph onError={onError} onOpenSource={id => { const s = sources.find(x => x.id === id); if (s) onOpen(s) }} />}
        {tab === "new" && <>
        {recent.length === 0 && <div className="text-xs text-gray-400 py-6 text-center">Chưa có nguồn nào.</div>}
        {recent.map(s => <RecentCard key={s.id} s={s} folders={folders} onOpen={() => onOpen(s)} onMove={f => onMove([s.id], f)} onDigest={() => digestNow(s)} />)}
        </>}
      </div>

      <div className="p-2.5 border-t border-gray-200 dark:border-slate-700 text-[12px]">
        <Link href="/analytics/creator/argon/kho-nguon/du-an" className="text-violet-700 dark:text-violet-300 hover:underline">Nguồn tự động: Lark, mail, thread, gói số liệu →</Link>
      </div>
    </div>
  )
}

function RecentCard({ s, folders, onOpen, onMove, onDigest }: { s: KhoSource; folders: FolderRow[]; onOpen: () => void; onMove: (folderId: string | null) => Promise<void>; onDigest: () => void }) {
  const d: DigestMeta | null = s.digest
  const where = folderPathOf(s.folder_id, folders)
  const options = Array.from(new Map(folders.map(f => [f.id, folderPathOf(f.id, folders)])).entries()).sort((a, b) => a[1].localeCompare(b[1], "vi"))
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-2.5 space-y-1.5">
      <div className="flex items-start gap-1.5">
        <CheckCircle2 size={13} className="mt-0.5 text-emerald-500 shrink-0" />
        <button type="button" onClick={onOpen} className="text-left text-[13px] font-medium leading-snug hover:underline break-words min-w-0">{s.name}</button>
        <span className="ml-auto text-[10.5px] text-gray-400 shrink-0">{fmtAgo(s.created_at)}</span>
      </div>
      {d ? <>
        <div className="flex flex-wrap gap-1">
          {d.docType && <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200 text-[10.5px]">{d.docType}</span>}
          {s.tags.slice(0, 4).map(t => <span key={t} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-[10.5px] text-gray-600 dark:text-slate-300">{t}</span>)}
        </div>
        {d.summary && <p className="text-[12.5px] text-gray-700 dark:text-slate-300 leading-snug">{d.summary}</p>}
        {!!d.suggestions?.length && <ul className="space-y-0.5">{d.suggestions.map((g, i) => <li key={i} className="flex gap-1 text-[12px] text-amber-800 dark:text-amber-200"><Lightbulb size={12} className="mt-0.5 shrink-0" />{g}</li>)}</ul>}
      </> : <button type="button" onClick={onDigest} className="text-[12px] text-violet-700 dark:text-violet-300 hover:underline">Tóm tắt nhanh tài liệu này</button>}
      <div className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
        <Folder size={11} className="text-amber-500" />
        <select value={s.folder_id ?? ""} onChange={e => void onMove(e.target.value || null)} aria-label="Thư mục" className="min-w-0 flex-1 bg-transparent border border-gray-200 dark:border-slate-600 rounded px-1 py-0.5 text-[11.5px]">
          <option value="">Chưa phân loại</option>
          {options.map(([id, path]) => <option key={id} value={id}>{path}</option>)}
        </select>
        {d?.autoFiled && where === d.autoFiled && <span className="shrink-0 text-emerald-600">tự xếp</span>}
      </div>
    </div>
  )
}
