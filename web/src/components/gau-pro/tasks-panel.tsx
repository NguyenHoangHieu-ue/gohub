"use client"

import { useCallback, useEffect, useState } from "react"
import { ShieldAlert, Loader2, RefreshCw, X } from "lucide-react"

// Panel "Việc & duyệt" của Gấu Pro (G2): hành động đang chờ duyệt (G0) + việc chạy nền (gp_jobs).
interface PendingRow { id: string; code: string; tool: string; summary: string; reason: string; channel: string; created_at: string }
interface SchedRow { id: string; title: string; when: string; only_if_notable: boolean; next_run_at: string | null; run_count: number }
interface JobRow { id: string; title: string; status: string; chunks: number; result: string | null; error: string | null; conversation_id: string | null; created_at: string; updated_at: string }

const JOB_STATUS: Record<string, string> = {
  queued: "⏳ Đang chờ chạy", running: "⚙️ Đang chạy", done: "✅ Xong", failed: "⚠️ Lỗi", cancelled: "Đã huỷ",
}

export function TasksPanel({ onOpenConversation, onClose, refreshKey }: {
  onOpenConversation: (id: string) => void
  onClose: () => void
  refreshKey: number
}) {
  const [pending, setPending] = useState<PendingRow[]>([])
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [scheds, setScheds] = useState<SchedRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<Record<string, string>>({})
  const [err, setErr] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, j, sc] = await Promise.all([
        fetch("/api/creator-ai/approve").then(r => r.json()).catch(() => ({ rows: [] })),
        fetch("/api/creator-ai/jobs").then(r => r.json()).catch(() => ({ jobs: [] })),
        fetch("/api/creator-ai/schedules").then(r => r.json()).catch(() => ({ enabled: false })),
      ])
      setScheds(sc.enabled ? (sc.tasks ?? []) : null)
      setPending(p.rows ?? [])
      setJobs(j.jobs ?? [])
      setErr(j.error || p.error || "")
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])
  // Có việc đang chạy → tự làm mới 15s/lần.
  useEffect(() => {
    if (!jobs.some(j => j.status === "queued" || j.status === "running")) return
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [jobs, load])

  const decide = async (id: string, approve: boolean) => {
    setNote(n => ({ ...n, [id]: "Đang xử lý..." }))
    const d = await fetch("/api/creator-ai/approve", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, approve }),
    }).then(r => r.json()).catch(e => ({ error: e.message }))
    setNote(n => ({ ...n, [id]: d.status === "executed" ? "✅ Đã duyệt và chạy" : d.status === "rejected" ? "Đã từ chối" : `⚠️ ${d.error || "Lỗi"}` }))
    setTimeout(load, 1500)
  }

  const cancelSched = async (id: string) => {
    await fetch(`/api/creator-ai/schedules?id=${id}`, { method: "DELETE" }).catch(() => {})
    load()
  }

  const cancel = async (id: string) => {
    await fetch(`/api/creator-ai/jobs?id=${id}`, { method: "DELETE" }).catch(() => {})
    load()
  }

  return (
    <div className="absolute right-0 top-full mt-1 w-[420px] max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Việc & duyệt</span>
        <div className="flex items-center gap-1">
          <button onClick={load} title="Làm mới" className="p-1 text-gray-400 hover:text-violet-600">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
          <button onClick={onClose} title="Đóng" className="p-1 text-gray-400 hover:text-gray-700"><X size={12} /></button>
        </div>
      </div>
      {err && <div className="px-3 py-2 text-amber-600">{err}</div>}

      <div className="px-3 pt-2 pb-1 font-semibold text-gray-600 dark:text-slate-300">Chờ duyệt ({pending.length})</div>
      {pending.length === 0 && <div className="px-3 pb-2 text-gray-400">Không có hành động nào chờ duyệt.</div>}
      {pending.map(a => (
        <div key={a.id} className="mx-3 mb-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2">
          <div className="flex items-center gap-1 font-semibold text-amber-800 dark:text-amber-300"><ShieldAlert size={12} /> #{a.code} · {a.tool}</div>
          <div className="mt-0.5 text-gray-800 dark:text-slate-100 break-words">{a.summary}</div>
          <div className="text-gray-500 dark:text-slate-400">{a.reason}</div>
          {note[a.id] ? <div className="mt-1 font-medium text-gray-600 dark:text-slate-300">{note[a.id]}</div> : (
            <div className="flex gap-2 mt-1.5">
              <button onClick={() => decide(a.id, true)} className="px-2.5 py-0.5 rounded-md bg-violet-600 text-white hover:bg-violet-700">Duyệt</button>
              <button onClick={() => decide(a.id, false)} className="px-2.5 py-0.5 rounded-md border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700">Từ chối</button>
            </div>
          )}
        </div>
      ))}

      {scheds && (
        <>
          <div className="px-3 pt-2 pb-1 font-semibold text-gray-600 dark:text-slate-300 border-t border-gray-100 dark:border-slate-800">Việc theo lịch ({scheds.length})</div>
          {scheds.length === 0 && <div className="px-3 pb-2 text-gray-400">Chưa có. Nhắn Gấu Pro kiểu &quot;mỗi sáng thứ 2 8h tóm tắt doanh thu tuần cho tôi&quot;.</div>}
          {scheds.map(t => (
            <div key={t.id} className="px-3 py-1.5 flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-gray-700 dark:text-slate-200">{t.only_if_notable ? "👀 " : "⏰ "}{t.title}</div>
                <div className="text-gray-500 dark:text-slate-400">{t.when}{t.next_run_at ? ` · lần tới ${new Date(t.next_run_at).toLocaleString("vi-VN")}` : ""}{t.run_count ? ` · đã chạy ${t.run_count}` : ""}</div>
              </div>
              <button onClick={() => cancelSched(t.id)} className="text-rose-500 hover:underline flex-shrink-0">Huỷ</button>
            </div>
          ))}
        </>
      )}

      <div className="px-3 pt-2 pb-1 font-semibold text-gray-600 dark:text-slate-300 border-t border-gray-100 dark:border-slate-800">Việc chạy nền</div>
      {jobs.length === 0 && <div className="px-3 pb-3 text-gray-400">Chưa có việc nào. Bật "Chạy nền" cạnh ô nhập để giao việc dài.</div>}
      <div className="divide-y divide-gray-100 dark:divide-slate-800">
        {jobs.map(j => (
          <div key={j.id} className="px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-gray-700 dark:text-slate-200 break-words">{j.title}</span>
              <span className="flex-shrink-0 text-[10px] text-gray-400">{new Date(j.created_at).toLocaleString("vi-VN")}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-gray-500 dark:text-slate-400">
              <span>{JOB_STATUS[j.status] ?? j.status}{j.chunks > 1 ? ` · ${j.chunks} chặng` : ""}</span>
              {j.conversation_id && (
                <button onClick={() => onOpenConversation(j.conversation_id!)} className="text-violet-600 hover:underline">Mở kết quả</button>
              )}
              {(j.status === "queued" || j.status === "running") && (
                <button onClick={() => cancel(j.id)} className="text-rose-500 hover:underline">Huỷ</button>
              )}
            </div>
            {j.error && <div className="mt-0.5 text-rose-500 break-words">{j.error}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
