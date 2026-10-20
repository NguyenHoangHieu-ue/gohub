"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api, jsonInit, type Run } from "../argon-types"

// Chạy lượt của sứ mệnh: SSE tới dự án nền (tự nối đoạn dở), gom các bước công cụ cho Bàn làm việc, thăm dò việc nền. Chat chỉ nhận câu trả lời, mọi bước đi vào `steps`.
export interface Step { id: string; runId: string; idx: number; name: string; args: Record<string, unknown>; ok: boolean; chars: number; at: string; result?: string }
export type Thinking = "low" | "medium" | "high"
export interface SendOpts { thinking: Thinking; allowTools: boolean; background: boolean }
const MAX_AUTO_SEGMENTS = 6

const FILE_TOOLS = ["docFile", "ghiFile", "lietKeFile"]
export function stepLabel(s: Pick<Step, "name" | "args">): { tag: string; text: string } {
  const a = s.args
  if (s.name === "docFile") return { tag: "ĐỌC", text: `Đọc ${String(a.path ?? "")}` }
  if (s.name === "ghiFile") return { tag: "GHI", text: `${a.append === true ? "Ghi thêm vào" : "Ghi"} ${String(a.path ?? "")}` }
  if (s.name === "lietKeFile") return { tag: "FILE", text: "Liệt kê file workspace" }
  if (s.name === "sql") return { tag: "SQL", text: `SQL: ${String(a.query ?? "").replace(/\s+/g, " ").slice(0, 70)}${a.saveAs ? ` → ${String(a.saveAs)}` : ""}` }
  if (s.name === "hoiHieu") return { tag: "HỎI", text: `Hỏi Hiếu: ${String(a.cauHoi ?? "").replace(/\s+/g, " ").slice(0, 70)}` }
  if (s.name === "run_code") return { tag: "PY", text: `Chạy Python${Array.isArray(a.inputs) && a.inputs.length ? ` (${a.inputs.length} file vào)` : ""}` }
  if (s.name === "layDuLieuHeThong") return { tag: "SỐ", text: `Lấy số liệu ${String(a.report ?? "")} ${String(a.quarter || (a.startDate ? `${a.startDate}→${a.endDate}` : ""))}`.trim() }
  return { tag: "TOOL", text: s.name }
}
/** Bước đã ghi vào workspace thành công → giao diện cần tải lại file/cây. */
export const changedWorkspace = (s: Pick<Step, "name" | "ok">) => s.ok && s.name === "ghiFile"
export const isFileTool = (name: string) => FILE_TOOLS.includes(name)

async function streamRun(projectId: string, body: Record<string, unknown>, signal: AbortSignal, onEvent: (e: Record<string, any>) => void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`/api/creator/argon/projects/${projectId}/runs`, { ...jsonInit("POST", body), signal })
  if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `HTTP ${res.status}`) }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2)
      if (line.startsWith("data:")) { try { onEvent(JSON.parse(line.slice(5))) } catch { /* bỏ qua gói hỏng */ } }
    }
  }
}

