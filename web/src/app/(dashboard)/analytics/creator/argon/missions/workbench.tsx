"use client"

import { useEffect, useState } from "react"
import { Brain, Check, Loader2, Square, Wrench, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { stepLabel, type Step } from "./use-mission-runner"
import { fmtUsd, tagStyle } from "./mission-types"

// Tham số bước: câu SQL / code Python hiện nguyên văn nhiều dòng (không bị JSON thoát ký tự xuống dòng), tham số còn lại hiện dạng JSON gọn.
function StepArgs({ args }: { args: Record<string, unknown> }) {
  const { query, code, content, ...rest } = args
  const block = (label: string, text: unknown) => typeof text === "string" && text ? <div key={label} className="mb-2"><div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">{label}</div><pre className="text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-words">{text}</pre></div> : null
  return <>
    {block("SQL", query)}{block("Python", code)}{block("Nội dung ghi", content)}
    {Object.keys(rest).length > 0 && <pre className="text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-words">{JSON.stringify(rest, null, 2)}</pre>}
  </>
}

// Bàn làm việc: dòng thời gian các bước Argon làm trong lượt (đọc/ghi file workspace, SQL, chạy code, lấy số liệu hệ thống). Chat chỉ hiện kết quả.
// Bấm một bước để xem tham số và kết quả đầy đủ; bước ghi/đọc file mở thẳng file đó ở khung giữa.
export function Workbench({ steps, busy, bgActive, spentUsd, runCount, focus, sandbox, building, onBuild, onStop, onOpenFile, onLoadFull }: {
  steps: Step[]
  busy: boolean
  bgActive: boolean
  spentUsd: number
  runCount: number
  focus: { id: string; k: number } | null   // chip [#N] trong chat bấm vào → chọn bước này (k đổi mỗi lần bấm)
  sandbox: { cpuMs: number; limitMs: number; snapshot: { at: string } | null } | null
  building: boolean
  onBuild: () => void
  onStop: () => void
  onOpenFile: (path: string) => void
  onLoadFull: (runId: string) => void
}) {
  const [sel, setSel] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const running = busy || bgActive
  useEffect(() => {
    if (!running) { setElapsed(0); return }
    const t0 = Date.now(); const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(t)
  }, [running])
  useEffect(() => { if (focus) setSel(focus.id) }, [focus])
  const cur = steps.find(s => s.id === sel) ?? null
  function pick(s: Step) {
    if (sel === s.id) { setSel(null); return }
    setSel(s.id)
    if (s.result == null) onLoadFull(s.runId)
    const p = typeof s.args.path === "string" ? s.args.path : null
    if (p && (s.name === "docFile" || s.name === "ghiFile")) onOpenFile(p)
  }
  const frac = sandbox ? Math.min(1, sandbox.cpuMs / Math.max(1, sandbox.limitMs)) : 0

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3.5 py-3 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-violet-600 dark:text-violet-300" />
          <span className="text-[13px] font-semibold text-gray-900 dark:text-slate-100">Bàn làm việc</span>
          {running
            ? <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-violet-50 dark:bg-violet-950/50 px-2 py-0.5 text-[11px] text-violet-700 dark:text-violet-200"><Loader2 size={11} className="animate-spin" />đang chạy · {elapsed}s</span>
            : <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] text-gray-500"><i className="h-1.5 w-1.5 rounded-full bg-gray-400" />rảnh</span>}
          {busy && <button type="button" onClick={onStop} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] border border-red-400 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"><Square size={10} />Dừng</button>}
        </div>
        <div className="mt-1 text-[11px] text-gray-500" title="Chi phí token Gemini đã dùng cho sứ mệnh này (chỉ để xem, không có giới hạn)">Đã dùng {fmtUsd(spentUsd)} · {runCount} lượt · {steps.length} bước ở lượt gần nhất</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {steps.length === 0 && (
          <div className="px-3 py-8 text-center">
            {running
              ? <div className="inline-flex items-center gap-2 text-xs text-gray-500"><Brain size={14} className="animate-pulse text-violet-500" />Argon đang đọc và suy luận…</div>
              : <>
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 dark:bg-slate-700 text-gray-400"><Wrench size={18} /></div>
                <div className="mt-2.5 text-[13px] font-medium text-gray-700 dark:text-slate-200">Chưa có bước nào</div>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">Khi Argon đọc file, ghi file, chạy SQL hay Python, từng bước hiện ở đây theo thứ tự thời gian. Bấm vào một bước để xem câu lệnh và kết quả.</p>
              </>}
          </div>
        )}
        <ol className="relative">
          {steps.map((s, i) => {
            const l = stepLabel(s)
            const last = i === steps.length - 1 && !running
            return (
              <li key={s.id} className="relative pl-8 pb-2">
                {!last && <span aria-hidden className="absolute left-[11px] top-6 bottom-0 w-px bg-gray-200 dark:bg-slate-700" />}
                <span aria-hidden className={cn("absolute left-0 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-semibold border", s.ok ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300")}>{s.ok ? <Check size={12} /> : <X size={12} />}</span>
                <button type="button" onClick={() => pick(s)} aria-pressed={sel === s.id}
                  className={cn("w-full text-left rounded-xl border px-2.5 py-2 transition-colors", sel === s.id ? "border-violet-400 bg-violet-50 dark:bg-violet-950/40" : "border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50", !s.ok && sel !== s.id && "border-red-200 dark:border-red-900")}>
                  <span className="flex items-center gap-1.5">
                    <span className={cn("shrink-0 rounded-md border px-1.5 py-px font-mono text-[10px] font-medium", tagStyle(l.tag))}>{l.tag}</span>
                    <span className="text-[10.5px] text-gray-400 tabular-nums">#{s.idx + 1}</span>
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-gray-800 dark:text-slate-100 break-words">{l.text}</span>
                </button>
              </li>
            )
          })}
          {running && steps.length > 0 && <li className="relative pl-8 py-1.5"><span aria-hidden className="absolute left-0 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40"><Loader2 size={12} className="animate-spin text-violet-600" /></span><span className="text-xs text-gray-500">đang làm bước tiếp…</span></li>}
        </ol>
      </div>

      <div className="border-t border-gray-200 dark:border-slate-700 px-3.5 py-2.5 text-[11px] text-gray-500">
        <div className="flex items-center justify-between gap-2">
          <span title="CPU Sandbox đã dùng trong tháng (gói Hobby 5 giờ/tháng). Chạy code ở sandbox cô lập, không có mạng.">Sandbox Python</span>
          <span className="tabular-nums">{sandbox ? `${(sandbox.cpuMs / 3_600_000).toFixed(2)} / ${(sandbox.limitMs / 3_600_000).toFixed(1)} giờ CPU` : "…"}</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)} aria-label="CPU Sandbox đã dùng trong tháng">
          <div className={cn("h-full rounded-full transition-all", frac > 0.85 ? "bg-red-500" : frac > 0.6 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.max(frac * 100, frac > 0 ? 2 : 0)}%` }} />
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          {sandbox && !sandbox.snapshot && <button type="button" onClick={onBuild} disabled={building} className="px-2 py-0.5 border border-violet-400 text-violet-700 dark:text-violet-300 rounded-lg disabled:opacity-50">{building ? "Đang chuẩn bị (1–3 phút)…" : "Chuẩn bị Sandbox"}</button>}
          {sandbox?.snapshot && <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check size={11} />sẵn sàng (Python + pandas)</span>}
        </div>
      </div>

      {cur && (
        <div className="border-t border-gray-200 dark:border-slate-700 bg-slate-900 text-slate-200 max-h-[40%] overflow-auto p-3">
          <div className="text-[11px] text-slate-400 mb-1.5">{stepLabel(cur).text} · {cur.ok ? "thành công" : "lỗi"} · {cur.chars.toLocaleString("vi-VN")} ký tự</div>
          <StepArgs args={cur.args} />
          {cur.result != null
            ? <pre className="mt-2 pt-2 border-t border-slate-700 text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-words text-slate-300">{cur.result.length > 6000 ? `${cur.result.slice(0, 6000)}\n…(xem phần còn lại trong file hoặc nhật ký)` : cur.result}</pre>
            : <div className="mt-2 text-[11px] text-slate-500">Đang tải kết quả…</div>}
        </div>
      )}
    </div>
  )
}
