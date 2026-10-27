"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, Inbox, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { bucketThreads, waitingDays, type MailThreadRow, type MailThreadStatus } from "@/lib/argon/mail-status-pure"
import { KIND_LABEL, type InboxItem, type InboxKind } from "@/lib/assistant/inbox-pure"
import { api, jsonInit } from "../argon-types"
import { useArgonAccess } from "../use-argon-member"

// Việc cần duyệt: MỘT danh sách mọi thứ đang chờ anh — hành động Gấu Pro, đề xuất sửa code + câu hỏi của Argon, thay đổi sự việc, mail chờ trả lời, phiếu sửa code hỏi lại.
// Mỗi nút gọi thẳng endpoint có sẵn của từng loại (không có logic duyệt riêng ở đây).
interface Inbox { items: InboxItem[]; byKind: Record<InboxKind, number>; failed: string[]; now: number }
const URG = { 3: "bg-red-500", 2: "bg-amber-500", 1: "bg-gray-300 dark:bg-slate-600" } as const
const ago = (at: string, now: number) => { const h = Math.max(0, Math.round((now - Date.parse(at)) / 3_600_000)); return h < 1 ? "vừa xong" : h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước` }
const btn = "px-2.5 py-1 text-[12px] rounded-lg border"
interface SkillVer { v: number; state: "candidate" | "approved" | "rejected" | "retired"; description: string; created_at: string; lint: { level: string } }
interface SkillRow { name: string; active: number | null; versions: SkillVer[] }
const STATE_VN = { candidate: "chờ duyệt", approved: "đang dùng", rejected: "đã từ chối", retired: "bản cũ" } as const

export function ViecCanDuyetPanel({ embedded = false, compact = false }: { embedded?: boolean; compact?: boolean }) {   // compact: gọn cho trang Hôm nay — tối đa 5 việc, không lọc loại, không mail chờ/kỹ năng
  const { data: session, status } = useSession()
  const router = useRouter()
  const access = useArgonAccess()
  const sessionRole = (session?.user as { role?: string } | undefined)?.role
  const role = access.enabled ? "creator" : access.loading ? undefined : sessionRole
  const member = access.member
  const [data, setData] = useState<Inbox | null>(null)
  const [kind, setKind] = useState<InboxKind | "all">("all")
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [mail, setMail] = useState<{ rows: MailThreadRow[]; now: number } | null>(null)
  const [mailBusy, setMailBusy] = useState(false)

  useEffect(() => { if (status === "authenticated" && role && role !== "creator") router.push("/chatbot") }, [status, role, router])
  const load = useCallback(async () => { try { setData(await api<Inbox>("/api/creator/assistant/inbox")); setErr(null) } catch (e) { setErr((e as Error).message) } }, [])
  const loadSkills = useCallback(async () => { try { setSkills((await api<{ skills: SkillRow[] }>("/api/creator/assistant/skills")).skills.filter(s => s.versions.some(v => v.state === "approved" || v.state === "retired"))) } catch { /* mục phụ: lỗi không chặn danh sách chính */ } }, [])
  const loadMail = useCallback(async () => { try { const m = await api<{ threads: MailThreadRow[]; now: number }>("/api/creator/argon/mail-status"); setMail({ rows: m.threads, now: m.now }) } catch { /* mục phụ */ } }, [])
  useEffect(() => { if (role === "creator") { void load(); if (!compact) { void loadSkills(); void loadMail() } } }, [role, load, loadSkills, loadMail, compact])
  async function setThread(id: string, st: MailThreadStatus) {
    setMail(m => (m ? { ...m, rows: m.rows.map(r => (r.id === id ? { ...r, status: st, status_by: "manual" } : r)) } : m))
    try { await api("/api/creator/argon/mail-status", jsonInit("PATCH", { id, status: st })) } catch (e) { setErr((e as Error).message); await loadMail() }
  }
  async function rescanMail() {
    setMailBusy(true)
    try { await api("/api/creator/argon/mail-status", jsonInit("POST", {})); await Promise.all([loadMail(), load()]) } catch (e) { setErr((e as Error).message) } finally { setMailBusy(false) }
  }
  async function skillAct(name: string, v: number, action: "rollback" | "retire") {
    setBusy(`skill:${name}:${v}`); setNote(null)
    try { await api("/api/creator/assistant/skills", jsonInit("POST", { name, v, action })); setNote(action === "rollback" ? `Đã quay lại phiên bản ${v} của "${name}".` : `Đã gỡ "${name}" khỏi prompt.`); await loadSkills() } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  async function act(it: InboxItem, action: "approve" | "reject" | "confirm" | "done" | "eval" | "gate") {
    setBusy(`${it.key}:${action}`); setNote(null)
    try {
      if (it.kind === "gp_action") {
        const r = await api<{ ok?: boolean; error?: string }>("/api/creator-ai/approve", jsonInit("POST", { id: it.id, approve: action === "approve" }))
        if (r.error) throw new Error(r.error)
        setNote(action === "approve" ? "Đã duyệt — hành động đã chạy." : "Đã từ chối.")
      } else if (it.kind === "argon_patch") {
        await api(`/api/creator/argon/missions/${it.missionId}/patches`, jsonInit("POST", { action, id: it.id }))
        setNote(action === "approve" ? "Đã duyệt — phiếu sửa code đã tạo, PR sẽ vào staging." : "Đã từ chối đề xuất.")
      } else if (it.kind === "fact_review") {
        await api("/api/creator/argon/facts", jsonInit("PATCH", action === "confirm" ? { id: it.id, confirm: true } : { id: it.id, status: "rejected" }))
        setNote(action === "confirm" ? "Đã xác nhận thay đổi." : "Đã bỏ thay đổi, giữ tin cũ.")
      } else if (it.kind === "skill_candidate" && action === "gate") {
        const [name, v] = it.id.split("@")
        await api("/api/creator/assistant/skills", jsonInit("POST", { name, v: Number(v), action: "gate" }))
        setNote("Đã chạy eval cổng — kết quả hiện trên thẻ.")
        void load(); return
      } else if (it.kind === "skill_candidate" && action === "eval") {
        const [name, v] = it.id.split("@")
        await api("/api/creator/assistant/skills", jsonInit("POST", { name, v: Number(v), action: "eval" }))
        setNote("Đã chấm A/B — kết quả hiện trên thẻ.")
        void load(); return
      } else if (it.kind === "skill_candidate") {
        const [name, v] = it.id.split("@")
        await api("/api/creator/assistant/skills", jsonInit("POST", { name, v: Number(v), action: action === "approve" ? "approve" : "reject" }))
        setNote(action === "approve" ? "Đã duyệt — skill bắt đầu dùng được từ lượt chat sau của Gấu Pro." : "Đã từ chối skill.")
      } else if (it.kind === "security_notice") {
        await api("/api/creator/assistant/alerts", jsonInit("POST", { id: it.id, action: "dismiss-security" }))
        setNote("Đã ghi nhận — cảnh báo được xoá khỏi danh sách.")
      } else if (it.kind === "kpi_alert") {
        await api("/api/creator/assistant/alerts", jsonInit("POST", { id: it.id, action: "dismiss" }))
        setNote("Đã bỏ qua cảnh báo này 7 ngày (nếu lệch nặng hơn sẽ báo lại).")
      } else if (it.kind === "memory_proposal") {
        const r = await api<{ message?: string }>("/api/creator/assistant/memory-proposals", jsonInit("POST", { id: it.id, action: action === "approve" ? "approve" : "reject" }))
        setNote(r.message ?? (action === "approve" ? "Đã lưu vào trí nhớ." : "Đã bỏ đề xuất."))
      } else if (it.kind === "mail") {
        await api("/api/creator/argon/mail-status", jsonInit("PATCH", { id: it.id, status: "done" }))
      }
      setData(d => (d ? { ...d, items: d.items.filter(x => x.key !== it.key) } : d))
      void load()
      if (it.kind === "skill_candidate") void loadSkills()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  if (role !== "creator") return null
  const allItems = (data?.items ?? []).filter(i => kind === "all" || i.kind === kind)
  const items = compact ? allItems.slice(0, 5) : allItems
  const partner = mail ? bucketThreads(mail.rows).waitingPartner : []
  const mailNow = mail?.now ?? Date.now()
  const counts = (k: InboxKind) => (data?.items ?? []).filter(i => i.kind === k).length

  return (
    <div id="viec-can-duyet" className={embedded ? "space-y-4" : "max-w-[1100px] mx-auto px-4 py-5 space-y-4"}>
      <div className="flex items-center gap-2">
        <Inbox size={20} className="text-violet-600" />
        <h2 className={embedded ? "font-semibold text-gray-900 dark:text-slate-100" : "text-xl font-bold text-gray-900 dark:text-slate-100"}>Việc cần duyệt</h2>
        {data && <span className="text-sm text-gray-500">{data.items.length} việc đang chờ anh</span>}
        {compact && (data?.items.length ?? 0) > 5 && <Link href="/analytics/creator/argon/viec-can-duyet" className="ml-auto text-[12px] font-medium text-violet-700 dark:text-violet-300 hover:underline">Xem tất cả {data?.items.length} →</Link>}
        <button type="button" onClick={() => void load()} className={cn("text-[12px] text-violet-700 dark:text-violet-300 hover:underline", !(compact && (data?.items.length ?? 0) > 5) && "ml-auto")}>Làm mới</button>
      </div>
      {err && <div className="p-2.5 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200">{err}</div>}
      {note && <div className="p-2.5 rounded-xl text-sm bg-emerald-50 text-emerald-800 border border-emerald-200">{note}</div>}
      {data?.failed.length ? <div className="p-2.5 rounded-xl text-[12.5px] bg-amber-50 text-amber-800 border border-amber-200 flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>Không đọc được một số nguồn việc: {data.failed.join(" · ")}</span></div> : null}

      <div className={cn("flex flex-wrap gap-1.5 text-[12px]", compact && "hidden")}>
        <button type="button" onClick={() => setKind("all")} className={cn(btn, kind === "all" ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30 font-medium" : "border-gray-200 dark:border-slate-700")}>Tất cả ({data?.items.length ?? 0})</button>
        {(Object.keys(KIND_LABEL) as InboxKind[]).filter(k => counts(k) > 0).map(k => (
          <button key={k} type="button" onClick={() => setKind(k)} className={cn(btn, kind === k ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30 font-medium" : "border-gray-200 dark:border-slate-700")}>{KIND_LABEL[k]} ({counts(k)})</button>
        ))}
      </div>

      {!data ? <div className="py-10 text-center text-sm text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Đang tải…</div>
        : items.length === 0 ? <div className="py-12 text-center text-sm text-gray-500"><CheckCircle2 size={22} className="mx-auto mb-2 text-emerald-500" />Không có việc nào đang chờ anh.</div>
        : (
          <ul className="space-y-2.5">
            {items.map(it => (
              <li key={it.key} className="ag-card ag-card-flat ag-rise p-3.5 flex gap-3">
                <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", URG[it.urgency])} title={it.urgency === 3 ? "Cần quyết sớm" : it.urgency === 2 ? "Nên xem hôm nay" : "Bình thường"} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-gray-500">
                    <span className="font-medium text-gray-700 dark:text-slate-300">{KIND_LABEL[it.kind]}</span><span>· {it.source}</span><span>· {ago(it.at, data.now)}</span>
                  </div>
                  <div className="text-[14px] font-medium text-gray-900 dark:text-slate-100 break-words">{it.title}</div>
                  {it.detail && <div className="text-[12.5px] leading-snug text-gray-600 dark:text-slate-300 break-words whitespace-pre-line">{it.detail}</div>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {it.actions.includes("approve") && <button type="button" disabled={!!busy} onClick={() => void act(it, "approve")} className={cn(btn, "bg-emerald-600 text-white border-emerald-600 disabled:opacity-50")}>{busy === `${it.key}:approve` ? "Đang chạy…" : "Duyệt"}</button>}
                    {it.actions.includes("confirm") && <button type="button" disabled={!!busy} onClick={() => void act(it, "confirm")} className={cn(btn, "bg-emerald-600 text-white border-emerald-600 disabled:opacity-50")}>Đúng, xác nhận</button>}
                    {it.actions.includes("done") && <button type="button" disabled={!!busy} onClick={() => void act(it, "done")} className={cn(btn, "bg-emerald-600 text-white border-emerald-600 disabled:opacity-50")}>Xong</button>}
                    {it.actions.includes("eval") && <button type="button" disabled={!!busy} onClick={() => void act(it, "eval")} className={cn(btn, "border-gray-300 dark:border-slate-600 disabled:opacity-50")}>{busy === `${it.key}:eval` ? "Đang chấm…" : "Chấm thử A/B"}</button>}
                    {it.actions.includes("gate") && <button type="button" disabled={!!busy} onClick={() => void act(it, "gate")} className={cn(btn, "border-gray-300 dark:border-slate-600 disabled:opacity-50")} title="Chạy 4 câu eval của Argon có/không có kỹ năng (~3 phút)">{busy === `${it.key}:gate` ? "Đang chạy eval (~3 phút)…" : "Chạy eval cổng"}</button>}
                    {it.actions.includes("reject") && <button type="button" disabled={!!busy} onClick={() => void act(it, "reject")} className={cn(btn, "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 disabled:opacity-50")}>{it.kind === "fact_review" ? "Sai, giữ tin cũ" : it.kind === "kpi_alert" ? "Bỏ qua 7 ngày" : it.kind === "security_notice" ? "Đã xem" : "Từ chối"}</button>}
                    {it.href && <Link href={it.href} className={cn(btn, "border-gray-300 dark:border-slate-600 text-violet-700 dark:text-violet-300")}>{it.kind === "kpi_alert" ? "Phân tích nguyên nhân" : it.actions.includes("open") ? "Mở để trả lời" : "Xem chi tiết"}</Link>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

      <section className={cn("pt-4 space-y-2", compact && "hidden")} aria-label="Mail chờ đối tác">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Mail anh đã gửi, đang chờ đối tác ({partner.length})</h2>
          <button type="button" onClick={() => void rescanMail()} disabled={mailBusy} className={cn("ml-auto inline-flex items-center gap-1 text-[12px] text-violet-700 dark:text-violet-300 hover:underline disabled:opacity-50", member && "hidden")}>
            {mailBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}Quét lại mail
          </button>
        </div>
        {partner.length === 0 ? <p className="text-[12.5px] text-gray-500">Không có luồng nào đang chờ. Đêm nay Argon quét INBOX và SENT (chỉ đọc), hoặc bấm Quét lại mail.</p> : (
          <ul className="space-y-2">
            {partner.slice(0, 8).map(r => (
              <li key={r.id} className="text-[13px] leading-snug rounded-xl border border-gray-200 dark:border-slate-700 p-2.5">
                <b>{r.subject || "(không tiêu đề)"}</b>
                <span className="ml-1.5 text-[11.5px] text-gray-500">{r.counterparty.replace(/<[^>]*>/g, "").trim()} · {waitingDays(r, mailNow)} ngày</span>
                {(r.next_action || r.summary) && <div className="text-[12px] text-gray-600 dark:text-slate-300">{r.next_action ? `Việc: ${r.next_action}` : r.summary}</div>}
                <div className="mt-0.5 flex gap-3 text-[12px]">
                  <button type="button" onClick={() => void setThread(r.id, "done")} className="font-medium text-emerald-700 hover:underline">Xong</button>
                  <button type="button" onClick={() => void setThread(r.id, "ignored")} className="text-gray-500 hover:text-red-600">Bỏ qua</button>
                </div>
              </li>
            ))}
            {partner.length > 8 && <li className="text-[12px] text-gray-400">… và {partner.length - 8} luồng nữa</li>}
          </ul>
        )}
      </section>

      {!compact && skills.length > 0 && (
        <section className="pt-4 space-y-2" aria-label="Kỹ năng đã học">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Kỹ năng Gấu Pro đã học ({skills.length})</h2>
          {skills.map(s => (
            <div key={s.name} className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-[13px]"><b>{s.name}</b><span className="text-gray-500">{s.active != null ? `đang dùng v${s.active}` : "đang tắt"}</span>
                {s.active != null && <button type="button" disabled={!!busy} onClick={() => void skillAct(s.name, s.active!, "retire")} className="ml-auto text-[12px] text-gray-500 hover:text-red-600">Gỡ khỏi prompt</button>}</div>
              <div className="flex flex-wrap gap-1.5">
                {s.versions.filter(v => v.state === "approved" || v.state === "retired").map(v => (
                  <span key={v.v} className="inline-flex items-center gap-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-slate-700 px-2 py-1" title={v.description}>
                    v{v.v} · {STATE_VN[v.state]}{v.created_at ? ` · ${new Date(v.created_at).toLocaleDateString("vi-VN")}` : ""}
                    {v.v !== s.active && <button type="button" disabled={!!busy} onClick={() => void skillAct(s.name, v.v, "rollback")} className="text-violet-700 dark:text-violet-300 hover:underline">Dùng bản này</button>}
                  </span>))}
              </div>
            </div>))}
        </section>
      )}
    </div>
  )
}
