"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Mic, Square } from "lucide-react"

// U4: 🎤 ở ô nhập — bấm để nói, bấm lần nữa để dừng → chép lời (gemini transcribe, /api/chat/transcribe mode=text) → chèn vào ô nhập.
const MAX_MS = 3 * 60_000

export function DictationButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle")
  const [err, setErr] = useState("")
  const recRef = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { recRef.current?.stream.getTracks().forEach(t => t.stop()); if (timer.current) clearTimeout(timer.current) }, [])

  const start = async () => {
    setErr("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 24_000 })
      chunks.current = []
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (timer.current) clearTimeout(timer.current)
        setState("processing")
        try {
          const form = new FormData()
          form.append("audio", new Blob(chunks.current, { type: "audio/webm" }), "voice.webm")
          form.append("mode", "text")
          const res = await fetch("/api/chat/transcribe", { method: "POST", body: form })
          const d = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`)
          if (d.transcript) onText(d.transcript)
        } catch (e: any) { setErr(e.message) }
        setState("idle")
      }
      recRef.current = rec
      rec.start()
      timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_MS)
      setState("recording")
    } catch (e: any) {
      setErr(e?.name === "NotAllowedError" ? "Bạn chưa cho phép dùng micro." : e.message)
    }
  }

  const label = state === "recording" ? "Dừng và chuyển thành chữ" : state === "processing" ? "Đang chuyển thành chữ…" : err ? `Nói để nhập (lỗi lần trước: ${err})` : "Nói để nhập (tối đa 3 phút)"
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled || state === "processing"}
      onClick={() => state === "recording" ? recRef.current?.stop() : start()}
      className={`flex-shrink-0 w-10 h-10 flex items-center justify-center border rounded-xl transition-colors disabled:opacity-40 ${state === "recording"
        ? "bg-rose-600 border-rose-600 text-white animate-pulse"
        : err ? "border-rose-200 text-rose-500" : "border-gray-200 dark:border-slate-700 text-gray-400 hover:text-brand-600 hover:bg-brand-50"}`}>
      {state === "processing" ? <Loader2 size={16} className="animate-spin" /> : state === "recording" ? <Square size={13} fill="currentColor" /> : <Mic size={16} />}
    </button>
  )
}
