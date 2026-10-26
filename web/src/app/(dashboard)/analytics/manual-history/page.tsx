"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { History, Loader2, RotateCcw, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { describeChange, type Changes } from "@/lib/manual-history/pure"

// Lịch sử nhập liệu: mọi lần người dùng sửa tay target, chi phí, tỷ giá, công thức, kế hoạch, tồn kho… — ai sửa, lúc nào, số cũ → số mới — và khôi phục số cũ (admin/creator).
// Dữ liệu có trần dung lượng (xem lib/manual-history/store.ts): chỉ ghi khi giá trị thật sự đổi, gộp lần lưu liên tiếp trong 10 phút, giữ tối đa 100 mục/dòng và 24 tháng.
interface Entry { id: number; tbl: string; row_key: string; action: "create" | "update" | "delete"; changes: Changes; truncated: boolean; label: string; by: string; at: string; source: string; tableLabel: string; restoreBlocked: string | null }
interface Resp { entries: Entry[]; tables: { id: string; label: string }[]; stats?: { rows: number; oldest: string | null; tables: { tbl: string; n: number }[] }; canRestore: boolean; error?: string }
const ACTION = { create: { t: "Thêm mới", c: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" }, update: { t: "Sửa", c: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" }, delete: { t: "Xoá", c: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" } } as const
const field = "px-2.5 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
const when = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })

export default function ManualHistoryPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const [table, setTable] = useState("")
  const [q, setQ] = useState("")
  const [data, setData] = useState<Resp | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<number | null>(null)

  const load = useCallback(async (append = false, beforeId?: number) => {
    setBusy(true); setErr(null)
    try {
      const qs = new URLSearchParams({ limit: "50", stats: append ? "0" : "1" })
      if (table) qs.set("table", table)
      if (q.trim()) qs.set("q", q.trim())
      if (beforeId) qs.set("before", String(beforeId))
      const r = await fetch(`/api/analytics/manual-history?${qs}`, { cache: "no-store" })
      const j: Resp = await r.json()
      if (!r.ok) throw new Error(j.error || "Lỗi tải lịch sử")
      setMore(j.entries.length === 50)
      setData(d => (append && d ? { ...j, entries: [...d.entries, ...j.entries], stats: d.stats } : j))
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }, [table, q])
  useEffect(() => { void load() }, [load])

  async function restore(e: Entry) {
    const lines = Object.entries(e.changes).slice(0, 6).map(([f, [o, n]]) => `• ${describeChange(f, [n, o])}`).join("\n")
    if (!window.confirm(`Khôi phục số cũ cho "${e.label || e.row_key}"?\n\n${lines}\n\nViệc khôi phục cũng được ghi vào lịch sử.`)) return
    setRestoring(e.id); setNote(null); setErr(null)
    try {
      const r = await fetch("/api/analytics/manual-history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", id: e.id }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Khôi phục lỗi")
      setNote("Đã khôi phục số cũ. Các tab sẽ làm mới số liệu trong ít giây.")
      void load()
    } catch (x) { setErr((x as Error).message) } finally { setRestoring(null) }
  }

  if (role && !["admin", "creator", "bod", "manager"].includes(role)) return <div className="p-6 text-sm text-gray-500">Bạn chưa được cấp quyền xem lịch sử nhập liệu.</div>

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2"><History size={20} className="text-brand-600" /><h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Lịch sử nhập liệu</h1></div>
      <p className="text-sm text-gray-500">Mọi lần sửa tay target, chi phí, tỷ giá, công thức, kế hoạch, tồn kho… được ghi lại để xem số cũ. Chỉ ghi khi giá trị thật sự đổi; sửa liên tiếp trong 10 phút gộp thành một mục; giữ tối đa 100 mục mỗi dòng và 24 tháng.</p>
      {data?.stats && <div className="text-xs text-gray-500">Đang lưu {data.stats.rows.toLocaleString("vi-VN")} mục{data.stats.oldest ? `, cũ nhất ${when(data.stats.oldest)}` : ""}.</div>}

      <div className="flex flex-wrap items-center gap-2">
        <select className={field} value={table} onChange={e => setTable(e.target.value)} aria-label="Lọc theo loại dữ liệu">
          <option value="">Tất cả loại dữ liệu</option>
          {(data?.tables ?? []).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={cn(field, "pl-8 w-72")} placeholder="Tìm mã khách, SKU, tên… hoặc người sửa" value={q} onChange={e => setQ(e.target.value)} aria-label="Tìm" /></div>
        {busy && <Loader2 size={15} className="animate-spin text-gray-400" />}
      </div>

      {err && <div className="p-2.5 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200">{err}</div>}
      {note && <div className="p-2.5 rounded-xl text-sm bg-emerald-50 text-emerald-800 border border-emerald-200">{note}</div>}

      {data && !data.entries.length && !busy && <div className="py-12 text-center text-sm text-gray-500">Chưa có lần sửa nào được ghi (lịch sử bắt đầu từ lúc tính năng này chạy).</div>}
      <ul className="space-y-2.5">
        {(data?.entries ?? []).map(e => (
          <li key={e.id} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-500">
              <span className={cn("px-1.5 py-0.5 rounded font-medium", ACTION[e.action].c)}>{ACTION[e.action].t}</span>
              <span className="font-medium text-gray-700 dark:text-slate-300">{e.tableLabel}</span><span>· {when(e.at)}</span><span>· {e.by || "không rõ"}</span>
            </div>
            <div className="text-[14px] font-medium text-gray-900 dark:text-slate-100 break-words">{e.label || e.row_key}</div>
            <ul className="text-[12.5px] text-gray-700 dark:text-slate-300 space-y-0.5 font-mono break-all">
              {Object.entries(e.changes).slice(0, 12).map(([f, c]) => <li key={f}>{describeChange(f, c)}</li>)}
              {Object.keys(e.changes).length > 12 && <li className="text-gray-400">… và {Object.keys(e.changes).length - 12} trường nữa</li>}
            </ul>
            {e.truncated && <div className="text-[11.5px] text-amber-700">Có giá trị quá dài đã bị cắt bớt.</div>}
            {data?.canRestore && (e.restoreBlocked
              ? <div className="text-[11.5px] text-gray-400">{e.restoreBlocked}</div>
              : <button type="button" disabled={restoring === e.id} onClick={() => void restore(e)} className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">
                  {restoring === e.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}Khôi phục số cũ
                </button>)}
          </li>
        ))}
      </ul>
      {more && <button type="button" disabled={busy} onClick={() => void load(true, data?.entries.at(-1)?.id)} className="w-full py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800">Xem thêm</button>}
    </div>
  )
}
