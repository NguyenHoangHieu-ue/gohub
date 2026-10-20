"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Brain, Check, Copy, Loader2, Pause, Play, RotateCcw, Rocket, Send, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtTokens, type Run } from "../argon-types"
import { ArgonMarkdown } from "../argon-markdown"
import { PHASE_LABEL, type MissionPhase } from "./mission-types"
import type { SendOpts, Thinking, useMissionRunner } from "./use-mission-runner"

// Chat của sứ mệnh: chỉ hiện KẾT QUẢ và điều cần Hiếu quyết; các bước làm việc nằm ở Bàn làm việc. Thanh pha dẫn Hiếu qua Làm rõ → Kế hoạch → Chốt và chạy.
type Runner = ReturnType<typeof useMissionRunner>
const THINK_LABEL: Record<Thinking, string> = { low: "Nhanh", medium: "Cân bằng", high: "Suy luận sâu" }
const STEPS: { phase: MissionPhase; label: string }[] = [{ phase: "clarify", label: "Làm rõ" }, { phase: "plan", label: "Kế hoạch" }, { phase: "run", label: "Chốt và chạy" }]
const QUICK: Record<MissionPhase, string[]> = {
  clarify: ["Hãy hỏi anh để làm rõ sứ mệnh này", "Đọc brief.md và các nguồn đã gắn, nói em còn thiếu gì"],
  plan: ["Soạn kế hoạch chi tiết dựa trên brief.md", "Liệt kê rủi ro và chỗ còn mơ hồ trước khi anh Chốt"],
  run: ["Bắt đầu thực hiện kế hoạch đã chốt", "Báo cáo tiến độ và việc còn lại"],
  paused: ["Tóm tắt đã làm được gì đến giờ"],
  done: ["Tóm tắt kết quả cuối cùng"],
}

