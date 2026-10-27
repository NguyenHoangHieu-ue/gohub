"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, Check, ExternalLink, FileText, Loader2, Paperclip, Pencil, PenLine, Plus, RotateCcw, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit } from "../argon-types"
import type { UploadState } from "./use-chat-upload"

// "Tài liệu của tôi": mọi tài liệu người dùng đã đưa cho trợ lý (Kho của CHÍNH họ). Người dùng PHẢI biết trợ lý đang hiểu gì từ tài liệu nên:
//  - Danh sách: tên, ngày, một đoạn tóm tắt "trợ lý hiểu là…", nút thêm tài liệu / viết ghi chú.
//  - Chi tiết: tóm tắt + NỘI DUNG chữ trợ lý đọc được; nếu sai thì Sửa nội dung (mỗi lần sửa là một phiên bản, khôi phục được), đổi tên, tạm không dùng, xoá; xem file gốc.
//  - PDF/ảnh/âm thanh trợ lý đọc thẳng từ file gốc nên không sửa chữ được: tải bản đúng lên rồi xoá bản cũ.
interface Doc { id: string; name: string; kind: string; enabled: boolean; updated_at: string; size_bytes: number | null; digest: { summary?: string; tags?: string[] } | null }
interface Detail { source: { id: string; name: string; kind: string; enabled: boolean; send_binary: boolean; version: number; extracted_text: string | null; updated_at: string; external_url: string | null }; versions: { version: number; note: string | null; author: string | null; created_at: string }[]; fileUrl: string | null }
const fmt = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
const SHOW = 6000
const KIND: Record<string, string> = { file: "Tệp", note: "Ghi chú", lark: "Lark", mail: "Thư" }

