"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Mic, MicOff, Monitor, Camera, PhoneOff, Loader2, X, Send } from "lucide-react"

// G5 (docs/plans/gau-pro-assistant.md): phiên giọng nói + màn hình/camera trực tiếp với Gấu Pro qua Gemini Live API.
// Trình duyệt kết nối THẲNG Gemini bằng token tạm (server cấp, khoá model + prompt + bộ tool CHỈ ĐỌC); tool chạy qua
// /api/creator-ai/live/tool. Mic: PCM 16-bit 16kHz; loa: PCM 24kHz; hình: JPEG ~1 khung/giây.

interface Turn { role: "user" | "assistant" | "tool"; text: string; done?: boolean }
type Share = "none" | "screen" | "camera"

// AudioWorklet: file tĩnh public/gp-pcm-capture.js (CSP script-src 'self' chặn nạp từ blob:).
const WORKLET_URL = "/gp-pcm-capture.js"

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function LiveSession({ onClose, onSaved }: { onClose: () => void; onSaved?: (conversationId: string) => void }) {
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "ending" | "error">("idle")
  const [err, setErr] = useState("")
  const [turns, setTurns] = useState<Turn[]>([])
  const [micOn, setMicOn] = useState(true)
  const [share, setShare] = useState<Share>("none")
  const [text, setText] = useState("")
  const [speaking, setSpeaking] = useState(false)

  const sessionRef = useRef<any>(null)
  const inCtxRef = useRef<AudioContext | null>(null)
  const outCtxRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const videoStreamRef = useRef<MediaStream | null>(null)
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playingRef = useRef<AudioBufferSourceNode[]>([])
  const nextTimeRef = useRef(0)
  const micOnRef = useRef(true)
  const turnsRef = useRef<Turn[]>([])
  const toolsRef = useRef<{ name: string; ms: number; err?: string }[]>([])
  const t0Ref = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  const pushText = useCallback((role: Turn["role"], chunk: string, finalize = false) => {
    const list = turnsRef.current
    const last = list[list.length - 1]
    if (last && last.role === role && !last.done) last.text += chunk
    else list.push({ role, text: chunk })
    if (finalize) list[list.length - 1].done = true
    turnsRef.current = list
    setTurns([...list])
  }, [])
  const closeTurns = () => { turnsRef.current.forEach(t => { t.done = true }) }

  const stopPlayback = () => {
    playingRef.current.forEach(s => { try { s.stop() } catch { /* đã dừng */ } })
    playingRef.current = []
    nextTimeRef.current = 0
    setSpeaking(false)
  }

  const play = (b64: string) => {
    const ctx = outCtxRef.current
    if (!ctx) return
    const bin = atob(b64)
    const pcm = new Int16Array(bin.length / 2)
    for (let i = 0; i < pcm.length; i++) pcm[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) << 16 >> 16
    const buf = ctx.createBuffer(1, pcm.length, 24000)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const at = Math.max(ctx.currentTime, nextTimeRef.current)
    src.start(at)
    nextTimeRef.current = at + buf.duration
    playingRef.current.push(src)
    setSpeaking(true)
    src.onended = () => {
      playingRef.current = playingRef.current.filter(s => s !== src)
      if (!playingRef.current.length) setSpeaking(false)
    }
  }

  const runTool = async (fc: { id?: string; name: string; args?: unknown }) => {
    const ts = Date.now()
    pushText("tool", `🔎 ${fc.name}`, true)
    let response: unknown
    try {
      const d = await fetch("/api/creator-ai/live/tool", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: fc.name, args: fc.args ?? {} }),
      }).then(r => r.json())
      response = d.response ?? { error: d.error || "Lỗi" }
    } catch (e: any) { response = { error: e.message } }
    const errMsg = (response as any)?.error
    toolsRef.current.push({ name: fc.name, ms: Date.now() - ts, ...(errMsg ? { err: String(errMsg) } : {}) })
    return { id: fc.id, name: fc.name, response: response as Record<string, unknown> }
  }

  const onMessage = async (m: any) => {
    if (m.toolCall?.functionCalls?.length) {
      const functionResponses = await Promise.all(m.toolCall.functionCalls.map(runTool))
      sessionRef.current?.sendToolResponse({ functionResponses })
    }
    const sc = m.serverContent
    if (!sc) return
    if (sc.interrupted) stopPlayback()                         // người dùng chen lời → ngừng phát ngay
    if (sc.inputTranscription?.text) pushText("user", sc.inputTranscription.text)
    if (sc.outputTranscription?.text) pushText("assistant", sc.outputTranscription.text)
    for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data && String(p.inlineData.mimeType).startsWith("audio/pcm")) play(p.inlineData.data)
    if (sc.turnComplete) closeTurns()
  }

  const stopShare = useCallback(() => {
    if (frameTimerRef.current) clearInterval(frameTimerRef.current)
    frameTimerRef.current = null
    videoStreamRef.current?.getTracks().forEach(t => t.stop())
    videoStreamRef.current = null
    setShare("none")
  }, [])

  const startShare = async (kind: Exclude<Share, "none">) => {
    stopShare()
    try {
      const stream = kind === "screen"
        ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 } })
        : await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
      videoStreamRef.current = stream
      stream.getVideoTracks()[0].onended = stopShare
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}) }
      if (!canvasRef.current) canvasRef.current = document.createElement("canvas")
      frameTimerRef.current = setInterval(() => {
        const v = videoRef.current, c = canvasRef.current, s = sessionRef.current
        if (!v || !c || !s || !v.videoWidth) return
        const scale = Math.min(1, 1024 / v.videoWidth)
        c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale)
        c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height)
        const data = c.toDataURL("image/jpeg", 0.6).split(",")[1]
        s.sendRealtimeInput({ video: { data, mimeType: "image/jpeg" } })
      }, 1000)
      setShare(kind)
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") setErr(`Không chia sẻ được ${kind === "screen" ? "màn hình" : "camera"}: ${e.message}`)
    }
  }

  const cleanup = useCallback(() => {
    stopShare()
    try { sessionRef.current?.close() } catch { /* đã đóng */ }
    sessionRef.current = null
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null
    inCtxRef.current?.close().catch(() => {}); inCtxRef.current = null
    playingRef.current.forEach(s => { try { s.stop() } catch { /* */ } }); playingRef.current = []
    outCtxRef.current?.close().catch(() => {}); outCtxRef.current = null
  }, [stopShare])

  const start = async () => {
    setErr(""); setStatus("connecting")
    turnsRef.current = []; toolsRef.current = []; setTurns([])
    try {
      const tok = await fetch("/api/creator-ai/live/token", { method: "POST" }).then(async r => ({ ok: r.ok, ...(await r.json()) }))
      if (!tok.ok || !tok.token) throw new Error(tok.error || "Không lấy được token phiên")
      const { GoogleGenAI } = await import("@google/genai")
      const ai = new GoogleGenAI({ apiKey: tok.token, httpOptions: { apiVersion: "v1alpha" } })
      outCtxRef.current = new AudioContext({ sampleRate: 24000 })
      sessionRef.current = await ai.live.connect({
        model: tok.model, config: tok.config,
        callbacks: {
          onmessage: (m: any) => { onMessage(m) },
          onerror: (e: any) => { setErr(`Lỗi kết nối: ${e?.message || "không rõ"}`) },
          onclose: (e: any) => {
            if (sessionRef.current) { setErr(e?.reason ? `Phiên đã đóng: ${e.reason}` : "Phiên đã đóng."); setStatus("error"); cleanup() }
          },
        },
      })
      // Mic → PCM 16kHz → Live
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      micStreamRef.current = mic
      const inCtx = new AudioContext({ sampleRate: 16000 })
      inCtxRef.current = inCtx
      await inCtx.audioWorklet.addModule(WORKLET_URL)
      const node = new AudioWorkletNode(inCtx, "pcm-capture")
      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (!micOnRef.current || !sessionRef.current) return
        sessionRef.current.sendRealtimeInput({ audio: { data: toBase64(e.data), mimeType: "audio/pcm;rate=16000" } })
      }
      inCtx.createMediaStreamSource(mic).connect(node)
      t0Ref.current = Date.now()
      setStatus("live")
    } catch (e: any) {
      setErr(e?.name === "NotAllowedError" ? "Bạn chưa cho phép dùng micro." : e.message)
      setStatus("error")
      cleanup()
    }
  }

  const end = async () => {
    setStatus("ending")
    const s = sessionRef.current
    sessionRef.current = null           // đánh dấu tự đóng (onclose không báo lỗi)
    try { s?.close() } catch { /* */ }
    cleanup()
    const payload = {
      turns: turnsRef.current.filter(t => t.role !== "tool").map(t => ({ role: t.role, text: t.text.trim() })),
      tools: toolsRef.current, durationMs: t0Ref.current ? Date.now() - t0Ref.current : 0,
    }
    if (payload.turns.length) {
      const d = await fetch("/api/creator-ai/live/log", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      }).then(r => r.json()).catch(() => ({}))
      if (d.conversationId) onSaved?.(d.conversationId)
    }
    setStatus("idle")
  }

  const sendText = () => {
    const t = text.trim()
    if (!t || !sessionRef.current) return
    pushText("user", t, true)
    sessionRef.current.sendClientContent({ turns: t, turnComplete: true })
    setText("")
  }

  useEffect(() => { micOnRef.current = micOn }, [micOn])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "auto" }) }, [turns])
  useEffect(() => () => cleanup(), [cleanup])

  const live = status === "live"
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget && !live) onClose() }}>
      <div className="w-full max-w-2xl h-[80vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${live ? (speaking ? "bg-violet-500 animate-pulse" : "bg-emerald-500") : "bg-gray-300"}`} />
            <span className="font-semibold text-sm text-gray-800 dark:text-slate-100">🎙 Gấu Pro trực tiếp</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">thử nghiệm</span>
          </div>
          <button onClick={() => { if (live) end(); onClose() }} className="p-1 text-gray-400 hover:text-gray-700" title="Đóng"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
          {status === "idle" && turns.length === 0 && (
            <div className="text-gray-500 dark:text-slate-400 text-xs leading-relaxed">
              Nói chuyện bằng giọng với Gấu Pro, có thể chia sẻ màn hình hoặc camera để Gấu nhìn cùng (vd bảng giá NCC đang mở → hỏi
              "so với COGS hiện tại thế nào"). Chỉ có công cụ <b>đọc</b> dữ liệu; việc cần ghi/gửi/tạo file hãy dùng chat thường.
              Hình màn hình được gửi tới Google Gemini để phân tích — chỉ chia sẻ khi cần. Kết thúc phiên, phụ đề được lưu thành 1 hội thoại.
            </div>
          )}
          {turns.map((t, i) => t.role === "tool" ? (
            <div key={i} className="text-[11px] text-gray-400 text-center">{t.text}</div>
          ) : (
            <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-xl ${t.role === "user" ? "bg-violet-600 text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-100"}`}>{t.text}</div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {share !== "none" && (
          <div className="px-4 pb-2">
            <div className="text-[10px] text-rose-500 mb-1">● Đang chia sẻ {share === "screen" ? "màn hình" : "camera"} với Gấu (1 khung/giây)</div>
            <video ref={videoRef} muted playsInline className="h-28 rounded-lg border border-gray-200 dark:border-slate-700 bg-black" />
          </div>
        )}
        {share === "none" && <video ref={videoRef} muted playsInline className="hidden" />}

        {err && <div className="px-4 pb-2 text-xs text-rose-500">{err}</div>}

        <div className="border-t border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center gap-2">
          {!live ? (
            <button onClick={start} disabled={status === "connecting" || status === "ending"}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm hover:bg-violet-500 disabled:opacity-50">
              {status === "connecting" || status === "ending" ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
              {status === "connecting" ? "Đang kết nối..." : status === "ending" ? "Đang lưu..." : "Bắt đầu nói"}
            </button>
          ) : (
            <>
              <button onClick={() => setMicOn(v => !v)} title={micOn ? "Tắt mic" : "Bật mic"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center border ${micOn ? "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300" : "bg-rose-50 border-rose-200 text-rose-500"}`}>
                {micOn ? <Mic size={15} /> : <MicOff size={15} />}
              </button>
              <button onClick={() => share === "screen" ? stopShare() : startShare("screen")} title="Chia sẻ màn hình"
                className={`w-10 h-10 rounded-xl flex items-center justify-center border ${share === "screen" ? "bg-violet-600 text-white border-violet-600" : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300"}`}>
                <Monitor size={15} />
              </button>
              <button onClick={() => share === "camera" ? stopShare() : startShare("camera")} title="Camera"
                className={`w-10 h-10 rounded-xl flex items-center justify-center border ${share === "camera" ? "bg-violet-600 text-white border-violet-600" : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300"}`}>
                <Camera size={15} />
              </button>
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") sendText() }}
                placeholder="Hoặc gõ..." className="flex-1 min-w-0 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-transparent" />
              <button onClick={sendText} disabled={!text.trim()} className="w-10 h-10 rounded-xl flex items-center justify-center text-violet-600 disabled:opacity-30"><Send size={15} /></button>
              <button onClick={end} title="Kết thúc phiên" className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-600 text-white hover:bg-rose-500">
                <PhoneOff size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
