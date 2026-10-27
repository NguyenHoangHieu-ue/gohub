"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, CircleHelp, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "../argon-types"
import { useArgonAccess } from "../use-argon-member"
import type { Criterion, Parity } from "@/lib/assistant/parity-pure"

// Chạy song song Gấu Pro ↔ Gấu Prime (Đợt 4): so số lượt/chất lượng, công cụ Gấu Pro đang dùng đã có ở Gấu Prime chưa, và tiêu chí gỡ Gấu Pro.
interface Side { runs: number; users: number; done: number; medianMs: number | null; up: number; down: number; upRate: number | null }
interface Data {
  days: number
  gauPro: Side
  gauPrime: Side & { costUsd: number; daysWithRuns: number }
  tools: { tool: string; count: number; status: Parity; label: string; prime: string; note?: string }[]
  criteria: Criterion[]
  errors: string[]
}
const sec = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`)
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—")
const CHIP: Record<Parity, string> = {
  covered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  approval: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  not_yet: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  "n/a": "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300",
}

function SideCard({ title, s, extra }: { title: string; s: Data["gauPro"]; extra?: React.ReactNode }) {
  return (
    <div className="ag-card ag-card-flat p-4 space-y-1.5">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-2xl font-bold tabular-nums">{s.runs}<span className="ml-1 text-xs font-normal text-gray-500">lượt · {s.users} người</span></p>
      <p className="text-xs text-gray-600 dark:text-slate-300">Hoàn tất {pct(s.done, s.runs)} · thời gian giữa {sec(s.medianMs)}</p>
      <p className="text-xs text-gray-600 dark:text-slate-300">👍 {s.up} · 👎 {s.down}{s.upRate != null && ` · ${s.upRate}% hài lòng`}</p>
      {extra}
    </div>
  )
}

export default function SongSongPage() {
  const router = useRouter()
  const access = useArgonAccess()
  const [days, setDays] = useState(14)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback((d: number) => { setData(null); api<Data>(`/api/creator/assistant/parallel?days=${d}`).then(setData).catch(e => setErr((e as Error).message)) }, [])
  useEffect(() => { if (!access.loading && (access.member || !access.enabled)) router.push("/analytics/creator/argon") }, [access, router])
  useEffect(() => { if (!access.loading && access.enabled && !access.member) load(days) }, [access, days, load])

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>
  if (!data) return <div className="p-6 text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Đang tải…</div>
  const gaps = data.tools.filter(t => t.status === "not_yet" || t.status === "partial")
  return (
    <div className="max-w-[1100px] mx-auto px-4 py-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">Chạy song song Gấu Pro ↔ Gấu Prime</h1>
        <div role="radiogroup" aria-label="Khoảng ngày" className="ml-auto inline-flex rounded-lg border border-gray-200 dark:border-slate-600 p-0.5">
          {[7, 14, 30].map(d => <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={cn("px-2.5 py-1 text-xs rounded-md", days === d ? "bg-violet-600 text-white" : "text-gray-600 dark:text-slate-300")}>{d} ngày</button>)}
        </div>
      </div>
      {data.errors.length > 0 && <p className="text-xs text-amber-700">Một số nguồn đọc lỗi: {data.errors.join("; ")}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <SideCard title="Gấu Pro" s={data.gauPro} />
        <SideCard title="Gấu Prime" s={data.gauPrime} extra={<p className="text-xs text-gray-600 dark:text-slate-300">{data.gauPrime.daysWithRuns} ngày có dùng · chi phí {data.gauPrime.costUsd.toLocaleString("vi-VN")} USD</p>} />
      </div>

      <section className="ag-card ag-card-flat p-4 space-y-2" aria-label="Tiêu chí gỡ Gấu Pro">
        <p className="text-sm font-semibold">Tiêu chí gỡ Gấu Pro</p>
        <ul className="space-y-1.5">
          {data.criteria.map(c => (
            <li key={c.id} className="flex items-start gap-2 text-[13px]">
              <span className={cn("mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white", c.ok === true ? "bg-emerald-500" : c.ok === false ? "bg-red-500" : "bg-gray-400")}>
                {c.ok === true ? <Check size={11} /> : c.ok === false ? <X size={11} /> : <CircleHelp size={11} />}
              </span>
              <span><span className="font-medium">{c.label}.</span> <span className="text-gray-500 dark:text-slate-400">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ag-card ag-card-flat p-4" aria-label="Công cụ Gấu Pro đang dùng">
        <p className="text-sm font-semibold mb-1">Công cụ Gấu Pro đang dùng ({data.tools.length}) — {gaps.length} chưa/mới một phần có ở Gấu Prime</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-gray-500"><th className="py-1 pr-3">Công cụ</th><th className="py-1 pr-3 text-right">Lần dùng</th><th className="py-1 pr-3">Ở Gấu Prime</th><th className="py-1">Tương đương</th></tr></thead>
            <tbody>
              {data.tools.map(t => (
                <tr key={t.tool} className="border-t border-gray-100 dark:border-slate-700">
                  <td className="py-1.5 pr-3 font-mono text-xs">{t.tool}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{t.count}</td>
                  <td className="py-1.5 pr-3"><span className={cn("rounded-full px-2 py-0.5 text-[11px]", CHIP[t.status])}>{t.label}</span></td>
                  <td className="py-1.5 text-gray-600 dark:text-slate-300">{t.prime}{t.note && <span className="text-gray-400"> — {t.note}</span>}</td>
                </tr>
              ))}
              {!data.tools.length && <tr><td colSpan={4} className="py-4 text-center text-gray-400">Chưa có lượt Gấu Pro nào trong khoảng này</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
