"use client"

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Atom, BellRing, Brain, Check, Copy, Database, Loader2, Pause, Play, RotateCcw, Rocket, Send, Sparkles, Square, ThumbsDown, ThumbsUp, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtTokens, type Run } from "../argon-types"
import { ArgonMarkdown } from "../argon-markdown"
import { routeLane } from "@/lib/assistant/route-pure"
import { PHASE_LABEL, phaseIndex, type MissionPhase, type PatchUi, type PendingAskUi } from "./mission-types"
import { stepLabel, type ModelKey, type SendOpts, type Thinking, type useMissionRunner } from "./use-mission-runner"

// Chat của sứ mệnh: chỉ hiện KẾT QUẢ và điều cần Hiếu quyết; các bước làm việc nằm ở Bàn làm việc. Thanh pha dẫn Hiếu qua Làm rõ → Kế hoạch → Chốt và chạy.
type Runner = ReturnType<typeof useMissionRunner>
const THINK_LABEL: Record<Thinking, string> = { low: "Nhanh", medium: "Cân bằng", high: "Sâu" }
const STEPS = ["Làm rõ", "Kế hoạch", "Chốt và chạy"]
const CHOT_PROMPT = "Anh đã Chốt. Đọc notes/ke-hoach.md và brief.md rồi thực hiện kế hoạch từ đầu đến cuối, tự làm hết các bước. Ghi kết quả vào workspace, ghi quyết định vào decisions.md, xong thì ghi tổng kết vào notes/tong-ket.md. Gặp chỗ mơ hồ ngoài brief thì hỏi anh bằng hoiHieu rồi dừng."
const QUICK: Record<MissionPhase, string[]> = {
  clarify: ["Hãy hỏi anh để làm rõ sứ mệnh này", "Đọc brief.md và các nguồn đã gắn, nói em còn thiếu gì"],
  plan: ["Soạn kế hoạch chi tiết dựa trên brief.md", "Liệt kê rủi ro và chỗ còn mơ hồ trước khi anh Chốt"],
  run: ["Bắt đầu thực hiện kế hoạch đã chốt", "Báo cáo tiến độ và việc còn lại"],
  paused: ["Tóm tắt đã làm được gì đến giờ"],
  done: ["Tóm tắt kết quả cuối cùng"],
}
const HINT: Record<MissionPhase, string> = {
  clarify: "Argon chỉ hỏi và ghi brief.md, chưa làm việc thật.",
  plan: "Argon soạn kế hoạch. Chưa làm gì cho tới khi anh Chốt.",
  run: "Argon tự làm theo brief.md và kế hoạch đã chốt.",
  paused: "Đang tạm dừng: chỉ trả lời câu hỏi, không làm việc mới.",
  done: "Sứ mệnh đã xong.",
}

/** Nút bật/tắt dạng chip trong thanh công cụ ô nhắn. */
function Toggle({ on, onClick, icon: Icon, label, title }: { on: boolean; onClick: () => void; icon: typeof Zap; label: string; title: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} title={title}
      className={cn("inline-flex items-center gap-1 px-2 py-1 text-[11.5px] rounded-lg border transition-colors", on ? "border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-700" : "border-gray-200 dark:border-slate-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700")}>
      <Icon size={12} />{label}
    </button>
  )
}
/** Nhóm nút chọn một (segmented). */
function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { v: T; label: string; icon?: typeof Zap; title?: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-gray-200 dark:border-slate-600 p-0.5 bg-gray-50 dark:bg-slate-900/40">
      {options.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} title={o.title} onClick={() => onChange(o.v)}
          className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] rounded-md transition-colors", value === o.v ? "bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-200 shadow-sm font-medium" : "text-gray-500 hover:text-gray-800 dark:hover:text-slate-200")}>
          {o.icon && <o.icon size={11} />}{o.label}
        </button>
      ))}
    </div>
  )
}

