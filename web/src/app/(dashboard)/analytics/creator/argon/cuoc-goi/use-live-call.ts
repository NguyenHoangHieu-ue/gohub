"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { appendChunk, finalizeLast, type CallLine } from "@/lib/argon/call-pure"

// Phiên nghe-dịch cuộc gọi: tiếng đối tác (tab/âm thanh hệ thống hoặc file thử) → Gemini Live (translate model) → phụ đề Anh/Việt; mic của anh chỉ chép chữ.
// Không phát âm thanh dịch ra loa (tiếng đối tác vẫn nghe từ cuộc gọi như bình thường). Tự nối lại khi phiên đứt và đổi phiên sang trước hạn 30 phút của Live.
export type CallStatus = "idle" | "connecting" | "live" | "reconnecting" | "error" | "ended"
export type CallSource = { kind: "share" } | { kind: "file"; file: File }
interface Tokens { partner: { token: string; model: string; config: unknown }; me: { token: string; model: string; config: unknown } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sess = any
const WORKLET_URL = "/gp-pcm-capture.js"
const IDLE_FINAL_MS = 1800, IDLE_FINAL_NO_VI_MS = 3500
const ROTATE_MS = 24 * 60_000, MAX_RECONNECT = 8
const BACKUP_KEY = "argon_call_backup"

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function useLiveCall(onPartnerFinal: (line: CallLine, all: CallLine[]) => void) {
  const [status, setStatus] = useState<CallStatus>("idle")
  const [err, setErr] = useState("")
  const [lines, setLines] = useState<CallLine[]>([])
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const linesRef = useRef<CallLine[]>([])
  const firedRef = useRef(new Set<number>())
  const sessRef = useRef<{ partner: Sess; me: Sess }>({ partner: null, me: null })
  const ctxRef = useRef<AudioContext | null>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const stoppingRef = useRef(false)
  const wantMicRef = useRef(true)
  const reconnectsRef = useRef(0)
  const rotateRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cbRef = useRef(onPartnerFinal)
  cbRef.current = onPartnerFinal

  const commit = useCallback((next: CallLine[]) => {
    linesRef.current = next
    setLines(next)
    for (const l of next) if (l.who === "partner" && l.final && !firedRef.current.has(l.id)) { firedRef.current.add(l.id); cbRef.current(l, next) }
  }, [])

  const openSessions = useCallback(async (): Promise<{ partner: Sess; me: Sess }> => {
    const r = await fetch("/api/creator/argon/call/token", { method: "POST" })
    const tok = (await r.json()) as Tokens & { error?: string }
    if (!r.ok) throw new Error(tok.error || "Không lấy được token phiên")
    const { GoogleGenAI } = await import("@google/genai")
    const open = async (t: Tokens["partner"], who: "partner" | "me"): Promise<Sess> => {
      const ai = new GoogleGenAI({ apiKey: t.token, httpOptions: { apiVersion: "v1alpha" } })
      const holder: { s: Sess } = { s: null }
      holder.s = await ai.live.connect({
        model: t.model, config: t.config as never,
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onmessage: (m: any) => {
            const sc = m.serverContent
            if (!sc) return
            const now = Date.now()
            if (sc.inputTranscription?.text) commit(appendChunk(linesRef.current, who, "en", sc.inputTranscription.text, now))
            if (who === "partner" && sc.outputTranscription?.text) commit(appendChunk(linesRef.current, "partner", "vi", sc.outputTranscription.text, now))
            if (sc.turnComplete) commit(finalizeLast(linesRef.current, who))
          },
          onerror: () => { /* onclose xử lý nối lại */ },
          onclose: () => { if (!stoppingRef.current && (sessRef.current[who] === holder.s)) void reconnect() },
        },
      })
      return holder.s
    }
    const [partner, me] = await Promise.all([open(tok.partner, "partner"), wantMicRef.current ? open(tok.me, "me") : Promise.resolve(null)])
    return { partner, me }
  }, [commit]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleRotate = useCallback(() => {
    if (rotateRef.current) clearTimeout(rotateRef.current)
    rotateRef.current = setTimeout(async () => {   // mở phiên mới TRƯỚC rồi mới đóng phiên cũ → không hở âm thanh
      if (stoppingRef.current) return
      try {
        const old = sessRef.current
        const fresh = await openSessions()
        sessRef.current = fresh
        for (const s of [old.partner, old.me]) { try { s?.close() } catch { /* */ } }
        scheduleRotate()
      } catch { /* để onclose/reconnect xử lý */ }
    }, ROTATE_MS)
  }, [openSessions])

  const reconnect = useCallback(async () => {
    if (stoppingRef.current) return
    if (reconnectsRef.current >= MAX_RECONNECT) { setErr("Phiên dịch đứt nhiều lần liên tiếp, anh bấm Kết thúc rồi bắt đầu lại."); setStatus("error"); return }
    reconnectsRef.current++
    setStatus("reconnecting")
    const old = sessRef.current
    sessRef.current = { partner: null, me: null }
    for (const s of [old.partner, old.me]) { try { s?.close() } catch { /* */ } }
    try {
      await new Promise(r => setTimeout(r, 800 * reconnectsRef.current))
      sessRef.current = await openSessions()
      setStatus("live"); scheduleRotate()
    } catch { void reconnect() }
  }, [openSessions, scheduleRotate])

  const cleanup = useCallback(() => {
    stoppingRef.current = true
    if (rotateRef.current) clearTimeout(rotateRef.current)
    const s = sessRef.current
    sessRef.current = { partner: null, me: null }
    for (const x of [s.partner, s.me]) { try { x?.close() } catch { /* */ } }
    streamsRef.current.forEach(st => st.getTracks().forEach(t => t.stop())); streamsRef.current = []
    ctxRef.current?.close().catch(() => {}); ctxRef.current = null
    if (audioElRef.current) { audioElRef.current.pause(); URL.revokeObjectURL(audioElRef.current.src); audioElRef.current = null }
  }, [])

  const start = useCallback(async (source: CallSource, opts: { mic: boolean }) => {
    setErr(""); setStatus("connecting"); stoppingRef.current = false; reconnectsRef.current = 0
    wantMicRef.current = opts.mic
    firedRef.current = new Set(); commit([]); setStartedAt(null)
    try {
      let partnerStream: MediaStream
      if (source.kind === "share") {
        // Chrome: chọn TAB cuộc gọi (Meet/WhatsApp Web) và tick "Chia sẻ âm thanh tab"; app máy tính thì chọn "Toàn bộ màn hình" + "Chia sẻ âm thanh hệ thống" (Windows).
        const ds = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints })
        ds.getVideoTracks().forEach(t => { t.enabled = false })
        streamsRef.current.push(ds)
        if (!ds.getAudioTracks().length) throw new Error("Chưa chia sẻ âm thanh. Bấm lại, chọn tab cuộc gọi và tick \"Chia sẻ âm thanh tab\" (hoặc chọn toàn bộ màn hình + \"Chia sẻ âm thanh hệ thống\").")
        ds.getAudioTracks()[0].onended = () => { if (!stoppingRef.current) { setErr("Anh đã dừng chia sẻ âm thanh."); setStatus("error"); cleanup() } }
        partnerStream = new MediaStream([ds.getAudioTracks()[0]])
      } else {
        const el = new Audio(URL.createObjectURL(source.file))
        el.crossOrigin = "anonymous"
        audioElRef.current = el
        await el.play()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cap = (el as any).captureStream?.() as MediaStream | undefined
        if (!cap || !cap.getAudioTracks().length) throw new Error("Trình duyệt không lấy được âm thanh từ file này.")
        partnerStream = new MediaStream([cap.getAudioTracks()[0]])
        el.onended = () => { /* hết file: giữ phiên để anh bấm Kết thúc */ }
      }
      const ctx = new AudioContext({ sampleRate: 16000 })
      ctxRef.current = ctx
      await ctx.audioWorklet.addModule(WORKLET_URL)
      sessRef.current = await openSessions()
      const send = (who: "partner" | "me") => (e: MessageEvent<ArrayBuffer>) => {
        try { sessRef.current[who]?.sendRealtimeInput({ audio: { data: toBase64(e.data), mimeType: "audio/pcm;rate=16000" } }) } catch { /* phiên đang nối lại */ }
      }
      const pNode = new AudioWorkletNode(ctx, "pcm-capture")
      pNode.port.onmessage = send("partner")
      ctx.createMediaStreamSource(partnerStream).connect(pNode)
      if (opts.mic) {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
        streamsRef.current.push(mic)
        const mNode = new AudioWorkletNode(ctx, "pcm-capture")
        mNode.port.onmessage = send("me")
        ctx.createMediaStreamSource(mic).connect(mNode)
      }
      setStartedAt(Date.now()); setStatus("live"); scheduleRotate()
    } catch (e) {
      const x = e as Error
      setErr(x.name === "NotAllowedError" ? "Anh chưa cho phép chia sẻ âm thanh hoặc micro." : x.message)
      setStatus("error"); cleanup()
    }
  }, [cleanup, commit, openSessions, scheduleRotate])

  /** Kết thúc nghe; trả các dòng đã chốt hết (dòng đang mở cũng được chốt). */
  const stop = useCallback((): CallLine[] => {
    cleanup()
    const done = linesRef.current.map(l => ({ ...l, final: true }))
    commit(done)
    setStatus("ended")
    try { sessionStorage.removeItem(BACKUP_KEY) } catch { /* */ }
    return done
  }, [cleanup, commit])

  useEffect(() => {   // chốt dòng đối tác khi im lặng đủ lâu (phòng khi Live không báo hết lượt)
    const t = setInterval(() => {
      const open = [...linesRef.current].reverse().find(l => l.who === "partner" && !l.final)
      if (open && Date.now() - open.at > (open.vi ? IDLE_FINAL_MS : IDLE_FINAL_NO_VI_MS)) commit(finalizeLast(linesRef.current, "partner"))
    }, 500)
    return () => clearInterval(t)
  }, [commit])
  useEffect(() => {   // sao lưu để không mất bản ghi nếu lỡ tải lại trang giữa cuộc gọi
    const t = setInterval(() => { if (linesRef.current.length) try { sessionStorage.setItem(BACKUP_KEY, JSON.stringify({ lines: linesRef.current, startedAt })) } catch { /* */ } }, 3000)
    return () => clearInterval(t)
  }, [startedAt])
  useEffect(() => () => cleanup(), [cleanup])

  return { status, err, lines, startedAt, start, stop, setErr, reset: () => { commit([]); setStatus("idle"); setErr(""); setStartedAt(null) } }
}

export function readCallBackup(): { lines: CallLine[]; startedAt: number | null } | null {
  try { const v = sessionStorage.getItem(BACKUP_KEY); return v ? JSON.parse(v) : null } catch { return null }
}
export const clearCallBackup = () => { try { sessionStorage.removeItem(BACKUP_KEY) } catch { /* */ } }
