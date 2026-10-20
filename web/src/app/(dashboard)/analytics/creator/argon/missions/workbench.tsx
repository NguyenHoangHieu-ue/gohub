"use client"

import { useEffect, useState } from "react"
import { Brain, Check, Loader2, Square, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { stepLabel, type Step } from "./use-mission-runner"
import { fmtUsd } from "./mission-types"

// Bàn làm việc: dòng thời gian các bước Argon làm trong lượt (đọc/ghi file workspace, lấy số liệu hệ thống). Chat chỉ hiện kết quả.
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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2 text-xs">
        <span className="uppercase tracking-wide text-gray-500 text-[11px]">Bàn làm việc</span>
        {running
          ? <span className="inline-flex items-center gap-1 text-violet-600"><Loader2 size={11} className="animate-spin" />đang chạy · {elapsed}s</span>
          : <span className="text-gray-400">rảnh</span>}
        <span className="ml-auto text-gray-500" title="Chi phí token Gemini đã dùng cho sứ mệnh này (chỉ để xem, không có giới hạn)">Đã dùng {fmtUsd(spentUsd)} · {runCount} lượt</span>
        {busy && <button type="button" onClick={onStop} className="inline-flex items-center gap-1 px-2 py-0.5 border border-red-400 text-red-600 rounded"><Square size={10} />Dừng</button>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {steps.length === 0 && (
          <div className="px-2 py-6 text-xs text-gray-400 text-center space-y-1">
            {running ? <div className="inline-flex items-center gap-1.5"><Brain size={13} className="animate-pulse" />Argon đang đọc và suy luận…</div> : <>
              <div>Chưa có bước nào.</div>
              <div>Khi Argon đọc file, ghi file hoặc lấy số liệu, từng bước hiện ở đây.</div>
            </>}
          </div>
        )}
        <ol className="space-y-1.5">
          {steps.map(s => {
            const l = stepLabel(s)
            return (
              <li key={s.id}>
                <button type="button" onClick={() => pick(s)} aria-pressed={sel === s.id}
                  className={cn("w-full text-left rounded-lg border px-2.5 py-1.5 text-xs grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 items-baseline",
                    sel === s.id ? "border-violet-400 bg-violet-50 dark:bg-violet-950/40" : "border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50",
                    !s.ok && "border-red-300 dark:border-red-800")}>
                  <span className={cn("font-mono text-[10px] px-1 rounded border", s.ok ? "text-gray-500 border-gray-300 dark:border-slate-600" : "text-red-600 border-red-300")}>#{s.idx + 1} {l.tag}</span>
                  <span className="truncate text-gray-800 dark:text-slate-100">{l.text}</span>
                  <span className="shrink-0">{s.ok ? <Check size={12} className="text-emerald-600" /> : <X size={12} className="text-red-600" />}</span>
                </button>
              </li>
            )
          })}
          {running && steps.length > 0 && <li className="px-2 py-1 text-xs text-gray-400 inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />đang làm bước tiếp…</li>}
        </ol>
      </div>
      <div className="border-t border-gray-200 dark:border-slate-700 px-3 py-2 text-[11px] text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span title="CPU Sandbox đã dùng trong tháng (gói Hobby 5 giờ/tháng). Chạy code ở sandbox cô lập, không có mạng.">Sandbox: {sandbox ? `${(sandbox.cpuMs / 3_600_000).toFixed(2)} / ${(sandbox.limitMs / 3_600_000).toFixed(1)} giờ CPU` : "…"}</span>
        {sandbox && !sandbox.snapshot && <button type="button" onClick={onBuild} disabled={building} className="px-2 py-0.5 border border-violet-400 text-violet-700 dark:text-violet-300 rounded disabled:opacity-50">{building ? "Đang chuẩn bị (1–3 phút)…" : "Chuẩn bị Sandbox"}</button>}
        {sandbox?.snapshot && <span className="text-emerald-600">đã sẵn sàng (Python + pandas)</span>}
      </div>
      {cur && (
        <div className="border-t border-gray-200 dark:border-slate-700 bg-slate-900 text-slate-200 max-h-[40%] overflow-auto p-3">
          <div className="text-[11px] text-slate-400 mb-1.5">{stepLabel(cur).text} · {cur.ok ? "thành công" : "lỗi"} · {cur.chars.toLocaleString("vi-VN")} ký tự</div>
          <pre className="text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-words">{JSON.stringify(cur.args, null, 2)}</pre>
          {cur.result != null
            ? <pre className="mt-2 pt-2 border-t border-slate-700 text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-words text-slate-300">{cur.result.length > 6000 ? `${cur.result.slice(0, 6000)}\n…(xem phần còn lại trong file hoặc nhật ký)` : cur.result}</pre>
            : <div className="mt-2 text-[11px] text-slate-500">Đang tải kết quả…</div>}
        </div>
      )}
    </div>
  )
}
