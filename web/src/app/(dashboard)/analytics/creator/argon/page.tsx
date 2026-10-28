"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, CalendarClock, ChevronDown, Inbox, Loader2, Moon, RefreshCw, Sparkles, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit } from "./argon-types"
import { useArgonMember } from "./use-argon-member"
import { ArgonMarkdown } from "./argon-markdown"
import { sectionOf } from "@/lib/argon/context-pure"
import { parseProposals, type Certainty } from "@/lib/argon/proposal-cards"
import { FACT_TYPES, bucketFacts, daysUntil, keyDate, type FactRow } from "@/lib/argon/facts-pure"
import { ViecCanDuyetPanel } from "./viec-can-duyet/panel"
import { BoiCanhPanel } from "./boi-canh/panel"

// Hôm nay — màn hình buổi sáng, đọc từ trên xuống theo mức ưu tiên:
//  1) Cần anh quyết (việc cần duyệt, tối đa 5) → 2) Đề xuất của Argon (mỗi đề xuất một thẻ: việc, mức chắc chắn, ảnh hưởng tiền, nguồn) → cột phải: Sắp tới hạn, Tác động, Mâu thuẫn → Kế hoạch (thu gọn).
// Dữ liệu do Argon cập nhật mỗi đêm (hoặc bấm Cập nhật ngay). Hỏi thêm: tab Hỏi; xem tài liệu: tab Kho.
interface Snapshot {
  missionId: string; plan: { text: string; updatedAt: string | null }
  tacDong: { text: string; updatedAt: string | null; audit: { total: number; ok: number; issues: string[]; empty: boolean } }
  nightly: boolean; running: { runId: string; since: string } | null
}
const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "")
const todayLabel = () => new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
const CERT: Record<Certainty, string> = {
  chac: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  co_the: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  chua_du: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300",
}

/** Tiêu đề mục: biểu tượng + tên + số đếm — dùng chung để các khối có cùng nhịp. */
function SectionTitle({ icon: Icon, tone, title, count, right }: { icon: typeof Inbox; tone: string; title: string; count?: number; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg", tone)}><Icon size={15} /></span>
      <h2 className="text-[15px] font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
      {count != null && count > 0 && <span className="rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-[11.5px] font-medium tabular-nums text-gray-600 dark:text-slate-300">{count}</span>}
      {right && <div className="ml-auto text-[12px]">{right}</div>}
    </div>
  )
}

