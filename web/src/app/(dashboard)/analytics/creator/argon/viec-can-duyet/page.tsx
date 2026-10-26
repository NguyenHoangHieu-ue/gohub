"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, Inbox, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { KIND_LABEL, type InboxItem, type InboxKind } from "@/lib/assistant/inbox-pure"
import { api, jsonInit } from "../argon-types"

// Việc cần duyệt: MỘT danh sách mọi thứ đang chờ anh — hành động Gấu Pro, đề xuất sửa code + câu hỏi của Argon, thay đổi sự việc, mail chờ trả lời, phiếu sửa code hỏi lại.
// Mỗi nút gọi thẳng endpoint có sẵn của từng loại (không có logic duyệt riêng ở đây).
interface Inbox { items: InboxItem[]; byKind: Record<InboxKind, number>; failed: string[]; now: number }
const URG = { 3: "bg-red-500", 2: "bg-amber-500", 1: "bg-gray-300 dark:bg-slate-600" } as const
const ago = (at: string, now: number) => { const h = Math.max(0, Math.round((now - Date.parse(at)) / 3_600_000)); return h < 1 ? "vừa xong" : h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước` }
const btn = "px-2.5 py-1 text-[12px] rounded-lg border"

export default function ViecCanDuyetPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as { role?: string } | undefined)?.role
  const [data, setData] = useState<Inbox | null>(null)
  const [kind, setKind] = useState<InboxKind | "all">("all")
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => { if (status === "authenticated" && role && role !== "creator") router.push("/chatbot") }, [status, role, router])
  const load = useCallback(async () => { try { setData(await api<Inbox>("/api/creator/assistant/inbox")); setErr(null) } catch (e) { setErr((e as Error).message) } }, [])
  useEffect(() => { if (role === "creator") void load() }, [role, load])

  async function act(it: InboxItem, action: "approve" | "reject" | "confirm" | "done") {
    setBusy(`${it.key}:${action}`); setNote(null)
    try {
      if (it.kind === "gp_action") {
        const r = await api<{ ok?: boolean; error?: string }>("/api/creator-ai/approve", jsonInit("POST", { id: it.id, approve: action === "approve" }))
        if (r.error) throw new Error(r.error)
        setNote(action === "approve" ? "Đã duyệt — Gấu Pro đã chạy hành động." : "Đã từ chối.")
      } else if (it.kind === "argon_patch") {
        await api(`/api/creator/argon/missions/${it.missionId}/patches`, jsonInit("POST", { action, id: it.id }))
        setNote(action === "approve" ? "Đã duyệt — phiếu sửa code đã tạo, PR sẽ vào staging." : "Đã từ chối đề xuất.")
      } else if (it.kind === "fact_review") {
        await api("/api/creator/argon/facts", jsonInit("PATCH", action === "confirm" ? { id: it.id, confirm: true } : { id: it.id, status: "rejected" }))
        setNote(action === "confirm" ? "Đã xác nhận thay đổi." : "Đã bỏ thay đổi, giữ tin cũ.")
      } else if (it.kind === "mail") {
        await api("/api/creator/argon/mail-status", jsonInit("PATCH", { id: it.id, status: "done" }))
      }
      setData(d => (d ? { ...d, items: d.items.filter(x => x.key !== it.key) } : d))
      void load()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  if (role !== "creator") return null
  const items = (data?.items ?? []).filter(i => kind === "all" || i.kind === kind)
  const counts = (k: InboxKind) => (data?.items ?? []).filter(i => i.kind === k).length

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-5 space-y-4">
      <div className="flex items-center gap-2">
        <Inbox size={20} className="text-violet-600" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Việc cần duyệt</h1>
        {data && <span className="text-sm text-gray-500">{data.items.length} việc đang chờ anh</span>}
        <button type="button" onClick={() => void load()} className="ml-auto text-[12px] text-violet-700 dark:text-violet-300 hover:underline">Làm mới</button>
      </div>
      {err && <div className="p-2.5 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200">{err}</div>}
      {note && <div className="p-2.5 rounded-xl text-sm bg-emerald-50 text-emerald-800 border border-emerald-200">{note}</div>}
      {data?.failed.length ? <div className="p-2.5 rounded-xl text-[12.5px] bg-amber-50 text-amber-800 border border-amber-200 flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>Không đọc được một số nguồn việc: {data.failed.join(" · ")}</span></div> : null}

      <div className="flex flex-wrap gap-1.5 text-[12px]">
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
              <li key={it.key} className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 flex gap-3">
                <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", URG[it.urgency])} title={it.urgency === 3 ? "Cần quyết sớm" : it.urgency === 2 ? "Nên xem hôm nay" : "Bình thường"} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-gray-500">
                    <span className="font-medium text-gray-700 dark:text-slate-300">{KIND_LABEL[it.kind]}</span><span>· {it.source}</span><span>· {ago(it.at, data.now)}</span>
                  </div>
                  <div className="text-[14px] font-medium text-gray-900 dark:text-slate-100 break-words">{it.title}</div>
                  {it.detail && <div className="text-[12.5px] leading-snug text-gray-600 dark:text-slate-300 break-words">{it.detail}</div>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {it.actions.includes("approve") && <button type="button" disabled={!!busy} onClick={() => void act(it, "approve")} className={cn(btn, "bg-emerald-600 text-white border-emerald-600 disabled:opacity-50")}>{busy === `${it.key}:approve` ? "Đang chạy…" : "Duyệt"}</button>}
                    {it.actions.includes("confirm") && <button type="button" disabled={!!busy} onClick={() => void act(it, "confirm")} className={cn(btn, "bg-emerald-600 text-white border-emerald-600 disabled:opacity-50")}>Đúng, xác nhận</button>}
                    {it.actions.includes("done") && <button type="button" disabled={!!busy} onClick={() => void act(it, "done")} className={cn(btn, "bg-emerald-600 text-white border-emerald-600 disabled:opacity-50")}>Xong</button>}
                    {it.actions.includes("reject") && <button type="button" disabled={!!busy} onClick={() => void act(it, "reject")} className={cn(btn, "border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 disabled:opacity-50")}>{it.kind === "fact_review" ? "Sai, giữ tin cũ" : "Từ chối"}</button>}
                    {it.href && <Link href={it.href} className={cn(btn, "border-gray-300 dark:border-slate-600 text-violet-700 dark:text-violet-300")}>{it.actions.includes("open") ? "Mở để trả lời" : "Xem chi tiết"}</Link>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
