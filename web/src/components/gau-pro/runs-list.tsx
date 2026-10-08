"use client"

import { useEffect, useState } from "react"

// Trace các lượt chạy Gấu Pro (G2, gp_runs) — tab "Lượt chạy" trong panel Nhật ký (chỉ creator).
interface Step { r?: number; tool?: string; ms?: number; err?: string; approval?: string; args?: string; model_ms?: number; tin?: number; tout?: number; calls?: string[]; tainted?: boolean; taintSources?: string[] }
interface Run {
  id: string; username: string | null; channel: string | null; question: string | null; steps: Step[]; skills: string[] | null
  tokens_in: number; tokens_out: number; duration_ms: number | null; outcome: string | null; created_at: string
}

const sec = (ms?: number | null) => (ms == null ? "?" : `${(ms / 1000).toFixed(1)}s`)

export function RunsList() {
  const [rows, setRows] = useState<Run[] | null>(null)
  const [err, setErr] = useState("")
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/creator-ai/runs?limit=50").then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setErr(d.error ?? "") })
      .catch(e => { setRows([]); setErr(e.message) })
  }, [])

  if (rows === null) return <div className="p-4 text-center text-xs text-gray-400">Đang tải...</div>
  if (err) return <div className="p-3 text-xs text-amber-600">{/gp_runs/.test(err) ? "Chưa chạy migration v65 (gp_runs)." : err}</div>
  if (rows.length === 0) return <div className="p-4 text-center text-xs text-gray-400">Chưa có lượt chạy nào được ghi.</div>

  return (
    <div className="divide-y divide-gray-100 dark:divide-slate-800">
      {rows.map(run => {
        const tools = run.steps.filter(s => s.tool)
        const errs = tools.filter(s => s.err).length
        return (
          <div key={run.id} className="px-3 py-2 text-xs">
            <button onClick={() => setOpen(open === run.id ? null : run.id)} className="w-full text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-700 dark:text-slate-300 truncate" title={run.question ?? ""}>{run.question || "(không có câu hỏi)"}</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{new Date(run.created_at).toLocaleString("vi-VN")}</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {run.username || "?"} · {run.channel} · {run.outcome} · {sec(run.duration_ms)} · {tools.length} tool{errs ? ` (${errs} lỗi)` : ""} · {(run.tokens_in / 1000).toFixed(0)}k/{(run.tokens_out / 1000).toFixed(1)}k token
              </div>
            </button>
            {open === run.id && (
              <div className="mt-1.5 space-y-0.5 font-mono text-[10px] text-gray-600 dark:text-slate-400">
                {run.skills?.length ? <div>skills: {run.skills.join(", ")}</div> : null}
                {run.steps.map((s, i) => s.tool ? (
                  <div key={i} className={s.err ? "text-rose-500" : s.approval ? "text-amber-600" : ""}>
                    #{s.r} {s.tool} {s.approval ? `→ chờ duyệt #${s.approval}` : sec(s.ms)} {s.err ? `✗ ${s.err}` : ""}
                    {s.args ? <span className="text-gray-400"> {s.args.slice(0, 120)}</span> : null}
                  </div>
                ) : s.tainted !== undefined ? (
                  s.tainted ? <div key={i} className="text-amber-600">⚠ đã đọc nội dung ngoài: {(s.taintSources ?? []).join(", ")}</div> : null
                ) : (
                  <div key={i} className="text-violet-500">#{s.r} model {sec(s.model_ms)} {s.calls?.length ? `→ ${s.calls.join(", ")}` : "→ trả lời"}</div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
