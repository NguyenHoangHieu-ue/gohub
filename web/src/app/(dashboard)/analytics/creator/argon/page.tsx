"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Moon, RefreshCw, Sparkles, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit } from "./argon-types"
import { ArgonMarkdown } from "./argon-markdown"
import { sectionOf } from "@/lib/argon/context-pure"
import { FACT_TYPES, bucketFacts, daysUntil, keyDate, type FactRow } from "@/lib/argon/facts-pure"

// Hôm nay: một màn hình gọn cho việc anh cần biết sáng nay — đề xuất (có nguồn, có mức chắc chắn), tin ảnh hưởng tới kế hoạch, sự việc sắp tới hạn.
// Dữ liệu do Argon cập nhật mỗi đêm (hoặc bấm Cập nhật ngay). Hỏi thêm / đào sâu: tab Trợ lý; xem tài liệu: tab Kho.
interface Snapshot {
  missionId: string; plan: { text: string; updatedAt: string | null }
  tacDong: { text: string; updatedAt: string | null; audit: { total: number; ok: number; issues: string[]; empty: boolean } }
  nightly: boolean; running: { runId: string; since: string } | null
}
const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "")
const card = "rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm"

export default function ArgonTodayPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [facts, setFacts] = useState<{ rows: FactRow[]; today: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
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
  const proposals = sectionOf(snap?.tacDong.text ?? "", "Đề xuất")
  const impact = sectionOf(snap?.tacDong.text ?? "", "Tác động")
  const conflicts = sectionOf(snap?.tacDong.text ?? "", "Mâu thuẫn")
  const pending = facts ? facts.rows.filter(f => f.status === "active" && f.needs_review).slice(0, 8) : []
  const soon = facts ? bucketFacts(facts.rows.filter(f => !pending.includes(f)), facts.today).soon.slice(0, 8) : []
  const settle = async (id: string, body: Record<string, unknown>) => { try { await api("/api/creator/argon/facts", jsonInit("PATCH", { id, ...body })); await load() } catch (e) { setErr((e as Error).message) } }
  const planEmpty = !!snap && snap.tacDong.text.includes("Chưa có kế hoạch")
  const audit = snap?.tacDong.audit

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-5 space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-slate-100 leading-tight">Hôm nay</h1>
          <p className="text-[13px] text-gray-500">{snap?.tacDong.updatedAt ? `Argon cập nhật lúc ${fmtAt(snap.tacDong.updatedAt)}` : "Chưa có cập nhật nào"}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-[13px] text-gray-600 dark:text-slate-300 cursor-pointer">
            <Moon size={14} className="text-violet-600" />
            <input type="checkbox" checked={!!snap?.nightly} disabled={!snap} onChange={() => void toggleNightly()} className="w-4 h-4 accent-violet-600" />Tự cập nhật mỗi đêm
          </label>
          <button type="button" onClick={() => void updateNow()} disabled={!snap || running || busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50">
            <RefreshCw size={13} className={cn(running && "animate-spin")} />{running ? "Đang cập nhật…" : "Cập nhật ngay"}
          </button>
        </div>
      </header>
      {err && <div className="text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 flex justify-between whitespace-pre-wrap"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">×</button></div>}
      {running && <div className="text-[13px] rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 px-3 py-2 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Argon đang đọc Kho và đối chiếu kế hoạch (từ {fmtAt(snap!.running!.since)}), thường mất vài phút. Xong sẽ nhắn Lark.</div>}
      {planEmpty && <div className="text-[13px] rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-3 py-2 flex items-center gap-2"><Target size={14} />Anh chưa viết kế hoạch và metric nên đề xuất chưa bám được trọng tâm. <Link href="/analytics/creator/argon/boi-canh" className="underline font-medium">Viết kế hoạch</Link></div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        <section className={cn(card, "p-4 space-y-3")} aria-labelledby="dx-title">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={16} className="text-violet-600" />
            <h2 id="dx-title" className="font-semibold text-gray-900 dark:text-slate-100">Đề xuất hôm nay</h2>
          </div>
          {audit && !audit.empty && (
            <div className={cn("text-[12px] rounded-lg px-2.5 py-1.5 flex items-start gap-1.5", audit.issues.length ? "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200")}>
              {audit.issues.length ? <AlertTriangle size={13} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={13} className="mt-0.5 shrink-0" />}
              <span>Kiểm nguồn: {audit.ok}/{audit.total} đề xuất đủ nhãn chắc chắn, mức ảnh hưởng, nguồn và mục kế hoạch liên quan.{audit.issues.length ? ` ${audit.issues.join("; ")}.` : ""}</span>
            </div>
          )}
          {proposals ? <ArgonMarkdown text={proposals} />
            : <p className="text-sm text-gray-500 leading-relaxed">{snap ? "Chưa có đề xuất. Bấm Cập nhật ngay để Argon đọc Kho và số liệu rồi đề xuất tối đa 3 việc, mỗi việc có nguồn và mức chắc chắn." : "Đang tải…"}</p>}
        </section>

        <div className="space-y-4 min-w-0">
          {pending.length > 0 && (
            <section className={cn(card, "p-4 space-y-2")} aria-labelledby="chg-title">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600" />
                <h2 id="chg-title" className="font-semibold text-gray-900 dark:text-slate-100">Thay đổi chờ anh xác nhận</h2>
                <Link href="/analytics/creator/argon/kho-nguon" className="ml-auto text-[12px] text-violet-700 dark:text-violet-300 hover:underline">Sổ sự việc</Link>
              </div>
              <ul className="space-y-2.5">
                {pending.map(f => (
                  <li key={f.id} className="text-[13px] leading-snug">
                    <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 mr-1.5">{FACT_TYPES[f.type]}</span>
                    <b>{[f.vendor, f.subject].filter(Boolean).join(" · ")}</b>: {f.summary}
                    {f.change_note && <div className="text-[12px] text-amber-700 dark:text-amber-300 mt-0.5">Đổi so với tin cũ: {f.change_note}</div>}
                    <div className="mt-1 flex gap-3 text-[12px]">
                      <button type="button" onClick={() => void settle(f.id, { confirm: true })} className="font-medium text-emerald-700 hover:underline">Đúng, xác nhận</button>
                      <button type="button" onClick={() => void settle(f.id, { status: "rejected" })} className="text-gray-500 hover:text-red-600">Sai, giữ tin cũ</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={cn(card, "p-4 space-y-2")} aria-labelledby="soon-title">
            <div className="flex items-center gap-2">
              <CalendarClock size={16} className="text-amber-600" />
              <h2 id="soon-title" className="font-semibold text-gray-900 dark:text-slate-100">Sắp tới hạn</h2>
              <Link href="/analytics/creator/argon/kho-nguon" className="ml-auto text-[12px] text-violet-700 dark:text-violet-300 hover:underline">Sổ sự việc</Link>
            </div>
            {soon.length === 0 ? <p className="text-sm text-gray-500">Không có sự việc nào tới hạn trong 14 ngày.</p> : (
              <ul className="space-y-2">
                {soon.map(f => {
                  const d = keyDate(f), left = d && facts ? daysUntil(d, facts.today) : null
                  return (
                    <li key={f.id} className="text-[13px] leading-snug">
                      <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 mr-1.5">{FACT_TYPES[f.type]}</span>
                      <b>{[f.vendor, f.subject].filter(Boolean).join(" · ")}</b>: {f.summary}
                      {left != null && <span className={cn("ml-1 text-[11.5px] font-medium", left <= 3 ? "text-red-600" : "text-amber-600")}>{left === 0 ? "hôm nay" : `còn ${left} ngày`}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className={cn(card, "p-4 space-y-2")} aria-labelledby="imp-title">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-violet-600" />
              <h2 id="imp-title" className="font-semibold text-gray-900 dark:text-slate-100">Tác động tới kế hoạch</h2>
              <Link href="/analytics/creator/argon/boi-canh" className="ml-auto text-[12px] text-violet-700 dark:text-violet-300 hover:underline">Bối cảnh</Link>
            </div>
            {impact ? <ArgonMarkdown text={impact} /> : <p className="text-sm text-gray-500">Chưa có.</p>}
          </section>

          {conflicts && (
            <section className={cn(card, "p-4 space-y-2")} aria-labelledby="cf-title">
              <div className="flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" /><h2 id="cf-title" className="font-semibold text-gray-900 dark:text-slate-100">Mâu thuẫn và mức ảnh hưởng</h2></div>
              <ArgonMarkdown text={conflicts} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
