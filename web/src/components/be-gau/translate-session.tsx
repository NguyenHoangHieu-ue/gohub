"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, PhoneOff, X, Languages } from "lucide-react"

// U3 dịch trực tiếp cho CS (Gemini Live + translationConfig). 2 phiên: khách → tiếng Việt, nhân viên → tiếng khách.
// Đo 2026-10-08: echoTargetLanguage=false VẪN phát âm thanh khi nghe đúng ngôn ngữ đích → KHÔNG cho 2 phiên cùng nghe;
// mic chỉ gửi vào phiên của "người đang nói" (bấm chọn). Mic PCM 16kHz, loa PCM 24kHz (giống phiên Trực tiếp).

const LANGS: { code: string; label: string }[] = [
  { code: "en", label: "Tiếng Anh" }, { code: "zh", label: "Tiếng Trung" }, { code: "ja", label: "Tiếng Nhật" },
  { code: "ko", label: "Tiếng Hàn" }, { code: "th", label: "Tiếng Thái" }, { code: "fr", label: "Tiếng Pháp" },
  { code: "de", label: "Tiếng Đức" }, { code: "es", label: "Tiếng Tây Ban Nha" }, { code: "ru", label: "Tiếng Nga" },
  { code: "id", label: "Tiếng Indonesia" }, { code: "ms", label: "Tiếng Mã Lai" }, { code: "km", label: "Tiếng Khmer" }, { code: "lo", label: "Tiếng Lào" },
]
type Dir = "guest" | "staff"   // guest = khách nói (dịch sang Việt) · staff = mình nói (dịch sang tiếng khách)
interface Line { dir: Dir; src: string; out: string }
const WORKLET_URL = "/gp-pcm-capture.js"

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function TranslateSession({ onClose }: { onClose: () => void }) {
  const [lang, setLang] = useState("en")
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle")
  const [err, setErr] = useState("")
  const [dir, setDir] = useState<Dir>("guest")
  const [lines, setLines] = useState<Line[]>([])
  const dirRef = useRef<Dir>("guest")
  const sessionsRef = useRef<Record<Dir, any>>({ guest: null, staff: null })
  const inCtxRef = useRef<AudioContext | null>(null)
  const outCtxRef = useRef<AudioContext | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const nextTimeRef = useRef(0)
  const linesRef = useRef<Line[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  const push = (d: Dir, field: "src" | "out", text: string) => {
    const list = linesRef.current
    let last = list[list.length - 1]
    if (!last || last.dir !== d || (field === "src" && last.out)) { last = { dir: d, src: "", out: "" }; list.push(last) }
    last[field] += text
    linesRef.current = list
    setLines([...list])
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
  }

  const cleanup = useCallback(() => {
    for (const d of ["guest", "staff"] as Dir[]) { try { sessionsRef.current[d]?.close() } catch { /* đã đóng */ } }
    sessionsRef.current = { guest: null, staff: null }
    micRef.current?.getTracks().forEach(t => t.stop()); micRef.current = null
    inCtxRef.current?.close().catch(() => {}); inCtxRef.current = null
    outCtxRef.current?.close().catch(() => {}); outCtxRef.current = null
  }, [])

  const start = async () => {
    setErr(""); setStatus("connecting"); linesRef.current = []; setLines([])
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      micRef.current = mic
      const d = await fetch("/api/chat/translate/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang }) })
        .then(async r => ({ ok: r.ok, ...(await r.json()) }))
      if (!d.ok) throw new Error(d.error || "Không lấy được token phiên")
      const { GoogleGenAI } = await import("@google/genai")
      outCtxRef.current = new AudioContext({ sampleRate: 24000 })
      const open = async (who: Dir, tok: any) => {
        const ai = new GoogleGenAI({ apiKey: tok.token, httpOptions: { apiVersion: "v1alpha" } })
        sessionsRef.current[who] = await ai.live.connect({
          model: tok.model, config: tok.config,
          callbacks: {
            onmessage: (m: any) => {
              const sc = m.serverContent
              if (!sc) return
              if (sc.inputTranscription?.text) push(who, "src", sc.inputTranscription.text)
              if (sc.outputTranscription?.text) push(who, "out", sc.outputTranscription.text)
              for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data && String(p.inlineData.mimeType).startsWith("audio/pcm")) play(p.inlineData.data)
            },
            onerror: (e: any) => setErr(`Lỗi kết nối: ${e?.message || "không rõ"}`),
            onclose: () => { if (sessionsRef.current[who]) { setErr("Phiên dịch đã đóng."); setStatus("error"); cleanup() } },
          },
        })
      }
      await Promise.all([open("guest", d.toVi), open("staff", d.toGuest)])
      const inCtx = new AudioContext({ sampleRate: 16000 })
      inCtxRef.current = inCtx
      await inCtx.audioWorklet.addModule(WORKLET_URL)
      const node = new AudioWorkletNode(inCtx, "pcm-capture")
      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        sessionsRef.current[dirRef.current]?.sendRealtimeInput({ audio: { data: toBase64(e.data), mimeType: "audio/pcm;rate=16000" } })
      }
      inCtx.createMediaStreamSource(mic).connect(node)
      setStatus("live")
    } catch (e: any) {
      setErr(e?.name === "NotAllowedError" ? "Bạn chưa cho phép dùng micro." : e.message)
      setStatus("error"); cleanup()
    }
  }

  const end = () => {
    const s = sessionsRef.current
    sessionsRef.current = { guest: null, staff: null }   // đánh dấu tự đóng (onclose không báo lỗi)
    for (const d of ["guest", "staff"] as Dir[]) { try { s[d]?.close() } catch { /* */ } }
    cleanup(); setStatus("idle")
  }

  useEffect(() => { dirRef.current = dir }, [dir])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "auto" }) }, [lines])
  useEffect(() => () => cleanup(), [cleanup])

  const live = status === "live"
  const langLabel = LANGS.find(l => l.code === lang)?.label ?? lang
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget && !live) onClose() }}>
      <div className="w-full max-w-2xl h-[80vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Languages size={16} className="text-brand-600" />
            <span className="font-semibold text-sm text-gray-800 dark:text-slate-100">Dịch trực tiếp</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">thử nghiệm</span>
          </div>
          <button onClick={() => { if (live) end(); onClose() }} className="p-1 text-gray-400 hover:text-gray-700" title="Đóng"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
          {!live && lines.length === 0 && (
            <div className="text-gray-500 dark:text-slate-400 text-xs leading-relaxed space-y-2">
              <p>Phiên dịch nói chuyện với khách nước ngoài: khách nói → bạn nghe tiếng Việt; bạn nói → khách nghe tiếng của họ.</p>
              <p>Bấm <b>"Khách đang nói"</b> / <b>"Tôi đang nói"</b> để chọn ai nói — chỉ chiều đang chọn được dịch. Âm thanh gửi tới Google Gemini để dịch, không lưu lại.</p>
              <label className="flex items-center gap-2 pt-1">
                <span>Ngôn ngữ của khách:</span>
                <select value={lang} onChange={e => setLang(e.target.value)} className="px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-transparent text-sm">
                  {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </label>
            </div>
          )}
          {lines.map((l, i) => (
            <div key={i} className={`flex ${l.dir === "staff" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-xl ${l.dir === "staff" ? "bg-brand-600 text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-100"}`}>
                <div className="text-[10px] opacity-70 mb-0.5">{l.dir === "staff" ? "Bạn" : "Khách"}: {l.src}</div>
                <div>{l.out || "…"}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {err && <div className="px-4 pb-2 text-xs text-rose-500">{err}</div>}

        <div className="border-t border-gray-100 dark:border-slate-800 px-4 py-3 flex items-center gap-2">
          {!live ? (
            <button onClick={start} disabled={status === "connecting"}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm hover:bg-brand-500 disabled:opacity-50">
              {status === "connecting" ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
              {status === "connecting" ? "Đang kết nối..." : `Bắt đầu dịch (${langLabel})`}
            </button>
          ) : (
            <>
              <button onClick={() => setDir("guest")} aria-pressed={dir === "guest"}
                className={`flex-1 h-10 rounded-xl text-sm border ${dir === "guest" ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300"}`}>
                Khách đang nói → Tiếng Việt
              </button>
              <button onClick={() => setDir("staff")} aria-pressed={dir === "staff"}
                className={`flex-1 h-10 rounded-xl text-sm border ${dir === "staff" ? "bg-brand-600 border-brand-600 text-white" : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300"}`}>
                Tôi đang nói → {langLabel}
              </button>
              <button onClick={end} title="Kết thúc" className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-600 text-white hover:bg-rose-500">
                <PhoneOff size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