export function useMissionRunner(o: {
  projectId: string | null
  runs: Run[]
  setRuns: (fn: (prev: Run[]) => Run[]) => void
  onError: (m: string) => void
  onWorkspaceChanged: () => void          // Argon vừa ghi file
  onFinished: () => void                  // lượt xong (cập nhật chi tiêu, lịch sử)
  onPoll: () => void                      // thăm dò việc nền: tải lại chi tiết sứ mệnh
}) {
  const { projectId, runs, setRuns, onError, onWorkspaceChanged, onFinished, onPoll } = o
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [warn, setWarn] = useState<string[]>([])
  const acRef = useRef<AbortController | null>(null)
  const stepsRun = useRef<string | null>(null)       // lượt mà `steps` đang hiển thị

  const patchRun = useCallback((id: string, p: Partial<Run>) => setRuns(prev => prev.map(r => (r.id === id ? { ...r, ...p } : r))), [setRuns])

  const loadSteps = useCallback(async (runId: string, full = false) => {
    if (!projectId) return
    try {
      const r = await api<{ tools: { name: string; args: Record<string, unknown>; ok: boolean; chars: number; at: string; result?: string }[] }>(`/api/creator/argon/projects/${projectId}/runs?runId=${runId}${full ? "&full=1" : ""}`)
      stepsRun.current = runId
      setSteps(r.tools.map((t, i) => ({ id: `${runId}:${i}`, runId, idx: i, ...t })))
    } catch { /* nhật ký lượt cũ có thể đã hết hạn: bỏ qua */ }
  }, [projectId])

  // Đổi sứ mệnh → xoá bước cũ; có lượt gần nhất thì nạp lại các bước của nó để Bàn làm việc không trống sau khi tải trang.
  const lastRunId = runs.length ? runs[runs.length - 1].id : null
  useEffect(() => { stepsRun.current = null; setSteps([]) }, [projectId])
  useEffect(() => { if (lastRunId && !busy && stepsRun.current !== lastRunId) void loadSteps(lastRunId) }, [lastRunId, busy, loadSteps])

  async function run(body: Record<string, unknown>) {
    if (!projectId) return
    const ac = new AbortController(); acRef.current = ac; setBusy(true); setWarn([])
    let seg = 0, resumeId = body.resumeRunId as string | undefined
    try {
      for (;;) {
        let rid = resumeId ?? "", final: Partial<Run> | null = null
        await streamRun(projectId, resumeId ? { ...body, resumeRunId: resumeId } : body, ac.signal, e => {
          if (e.type === "start") {
            rid = e.runId; if (e.warnings?.length) setWarn(e.warnings)
            if (!resumeId) {
              stepsRun.current = rid; setSteps([])
              setRuns(prev => [...prev, { id: rid, prompt: String(body.prompt), answer: "", status: "running", model: null, thinking: String(body.thinking), source_ids: [], tokens_in: 0, tokens_out: 0, cached_in: 0, cost_usd: 0, duration_ms: 0, segments: 0, error: null, created_at: new Date().toISOString() }])
            } else patchRun(rid, { status: "running" })
          } else if (e.type === "delta") {
            setRuns(prev => prev.map(r => (r.id === rid ? { ...r, answer: r.answer + e.text } : r)))
          } else if (e.type === "tool") {
            const st: Step = { id: "", runId: rid, idx: 0, name: e.name, args: e.args, ok: e.ok, chars: e.chars, at: new Date().toISOString() }
            setSteps(prev => [...prev, { ...st, idx: prev.length, id: `${rid}:${prev.length}` }])
            if (changedWorkspace(st)) onWorkspaceChanged()
          } else if (e.type === "done") { final = e.run } else if (e.type === "error") { throw new Error(e.message) }
        })
        if (final) patchRun(rid, final)
        seg++
        if ((final as Partial<Run> | null)?.status === "partial" && seg < MAX_AUTO_SEGMENTS && !ac.signal.aborted) { resumeId = rid; continue }
        break
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) onError((e as Error).message)
    }
    setBusy(false); acRef.current = null
    onFinished()
  }

  async function startBackground(body: Record<string, unknown>) {
    if (!projectId) return
    try {
      const r = await api<{ runId: string }>(`/api/creator/argon/projects/${projectId}/runs`, jsonInit("POST", { ...body, background: true }))
      if (body.resumeRunId) patchRun(String(body.resumeRunId), { status: "queued" })
      else { stepsRun.current = r.runId; setSteps([]); setRuns(prev => [...prev, { id: r.runId, prompt: String(body.prompt), answer: "", status: "queued", model: null, thinking: String(body.thinking), source_ids: [], tokens_in: 0, tokens_out: 0, cached_in: 0, cost_usd: 0, duration_ms: 0, segments: 0, error: null, created_at: new Date().toISOString() }]) }
    } catch (e) { onError((e as Error).message) }
  }

  const send = (prompt: string, opts: SendOpts) => (opts.background ? startBackground({ prompt, thinking: opts.thinking, allowTools: opts.allowTools }) : run({ prompt, thinking: opts.thinking, allowTools: opts.allowTools }))
  const resume = (runId: string, opts: SendOpts) => (opts.background ? startBackground({ resumeRunId: runId, thinking: opts.thinking, allowTools: opts.allowTools }) : run({ resumeRunId: runId, thinking: opts.thinking, allowTools: opts.allowTools }))
  const stop = () => acRef.current?.abort()
  async function cancelBg(runId: string) {
    if (!projectId) return
    try { await api(`/api/creator/argon/projects/${projectId}/runs`, jsonInit("PATCH", { runId, action: "cancel" })); patchRun(runId, { status: "stopped" }) } catch (e) { onError((e as Error).message) }
  }

  // Việc nền đang chờ/chạy (kể cả sau khi tải lại trang): 5 giây hỏi lại trạng thái + các bước của lượt đó.
  const bgRun = runs.find(r => r.status === "queued" || r.status === "running")
  const bgActive = !!bgRun && !busy
  const bgId = bgRun?.id
  useEffect(() => {
    if (!bgActive || !bgId) return
    const t = setInterval(() => { onPoll(); void loadSteps(bgId) }, 5000)
    return () => clearInterval(t)
  }, [bgActive, bgId, onPoll, loadSteps])

  return { busy, bgActive, steps, warn, send, resume, stop, cancelBg, loadSteps }
}
