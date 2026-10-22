"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, Check, Copy, FileAudio, Headphones, Loader2, MonitorUp, PhoneOff, Plus, Minus, RotateCcw, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit } from "../argon-types"
import { ArgonMarkdown } from "../argon-markdown"
import { highlightParts, shouldSuggest, type CallLine, type CallSummary, type SuggestResult } from "@/lib/argon/call-pure"
import { clearCallBackup, readCallBackup, useLiveCall } from "./use-live-call"

// Cuộc gọi: màn hình PHỤ khi anh gọi vendor (Meet, WhatsApp…) bằng tiếng Anh. Trái = phụ đề (Anh nhỏ, Việt to, số tô vàng để xác nhận lại); phải = gợi ý trả lời có căn cứ từ Kho;
// cuối buổi = tổng hợp, lưu vào Kho (Cuộc gọi/<vendor>) và ghi giá/hạn đối tác nêu vào sổ sự việc. Gợi ý chỉ để tham khảo, không tự nói thay anh.
interface Sug { lineId: number; utterance: string; loading: boolean; error?: string; result?: SuggestResult & { sources: string[] } }
interface Finished { markdown: string; summary: CallSummary; sourceId: string; folder: string; facts: number }
const fmtClock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` }

function Marked({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{highlightParts(text).map((p, i) => (p.num ? <mark key={i} className="rounded bg-amber-300/90 px-0.5 text-slate-900">{p.t}</mark> : <span key={i}>{p.t}</span>))}</span>
}

export default function CuocGoiPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [vendor, setVendor] = useState("")
  const [goal, setGoal] = useState("")
  const [vendors, setVendors] = useState<string[]>([])
  const [mic, setMic] = useState(true)
  const [prep, setPrep] = useState<string | null>(null)
  const [briefing, setBriefing] = useState("")
  const [briefInfo, setBriefInfo] = useState<{ facts: number; sources: string[] } | null>(null)
  const [sugs, setSugs] = useState<Sug[]>([])
  const [finished, setFinished] = useState<Finished | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [font, setFont] = useState(1)
  const [now, setNow] = useState(Date.now())
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [backup, setBackup] = useState<{ lines: CallLine[]; startedAt: number | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const briefingRef = useRef(""), vendorRef = useRef(""), goalRef = useRef("")
  const aborts = useRef<Map<number, AbortController>>(new Map())
  const endRef = useRef<HTMLDivElement>(null)
  briefingRef.current = briefing; vendorRef.current = vendor; goalRef.current = goal

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])
  useEffect(() => {
    if (role !== "creator") return
    setBackup(readCallBackup())
    api<{ facts: { vendor: string }[] }>("/api/creator/argon/facts").then(r => setVendors(Array.from(new Set(r.facts.map(f => f.vendor.trim()).filter(Boolean))).sort())).catch(() => { /* gợi ý vendor là phụ */ })
  }, [role])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const requestSuggestion = useCallback(async (line: CallLine, all: CallLine[]) => {
    if (!shouldSuggest(line)) return
    aborts.current.forEach(a => a.abort())   // chỉ cần gợi ý cho câu MỚI NHẤT
    const ac = new AbortController(); aborts.current.set(line.id, ac)
    setSugs(s => [{ lineId: line.id, utterance: line.en, loading: true }, ...s].slice(0, 12))
    try {
      const r = await fetch("/api/creator/argon/call/suggest", { ...jsonInit("POST", { briefing: briefingRef.current, vendor: vendorRef.current, goal: goalRef.current, utterance: line.en, lines: all.filter(l => l.id !== line.id).map(l => ({ who: l.who, en: l.en })) }), signal: ac.signal })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setSugs(s => s.map(x => (x.lineId === line.id ? { ...x, loading: false, result: j } : x)))
    } catch (e) {
      if ((e as Error).name === "AbortError") { setSugs(s => s.filter(x => x.lineId !== line.id)); return }
      setSugs(s => s.map(x => (x.lineId === line.id ? { ...x, loading: false, error: (e as Error).message } : x)))
    }
  }, [])

  const call = useLiveCall(requestSuggestion)
  const live = call.status === "live" || call.status === "reconnecting"
  const lineCount = call.lines.length, lastVi = call.lines[call.lines.length - 1]?.vi
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }) }, [lineCount, lastVi])

  async function begin(source: { kind: "share" } | { kind: "file"; file: File }) {
    setErr(null); setFinished(null); setSugs([]); clearCallBackup(); setBackup(null)
    setPrep("Đang nạp bối cảnh từ Kho…")
    try {
      const b = await api<{ briefing: string; sources: string[]; facts: number }>("/api/creator/argon/call/brief", jsonInit("POST", { vendor, goal }))
      setBriefing(b.briefing); setBriefInfo({ facts: b.facts, sources: b.sources })
    } catch (e) { setBriefing(""); setBriefInfo(null); setErr(`Chưa nạp được bối cảnh (vẫn dịch được): ${(e as Error).message}`) }
    setPrep(null)
    await call.start(source, { mic })
  }

  async function end(linesOverride?: CallLine[], startedOverride?: number | null) {
    aborts.current.forEach(a => a.abort())
    const lines = linesOverride ?? call.stop()
    const startedAt = startedOverride ?? call.startedAt ?? Date.now() - 60_000
    if (!lines.some(l => l.en.trim())) { call.reset(); return }
    setFinishing(true)
    try { setFinished(await api<Finished>("/api/creator/argon/call/finish", jsonInit("POST", { vendor, goal, briefing, lines, startedAt, endedAt: Date.now() }))) }
    catch (e) { setErr(`Chưa tổng hợp được: ${(e as Error).message}. Bản ghi vẫn còn trên màn hình, anh bấm "Tổng hợp lại".`) }
    setFinishing(false)
  }
  function copy(key: string, text: string) { void navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(c => (c === key ? null : c)), 1500) }) }

  const latest = sugs[0]
  const elapsed = call.startedAt ? fmtClock(now - call.startedAt) : "00:00"
  const sizeCls = useMemo(() => ["text-lg", "text-2xl", "text-3xl", "text-4xl"][font], [font])
  const enCls = useMemo(() => ["text-xs", "text-sm", "text-base", "text-lg"][font], [font])
  if (status === "loading" || !role) return <div className="p-6 text-sm text-gray-400">Đang tải…</div>
  if (role !== "creator") return null
  const dark = "bg-slate-950 text-slate-100"

  // ── Màn hình sau cuộc gọi ──
  if (finished || finishing) {
    return (
      <div className="max-w-[1000px] mx-auto px-4 py-5 space-y-4">
        {finishing && !finished ? <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Argon đang tổng hợp cuộc gọi và lưu vào Kho…</div> : finished && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Tổng hợp cuộc gọi</h1>
              <span className="text-xs text-gray-500">đã lưu vào Kho › {finished.folder}{finished.facts ? ` · ghi ${finished.facts} sự việc vào sổ` : ""}</span>
              <div className="ml-auto flex gap-2">
                <Link href="/analytics/creator/argon/kho-nguon" className="px-3 py-1.5 text-[13px] rounded-lg border border-gray-200 dark:border-slate-700">Mở Kho</Link>
                <button type="button" onClick={() => { setFinished(null); call.reset(); setBriefing(""); setBriefInfo(null) }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg bg-violet-600 text-white"><RotateCcw size={13} />Cuộc gọi mới</button>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-5"><ArgonMarkdown text={finished.markdown} /></div>
            {finished.summary.email && <button type="button" onClick={() => copy("email", finished.summary.email)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg border border-violet-300 text-violet-700 dark:text-violet-300">{copied === "email" ? <Check size={13} /> : <Copy size={13} />}Sao chép email nháp</button>}
          </>
        )}
      </div>
    )
  }

  // ── Thiết lập (chưa gọi) ──
  if (!live && call.status !== "connecting" && call.status !== "ended") {
    return (
      <div className="max-w-[900px] mx-auto px-4 py-5 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Cuộc gọi với đối tác</h1>
          <p className="text-[13px] text-gray-500">Mở trang này trên màn hình phụ: phụ đề dịch trực tiếp, gợi ý câu trả lời, tổng hợp cuối buổi. Âm thanh chỉ gửi Google Gemini để dịch, không lưu âm thanh, chỉ lưu chữ.</p>
        </div>
        {(err || call.err) && <div className="text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span className="whitespace-pre-wrap">{err || call.err}</span></div>}
        {backup && backup.lines.length > 0 && (
          <div className="text-sm rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 px-3 py-2 flex flex-wrap items-center gap-2">
            Còn một bản ghi cuộc gọi chưa tổng hợp ({backup.lines.length} dòng).
            <button type="button" onClick={() => void end(backup.lines.map(l => ({ ...l, final: true })), backup.startedAt)} className="underline font-medium">Tổng hợp bản ghi đó</button>
            <button type="button" onClick={() => { clearCallBackup(); setBackup(null) }} className="underline">Bỏ</button>
          </div>
        )}
        <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4 space-y-3">
          <label className="block text-[13px] font-medium text-gray-700 dark:text-slate-200">Đối tác / vendor
            <input value={vendor} onChange={e => setVendor(e.target.value)} list="call-vendors" placeholder="vd 3HK, Billion Connect, VNPT" className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-transparent" />
            <datalist id="call-vendors">{vendors.map(v => <option key={v} value={v} />)}</datalist>
          </label>
          <label className="block text-[13px] font-medium text-gray-700 dark:text-slate-200">Mục tiêu cuộc gọi (để Argon gợi ý đúng trọng tâm)
            <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2} placeholder="vd Chốt giá Thái Lan True Move xuống dưới 3.5 HKD/GB, hỏi MOQ và hiệu lực" className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-transparent" />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-slate-200"><input type="checkbox" checked={mic} onChange={e => setMic(e.target.checked)} className="accent-violet-600" />Chép cả lời của tôi qua micro (để gợi ý và tổng hợp đúng; nên đeo tai nghe để micro không thu lẫn tiếng đối tác)</label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => void begin({ kind: "share" })} disabled={!!prep} className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50">{prep ? <Loader2 size={15} className="animate-spin" /> : <MonitorUp size={15} />}{prep ?? "Chia sẻ âm thanh cuộc gọi và bắt đầu"}</button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!prep} className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-slate-600 disabled:opacity-50"><FileAudio size={15} />Thử bằng file âm thanh</button>
            <input ref={fileRef} type="file" accept="audio/*,video/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void begin({ kind: "file", file: f }) }} />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4 text-[13px] text-gray-600 dark:text-slate-300 space-y-2 leading-relaxed">
          <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-slate-100"><Headphones size={15} />Cách chia sẻ âm thanh (Chrome, Windows)</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><b>Google Meet / WhatsApp Web:</b> mở cuộc gọi ở một tab, bấm nút trên, chọn <b>Tab Chrome</b> → chọn tab cuộc gọi → tick <b>Chia sẻ âm thanh tab</b>.</li>
            <li><b>WhatsApp trên máy tính (app):</b> chọn <b>Toàn bộ màn hình</b> → tick <b>Chia sẻ âm thanh hệ thống</b>.</li>
            <li>Tiếng đối tác vẫn nghe ở loa/tai nghe như bình thường; trang này chỉ nghe lén bản sao để dịch.</li>
            <li>Số liệu (giá, dung lượng, hạn) được tô vàng. Số dễ nghe nhầm nên hỏi lại đối tác trước khi chốt.</li>
          </ul>
        </div>
      </div>
    )
  }

  // ── Đang gọi: màn hình phụ ──
  return (
    <div className={cn("mx-4 my-3 rounded-2xl overflow-hidden flex flex-col h-[calc(100vh-7.5rem)] min-h-[480px]", dark)}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900">
        <span className={cn("inline-flex items-center gap-1.5 text-[13px]", call.status === "reconnecting" ? "text-amber-400" : "text-emerald-400")}><span className={cn("w-2 h-2 rounded-full animate-pulse", call.status === "reconnecting" ? "bg-amber-400" : "bg-emerald-400")} />{call.status === "connecting" ? "Đang kết nối…" : call.status === "reconnecting" ? "Đang nối lại…" : "Đang nghe"}</span>
        <span className="font-mono text-sm text-slate-300">{elapsed}</span>
        <span className="text-sm text-slate-400 truncate">{vendor || "Đối tác"}{goal ? ` · ${goal}` : ""}</span>
        {briefInfo && <span className="text-[11.5px] text-slate-500" title={briefInfo.sources.join("\n")}>đã nạp {briefInfo.facts} sự việc + {briefInfo.sources.length} nguồn</span>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setFont(f => Math.max(0, f - 1))} className="p-1.5 rounded bg-slate-800 hover:bg-slate-700" aria-label="Giảm cỡ chữ"><Minus size={14} /></button>
          <button type="button" onClick={() => setFont(f => Math.min(3, f + 1))} className="p-1.5 rounded bg-slate-800 hover:bg-slate-700" aria-label="Tăng cỡ chữ"><Plus size={14} /></button>
          <button type="button" onClick={() => void end()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg bg-rose-600 hover:bg-rose-500 text-white"><PhoneOff size={14} />Kết thúc và tổng hợp</button>
        </div>
      </div>
      {(err || call.err) && <div className="px-4 py-1.5 text-[13px] bg-rose-950 text-rose-200">{err || call.err}</div>}

      <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="overflow-y-auto px-5 py-4 space-y-4 border-r border-slate-800" aria-label="Phụ đề">
          {call.lines.length === 0 && <p className="text-slate-500 text-sm">Đang chờ đối tác nói…</p>}
          {call.lines.map(l => l.who === "partner" ? (
            <div key={l.id} className="space-y-0.5">
              <div className={cn("text-slate-400 leading-snug", enCls)}><Marked text={l.en} /></div>
              <div className={cn("font-medium leading-snug", sizeCls, !l.final && "opacity-80")}>{l.vi ? <Marked text={l.vi} /> : <span className="text-slate-600">…</span>}</div>
            </div>
          ) : (
            <div key={l.id} className="flex justify-end"><div className={cn("max-w-[80%] rounded-xl bg-indigo-950/60 border border-indigo-900 px-3 py-1.5 text-indigo-200", enCls)}><span className="text-[10px] uppercase tracking-wide text-indigo-400 mr-1.5">Anh</span>{l.en}</div></div>
          ))}
          <div ref={endRef} />
        </section>

        <aside className="overflow-y-auto px-5 py-4 space-y-4 bg-slate-900/60" aria-label="Gợi ý trả lời">
          <div className="flex items-center gap-2 text-[12px] uppercase tracking-wide text-emerald-400"><Sparkles size={14} />Gợi ý trả lời</div>
          {!latest && <p className="text-slate-500 text-sm">Khi đối tác nói xong một ý, Argon gợi ý câu trả lời ở đây (dựa trên Kho, sổ sự việc và kế hoạch của anh).</p>}
          {latest && (
            <div className="space-y-3">
              <div className="text-[12px] text-slate-500">Đối tác: “{latest.utterance.slice(0, 140)}{latest.utterance.length > 140 ? "…" : ""}”</div>
              {latest.loading && <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" />Đang nghĩ câu trả lời…</div>}
              {latest.error && <div className="text-sm text-rose-300">Chưa gợi ý được: {latest.error}</div>}
              {latest.result?.suggestions.map((s, i) => (
                <div key={i} className="rounded-xl border border-emerald-700/60 bg-emerald-950/40 p-3 space-y-1.5">
                  <div className={cn("font-medium text-emerald-100 leading-snug", ["text-base", "text-lg", "text-xl", "text-2xl"][font])}>{s.en}</div>
                  <div className="text-sm text-slate-300">{s.vi}</div>
                  {s.basis.length > 0 && <div className="flex flex-wrap gap-1">{s.basis.map(b => <span key={b} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{b}</span>)}</div>}
                  <button type="button" onClick={() => copy(`s${i}`, s.en)} className="inline-flex items-center gap-1 text-[11.5px] text-emerald-300 hover:text-emerald-200">{copied === `s${i}` ? <Check size={12} /> : <Copy size={12} />}Sao chép</button>
                </div>
              ))}
              {!!latest.result?.confirm.length && <div className="rounded-lg bg-amber-950/50 border border-amber-800/60 px-3 py-2 text-[13px] text-amber-200"><b>Nên hỏi lại cho chắc:</b> {latest.result.confirm.join(" · ")}</div>}
              {!!latest.result?.ask.length && <div className="text-[13px] text-slate-300"><b className="text-slate-400">Có thể hỏi tiếp:</b><ul className="list-disc pl-5 mt-0.5">{latest.result.ask.map(a => <li key={a}>{a}</li>)}</ul></div>}
            </div>
          )}
          {sugs.length > 1 && (
            <details className="text-[13px] text-slate-400">
              <summary className="cursor-pointer select-none">Gợi ý trước đó ({sugs.length - 1})</summary>
              <div className="mt-2 space-y-2">{sugs.slice(1).map(s => <div key={s.lineId} className="rounded-lg bg-slate-800/60 p-2"><div className="text-[11.5px] text-slate-500">“{s.utterance.slice(0, 100)}”</div>{s.result?.suggestions.map((x, i) => <div key={i} className="text-slate-200">{x.en}</div>)}</div>)}</div>
            </details>
          )}
        </aside>
      </div>
    </div>
  )
}