export function MissionChat({ phase, runs, runner, onPhase, onStep, onError }: {
  phase: MissionPhase
  runs: Run[]
  runner: Runner
  onPhase: (to: MissionPhase) => Promise<void>
  onStep: (runId: string, n: number) => void   // bấm chip [#N] trong câu trả lời → Bàn làm việc chọn bước N của lượt đó
  onError: (m: string) => void
}) {
  const [prompt, setPrompt] = useState("")
  const [thinking, setThinking] = useState<Thinking>("medium")
  const [background, setBackground] = useState(false)
  const [allowTools, setAllowTools] = useState(true)
  const [confirmChot, setConfirmChot] = useState(false)
  const [phaseBusy, setPhaseBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const opts: SendOpts = { thinking, allowTools, background }
  const { busy, bgActive } = runner
  useEffect(() => { if (stick.current) endRef.current?.scrollIntoView({ block: "end" }) }, [runs])

  async function go(to: MissionPhase) {
    setPhaseBusy(true)
    try { await onPhase(to); setConfirmChot(false) } catch (e) { onError((e as Error).message) } finally { setPhaseBusy(false) }
  }
  async function send(text?: string) {
    const p = (text ?? prompt).trim()
    if (!p || busy) return
    setPrompt(""); stick.current = true
    await runner.send(p, opts)
  }

  const idx = phase === "clarify" ? 0 : phase === "plan" ? 1 : 2
  const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg disabled:opacity-50"
  const ghost = `${btn} border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200`
  const primary = `${btn} bg-violet-600 text-white`

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-3 pb-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <ol className="flex gap-1">
          {STEPS.map((s, i) => (
            <li key={s.phase} aria-current={i === idx} className={cn("flex-1 border-b-2 pb-1 text-xs", i === idx ? "border-violet-600" : i < idx ? "border-emerald-500" : "border-gray-200 dark:border-slate-600")}>
              <span className="block text-[10px] uppercase tracking-wide text-gray-500">Pha {i + 1}</span>
              <span className={cn("text-sm", i === idx ? "font-medium text-gray-900 dark:text-slate-100" : "text-gray-500")}>{i === 2 && (phase === "paused" || phase === "done") ? PHASE_LABEL[phase] : s.label}</span>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {phase === "clarify" && <button type="button" disabled={phaseBusy} onClick={() => go("plan")} className={ghost}>Sang Kế hoạch<ArrowRight size={14} /></button>}
          {phase === "plan" && <>
            <button type="button" disabled={phaseBusy} onClick={() => go("clarify")} className={ghost}><ArrowLeft size={14} />Làm rõ tiếp</button>
            <button type="button" disabled={phaseBusy || busy} onClick={() => setConfirmChot(true)} className={primary}><Rocket size={14} />Chốt và chạy</button>
          </>}
          {phase === "run" && <>
            <button type="button" disabled={phaseBusy} onClick={() => go("paused")} className={ghost}><Pause size={14} />Tạm dừng</button>
            <button type="button" disabled={phaseBusy} onClick={() => go("done")} className={ghost}><Check size={14} />Đánh dấu xong</button>
          </>}
          {phase === "paused" && <>
            <button type="button" disabled={phaseBusy} onClick={() => go("run")} className={primary}><Play size={14} />Tiếp tục chạy</button>
            <button type="button" disabled={phaseBusy} onClick={() => go("plan")} className={ghost}>Về Kế hoạch</button>
          </>}
          {phase === "done" && <button type="button" disabled={phaseBusy} onClick={() => go("run")} className={ghost}><RotateCcw size={14} />Mở lại</button>}
          <span className="text-xs text-gray-500">{phase === "clarify" ? "Argon chỉ hỏi và ghi brief.md, chưa làm việc thật." : phase === "plan" ? "Argon soạn kế hoạch. Chưa làm gì cho tới khi anh Chốt." : phase === "run" ? "Argon tự làm theo brief.md và kế hoạch đã chốt." : phase === "paused" ? "Chỉ trả lời câu hỏi, không làm việc mới." : "Sứ mệnh đã xong."}</span>
        </div>
        {confirmChot && (
          <div role="alertdialog" aria-label="Xác nhận Chốt" className="mt-2 rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 p-3 text-sm">
            <p className="text-gray-800 dark:text-slate-100">Sau khi Chốt, Argon tự làm theo <b>brief.md</b> và kế hoạch: ghi file, lấy số liệu hệ thống, không hỏi lại từng bước. Chỗ nào mơ hồ ngoài brief thì nó dừng và hỏi anh. Anh vẫn bấm Dừng hoặc Tạm dừng được bất cứ lúc nào.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={phaseBusy} onClick={() => go("run")} className={primary}><Rocket size={14} />Chốt</button>
              <button type="button" onClick={() => setConfirmChot(false)} className={ghost}>Chưa</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}>
        {runs.length === 0 && <div className="text-center text-sm text-gray-400 mt-10">Chưa có trao đổi nào. Bắt đầu bằng một gợi ý bên dưới hoặc gõ câu của anh.</div>}
        {runs.map(r => {
          const bgLive = !busy && (r.status === "queued" || r.status === "running")
          const live = (busy && r.id === runs[runs.length - 1]?.id) || bgLive
          return (
            <div key={r.id} className="space-y-2">
              <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-600 text-white px-3.5 py-2 text-sm whitespace-pre-wrap">{r.prompt}</div></div>
              <div className="rounded-2xl rounded-bl-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
                {r.answer ? <ArgonMarkdown text={r.answer} onStep={n => onStep(r.id, n)} /> : <div className="text-sm text-gray-400 inline-flex items-center gap-2"><Brain size={14} className="animate-pulse" />Argon đang làm việc, xem từng bước ở Bàn làm việc…</div>}
                {r.status === "error" && <div className="mt-2 text-xs text-red-600">Lỗi: {r.error}</div>}
                {r.status === "stopped" && <div className="mt-2 text-xs text-amber-600">Đã dừng.</div>}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                  {live && <span className="inline-flex items-center gap-1 text-violet-600"><Loader2 size={11} className="animate-spin" />{bgLive ? (r.status === "queued" ? "chạy nền · chờ đoạn kế" : `chạy nền · đoạn ${r.segments + 1}`) : "đang chạy"}</span>}
                  {bgLive && <button type="button" onClick={() => runner.cancelBg(r.id)} className="inline-flex items-center gap-1 text-red-600 hover:underline"><Square size={10} />Dừng việc nền</button>}
                  {r.tokens_in > 0 && <span>{fmtTokens(r.tokens_in)} vào · {fmtTokens(r.tokens_out)} ra · ~${r.cost_usd.toFixed(2)} · {Math.round(r.duration_ms / 1000)}s{r.segments > 1 ? ` · ${r.segments} đoạn` : ""}</span>}
                  {!live && r.status === "partial" && <button type="button" disabled={busy} onClick={() => runner.resume(r.id, opts)} className="inline-flex items-center gap-1 text-violet-600 font-medium"><Play size={11} />Tiếp tục viết</button>}
                  {!live && r.answer && <button type="button" onClick={() => void navigator.clipboard?.writeText(r.answer)} className="inline-flex items-center gap-1 hover:text-gray-800"><Copy size={11} />Sao chép</button>}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {runner.warn.length > 0 && <div className="mx-4 mb-2 text-xs rounded-lg bg-amber-50 text-amber-800 px-3 py-2 whitespace-pre-wrap">{runner.warn.join("\n")}</div>}

      <div className="border-t border-gray-200 dark:border-slate-700 p-3">
        {!busy && !bgActive && <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK[phase].map(q => <button key={q} type="button" onClick={() => setPrompt(q)} title={q} className="px-2 py-0.5 text-xs rounded-full border border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40">{q}</button>)}
        </div>}
        <div className="flex items-end gap-2">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} aria-label="Nhắn Argon"
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() } }}
            placeholder="Nhắn Argon — Ctrl+Enter để gửi"
            className="flex-1 resize-none px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-xl bg-transparent focus:outline-none focus:ring-2 focus:ring-violet-500" />
          {busy
            ? <button type="button" onClick={runner.stop} className="h-10 px-3 rounded-xl bg-red-600 text-white inline-flex items-center gap-1.5 text-sm"><Square size={14} />Dừng</button>
            : <button type="button" onClick={() => void send()} disabled={!prompt.trim()} className="h-10 px-3 rounded-xl bg-violet-600 text-white inline-flex items-center gap-1.5 text-sm disabled:opacity-50"><Send size={14} />Gửi</button>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <label className="inline-flex items-center gap-1.5" title="Worker chạy không giới hạn đoạn, đóng trang vẫn chạy; xong nhắn Lark cho Hiếu"><input type="checkbox" checked={background} onChange={e => setBackground(e.target.checked)} />Chạy nền (xong nhắn Lark)</label>
          <label className="inline-flex items-center gap-1.5" title="Argon được gọi công cụ chỉ-đọc lấy số liệu mới nhất của hệ thống"><input type="checkbox" checked={allowTools} onChange={e => setAllowTools(e.target.checked)} />Cho Argon lấy số liệu hệ thống</label>
          <span className="inline-flex items-center gap-1.5">Suy luận:
            {(Object.keys(THINK_LABEL) as Thinking[]).map(t => <button key={t} type="button" onClick={() => setThinking(t)} className={cn("px-2 py-0.5 rounded-md border", thinking === t ? "bg-violet-600 text-white border-violet-600" : "border-gray-300 dark:border-slate-600")}>{THINK_LABEL[t]}</button>)}
          </span>
        </div>
      </div>
    </div>
  )
}
