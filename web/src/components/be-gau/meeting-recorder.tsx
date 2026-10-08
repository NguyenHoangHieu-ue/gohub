"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Square, Loader2, Upload } from "lucide-react"

// U3: ghi âm cuộc họp (hoặc chọn file ghi âm) → /api/chat/transcribe → biên bản. 16kbps opus để vừa trần ~4,4MB (≈ 35 phút).
const MAX_MS = 35 * 60_000
const fmt = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`

export function MeetingRecorder({ disabled, onResult }: {
  disabled?: boolean
  onResult: (label: string, reply: string) => void
}) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle")
  const [elapsed, setElapsed] = useState(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const t0Ref = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state !== "recording") return
    const id = setInterval(() => {
      const ms = Date.now() - t0Ref.current
      setElapsed(ms)
      if (ms >= MAX_MS) recRef.current?.stop()
    }, 1000)
    return () => clearInterval(id)
  }, [state])
  useEffect(() => () => { recRef.current?.stream.getTracks().forEach(t => t.stop()) }, [])

  const send = async (blob: Blob, label: string) => {
    setState("processing")
    let reply: string
    try {
      const form = new FormData()
      form.append("audio", blob, "meeting.webm")
      const res = await fetch("/api/chat/transcribe", { method: "POST", body: form })
      const d = await res.json().catch(() => ({}))
      reply = res.ok
        ? `${d.minutes}\n\n---\n**Lời nói (chép tự động — có thể nghe nhầm thuật ngữ, biên bản ở trên đã sửa)**\n\n${d.transcript}`
        : `Không làm được biên bản: ${d.error || `HTTP ${res.status}`}`
    } catch (e: any) { reply = `Không làm được biên bản: ${e.message}` }
    setState("idle")
    onResult(label, reply)
  }

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 16_000 })
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const ms = Date.now() - t0Ref.current
        void send(new Blob(chunksRef.current, { type: "audio/webm" }), `🎙 Ghi âm cuộc họp (${fmt(ms)}) — làm biên bản giúp mình`)
      }
      recRef.current = rec
      t0Ref.current = Date.now()
      setElapsed(0)
      rec.start(10_000)
      setState("recording")
    } catch (e: any) {
      onResult("🎙 Ghi âm cuộc họp", e?.name === "NotAllowedError" ? "Bạn chưa cho phép dùng micro." : `Không ghi âm được: ${e.message}`)
    }
  }

  if (state === "recording") return (
    <button type="button" onClick={() => recRef.current?.stop()} title="Dừng ghi âm và làm biên bản"
      className="flex-shrink-0 h-10 px-3 flex items-center gap-1.5 text-xs bg-rose-600 text-white rounded-xl animate-pulse">
      <Square size={12} fill="currentColor" />{fmt(elapsed)}
    </button>
  )
  if (state === "processing") return (
    <span className="flex-shrink-0 h-10 px-3 flex items-center gap-1.5 text-xs text-brand-600 border border-brand-200 rounded-xl">
      <Loader2 size={13} className="animate-spin" />Đang làm biên bản…
    </span>
  )
  return (
    <div className="flex-shrink-0 flex items-center">
      <button type="button" onClick={start} disabled={disabled} title="Ghi âm cuộc họp → biên bản (tối đa 35 phút)"
        className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-brand-50 border border-gray-200 dark:border-slate-700 rounded-l-xl disabled:opacity-40">
        <Mic size={16} />
      </button>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled} title="Chọn file ghi âm (≤ 4MB) → biên bản"
        className="w-7 h-10 flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-brand-50 border border-l-0 border-gray-200 dark:border-slate-700 rounded-r-xl disabled:opacity-40">
        <Upload size={12} />
      </button>
      <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={e => {
        const f = e.target.files?.[0]; e.target.value = ""
        if (f) void send(f, `🎙 File ghi âm "${f.name}" — làm biên bản giúp mình`)
      }} />
    </div>
  )
}
