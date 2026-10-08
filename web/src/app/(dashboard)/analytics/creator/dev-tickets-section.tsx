"use client"

import { useCallback, useEffect, useState } from "react"
import { Code2, ExternalLink, RefreshCw, Send } from "lucide-react"
import { cn } from "@/lib/utils"

// U5b (plan be-gau-upgrade.md): phiếu sửa code do Gấu Pro tạo, Claude Code chạy trên GitHub Actions. Tạo + duyệt phiếu ở Gấu Pro (web/Lark);
// ở đây xem tiến độ, trả lời câu hỏi, mở PR.
interface Ticket {
  id: number; title: string; status: string; plan: string; question: string | null; summary: string | null
  pr_url: string | null; preview_url: string | null; run_url: string | null; error: string | null
  answers: { q: string; a: string }[]; updated_at: string
}

const STATUS: Record<string, { label: string; cls: string }> = {
  queued:    { label: "Chờ chạy", cls: "bg-slate-100 text-slate-600" },
  running:   { label: "Đang làm", cls: "bg-sky-100 text-sky-700" },
  question:  { label: "Cần anh trả lời", cls: "bg-amber-100 text-amber-700" },
  pr_open:   { label: "Đã mở PR", cls: "bg-emerald-100 text-emerald-700" },
  failed:    { label: "Lỗi", cls: "bg-rose-100 text-rose-700" },
  cancelled: { label: "Đã huỷ", cls: "bg-slate-100 text-slate-400" },
}

export default function DevTicketsSection() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [sending, setSending] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch("/api/dev-tickets").then(async r => {
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setTickets(d.tickets ?? []); setError(null) } else setError(d.error || "Không tải được phiếu")
    }).finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  const answer = async (id: number) => {
    const text = draft[id]?.trim()
    if (!text) return
    setSending(id)
    try {
      const r = await fetch("/api/dev-tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, answer: text }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setError(d.error || "Gửi thất bại")
      else setDraft(p => ({ ...p, [id]: "" }))
      load()
    } finally { setSending(null) }
  }

  return (
    <div className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-sky-50 bg-sky-50/50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sky-600 rounded-xl flex items-center justify-center">
            <Code2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800">Phiếu sửa code (Claude Code)</h2>
            <p className="text-xs text-slate-400">Nhờ Gấu Pro tạo phiếu → duyệt → Claude Code sửa trên nhánh riêng, mở PR vào staging.</p>
          </div>
        </div>
        <button onClick={load} className="p-2 rounded-xl text-slate-500 hover:bg-sky-100" title="Tải lại">
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {error && <div className="mx-6 mt-4 px-4 py-2.5 rounded-xl text-sm bg-rose-50 text-rose-700 border border-rose-100">{error}</div>}

      {!loading && !tickets.length && !error && <p className="px-6 py-8 text-sm text-slate-400 text-center">Chưa có phiếu nào.</p>}

      <ul className="divide-y divide-slate-100">
        {tickets.map(t => {
          const st = STATUS[t.status] ?? { label: t.status, cls: "bg-slate-100 text-slate-600" }
          return (
            <li key={t.id} className="px-6 py-3">
              <button onClick={() => setOpen(open === t.id ? null : t.id)} className="w-full flex items-center gap-3 text-left">
                <span className="text-xs font-mono text-slate-400 w-10">#{t.id}</span>
                <span className="flex-1 text-sm font-medium text-slate-800 truncate">{t.title}</span>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", st.cls)}>{st.label}</span>
                <span className="text-xs text-slate-400 w-28 text-right">{new Date(t.updated_at).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</span>
              </button>

              {(open === t.id || t.status === "question") && (
                <div className="mt-3 sm:pl-[3.25rem] space-y-3 text-sm text-slate-700">
                  {t.question && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="whitespace-pre-wrap">{t.question}</p>
                      <div className="mt-2 flex gap-2">
                        <input value={draft[t.id] ?? ""} onChange={e => setDraft(p => ({ ...p, [t.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") answer(t.id) }}
                          placeholder="Trả lời để Claude Code làm tiếp…" className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm" />
                        <button onClick={() => answer(t.id)} disabled={sending === t.id || !draft[t.id]?.trim()}
                          className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-white text-sm font-medium disabled:opacity-50">
                          <Send className="w-3.5 h-3.5" />Gửi
                        </button>
                      </div>
                    </div>
                  )}
                  {open === t.id && (
                    <>
                      {t.plan && <div><p className="text-xs font-semibold text-slate-500 mb-1">Kế hoạch</p><p className="whitespace-pre-wrap">{t.plan}</p></div>}
                      {t.answers.length > 0 && (
                        <div><p className="text-xs font-semibold text-slate-500 mb-1">Hỏi đáp</p>
                          {t.answers.map((x, i) => <p key={i} className="whitespace-pre-wrap">❓ {x.q}<br />↳ {x.a}</p>)}
                        </div>
                      )}
                      {t.summary && <div><p className="text-xs font-semibold text-slate-500 mb-1">Claude Code báo</p><p className="whitespace-pre-wrap">{t.summary}</p></div>}
                      {t.error && <p className="text-rose-600 whitespace-pre-wrap">{t.error}</p>}
                      <div className="flex flex-wrap gap-3 text-xs">
                        {t.pr_url && <a href={t.pr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline">PR <ExternalLink className="w-3 h-3" /></a>}
                        {t.preview_url && <a href={t.preview_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline">Bản xem thử <ExternalLink className="w-3 h-3" /></a>}
                        {t.run_url && <a href={t.run_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-500 hover:underline">Nhật ký chạy <ExternalLink className="w-3 h-3" /></a>}
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
