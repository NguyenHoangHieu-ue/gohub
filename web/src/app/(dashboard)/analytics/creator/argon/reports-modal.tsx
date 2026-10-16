"use client"

import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Download, ExternalLink, Pencil, RefreshCw, Search, Star, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit, fmtBytes, type ReportMetaUi } from "./argon-types"
import { ReportViewer, downloadReport } from "./report-viewer"

// Kho báo cáo: mọi report Argon đã tạo (tự lưu khi lượt chạy xong). Mở lại, tải .html, in PDF (trong khung mở), đánh dấu ⭐ làm mẫu rồi "dựng lại với số liệu mới" trong dự án đang mở.
export function ReportsModal({ reports, activeProject, onClose, onChange, onUseTemplate, onError }: {
  reports: ReportMetaUi[]
  activeProject: string | null
  onClose: () => void
  onChange: () => void
  onUseTemplate: (r: ReportMetaUi) => void
  onError: (m: string) => void
}) {
  const [q, setQ] = useState("")
  const [tab, setTab] = useState<"all" | "tpl">("all")
  const [view, setView] = useState<{ title: string; html: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const shown = useMemo(() => reports.filter(r => (tab === "all" || r.template) && (!q.trim() || `${r.title} ${r.projectName}`.toLowerCase().includes(q.trim().toLowerCase()))), [reports, q, tab])

  async function fetchHtml(r: ReportMetaUi) { return (await api<{ html: string }>(`/api/creator/argon/reports/${r.id}`)).html }
  async function open(r: ReportMetaUi) { setBusy(r.id); try { setView({ title: r.title, html: await fetchHtml(r) }) } catch (e) { onError((e as Error).message) } setBusy(null) }
  async function download(r: ReportMetaUi) { setBusy(r.id); try { downloadReport(r.title, await fetchHtml(r)) } catch (e) { onError((e as Error).message) } setBusy(null) }
  async function patch(r: ReportMetaUi, body: { title?: string; template?: boolean }) { try { await api(`/api/creator/argon/reports/${r.id}`, jsonInit("PATCH", body)); onChange() } catch (e) { onError((e as Error).message) } }
  async function rename(r: ReportMetaUi) { const t = prompt("Đổi tên report", r.title)?.trim(); if (t) await patch(r, { title: t }) }
  async function remove(r: ReportMetaUi) {
    if (!confirm(`Xoá report "${r.title}" khỏi kho?`)) return
    try { await api(`/api/creator/argon/reports/${r.id}`, { method: "DELETE" }); onChange() } catch (e) { onError((e as Error).message) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <div className="font-semibold">Kho báo cáo <span className="text-xs font-normal text-gray-500">({reports.length})</span></div>
          <div className="flex rounded-lg border border-gray-300 dark:border-slate-600 overflow-hidden text-xs">
            {(["all", "tpl"] as const).map(t => <button key={t} onClick={() => setTab(t)} className={cn("px-2.5 py-1", tab === t ? "bg-violet-600 text-white" : "")}>{t === "all" ? "Tất cả" : `⭐ Mẫu (${reports.filter(r => r.template).length})`}</button>)}
          </div>
          <div className="relative flex-1"><Search size={13} className="absolute left-2 top-2 text-gray-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo tên report hoặc dự án" className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 dark:border-slate-600 rounded-lg bg-transparent" /></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {shown.length === 0 && <div className="text-sm text-gray-400 text-center py-10">{reports.length ? "Không có report khớp." : "Chưa có report nào. Gõ chủ đề vào ô chat rồi bấm “Làm report” — report tự vào kho."}</div>}
          {shown.map(r => (
            <div key={r.id} className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2">
              <div className="flex items-center gap-2">
                <button onClick={() => patch(r, { template: !r.template })} title={r.template ? "Bỏ đánh dấu mẫu" : "Đánh dấu làm mẫu (dựng lại với số liệu mới)"} className={r.template ? "text-amber-500" : "text-gray-300 hover:text-amber-500"}><Star size={16} fill={r.template ? "currentColor" : "none"} /></button>
                <button onClick={() => open(r)} className="flex-1 min-w-0 text-left text-sm font-medium truncate hover:underline" title={r.title}>{r.title}</button>
                <span className="text-[11px] text-gray-500 shrink-0">{new Date(r.createdAt).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {fmtBytes(r.size)}</span>
              </div>
              <div className="mt-1 pl-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span className="truncate max-w-[220px]">{r.projectName || "—"}</span>
                <button onClick={() => open(r)} disabled={busy === r.id} className="inline-flex items-center gap-1 text-violet-600 hover:underline"><ExternalLink size={11} />Mở</button>
                <button onClick={() => download(r)} disabled={busy === r.id} className="inline-flex items-center gap-1 hover:text-gray-800"><Download size={11} />.html</button>
                {activeProject && <button onClick={() => { onUseTemplate(r); onClose() }} className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline" title="Dựng lại report này với số liệu mới nhất từ nguồn của dự án đang mở"><RefreshCw size={11} />Dựng lại với số liệu mới</button>}
                <button onClick={() => rename(r)} className="inline-flex items-center gap-1 hover:text-gray-800 ml-auto"><Pencil size={11} />Đổi tên</button>
                <button onClick={() => remove(r)} className="inline-flex items-center gap-1 hover:text-red-600"><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {view && <ReportViewer title={view.title} html={view.html} onClose={() => setView(null)} />}
    </div>, document.body)
}