// Câu trả lời đã xong không cần vẽ lại mỗi lần ô nhập hoặc trang cha đổi (parse markdown + bảng + khối report là phần nặng nhất khi chat dài).
const AnswerMd = memo(function AnswerMd({ text, runId, onStep }: { text: string; runId: string; onStep: (runId: string, n: number) => void }) {
  const cb = useCallback((n: number) => onStep(runId, n), [onStep, runId])
  return <ArgonMarkdown text={text} onStep={cb} />
})

export function MissionChat({ autoSend, phase, pendingAsk, patches, onPatch, runs, runner, onPhase, onStep, onError, simple = false, quick, onDraft, aboveInput }: {
  autoSend: { text: string; k: number } | null   // câu lệnh tự gửi (vd ▶ chạy lại script); mỗi k mới = một lần gửi
  phase: MissionPhase
  pendingAsk: PendingAskUi | null
  patches: PatchUi[]
  onPatch: (id: string, action: "approve" | "reject") => Promise<void>   // Hiếu duyệt/bỏ đề xuất sửa code của Argon
  runs: Run[]
  runner: Runner
  onPhase: (to: MissionPhase) => Promise<void>
  onStep: (runId: string, n: number) => void   // bấm chip [#N] trong câu trả lời → Bàn làm việc chọn bước N của lượt đó
  onError: (m: string) => void
  simple?: boolean        // trang Argon gọn: ẩn thanh pha (sứ mệnh luôn ở pha chạy), chỉ còn khung chat
  quick?: string[]        // câu gợi ý riêng thay cho gợi ý theo pha
  onDraft?: (text: string) => void   // báo nội dung đang gõ ra ngoài (trang Hỏi dùng để gợi ý nhanh từ Kho)
  aboveInput?: React.ReactNode       // khối hiện NGAY TRÊN ô nhắn (vd gợi ý từ Kho)
}) {
  const [prompt, setPromptState] = useState("")
  // Báo nội dung đang gõ ra ngoài: trễ 350ms (gõ liên tục chỉ báo 1 lần, không làm cả trang cha vẽ lại theo từng ký tự); xoá ô (gửi) thì báo ngay.
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setPrompt = (v: string) => {
    setPromptState(v)
    if (!onDraft) return
    if (draftTimer.current) clearTimeout(draftTimer.current)
    if (!v) { onDraft(v); return }
    draftTimer.current = setTimeout(() => onDraft(v), 350)
  }
  useEffect(() => () => { if (draftTimer.current) clearTimeout(draftTimer.current) }, [])
  const onStepRef = useRef(onStep)
  onStepRef.current = onStep
  const stepStable = useCallback((runId: string, n: number) => onStepRef.current(runId, n), [])
  const [showOpts, setShowOpts] = useState(false)   // trang gọn: ẩn mức suy luận / số liệu hệ thống / chạy nền sau "Tuỳ chọn"
  const [thinking, setThinking] = useState<Thinking>("medium")
  const [background, setBackground] = useState(false)
  // Nhanh = model nhanh chung (nhanh ~4-7 lần, rẻ ~1/2); Sâu = Gemini 4 Argon cho việc cần suy luận kỹ/viết dài; Tự động = router theo mục đích câu hỏi (làn) chọn một trong hai.
  const [modelMode, setModelMode] = useState<ModelKey | "auto">("auto")
  useEffect(() => { try { const v = localStorage.getItem("argon_model"); if (v === "fast" || v === "deep" || v === "auto") setModelMode(v) } catch { /* trình duyệt chặn lưu: dùng mặc định */ } }, [])
  const pickModel = (m: ModelKey | "auto") => { setModelMode(m); try { localStorage.setItem("argon_model", m) } catch { /* bỏ qua */ } }
  const lane = useMemo(() => (prompt.trim().length >= 4 ? routeLane(prompt) : null), [prompt])
  const model: ModelKey = modelMode === "auto" ? (lane?.tier ?? "fast") : modelMode
  const [allowTools, setAllowTools] = useState(true)
  const [confirmChot, setConfirmChot] = useState(false)
  const [autoRun, setAutoRun] = useState(true)   // Chốt xong tự giao Argon chạy nền theo kế hoạch
  const [phaseBusy, setPhaseBusy] = useState(false)
  const [patchBusy, setPatchBusy] = useState<string | null>(null)
  async function decidePatch(id: string, action: "approve" | "reject") {
    setPatchBusy(id)
    try { await onPatch(id, action) } catch (e) { onError((e as Error).message) } finally { setPatchBusy(null) }
  }
  const [rated, setRated] = useState<Record<string, 1 | -1>>({})
  async function rate(runId: string, question: string, answer: string, rating: 1 | -1) {
    setRated(m => ({ ...m, [runId]: rating }))
    try { await fetch("/api/chat/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: "argon", question, answer, rating }) }) } catch { /* phản hồi lỗi không ảnh hưởng chat */ }
  }
  const endRef = useRef<HTMLDivElement>(null)
  const lastStep = runner.steps.length ? stepLabel(runner.steps[runner.steps.length - 1]) : null   // bước công cụ mới nhất, để biết Argon đang làm gì khi chưa có chữ
  const stick = useRef(true)
  const opts: SendOpts = { thinking, allowTools, background, model }
  const { busy, bgActive } = runner
  useEffect(() => { if (stick.current) endRef.current?.scrollIntoView({ block: "end" }) }, [runs])
  const lastAuto = useRef(0)
  useEffect(() => { if (autoSend && autoSend.k !== lastAuto.current && !busy) { lastAuto.current = autoSend.k; void runner.send(autoSend.text, opts) } }) // eslint-disable-line react-hooks/exhaustive-deps

  async function go(to: MissionPhase) {
    setPhaseBusy(true)
    try {
      await onPhase(to); setConfirmChot(false)
      if (to === "run" && phase === "plan" && autoRun) void runner.send(CHOT_PROMPT, { thinking: "medium", allowTools: true, background: true, model })
    } catch (e) { onError((e as Error).message) } finally { setPhaseBusy(false) }
  }
  async function send(text?: string) {
    const p = (text ?? prompt).trim()
    if (!p || busy) return
    setPrompt(""); stick.current = true
    await runner.send(p, opts)
  }

  const idx = phaseIndex(phase)
  const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg disabled:opacity-50 transition-colors"
  const ghost = `${btn} border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700`
  const primary = `${btn} bg-violet-600 hover:bg-violet-700 text-white shadow-sm`
  const idle = !busy && !bgActive

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Thanh pha: ba chặng nối nhau, chặng đã qua có dấu tích; nút chuyển pha bên phải */}
      {!simple && <div className="px-4 pt-3 pb-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ol className="flex items-center flex-1 min-w-[260px]" aria-label="Các pha của sứ mệnh">
            {STEPS.map((label, i) => {
              const done = i < idx || phase === "done"
              const cur = i === idx && phase !== "done"
              return (
                <Fragment key={label}>
                  <li aria-current={cur ? "step" : undefined} className="flex items-center gap-2 shrink-0">
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold border", done ? "bg-emerald-500 border-emerald-500 text-white" : cur ? "bg-violet-600 border-violet-600 text-white ring-4 ring-violet-100 dark:ring-violet-900/50" : "border-gray-300 dark:border-slate-600 text-gray-400")}>{done ? <Check size={13} /> : i + 1}</span>
                    <span className={cn("text-[13px]", cur ? "font-semibold text-gray-900 dark:text-slate-100" : done ? "text-gray-700 dark:text-slate-300" : "text-gray-400")}>{i === 2 && (phase === "paused" || phase === "done") ? PHASE_LABEL[phase] : label}</span>
                  </li>
                  {i < STEPS.length - 1 && <li aria-hidden className={cn("mx-3 h-px flex-1 min-w-[16px]", i < idx || phase === "done" ? "bg-emerald-400" : "bg-gray-200 dark:bg-slate-600")} />}
                </Fragment>
              )
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">{HINT[phase]}</p>
        {confirmChot && (
          <div role="alertdialog" aria-label="Xác nhận Chốt" className="mt-3 rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 p-3.5 text-sm">
            <p className="text-gray-800 dark:text-slate-100 leading-relaxed">Sau khi Chốt, Argon tự làm theo <b>brief.md</b> và kế hoạch: ghi file, lấy số liệu hệ thống, không hỏi lại từng bước. Chỗ nào mơ hồ ngoài brief thì nó dừng và hỏi anh. Anh vẫn bấm Dừng hoặc Tạm dừng được bất cứ lúc nào.</p>
            <label className="mt-2.5 flex items-center gap-1.5 text-xs text-gray-700 dark:text-slate-300"><input type="checkbox" checked={autoRun} onChange={e => setAutoRun(e.target.checked)} className="accent-violet-600" />Giao Argon chạy ngay theo kế hoạch (chạy nền, xong nhắn Lark)</label>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={phaseBusy} onClick={() => go("run")} className={primary}><Rocket size={14} />Chốt</button>
              <button type="button" onClick={() => setConfirmChot(false)} className={ghost}>Chưa</button>
            </div>
          </div>
        )}
      </div>}

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6" onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}>
        {runs.length === 0 && (
          <div className="mx-auto mt-10 max-w-sm text-center">
            <div className="ag-avatar mx-auto h-12 w-12"><Atom size={22} /></div>
            <div className="mt-3 text-sm font-medium text-gray-800 dark:text-slate-100">Bắt đầu với Argon</div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">Chọn một gợi ý ở dưới hoặc gõ yêu cầu của anh. {simple ? "Chat chỉ giữ kết quả; mọi bước Argon làm hiện ở mục “Argon đang làm gì” bên dưới." : "Mọi bước Argon làm (đọc file, SQL, chạy code) hiện ở cột Bàn làm việc bên phải, chat chỉ giữ kết quả."}</p>
          </div>
        )}
        {runs.map(r => {
          const bgLive = !busy && (r.status === "queued" || r.status === "running")
          const live = (busy && r.id === runs[runs.length - 1]?.id) || bgLive
          return (
            <div key={r.id} className="space-y-3">
              <div className="flex justify-end"><div className="max-w-[82%] ag-bubble-user px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap">{r.prompt}</div></div>
              <div className="flex items-start gap-2.5">
                <span className="ag-avatar mt-0.5 h-7 w-7 shrink-0" aria-hidden><Atom size={15} /></span>
                <div className="min-w-0 flex-1 ag-bubble-ai px-4 py-3">
                  {r.answer ? <AnswerMd text={r.answer} runId={r.id} onStep={stepStable} />
                    : <div className="flex items-center gap-2 text-[13px] text-gray-500"><span className="ag-think" aria-hidden />{lastStep ? `Argon đang làm: ${lastStep.tag} ${lastStep.text.slice(0, 80)} (${runner.steps.length} bước)` : "Argon đang làm việc…"}</div>}
                  {r.status === "error" && <div className="mt-2 text-xs text-red-600">Lỗi: {r.error}</div>}
                  {r.status === "stopped" && <div className="mt-2 text-xs text-amber-600">Đã dừng.</div>}
                  <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-gray-500">
                    {live && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 dark:bg-violet-950/50 px-2 py-0.5 text-violet-700 dark:text-violet-200"><Loader2 size={11} className="animate-spin" />{bgLive ? (r.status === "queued" ? "chạy nền · chờ đoạn kế" : `chạy nền · đoạn ${r.segments + 1}`) : "đang chạy"}</span>}
                    {bgLive && <button type="button" onClick={() => runner.cancelBg(r.id)} className="inline-flex items-center gap-1 text-red-600 hover:underline"><Square size={10} />Dừng việc nền</button>}
                    {r.answer && r.status === "done" && !live && (
                      <span className="inline-flex items-center gap-0.5" role="group" aria-label="Đánh giá câu trả lời">
                        <button type="button" onClick={() => void rate(r.id, r.prompt, r.answer, 1)} aria-label="Trả lời tốt" aria-pressed={rated[r.id] === 1} className={cn("rounded p-1 hover:bg-emerald-50 dark:hover:bg-emerald-950/40", rated[r.id] === 1 ? "text-emerald-600" : "text-gray-400")}><ThumbsUp size={12} /></button>
                        <button type="button" onClick={() => void rate(r.id, r.prompt, r.answer, -1)} aria-label="Trả lời chưa tốt" aria-pressed={rated[r.id] === -1} className={cn("rounded p-1 hover:bg-red-50 dark:hover:bg-red-950/40", rated[r.id] === -1 ? "text-red-600" : "text-gray-400")}><ThumbsDown size={12} /></button>
                      </span>
                    )}
                    {r.model && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-0.5">{/flash/i.test(r.model) ? <><Zap size={10} />Nhanh</> : <><Brain size={10} />Sâu</>}</span>}
                    {r.tokens_in > 0 && <span>{fmtTokens(r.tokens_in)} vào · {fmtTokens(r.tokens_out)} ra · ~${r.cost_usd.toFixed(2)} · {Math.round(r.duration_ms / 1000)}s{r.segments > 1 ? ` · ${r.segments} đoạn` : ""}</span>}
                    {!live && r.status === "partial" && <button type="button" disabled={busy} onClick={() => runner.resume(r.id, opts)} className="inline-flex items-center gap-1 text-violet-600 font-medium"><Play size={11} />Tiếp tục viết</button>}
                    {!live && r.answer && <button type="button" onClick={() => void navigator.clipboard?.writeText(r.answer)} className="ml-auto inline-flex items-center gap-1 hover:text-gray-800 dark:hover:text-slate-200"><Copy size={11} />Sao chép</button>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {patches.some(x => x.status === "pending") && (
        <div role="group" aria-label="Đề xuất sửa code của Argon" className="mx-4 mb-2 space-y-2">
          {patches.filter(x => x.status === "pending").map(x => (
            <div key={x.id} className="rounded-xl border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 p-3 text-sm">
              <div className="font-medium text-sky-900 dark:text-sky-200">Argon đề xuất sửa code: {x.title}</div>
              <details className="mt-1 text-gray-700 dark:text-slate-200"><summary className="cursor-pointer text-xs text-sky-700 dark:text-sky-300">Xem nội dung đề xuất</summary><p className="mt-1 whitespace-pre-wrap text-[13px]">{x.request}</p>{x.plan && <p className="mt-1 whitespace-pre-wrap text-[13px] text-gray-500">Hướng sửa gợi ý: {x.plan}</p>}</details>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={patchBusy === x.id} onClick={() => void decidePatch(x.id, "approve")} className="px-3 py-1 text-xs rounded-lg bg-sky-600 text-white disabled:opacity-50">Duyệt, giao Claude Code sửa</button>
                <button type="button" disabled={patchBusy === x.id} onClick={() => void decidePatch(x.id, "reject")} className="px-3 py-1 text-xs rounded-lg border border-gray-300 dark:border-slate-600">Bỏ qua</button>
                <span className="text-[11px] text-gray-500">Duyệt xong Claude Code viết patch và mở PR vào nhánh staging (không vào main). Anh xem PR rồi merge.</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {pendingAsk && idle && (
        <div role="group" aria-label="Argon đang chờ anh trả lời" className="mx-4 mb-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
          <div className="font-medium text-amber-900 dark:text-amber-200">Argon đang chờ anh quyết</div>
          <p className="mt-1 text-gray-800 dark:text-slate-100 whitespace-pre-wrap">{pendingAsk.question}</p>
          {pendingAsk.options.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">
            {pendingAsk.options.map(o => <button key={o} type="button" onClick={() => void send(o)} className="px-2.5 py-1 text-xs rounded-lg border border-amber-400 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40">{o}</button>)}
          </div>}
          <div className="mt-1.5 text-[11px] text-gray-500">Bấm một lựa chọn, hoặc gõ câu trả lời ở ô dưới. Argon sẽ làm tiếp từ chỗ đã dừng.</div>
        </div>
      )}
      {runner.warn.length > 0 && <div className="mx-4 mb-2 text-xs rounded-lg bg-amber-50 text-amber-800 px-3 py-2 whitespace-pre-wrap">{runner.warn.join("\n")}</div>}

      {/* Ô nhắn: một khối bo tròn, hàng công cụ ngay dưới ô gõ */}
      <div className="px-4 pb-4 pt-2">
        {idle && !(simple && prompt.trim()) && <div className="mb-2 flex flex-wrap gap-1.5">
          {(quick ?? QUICK[phase]).map(q => <button key={q} type="button" onClick={() => setPrompt(q)} title={q} className="px-2.5 py-1 text-xs rounded-full border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors">{q}</button>)}
        </div>}
        {aboveInput}
        <div className="ag-composer">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2} aria-label="Nhắn Argon"
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send() } }}
            placeholder="Nhắn Argon…"
            className="block w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[13.5px] leading-relaxed text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none" />
          <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5 pt-1">
            <Seg label="Mô hình" value={modelMode} onChange={pickModel} options={[
              { v: "auto", label: "Tự động", icon: Sparkles, title: "Tự động: chọn Nhanh hoặc Sâu theo mục đích câu hỏi (hiện ở chip bên cạnh); bấm Nhanh/Sâu để tự chọn" },
              { v: "fast", label: "Nhanh", icon: Zap, title: "Nhanh: việc nhiều bước công cụ, SQL, file (nhanh ~4-7 lần, rẻ ~1/2)" },
              { v: "deep", label: "Sâu", icon: Brain, title: "Sâu (Gemini 4 Argon): phân tích khó, viết dài, ngữ cảnh lớn" },
            ]} />
            {lane && (
              <span title={lane.reason} className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border", lane.here ? "border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 bg-violet-50/60 dark:bg-violet-950/30" : "border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30")}>
                Làn {lane.n} · {lane.label}{lane.here ? ` · ${modelMode === "auto" ? "tự chọn " : ""}${model === "deep" ? "Sâu" : "Nhanh"}` : " · cần Gấu Pro"}
              </span>
            )}
            {simple && <button type="button" onClick={() => setShowOpts(v => !v)} aria-expanded={showOpts} className="px-2 py-1 text-[12px] rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-slate-200">{showOpts ? "Ẩn tuỳ chọn" : "Tuỳ chọn"}</button>}
            {(!simple || showOpts) && <>
            <Seg label="Mức suy luận" value={thinking} onChange={setThinking} options={(Object.keys(THINK_LABEL) as Thinking[]).map(t => ({ v: t, label: THINK_LABEL[t], title: `Suy luận: ${THINK_LABEL[t]}` }))} />
            <Toggle on={allowTools} onClick={() => setAllowTools(v => !v)} icon={Database} label="Số liệu hệ thống" title="Argon được gọi công cụ chỉ-đọc lấy số liệu mới nhất của hệ thống" />
            <Toggle on={background} onClick={() => setBackground(v => !v)} icon={BellRing} label="Chạy nền" title="Worker chạy không giới hạn đoạn, đóng trang vẫn chạy; xong nhắn Lark cho Hiếu" />
            </>}
            <span className="ml-auto flex items-center gap-2">
              <kbd className="ag-kbd hidden sm:inline">Ctrl ↵</kbd>
              {busy
                ? <button type="button" onClick={runner.stop} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-red-600 px-3 text-[13px] text-white hover:bg-red-700"><Square size={13} />Dừng</button>
                : <button type="button" onClick={() => void send()} disabled={!prompt.trim()} className="ag-btn-primary h-8 !py-0"><Send size={13} />Gửi</button>}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
