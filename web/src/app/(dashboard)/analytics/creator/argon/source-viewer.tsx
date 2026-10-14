"use client"

import { useEffect, useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { X, Save, RotateCcw, ExternalLink, Loader2, Sparkles, Download, Check } from "lucide-react"
import { collapseDiff, diffLines, diffStats } from "@/lib/argon/diff"
import { cn } from "@/lib/utils"
import { api, jsonInit, fmtTokens, type Source } from "./argon-types"

interface Detail { source: Source & { extracted_text: string | null }; versions: { version: number; note: string | null; author: string | null; created_at: string }[]; fileUrl: string | null }

// "=== Sheet: Tên ===\ncsv…" → các bảng để xem như Excel (chỉ xem; sửa ở tab Sửa dưới dạng CSV).
function parseSheets(text: string): { name: string; rows: string[][] }[] {
  const out: { name: string; rows: string[][] }[] = []
  for (const block of text.split(/^=== Sheet: /m).filter(Boolean)) {
    const nl = block.indexOf("\n")
    const name = block.slice(0, nl).replace(/ ===$/, "")
    const rows = block.slice(nl + 1).split("\n").filter(l => l.length).slice(0, 500).map(l => {
      const cells: string[] = []; let cur = "", q = false
      for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { cells.push(cur); cur = "" } else cur += ch }
      cells.push(cur); return cells
    })
    out.push({ name, rows })
  }
  return out
}