export function MyDocs({ onClose, refreshKey, onError, upload, up, onChangedDocs }: {
  onClose: () => void; refreshKey: unknown; onError: (m: string) => void
  upload: (files: File[]) => void; up: UploadState; onChangedDocs?: () => void
}) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState({ name: "", text: "" })
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => api<{ projectId: string; sources: Doc[] }>("/api/creator/argon/kho").then(r => { setProjectId(r.projectId); setDocs([...(r.sources ?? [])].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))) }).catch(e => { onError((e as Error).message); setDocs([]) }), [onError])
  useEffect(() => { void load() }, [load, refreshKey])

  async function addNote() {
    if (!projectId || !note.text.trim()) return
    setBusy("note")
    try {
      await api(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "note", name: note.name.trim() || "Ghi chú", text: note.text }))
      setNote({ name: "", text: "" }); setNoteOpen(false); await load(); onChangedDocs?.()
    } catch (e) { onError((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-label="Tài liệu của tôi" className="w-full sm:max-w-2xl max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-700">
        {openId ? (
          <DocDetail id={openId} onBack={() => { setOpenId(null); void load() }} onClose={onClose} onError={onError} onChanged={() => { void load(); onChangedDocs?.() }} />
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-800">
              <FileText size={16} className="text-violet-600" />
              <span className="text-[15px] font-semibold text-gray-900 dark:text-slate-100">Tài liệu của tôi</span>
              <button type="button" onClick={onClose} aria-label="Đóng" className="ml-auto rounded-md p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"><X size={16} /></button>
            </div>
            <div className="px-4 pt-3 pb-2 space-y-2.5">
              <p className="text-[13px] leading-relaxed text-gray-500 dark:text-slate-400">Đây là những gì trợ lý đã đọc và dùng để trả lời bạn. Chỉ mình bạn thấy. Bấm vào một tài liệu để xem trợ lý hiểu gì, sửa nếu sai.</p>
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" multiple hidden onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) upload(fs) }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-[13px] font-medium text-white hover:bg-violet-700"><Paperclip size={14} />Thêm tài liệu</button>
                <button type="button" onClick={() => setNoteOpen(v => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-300 dark:border-slate-600 px-3.5 text-[13px] text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"><PenLine size={14} />Viết ghi chú</button>
              </div>
              {up.stage === "working" && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-[13px] text-emerald-900 dark:text-emerald-100"><Loader2 size={14} className="animate-spin" />{up.text}</p>}
              {up.stage === "done" && <p className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-[13px] text-emerald-900 dark:text-emerald-100">Đã lưu: {up.names.join(", ")}.{up.failed.length > 0 && ` Chưa lưu được: ${up.failed.join(", ")}.`}</p>}
              {up.stage === "error" && <p className="rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[13px] text-red-800 dark:text-red-200">{up.text}</p>}
              {noteOpen && (
                <div className="space-y-2 rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                  <input value={note.name} onChange={e => setNote(n => ({ ...n, name: e.target.value }))} maxLength={80} placeholder="Tên ghi chú (vd: Giá báo của NCC A)" className="w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-transparent px-3 py-2 text-[13.5px] outline-none focus:ring-1 focus:ring-violet-400" />
                  <textarea value={note.text} onChange={e => setNote(n => ({ ...n, text: e.target.value }))} rows={5} placeholder="Viết hoặc dán nội dung bạn muốn trợ lý nhớ…" className="w-full resize-y rounded-lg border border-gray-200 dark:border-slate-600 bg-transparent px-3 py-2 text-[13.5px] leading-relaxed outline-none focus:ring-1 focus:ring-violet-400" />
                  <div className="flex gap-2"><button type="button" onClick={() => void addNote()} disabled={busy === "note" || !note.text.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-[13px] font-medium text-white disabled:opacity-50">{busy === "note" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Lưu ghi chú</button><button type="button" onClick={() => setNoteOpen(false)} className="h-9 rounded-xl px-3 text-[13px] text-gray-600 dark:text-slate-300">Huỷ</button></div>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
              {docs === null && <div className="flex items-center gap-2 px-3 py-6 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" />Đang tải…</div>}
              {docs?.length === 0 && <p className="px-3 py-8 text-center text-sm text-gray-400">Chưa có tài liệu nào. Bấm “Thêm tài liệu” hoặc “Viết ghi chú”.</p>}
              {docs?.map(d => (
                <button key={d.id} type="button" onClick={() => setOpenId(d.id)} className={cn("w-full text-left flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-gray-50 dark:hover:bg-slate-800", !d.enabled && "opacity-60")}>
                  <FileText size={16} className="mt-0.5 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2"><span className="truncate text-[14px] font-medium text-gray-900 dark:text-slate-100">{d.name}</span>{!d.enabled && <span className="rounded bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10.5px] text-gray-500">Tạm không dùng</span>}</span>
                    <span className="block text-[11.5px] text-gray-400">{KIND[d.kind] ?? d.kind} · {fmt(d.updated_at)}</span>
                    {d.digest?.summary && <span className="mt-1 block line-clamp-2 text-[12.5px] leading-snug text-gray-600 dark:text-slate-300">{d.digest.summary}</span>}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DocDetail({ id, onBack, onClose, onError, onChanged }: { id: string; onBack: () => void; onClose: () => void; onError: (m: string) => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [digest, setDigest] = useState<string>("")
  const [edit, setEdit] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [rename, setRename] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const r = await api<Detail>(`/api/creator/argon/sources/${id}`)
      setD(r)
      const kho = await api<{ sources: Doc[] }>("/api/creator/argon/kho").catch(() => null)
      setDigest(kho?.sources.find(s => s.id === id)?.digest?.summary ?? "")
    } catch (e) { onError((e as Error).message); onBack() }
  }, [id, onError, onBack])
  useEffect(() => { void load() }, [load])

  async function patch(body: Record<string, unknown>, key: string) {
    setBusy(key)
    try { await api(`/api/creator/argon/sources/${id}`, jsonInit("PATCH", body)); await load(); onChanged() } catch (e) { onError((e as Error).message) } finally { setBusy(null) }
  }
  async function remove() {
    if (!d || !confirm(`Xoá tài liệu “${d.source.name}”? Trợ lý sẽ không còn dùng tài liệu này nữa.`)) return
    setBusy("del")
    try { await api(`/api/creator/argon/sources/${id}`, { method: "DELETE" }); onChanged(); onBack() } catch (e) { onError((e as Error).message); setBusy(null) }
  }

  if (!d) return <div className="flex items-center gap-2 px-5 py-10 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" />Đang tải…</div>
  const s = d.source, text = s.extracted_text ?? ""
  const editable = !s.send_binary
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 dark:border-slate-800">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"><ArrowLeft size={14} />Quay lại</button>
        {rename === null ? (
          <><span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900 dark:text-slate-100">{s.name}</span>
            <button type="button" onClick={() => setRename(s.name)} aria-label="Đổi tên" className="rounded-md p-1 text-gray-400 hover:text-violet-600"><Pencil size={14} /></button></>
        ) : (
          <><input value={rename} onChange={e => setRename(e.target.value)} autoFocus maxLength={160} onKeyDown={e => { if (e.key === "Enter") { void patch({ name: rename }, "rename"); setRename(null) } else if (e.key === "Escape") setRename(null) }} className="min-w-0 flex-1 rounded-lg border border-violet-300 bg-white dark:bg-slate-800 px-2.5 py-1 text-[14px] outline-none" />
            <button type="button" onClick={() => { void patch({ name: rename }, "rename"); setRename(null) }} aria-label="Lưu tên" className="rounded-md p-1 text-emerald-600"><Check size={16} /></button></>
        )}
        <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-md p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"><X size={16} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
        <p className="text-[12px] text-gray-400">{KIND[s.kind] ?? s.kind} · cập nhật {fmt(s.updated_at)} · bản {s.version}{!s.enabled && " · đang tạm không dùng"}</p>
        {digest && <section><h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Trợ lý hiểu tài liệu này là</h3><p className="rounded-xl bg-violet-50/70 dark:bg-violet-950/30 px-3.5 py-3 text-[14px] leading-relaxed text-gray-800 dark:text-slate-200">{digest}</p></section>}
        <section>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Nội dung trợ lý đọc được</h3>
            {editable && edit === null && <button type="button" onClick={() => setEdit(text)} className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-medium text-violet-700 dark:text-violet-300 hover:underline"><Pencil size={12} />Sửa nội dung</button>}
          </div>
          {!editable && <p className="mb-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[12.5px] leading-snug text-amber-900 dark:text-amber-100">Tệp này (PDF, ảnh, âm thanh…) trợ lý đọc thẳng từ file gốc nên không sửa chữ được. Nếu thấy sai, hãy tải bản đúng lên rồi xoá bản này.</p>}
          {edit !== null ? (
            <div className="space-y-2">
              <textarea value={edit} onChange={e => setEdit(e.target.value)} rows={14} className="w-full resize-y rounded-xl border border-gray-300 dark:border-slate-600 bg-transparent px-3 py-2.5 text-[13.5px] leading-relaxed outline-none focus:ring-1 focus:ring-violet-400" />
              <div className="flex gap-2">
                <button type="button" onClick={async () => { await patch({ text: edit, note: "Sửa tay" }, "save"); setEdit(null) }} disabled={busy === "save"} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-[13px] font-medium text-white disabled:opacity-50">{busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Lưu thay đổi</button>
                <button type="button" onClick={() => setEdit(null)} className="h-9 rounded-xl px-3 text-[13px] text-gray-600 dark:text-slate-300">Huỷ</button>
              </div>
              <p className="text-[12px] text-gray-400">Mỗi lần lưu là một phiên bản mới; bạn có thể khôi phục bản cũ ở mục “Các bản đã sửa”.</p>
            </div>
          ) : text ? (
            <>
              <pre className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-gray-50 dark:bg-slate-800/60 px-3.5 py-3 font-sans text-[13px] leading-relaxed text-gray-800 dark:text-slate-200">{more ? text : text.slice(0, SHOW)}</pre>
              {text.length > SHOW && <button type="button" onClick={() => setMore(v => !v)} className="mt-1.5 text-[12.5px] text-violet-700 dark:text-violet-300 hover:underline">{more ? "Thu gọn" : `Xem hết (${text.length.toLocaleString("vi-VN")} ký tự)`}</button>}
            </>
          ) : <p className="rounded-xl bg-gray-50 dark:bg-slate-800/60 px-3.5 py-3 text-[13px] text-gray-500">Trợ lý chưa đọc được chữ nào từ tài liệu này.</p>}
        </section>
        {d.versions.length > 1 && (
          <section>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Các bản đã sửa</h3>
            <ul className="space-y-1">
              {d.versions.slice(0, 6).map(v => (
                <li key={v.version} className="flex items-center gap-2 text-[12.5px] text-gray-600 dark:text-slate-300">
                  <span className="tabular-nums">Bản {v.version}</span><span className="text-gray-400">{fmt(v.created_at)}{v.note ? ` · ${v.note}` : ""}</span>
                  {v.version === s.version ? <span className="ml-auto text-[11px] text-emerald-600">đang dùng</span> : editable && <button type="button" disabled={!!busy} onClick={() => void patch({ restoreVersion: v.version }, `r${v.version}`)} className="ml-auto inline-flex items-center gap-1 text-violet-700 dark:text-violet-300 hover:underline disabled:opacity-50"><RotateCcw size={11} />Khôi phục</button>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-slate-800 px-4 py-3">
        {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-300 dark:border-slate-600 px-3.5 text-[13px] text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"><ExternalLink size={13} />Xem file gốc</a>}
        <button type="button" disabled={!!busy} onClick={() => void patch({ enabled: !s.enabled }, "toggle")} className="inline-flex h-9 items-center rounded-xl border border-gray-300 dark:border-slate-600 px-3.5 text-[13px] text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">{s.enabled ? "Tạm không dùng" : "Dùng lại"}</button>
        <button type="button" disabled={busy === "del"} onClick={() => void remove()} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50">{busy === "del" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}Xoá</button>
      </div>
    </>
  )
}