export default function ArgonTodayPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const member = useArgonMember()
  const [usage, setUsage] = useState<{ members: { username: string; name: string; runsToday: number; usdToday: number; runs7d: number; usd7d: number; lastAt: string | null }[]; limits: { runs: number; usd: number } } | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [facts, setFacts] = useState<{ rows: FactRow[]; today: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.argon_enabled === true ? "creator" : (d?.role ?? session?.user?.role ?? "staff"))).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])

  const load = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([api<Snapshot>("/api/creator/argon/context"), api<{ facts: FactRow[]; today: string }>("/api/creator/argon/facts").catch(() => null)])
      setSnap(s)
      if (f) setFacts({ rows: f.facts, today: f.today })
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { if (role === "creator") void load() }, [role, load])
  useEffect(() => { if (role === "creator" && !member) api<NonNullable<typeof usage>>("/api/creator/argon/usage").then(setUsage).catch(() => undefined) }, [role, member])   // chỉ Creator thấy mức dùng của người được cấp
  useEffect(() => { if (role === "creator" && window.location.hash === "#ke-hoach-box") (document.getElementById("ke-hoach-box") as HTMLDetailsElement | null)?.setAttribute("open", "") }, [role])
  useEffect(() => {   // đang cập nhật → hỏi lại mỗi 6 giây
    if (!snap?.running) return
    const t = setInterval(() => void load(), 6000)
    return () => clearInterval(t)
  }, [snap?.running, load])

  async function updateNow() {
    setBusy(true)
    try { await api("/api/creator/argon/context", jsonInit("POST", {})); await load() } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  async function toggleNightly() {
    if (!snap) return
    const next = !snap.nightly
    setSnap({ ...snap, nightly: next })
    try { setSnap(await api<Snapshot>("/api/creator/argon/context", jsonInit("PATCH", { nightly: next }))) } catch (e) { setErr((e as Error).message); setSnap({ ...snap, nightly: !next }) }
  }

  if (status === "loading" || !role) return <div className="p-6 text-sm text-gray-400">Đang tải…</div>
  if (role !== "creator") return null
  const running = !!snap?.running
  const proposalsMd = sectionOf(snap?.tacDong.text ?? "", "Đề xuất")
  const cards = proposalsMd ? parseProposals(proposalsMd) : null
  const impact = sectionOf(snap?.tacDong.text ?? "", "Tác động")
  const conflicts = sectionOf(snap?.tacDong.text ?? "", "Mâu thuẫn")
  const pending = facts ? facts.rows.filter(f => f.status === "active" && f.needs_review).slice(0, 8) : []
  const soon = facts ? bucketFacts(facts.rows.filter(f => !pending.includes(f)), facts.today).soon.slice(0, 8) : []
  const planEmpty = !!snap && snap.tacDong.text.includes("Chưa có kế hoạch")
  const audit = snap?.tacDong.audit

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-6 space-y-6">
      {/* Đầu trang: ngày, trạng thái cập nhật, hành động chính */}
      <header className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-[12px] uppercase tracking-wide text-gray-400 first-letter:uppercase">{todayLabel()}</p>
          <h1 className="ag-title text-[26px] font-bold tracking-tight leading-tight">Hôm nay</h1>
          <p className="text-[13px] text-gray-500 dark:text-slate-400">{snap?.tacDong.updatedAt ? `Argon cập nhật lúc ${fmtAt(snap.tacDong.updatedAt)}` : "Chưa có cập nhật nào"}</p>
        </div>
        <div className={cn("ml-auto flex flex-wrap items-center gap-3", member && "hidden")}>
          <label className="inline-flex items-center gap-2 text-[13px] text-gray-600 dark:text-slate-300 cursor-pointer" title="Mỗi đêm Argon tự đọc Kho, đối chiếu kế hoạch rồi viết bản tin sáng">
            <Moon size={14} className="text-violet-600" />
            <input type="checkbox" checked={!!snap?.nightly} disabled={!snap} onChange={() => void toggleNightly()} className="w-4 h-4 accent-violet-600" />Tự cập nhật mỗi đêm
          </label>
          <button type="button" onClick={() => void updateNow()} disabled={!snap || running || busy} className="ag-btn-primary">
            <RefreshCw size={13} className={cn(running && "animate-spin")} />{running ? "Đang cập nhật…" : "Cập nhật ngay"}
          </button>
        </div>
      </header>

      {/* Thông báo trạng thái: chỉ hiện khi có */}
      {(err || running || planEmpty) && (
        <div className="space-y-2">
          {err && <div className="text-sm rounded-xl bg-red-50 text-red-700 px-3.5 py-2.5 flex justify-between whitespace-pre-wrap"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">×</button></div>}
          {running && <div className="text-[13px] rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 px-3.5 py-2.5 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Argon đang đọc Kho và đối chiếu kế hoạch (từ {fmtAt(snap!.running!.since)}), thường mất vài phút. Xong sẽ nhắn Lark.</div>}
          {planEmpty && <div className="text-[13px] rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-3.5 py-2.5 flex items-center gap-2"><Target size={14} />Anh chưa viết kế hoạch và metric nên đề xuất chưa bám được trọng tâm. <a href="#ke-hoach-box" onClick={() => { const d = document.getElementById("ke-hoach-box") as HTMLDetailsElement | null; if (d) d.open = true }} className="underline font-medium">Viết kế hoạch</a></div>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        {/* Cột chính: cần quyết → đề xuất */}
        <div className="space-y-6 min-w-0">
          <section className="ag-card p-5 space-y-3" aria-label="Cần anh quyết">
            <ViecCanDuyetPanel embedded compact />
          </section>

          <section className="space-y-3" aria-labelledby="dx-title">
            <SectionTitle icon={Sparkles} tone="bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200" title="Đề xuất của Argon" count={cards?.length} />
            {audit && !audit.empty && audit.issues.length > 0 && (
              <div className="text-[12px] rounded-lg px-3 py-2 flex items-start gap-1.5 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>Kiểm nguồn: {audit.ok}/{audit.total} đề xuất đủ nhãn, ảnh hưởng, nguồn và mục kế hoạch. {audit.issues.join("; ")}.</span>
              </div>
            )}
            {cards ? (
              <ol className="space-y-3">
                {cards.map(c => (
                  <li key={c.n} className="ag-card p-4 flex gap-3.5">
                    <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[13px] font-semibold text-white tabular-nums">{c.n}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1">
                        <h3 className="text-[15px] font-semibold leading-snug text-gray-900 dark:text-slate-100 min-w-0 flex-1">{c.title}</h3>
                        {c.certainty && <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", CERT[c.certainty])}>{c.certaintyLabel}</span>}
                      </div>
                      {c.impact && <p className="rounded-lg bg-violet-50/70 dark:bg-violet-950/30 px-3 py-2 text-[13.5px] leading-snug text-gray-800 dark:text-slate-200"><span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Ảnh hưởng</span>{c.impact}</p>}
                      {c.why && <p className="text-[14px] leading-relaxed text-gray-700 dark:text-slate-300">{c.why}</p>}
                      {c.extra.map((t, i) => <p key={i} className="text-[13.5px] leading-relaxed text-gray-600 dark:text-slate-400">{t}</p>)}
                      {(c.plan || c.sources.length > 0) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11.5px] text-gray-500 dark:text-slate-400">
                          {c.plan && <span className="rounded-md bg-gray-100 dark:bg-slate-700 px-2 py-0.5">Kế hoạch: {c.plan}</span>}
                          {c.sources.map(s => <span key={s} className="rounded-md border border-gray-200 dark:border-slate-600 px-2 py-0.5">{s}</span>)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : proposalsMd ? (
              <div className="ag-card p-5"><ArgonMarkdown text={proposalsMd} /></div>
            ) : (
              <div className="ag-card p-6 text-center">
                <p className="text-sm text-gray-500 leading-relaxed">{snap ? "Chưa có đề xuất. Bấm “Cập nhật ngay” để Argon đọc Kho và số liệu rồi đề xuất tối đa 3 việc, mỗi việc có nguồn và mức chắc chắn." : "Đang tải…"}</p>
              </div>
            )}
          </section>
        </div>

        {/* Cột phải: thông tin để nắm, không cần quyết ngay */}
        <aside className="space-y-5 min-w-0" aria-label="Cần nắm">
          <section className="ag-card p-4 space-y-3" aria-labelledby="soon-title">
            <SectionTitle icon={CalendarClock} tone="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200" title="Sắp tới hạn" count={soon.length}
              right={<Link href="/analytics/creator/argon/kho-nguon" className="text-violet-700 dark:text-violet-300 hover:underline">Sổ sự việc</Link>} />
            {soon.length === 0 ? <p className="text-[13px] text-gray-500">Không có sự việc nào tới hạn trong 14 ngày.</p> : (
              <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                {soon.map(f => {
                  const d = keyDate(f), left = d && facts ? daysUntil(d, facts.today) : null
                  return (
                    <li key={f.id} className="py-2.5 first:pt-0 last:pb-0 flex gap-3">
                      <span className={cn("mt-0.5 inline-flex h-9 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-center leading-none", left != null && left <= 3 ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200")}>
                        <span className="text-[15px] font-semibold tabular-nums">{left === 0 ? "0" : left ?? "—"}</span><span className="text-[9.5px] uppercase tracking-wide">{left === 0 ? "hôm nay" : "ngày"}</span>
                      </span>
                      <span className="min-w-0 text-[13px] leading-snug text-gray-700 dark:text-slate-300">
                        <span className="block text-[11px] text-gray-400">{FACT_TYPES[f.type]}</span>
                        <b className="font-medium text-gray-900 dark:text-slate-100">{[f.vendor, f.subject].filter(Boolean).join(" · ")}</b>: {f.summary}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="ag-card p-4 space-y-3" aria-labelledby="imp-title">
            <SectionTitle icon={Target} tone="bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200" title="Tác động tới kế hoạch"
              right={<a href="#ke-hoach-box" onClick={() => { const d = document.getElementById("ke-hoach-box") as HTMLDetailsElement | null; if (d) d.open = true }} className="text-violet-700 dark:text-violet-300 hover:underline">Kế hoạch</a>} />
            {impact ? <div className="max-h-[420px] overflow-y-auto pr-1"><ArgonMarkdown text={impact} /></div> : <p className="text-[13px] text-gray-500">Chưa có.</p>}
          </section>

          {conflicts && (
            <section className="ag-card p-4 space-y-3 border-red-200 dark:border-red-900/60" aria-labelledby="cf-title">
              <SectionTitle icon={AlertTriangle} tone="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200" title="Mâu thuẫn" />
              <div className="max-h-[360px] overflow-y-auto pr-1"><ArgonMarkdown text={conflicts} /></div>
            </section>
          )}
        </aside>
      </div>

      {usage && usage.members.length > 0 && (
        <details className="ag-card p-4 group">
          <summary className="flex cursor-pointer select-none items-center gap-2 text-[13px] font-medium text-gray-700 dark:text-slate-300">
            <ChevronDown size={14} className="transition-transform group-open:rotate-180" />Người được cấp dùng Gấu Prime ({usage.members.length}) · hạn mức {usage.limits.runs} lượt / ${usage.limits.usd} mỗi ngày
          </summary>
          <ul className="mt-3 space-y-1 text-[13px] text-gray-700 dark:text-slate-300">
            {usage.members.map(u => (
              <li key={u.username}><b>{u.name}</b>: hôm nay {u.runsToday} lượt (${u.usdToday}) · 7 ngày {u.runs7d} lượt (${u.usd7d}) · {u.lastAt ? `dùng lần cuối ${fmtAt(u.lastAt)}` : "chưa dùng"}</li>
            ))}
          </ul>
        </details>
      )}

      <details id="ke-hoach-box" className="ag-card p-4 group">
        <summary className="flex cursor-pointer select-none items-center gap-2 text-[14px] font-semibold text-gray-900 dark:text-slate-100">
          <ChevronDown size={14} className="transition-transform group-open:rotate-180" />Kế hoạch và bối cảnh <span className="text-[12px] font-normal text-gray-500">anh viết kế hoạch, Argon đọc Kho rồi đối chiếu</span>
        </summary>
        <div className="pt-4"><BoiCanhPanel embedded /></div>
      </details>
    </div>
  )
}