export function SourceViewer({ source, onClose, onChanged, onError }: {
  source: Source; onClose: () => void; onChanged: (s: Source) => void; onError: (m: string) => void
}) {
  const [d, setD] = useState<Detail | null>(null)
  const [mode, setMode] = useState<"view" | "edit">("view")
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const [sheet, setSheet] = useState(0)
  const [instr, setInstr] = useState("")
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<{ text: string; instruction: string; truncated: boolean; costUsd: number } | null>(null)

  useEffect(() => {
    let alive = true
    api<Detail>(`/api/creator/argon/sources/${source.id}`).then(r => { if (alive) { setD(r); setText(r.source.extracted_text ?? "") } }).catch(e => onError(e.message))
    return () => { alive = false }
  }, [source.id, onError])

  const mime = source.mime ?? ""
  const sheets = useMemo(() => (/spreadsheet|csv/.test(mime) || /\.xlsx?$/i.test(source.name)) && text.startsWith("=== Sheet") ? parseSheets(text) : [], [text, mime, source.name])
  const binary = source.send_binary
  const dirty = !!d && text !== (d.source.extracted_text ?? "")

  async function save() {
    setSaving(true)
    try {
      const r = await api<{ source: Source }>(`/api/creator/argon/sources/${source.id}`, jsonInit("PATCH", { text }))
      onChanged(r.source)
      const full = await api<Detail>(`/api/creator/argon/sources/${source.id}`)
      setD(full); setMode("view")
    } catch (e) { onError((e as Error).message) }
    setSaving(false)
  }

  async function askRevise() {
    if (!instr.trim()) return
    setDrafting(true); setDraft(null)
    try {
      const r = await api<{ text: string; truncated: boolean; costUsd: number }>(`/api/creator/argon/sources/${source.id}/revise`, jsonInit("POST", { instruction: instr.trim() }))
      setDraft({ text: r.text, instruction: instr.trim(), truncated: r.truncated, costUsd: r.costUsd })
    } catch (e) { onError((e as Error).message) }
    setDrafting(false)
  }

  async function applyDraft() {
    if (!draft) return
    setSaving(true)
    try {
      const r = await api<{ source: Source }>(`/api/creator/argon/sources/${source.id}`, jsonInit("PATCH", { text: draft.text, note: `Argon sửa (đã duyệt): ${draft.instruction.slice(0, 120)}` }))
      onChanged(r.source)
      const full = await api<Detail>(`/api/creator/argon/sources/${source.id}`)
      setD(full); setText(full.source.extracted_text ?? ""); setDraft(null); setInstr(""); setMode("view")
    } catch (e) { onError((e as Error).message) }
    setSaving(false)
  }

  const diff = useMemo(() => (draft && d ? diffLines(d.source.extracted_text ?? "", draft.text) : null), [draft, d])

  async function restore(v: number) {
    if (!confirm(`Khôi phục bản ${v}? (tạo thành phiên bản mới, bản hiện tại vẫn còn trong lịch sử)`)) return
    setSaving(true)
    try {
      const r = await api<{ source: Source }>(`/api/creator/argon/sources/${source.id}`, jsonInit("PATCH", { restoreVersion: v }))
      onChanged(r.source)
      const full = await api<Detail>(`/api/creator/argon/sources/${source.id}`)
      setD(full); setText(full.source.extracted_text ?? "")
    } catch (e) { onError((e as Error).message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate text-gray-800 dark:text-slate-100">{source.name}</div>
            <div className="text-xs text-gray-500">{fmtTokens(source.tokens)} token · phiên bản {d?.source.version ?? source.version}{source.external_url ? " · " : ""}{source.external_url && <a href={source.external_url} target="_blank" rel="noreferrer" className="text-violet-600 inline-flex items-center gap-0.5">mở nguồn <ExternalLink size={11} /></a>}</div>
          </div>
          {!binary && d && (
            <div className="flex rounded-lg border border-gray-300 dark:border-slate-600 overflow-hidden text-sm">
              {(["view", "edit"] as const).map(m => <button key={m} onClick={() => setMode(m)} className={cn("px-3 py-1", mode === m ? "bg-violet-600 text-white" : "text-gray-600 dark:text-slate-300")}>{m === "view" ? "Xem" : "Sửa"}</button>)}
            </div>
          )}
          {mode === "edit" && <button onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Lưu bản mới</button>}
          {!binary && d && (
            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-slate-300" title="Tải phiên bản hiện tại (định dạng đơn giản, không giữ định dạng file gốc)">
              <Download size={13} />
              <a className="hover:underline" href={`/api/creator/argon/sources/${source.id}/export?format=docx`}>docx</a>
              <a className="hover:underline" href={`/api/creator/argon/sources/${source.id}/export?format=xlsx`}>xlsx</a>
              <a className="hover:underline" href={`/api/creator/argon/sources/${source.id}/export?format=md`}>md</a>
            </div>
          )}
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X size={18} /></button>
        </div>

        {!binary && d && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-slate-700 bg-violet-50/50 dark:bg-violet-950/20">
            <Sparkles size={14} className="text-violet-600 shrink-0" />
            <input value={instr} onChange={e => setInstr(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void askRevise() }} placeholder="Nhờ Argon sửa tài liệu này… (vd: viết lại mục 3 ngắn hơn, đổi số Q3 theo sổ dự án)" className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
            <button onClick={askRevise} disabled={drafting || !instr.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg disabled:opacity-50">{drafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}Tạo bản nháp</button>
          </div>
        )}
        {draft && diff && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-700 flex items-center gap-3 text-sm bg-amber-50/60 dark:bg-amber-950/20">
            <span className="font-medium">Bản nháp của Argon</span>
            <span className="text-emerald-700">+{diffStats(diff).added}</span><span className="text-red-600">−{diffStats(diff).removed}</span>
            <span className="text-xs text-gray-500">~${draft.costUsd.toFixed(2)}</span>
            {draft.truncated && <span className="text-xs text-red-600">Bản nháp bị cắt (quá dài) — không thể áp dụng</span>}
            <button onClick={applyDraft} disabled={saving || draft.truncated} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg disabled:opacity-50"><Check size={14} />Duyệt & lưu phiên bản mới</button>
            <button onClick={() => setDraft(null)} className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg">Bỏ bản nháp</button>
          </div>
        )}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-auto p-4">
            {!d && <div className="text-sm text-gray-400">Đang tải…</div>}
            {draft && diff && (
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
                {collapseDiff(diff, 3).map((o, i) => o.t === "skip"
                  ? <div key={i} className="text-gray-400 py-0.5">⋯ {o.n} dòng không đổi ⋯</div>
                  : <div key={i} className={cn(o.t === "add" && "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100", o.t === "del" && "bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-100 line-through decoration-red-300")}>{o.t === "add" ? "+ " : o.t === "del" ? "− " : "  "}{o.line}</div>)}
              </pre>
            )}
            {!draft && d && binary && d.fileUrl && (
              mime === "application/pdf" ? <iframe src={d.fileUrl} className="w-full h-full rounded-lg border border-gray-200" title={source.name} />
              : mime.startsWith("image/") ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.fileUrl} alt={source.name} className="max-w-full mx-auto rounded-lg" />
              : mime.startsWith("video/") ? <video src={d.fileUrl} controls className="w-full rounded-lg" />
              : mime.startsWith("audio/") ? <audio src={d.fileUrl} controls className="w-full" />
              : <a href={d.fileUrl} className="text-violet-600 underline">Tải file về</a>
            )}
            {!draft && d && !binary && mode === "edit" && (
              <textarea value={text} onChange={e => setText(e.target.value)} className="w-full h-full min-h-[60vh] p-3 text-sm font-mono border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" />
            )}
            {!draft && d && !binary && mode === "view" && (
              sheets.length ? (
                <div>
                  <div className="flex gap-1 mb-2 flex-wrap">{sheets.map((s, i) => <button key={s.name} onClick={() => setSheet(i)} className={cn("px-2 py-1 text-xs rounded-md border", i === sheet ? "bg-violet-600 text-white border-violet-600" : "border-gray-300 dark:border-slate-600")}>{s.name}</button>)}</div>
                  <div className="overflow-auto border border-gray-200 dark:border-slate-700 rounded-lg">
                    <table className="text-xs w-full"><tbody>{sheets[sheet].rows.map((r, i) => <tr key={i} className={i === 0 ? "bg-gray-50 dark:bg-slate-800 font-semibold" : "border-t border-gray-100 dark:border-slate-800"}>{r.map((c, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{c}</td>)}</tr>)}</tbody></table>
                  </div>
                  {sheets[sheet].rows.length >= 500 && <div className="text-xs text-gray-400 mt-1">Chỉ hiện 500 dòng đầu — Argon vẫn đọc đủ.</div>}
                </div>
              ) : source.kind === "note" || /markdown|\.md$/i.test(mime + source.name) ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 dark:[&_th]:bg-slate-800 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>
              ) : <pre className="text-sm whitespace-pre-wrap font-sans">{text}</pre>
            )}
          </div>
          {d && d.versions.length > 0 && (
            <div className="w-56 shrink-0 border-l border-gray-200 dark:border-slate-700 overflow-auto p-3">
              <div className="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-2">Phiên bản</div>
              <div className="space-y-1.5">
                {d.versions.map(v => (
                  <div key={v.version} className="text-xs rounded-lg border border-gray-200 dark:border-slate-700 px-2 py-1.5">
                    <div className="flex items-center justify-between"><span className="font-medium">v{v.version}{v.version === d.source.version ? " (hiện tại)" : ""}</span>
                      {v.version !== d.source.version && !binary && <button onClick={() => restore(v.version)} title="Khôi phục" className="text-violet-600"><RotateCcw size={12} /></button>}</div>
                    <div className="text-gray-500">{v.note}</div>
                    <div className="text-gray-400">{new Date(v.created_at).toLocaleString("vi-VN")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
