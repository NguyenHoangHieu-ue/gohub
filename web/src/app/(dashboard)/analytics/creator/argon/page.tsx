"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Mail, Moon, RefreshCw, Sparkles, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit } from "./argon-types"
import { ArgonMarkdown } from "./argon-markdown"
import { sectionOf } from "@/lib/argon/context-pure"
import { FACT_TYPES, bucketFacts, daysUntil, keyDate, type FactRow } from "@/lib/argon/facts-pure"
import { bucketThreads, isNewThread, waitingDays, type MailThreadRow, type MailThreadStatus } from "@/lib/argon/mail-status-pure"
import { KIND_LABEL, type InboxKind } from "@/lib/assistant/inbox-pure"

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
  const [mail, setMail] = useState<{ rows: MailThreadRow[]; now: number } | null>(null)
  const [inbox, setInbox] = useState<{ total: number; byKind: Record<InboxKind, number> } | null>(null)
  const [mailTab, setMailTab] = useState<"waitingMe" | "waitingPartner" | "done">("waitingMe")
  const [mailBusy, setMailBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => setRole(d?.role ?? session?.user?.role ?? "staff")).catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])
  useEffect(() => { if (role && role !== "creator") router.push("/chatbot") }, [role, router])

  const load = useCallback(async () => {
    try {
      const [s, f, m, ib] = await Promise.all([api<Snapshot>("/api/creator/argon/context"), api<{ facts: FactRow[]; today: string }>("/api/creator/argon/facts").catch(() => null), api<{ threads: MailThreadRow[]; now: number }>("/api/creator/argon/mail-status").catch(() => null), api<{ total: number; byKind: Record<InboxKind, number> }>("/api/creator/assistant/inbox?count=1").catch(() => null)])
      setSnap(s)
      if (f) setFacts({ rows: f.facts, today: f.today })
      if (m) setMail({ rows: m.threads, now: m.now })
      if (ib) setInbox(ib)
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
  const mailBuckets = mail ? bucketThreads(mail.rows) : null
  const setThread = async (id: string, status: MailThreadStatus) => {
    setMail(m => (m ? { ...m, rows: m.rows.map(r => (r.id === id ? { ...r, status, status_by: "manual" } : r)) } : m))   // cập nhật ngay, không chờ tải lại cả trang
    try { await api("/api/creator/argon/mail-status", jsonInit("PATCH", { id, status })) } catch (e) { setErr((e as Error).message); await load() }
  }
  const rescanMail = async () => { setMailBusy(true); try { await api("/api/creator/argon/mail-status", jsonInit("POST", {})); await load() } catch (e) { setErr((e as Error).message) } finally { setMailBusy(false) } }
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
          {inbox && inbox.total > 0 && (
            <section className={cn(card, "p-4 space-y-2")} aria-labelledby="inbox-title">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600" />
                <h2 id="inbox-title" className="font-semibold text-gray-900 dark:text-slate-100">Việc cần duyệt ({inbox.total})</h2>
                <Link href="/analytics/creator/argon/viec-can-duyet" className="ml-auto text-[12px] font-medium text-violet-700 dark:text-violet-300 hover:underline">Xem và duyệt →</Link>
              </div>
              <ul className="text-[13px] text-gray-700 dark:text-slate-300 space-y-0.5">
                {(Object.keys(KIND_LABEL) as InboxKind[]).filter(k => inbox.byKind[k] > 0).map(k => <li key={k}>• {inbox.byKind[k]} {KIND_LABEL[k].toLowerCase()}</li>)}
              </ul>
            </section>
          )}

          <section className={cn(card, "p-4 space-y-2")} aria-labelledby="mail-title">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-sky-600" />
              <h2 id="mail-title" className="font-semibold text-gray-900 dark:text-slate-100">Mail</h2>
              <button type="button" onClick={() => void rescanMail()} disabled={mailBusy} className="ml-auto inline-flex items-center gap-1 text-[12px] text-violet-700 dark:text-violet-300 hover:underline disabled:opacity-50">
                {mailBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}Quét lại
              </button>
            </div>
            {!mailBuckets || (!mail!.rows.length) ? <p className="text-sm text-gray-500">Chưa có luồng thư nào. Đêm nay Argon sẽ quét INBOX và SENT (chỉ đọc), hoặc bấm Quét lại.</p> : (<>
              <div className="flex gap-1.5 text-[12px]">
                {([["waitingMe", "Chờ mình"], ["waitingPartner", "Chờ đối tác"], ["done", "Xong"]] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setMailTab(k)} className={cn("px-2 py-1 rounded-lg border", mailTab === k ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30 font-medium" : "border-gray-200 dark:border-slate-700")}>{label} ({mailBuckets[k].length})</button>
                ))}
              </div>
              {mailBuckets[mailTab].length === 0 ? <p className="text-sm text-gray-500">Không có luồng nào.</p> : (
                <ul className="space-y-2.5">
                  {mailBuckets[mailTab].slice(0, 8).map(r => (
                    <li key={r.id} className="text-[13px] leading-snug">
                      <b>{r.subject || "(không tiêu đề)"}</b>
                      {isNewThread(r, mail!.now) && <span className="ml-1.5 text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">Mới</span>}
                      <span className="ml-1.5 text-[11.5px] text-gray-500">{r.counterparty.replace(/<[^>]*>/g, "").trim()} · {waitingDays(r, mail!.now)} ngày</span>
                      {(r.next_action || r.summary) && <div className="text-[12px] text-gray-600 dark:text-slate-300">{r.next_action ? `Việc: ${r.next_action}` : r.summary}</div>}
                      <div className="mt-0.5 flex gap-3 text-[12px]">
                        {r.status !== "done" && <button type="button" onClick={() => void setThread(r.id, "done")} className="font-medium text-emerald-700 hover:underline">Xong</button>}
                        {r.status === "waiting_me" && <button type="button" onClick={() => void setThread(r.id, "waiting_partner")} className="text-gray-500 hover:text-violet-700">Đã trả lời</button>}
                        {r.status === "done" && <button type="button" onClick={() => void setThread(r.id, "waiting_me")} className="text-gray-500 hover:text-violet-700">Mở lại</button>}
                        {r.status !== "done" && <button type="button" onClick={() => void setThread(r.id, "ignored")} className="text-gray-500 hover:text-red-600">Bỏ qua</button>}
                      </div>
                    </li>
                  ))}
                  {mailBuckets[mailTab].length > 8 && <li className="text-[12px] text-gray-400">… và {mailBuckets[mailTab].length - 8} luồng nữa</li>}
                </ul>
              )}
              {mailBuckets.ignored > 0 && <p className="text-[11.5px] text-gray-400">{mailBuckets.ignored} luồng thư tự động/đã bỏ qua không hiện.</p>}
            </>)}
          </section>

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
