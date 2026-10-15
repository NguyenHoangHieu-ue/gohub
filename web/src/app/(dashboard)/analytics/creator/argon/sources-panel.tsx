"use client"

import { useRef, useState } from "react"
import { FileText, FileSpreadsheet, Image as ImageIcon, Film, Music, File as FileIcon, StickyNote, Link2, Mail, Pin, PinOff, Trash2, Upload, Eye, Plus, Loader2, FileType2, RefreshCw, BarChart3 } from "lucide-react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { cn } from "@/lib/utils"
import { api, jsonInit, fmtBytes, fmtTokens, CONTEXT_LIMIT, type MailRuleUi, type Source } from "./argon-types"

function iconFor(s: Source) {
  const m = s.mime ?? ""
  if (s.meta?.dataPack) return BarChart3
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

export function SourcesPanel({ projectId, sources, setSources, onOpen, onError, onReload }: {
  projectId: string
  sources: Source[]
  setSources: (fn: (prev: Source[]) => Source[]) => void
  onOpen: (s: Source) => void
  onError: (msg: string) => void
  onReload: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState({ name: "", text: "" })
  const [larkOpen, setLarkOpen] = useState(false)
  const [lark, setLark] = useState({ url: "", mode: "snapshot" as "snapshot" | "live" })
  const [folderPick, setFolderPick] = useState<{ items: { token: string; type: string; name: string; have: boolean }[]; limit: number; picked: string[]; autoNew: boolean } | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [dataOpen, setDataOpen] = useState(false)
  const [packs, setPacks] = useState<{ id: string; label: string; description: string; noQuarter?: boolean; scopes?: { id: string; label: string }[] }[]>([])
  const [quarters, setQuarters] = useState<string[]>([])
  const [pack, setPack] = useState({ id: "", quarter: "", scope: "", mode: "snapshot" as "snapshot" | "live" })
  const [mailOpen, setMailOpen] = useState(false)

  async function openData() {
    const opening = !dataOpen
    setDataOpen(opening); setLarkOpen(false); setNoteOpen(false); setMailOpen(false)
    if (!opening || packs.length) return
    try {
      const r = await api<{ packs: { id: string; label: string; description: string; noQuarter?: boolean; scopes?: { id: string; label: string }[] }[]; quarters: string[] }>("/api/creator/argon/data-packs")
      setPacks(r.packs); setQuarters(r.quarters); setPack(p => ({ ...p, id: r.packs[0]?.id ?? "", quarter: r.quarters[0] ?? "" }))
    } catch (e) { onError((e as Error).message) }
  }

  async function addPack() {
    const def = packs.find(p => p.id === pack.id)
    const noQ = !!def?.noQuarter
    const scopeId = def?.scopes ? (pack.scope || def.scopes[0]?.id) : undefined
    if (!pack.id || (!pack.quarter && !noQ && !scopeId)) return
    setBusy("Đang lấy số liệu hệ thống… (có thể mất ~30 giây)"); setInfo(null)
    try {
      const r = await api<{ sources: Source[]; skipped: string[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "data", pack: pack.id, quarter: scopeId ?? (noQ ? "all" : pack.quarter), mode: pack.mode }))
      setSources(prev => [...prev, ...r.sources])
      setInfo(r.sources.length ? `Đã thêm gói dữ liệu (${fmtTokens(r.sources[0].tokens)} token)` : r.skipped.join(", "))
      if (r.sources.length) setDataOpen(false)
    } catch (e) { onError((e as Error).message) }
    setBusy(null)
  }
  const [rules, setRules] = useState<MailRuleUi[]>([])
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([])
  const [rule, setRule] = useState<MailRuleUi>({ id: "", name: "", folder: "INBOX", from: "", keywords: "", sinceDays: 30, maxThreads: 30, attachments: true })

  async function openMail() {
    const opening = !mailOpen
    setMailOpen(opening); setLarkOpen(false); setNoteOpen(false); setDataOpen(false)
    if (!opening) return
    try {
      const r = await api<{ rules: MailRuleUi[]; folders: { id: string; name: string }[]; error?: string }>(`/api/creator/argon/projects/${projectId}/mail`)
      setRules(r.rules); setFolders(r.folders)
      if (r.error) onError(r.error)
    } catch (e) { onError((e as Error).message) }
  }

  const mailInfo = (results: { rule: string; threads: number; created: number; updated: number; attachments: number; errors: string[] }[]) => {
    const t = results.reduce((n, x) => n + x.threads, 0), c = results.reduce((n, x) => n + x.created, 0), u = results.reduce((n, x) => n + x.updated, 0), a = results.reduce((n, x) => n + x.attachments, 0)
    const errs = results.flatMap(x => x.errors)
    setInfo(`Mail: ${t} luồng khớp · ${c} mới · ${u} cập nhật · ${a} đính kèm`)
    if (errs.length) onError(errs.join("\n"))
  }

  async function saveRule() {
    setBusy("Đang đọc mail Lark… (có thể mất ~30 giây)"); setInfo(null)
    try {
      const r = await api<{ results: Parameters<typeof mailInfo>[0]; rules: MailRuleUi[] }>(`/api/creator/argon/projects/${projectId}/mail`, jsonInit("POST", { rule: { ...rule, name: rule.name || `Mail ${rule.folder}` } }))
      setRules(r.rules); mailInfo(r.results); onReload()
      setRule({ id: "", name: "", folder: rule.folder, from: "", keywords: "", sinceDays: 30, maxThreads: 30, attachments: true })
    } catch (e) { onError((e as Error).message) }
    setBusy(null)
  }

  async function syncMail() {
    setBusy("Đang đọc lại mail Lark…")
    try {
      const r = await api<{ results: Parameters<typeof mailInfo>[0] }>(`/api/creator/argon/projects/${projectId}/mail`, jsonInit("POST", { action: "sync" }))
      mailInfo(r.results); onReload()
    } catch (e) { onError((e as Error).message) }
    setBusy(null)
  }

  async function deleteRule(id: string) {
    try { const r = await api<{ rules: MailRuleUi[] }>(`/api/creator/argon/projects/${projectId}/mail?ruleId=${id}`, { method: "DELETE" }); setRules(r.rules) } catch (e) { onError((e as Error).message) }
  }

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
        const { error } = await supabaseBrowser.storage.from(prep.bucket).uploadToSignedUrl(up.path, up.token, files[i])
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

  async function addLark(pick?: string[]) {
    if (!lark.url.trim()) return
    setBusy(pick ? "Đang đọc các file đã chọn…" : "Đang đọc tài liệu Lark…"); setInfo(null)
    try {
      const r = await api<{ sources: Source[]; errors: string[]; skipped: string[]; folder?: { items: { token: string; type: string; name: string; have: boolean }[]; limit: number } }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "lark", url: lark.url.trim(), mode: lark.mode, pick, autoNew: folderPick?.autoNew }))
      if (r.folder) { setFolderPick({ ...r.folder, picked: [], autoNew: false }); setBusy(null); return }
      setSources(prev => [...prev, ...r.sources])
      const msg = [r.sources.length ? `Đã thêm ${r.sources.length} nguồn từ Lark` : "", ...r.skipped, ...r.errors].filter(Boolean).join("\n")
      if (r.errors.length) onError(msg); else setInfo(msg || null)
      if (r.sources.length) { setLark(l => ({ ...l, url: "" })); setLarkOpen(false); setFolderPick(null) }
    } catch (e) { onError((e as Error).message) }
    setBusy(null)
  }

  async function syncAll() {
    setBusy("Đang đồng bộ Lark…"); setInfo(null)
    try {
      const r = await api<{ results: { name: string; status: string; note?: string }[]; sources: Source[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "sync" }))
      setSources(prev => prev.map(x => r.sources.find(n => n.id === x.id) ?? x))
      const ch = r.results.filter(x => x.status === "changed").length, er = r.results.filter(x => x.status === "error")
      setInfo(`Đồng bộ ${r.results.length} nguồn: ${ch} có thay đổi${er.length ? `, ${er.length} lỗi` : ""}`)
      if (er.length) onError(er.map(x => `${x.name}: ${x.note}`).join("\n"))
    } catch (e) { onError((e as Error).message) }
    setBusy(null)
  }

  async function syncOne(s: Source) {
    setBusy(`Đồng bộ "${s.name}"…`); setInfo(null)
    try {
      const r = await api<{ result: { status: string; note?: string }; source: Source }>(`/api/creator/argon/sources/${s.id}`, { method: "POST" })
      setSources(prev => prev.map(x => (x.id === s.id ? r.source : x)))
      if (r.result.status === "error" || r.result.status === "skipped") onError(`${s.name}: ${r.result.note}`)
      else setInfo(r.result.status === "changed" ? `"${s.name}" đã cập nhật (${r.result.note})` : `"${s.name}" không có thay đổi`)
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
        <div className="text-gray-500 mt-1">docx · xlsx · pptx · pdf · ảnh · video · âm thanh · md/csv/json — tối đa 45MB/file (file lớn hơn 8MB đi qua Gemini Files API)</div>
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
          <button onClick={() => { setLarkOpen(v => !v); setNoteOpen(false); setMailOpen(false); setDataOpen(false) }} className="inline-flex items-center gap-1 text-gray-600 dark:text-slate-300 hover:underline"><Link2 size={12} />Thêm link (Lark / video)</button>
          <button onClick={() => { setNoteOpen(v => !v); setLarkOpen(false); setMailOpen(false); setDataOpen(false) }} className="inline-flex items-center gap-1 text-gray-600 dark:text-slate-300 hover:underline"><Plus size={12} />Ghi chú / dán văn bản</button>
          <button onClick={openData} className="inline-flex items-center gap-1 text-gray-600 dark:text-slate-300 hover:underline"><BarChart3 size={12} />Số liệu hệ thống</button>
          <button onClick={openMail} className="inline-flex items-center gap-1 text-gray-600 dark:text-slate-300 hover:underline"><Mail size={12} />Mail Lark</button>
          {sources.some(x => x.kind === "lark" || !!x.meta?.dataPack) && <button onClick={syncAll} disabled={!!busy} className="inline-flex items-center gap-1 text-gray-600 dark:text-slate-300 hover:underline disabled:opacity-50"><RefreshCw size={12} />Đồng bộ Lark</button>}
        </div>
      </div>

      {dataOpen && (
        <div className="mx-3 mb-3 space-y-2 text-xs">
          <div className="text-gray-500">Số liệu MỚI NHẤT của hệ thống (cùng nguồn với các tab Quarter Report, Squad, Thị trường…), lưu thành 1 nguồn để Argon đọc. Đồng bộ hằng đêm hoặc đọc mới mỗi lần chạy.</div>
          <select value={pack.id} onChange={e => setPack(p => ({ ...p, id: e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent">
            {packs.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <div className="text-gray-400">{packs.find(p => p.id === pack.id)?.description}</div>
          <div className="flex flex-wrap items-center gap-2">
            {packs.find(p => p.id === pack.id)?.scopes && <select value={pack.scope || packs.find(p => p.id === pack.id)!.scopes![0].id} onChange={e => setPack(p => ({ ...p, scope: e.target.value }))} className="w-full min-w-0 px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent">
              {packs.find(p => p.id === pack.id)!.scopes!.map(sc => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
            </select>}
            {!packs.find(p => p.id === pack.id)?.noQuarter && !packs.find(p => p.id === pack.id)?.scopes && <select value={pack.quarter} onChange={e => setPack(p => ({ ...p, quarter: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent">
              {quarters.map(q => <option key={q} value={q}>{q}</option>)}
            </select>}
            <label className="inline-flex items-center gap-1"><input type="radio" checked={pack.mode === "snapshot"} onChange={() => setPack(p => ({ ...p, mode: "snapshot" }))} />Chụp lại (hằng đêm)</label>
            <label className="inline-flex items-center gap-1"><input type="radio" checked={pack.mode === "live"} onChange={() => setPack(p => ({ ...p, mode: "live" }))} />Mới mỗi lần chạy</label>
          </div>
          <button onClick={addPack} disabled={!!busy || !pack.id} className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg disabled:opacity-50">Thêm</button>
        </div>
      )}
      {mailOpen && (
        <div className="mx-3 mb-3 space-y-2 text-xs">
          <div className="text-gray-500">Chỉ đọc. Mỗi luồng thư khớp quy tắc thành 1 nguồn; đính kèm pdf/docx/xlsx/pptx/csv thành nguồn riêng.</div>
          {rules.map(r => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 px-2 py-1">
              <span className="flex-1 truncate" title={`${r.folder} · ${r.sinceDays} ngày${r.from ? ` · từ ${r.from}` : ""}${r.keywords ? ` · ${r.keywords}` : ""}`}>{r.name} <span className="text-gray-400">· {folders.find(f => f.id === r.folder)?.name ?? r.folder} · {r.sinceDays}n</span></span>
              <button onClick={() => deleteRule(r.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={12} /></button>
            </div>
          ))}
          {rules.length > 0 && <button onClick={syncMail} disabled={!!busy} className="inline-flex items-center gap-1 text-violet-600 hover:underline disabled:opacity-50"><RefreshCw size={11} />Nạp lại mọi quy tắc</button>}
          <div className="pt-1 border-t border-gray-100 dark:border-slate-700 space-y-1.5">
            <input value={rule.name} onChange={e => setRule(r => ({ ...r, name: e.target.value }))} placeholder="Tên quy tắc (vd: Mail vendor 3HK)" className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
            <div className="flex gap-1.5">
              <select value={rule.folder} onChange={e => setRule(r => ({ ...r, folder: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent">
                {(folders.length ? folders : [{ id: "INBOX", name: "Inbox" }]).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <input type="number" min={1} max={365} value={rule.sinceDays} onChange={e => setRule(r => ({ ...r, sinceDays: Number(e.target.value) }))} title="Số ngày gần nhất" className="w-16 px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
              <input type="number" min={1} max={60} value={rule.maxThreads} onChange={e => setRule(r => ({ ...r, maxThreads: Number(e.target.value) }))} title="Tối đa số luồng thư" className="w-16 px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
            </div>
            <input value={rule.from ?? ""} onChange={e => setRule(r => ({ ...r, from: e.target.value }))} placeholder="Người gửi chứa… (vd: hthk.com)" className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
            <input value={rule.keywords ?? ""} onChange={e => setRule(r => ({ ...r, keywords: e.target.value }))} placeholder="Từ khoá, cách nhau dấu phẩy (khớp tiêu đề hoặc nội dung)" className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={rule.attachments} onChange={e => setRule(r => ({ ...r, attachments: e.target.checked }))} className="accent-violet-600" />Tải cả đính kèm (≤15MB)</label>
            <div><button onClick={saveRule} disabled={!!busy} className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg disabled:opacity-50">Lưu & nạp mail</button></div>
          </div>
        </div>
      )}
      {info && <div className="mx-3 mb-2 text-xs rounded-lg bg-emerald-50 text-emerald-800 px-2.5 py-1.5 whitespace-pre-wrap">{info}</div>}
      {larkOpen && (
        <div className="mx-3 mb-3 space-y-2">
          <input value={lark.url} onChange={e => { setFolderPick(null); setLark(l => ({ ...l, url: e.target.value })) }} placeholder="Dán link Lark (docx / sheets / wiki / base / thư mục / biên bản họp minutes) hoặc video YouTube" className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
            <label className="inline-flex items-center gap-1"><input type="radio" checked={lark.mode === "snapshot"} onChange={() => setLark(l => ({ ...l, mode: "snapshot" }))} />Chụp lại (đồng bộ hằng đêm)</label>
            <label className="inline-flex items-center gap-1"><input type="radio" checked={lark.mode === "live"} onChange={() => setLark(l => ({ ...l, mode: "live" }))} />Đọc mới mỗi lần chạy</label>
          </div>
          <button onClick={() => void addLark()} disabled={!!busy || !lark.url.trim()} className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg disabled:opacity-50">Thêm</button>
          {folderPick && (
            <div className="rounded-lg border border-gray-200 dark:border-slate-600 p-2 space-y-1.5 text-xs">
              <div className="flex items-center justify-between"><span className="font-medium">Thư mục có {folderPick.items.length} file — chọn file cần thêm (tối đa {folderPick.limit})</span>
                <button className="text-violet-600" onClick={() => setFolderPick(f => f && ({ ...f, picked: f.picked.length ? [] : f.items.filter(i => !i.have).slice(0, f.limit).map(i => i.token) }))}>{folderPick.picked.length ? "Bỏ chọn" : "Chọn tất cả"}</button></div>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {folderPick.items.map(i => (
                  <label key={i.token} className={`flex items-center gap-1.5 ${i.have ? "opacity-50" : ""}`}>
                    <input type="checkbox" disabled={i.have} checked={folderPick.picked.includes(i.token)} onChange={e => setFolderPick(f => f && ({ ...f, picked: e.target.checked ? [...f.picked, i.token].slice(0, f.limit) : f.picked.filter(t => t !== i.token) }))} />
                    <span className="truncate">{i.name}</span><span className="text-gray-400 shrink-0">{i.type}{i.have ? " · đã có" : ""}</span>
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={folderPick.autoNew} onChange={e => setFolderPick(f => f && ({ ...f, autoNew: e.target.checked }))} />Đồng bộ đêm tự thêm file MỚI trong thư mục này</label>
              <button onClick={() => void addLark(folderPick.picked)} disabled={!!busy || !folderPick.picked.length} className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg disabled:opacity-50">Thêm {folderPick.picked.length} file đã chọn</button>
            </div>
          )}
        </div>
      )}

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
                {(s.kind === "lark" || !!s.meta?.dataPack) && s.synced_at ? <span title={s.sync_mode === "live" ? "Đọc mới mỗi lần chạy" : "Đồng bộ hằng đêm"}>{s.sync_mode === "live" ? "live" : "chụp"} · {new Date(s.synced_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span> : null}
                {(s.kind === "lark" || !!s.meta?.dataPack) && <button onClick={() => syncOne(s)} disabled={!!busy} className="text-violet-600 hover:underline inline-flex items-center gap-0.5 disabled:opacity-50"><RefreshCw size={10} />đồng bộ</button>}
                {s.version > 1 ? <span>v{s.version}</span> : null}{s.meta?.edited ? <span className="text-amber-600">đã sửa</span> : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
