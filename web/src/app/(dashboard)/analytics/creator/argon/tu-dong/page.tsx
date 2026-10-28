"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, ChevronRight, Loader2, Moon, Play, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, jsonInit } from "../argon-types"
import { useArgonAccess } from "../use-argon-member"

// Tự động hằng đêm — thay cho trang "Nâng cao" (chủ yếu là tuần tra đêm). Ba việc: bật/tắt bản tin sáng, chạy thử ngay, xem Argon dự đoán đúng hay sai.
// Câu lệnh của bản tin là CỐ ĐỊNH (nút "Cập nhật ngay" và cron đêm dùng chung một câu), nên trang này không cho sửa câu lệnh.
interface Snapshot { missionId: string; tacDong: { updatedAt: string | null }; nightly: boolean; running: { runId: string; since: string } | null }
interface Forecast { id: string; text: string; expected?: number; unit?: string; checkDate: string; status: "open" | "scored"; actual?: number; errorPct?: number; verdict?: "dung" | "gan_dung" | "sai"; note?: string }
interface Summary { scored: number; open: number; right: number; near: number; wrong: number; accuracyPct: number | null; avgErrorPct: number | null }
const VERDICT = { dung: ["Đúng", "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"], gan_dung: ["Gần đúng", "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"], sai: ["Sai", "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200"] } as const
const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "")

export default function TuDongPage() {
  const router = useRouter()
  const access = useArgonAccess()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [forecasts, setForecasts] = useState<Forecast[]>([])
  const [sum, setSum] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (!access.loading && (access.member || !access.enabled)) router.replace("/analytics/creator/argon/hoi-tim") }, [access, router])

  const load = useCallback(async () => {
    try {
      const s = await api<Snapshot>("/api/creator/argon/context")
      setSnap(s)
      const p = await api<{ forecasts: Forecast[]; forecastSummary: Summary }>(`/api/creator/argon/missions/${s.missionId}/patrol`).catch(() => null)
      if (p) { setForecasts(p.forecasts ?? []); setSum(p.forecastSummary ?? null) }
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { if (!access.loading && access.enabled && !access.member) void load() }, [access, load])
  useEffect(() => { if (!snap?.running) return; const t = setInterval(() => void load(), 6000); return () => clearInterval(t) }, [snap?.running, load])

  async function toggle() {
    if (!snap) return
    const next = !snap.nightly
    setSnap({ ...snap, nightly: next })
    try { setSnap(await api<Snapshot>("/api/creator/argon/context", jsonInit("PATCH", { nightly: next }))) } catch (e) { setErr((e as Error).message); setSnap({ ...snap, nightly: !next }) }
  }
  async function runNow() {
    setBusy(true)
    try { await api("/api/creator/argon/context", jsonInit("POST", {})); await load() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if (access.loading || !snap) return <div className="p-6 text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Đang tải…</div>
  const running = !!snap.running
  return (
    <div className="max-w-[860px] mx-auto px-4 py-6 space-y-5">
      <header>
        <h1 className="ag-title text-[26px] font-bold tracking-tight leading-tight">Tự động hằng đêm</h1>
        <p className="mt-1 text-[14px] text-gray-500 dark:text-slate-400">Mỗi đêm Argon tự làm bài “bản tin sáng” để sáng ra anh có sẵn việc cần xem.</p>
      </header>
      {err && <div className="text-sm rounded-xl bg-red-50 text-red-700 px-3.5 py-2.5 flex justify-between whitespace-pre-wrap"><span>{err}</span><button type="button" onClick={() => setErr(null)} aria-label="Đóng">×</button></div>}

      <section className="ag-card p-5 space-y-4" aria-label="Bản tin sáng">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200"><Moon size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-gray-900 dark:text-slate-100">Bản tin sáng</h2>
            <p className="text-[13px] text-gray-500 dark:text-slate-400">{snap.tacDong.updatedAt ? `Lần cập nhật gần nhất: ${fmtAt(snap.tacDong.updatedAt)}` : "Chưa có lần cập nhật nào"}</p>
          </div>
          <button type="button" role="switch" aria-checked={snap.nightly} onClick={() => void toggle()} className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors", snap.nightly ? "bg-violet-600" : "bg-gray-300 dark:bg-slate-600")} title={snap.nightly ? "Đang bật: mỗi đêm tự chạy" : "Đang tắt"}>
            <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", snap.nightly ? "translate-x-6" : "translate-x-1")} />
          </button>
        </div>
        <p className="text-[13px] font-medium text-gray-700 dark:text-slate-200">{snap.nightly ? "Đang bật — mỗi đêm Argon tự cập nhật và nhắn Lark cho anh." : "Đang tắt — Argon chỉ cập nhật khi anh bấm “Chạy thử ngay”."}</p>
        <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-gray-600 dark:text-slate-300">
          <li className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />Đọc Kho (mail, tài liệu, sổ sự việc) và số liệu công ty.</li>
          <li className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />Đối chiếu với kế hoạch và metric anh đã viết.</li>
          <li className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />Viết tối đa 3 đề xuất có nguồn, hiện ở trang <Link href="/analytics/creator/argon" className="text-violet-700 dark:text-violet-300 hover:underline">Hôm nay</Link>.</li>
        </ul>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={() => void runNow()} disabled={running || busy} className="ag-btn-primary">
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{running ? "Đang chạy…" : "Chạy thử ngay"}
          </button>
          {running && <span className="text-[12.5px] text-gray-500">Bắt đầu lúc {fmtAt(snap.running!.since)}, thường mất vài phút. Xong sẽ nhắn Lark.</span>}
        </div>
      </section>

      <section className="ag-card p-5 space-y-3" aria-label="Sổ dự đoán">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200"><Target size={16} /></span>
          <h2 className="text-[16px] font-semibold text-gray-900 dark:text-slate-100">Argon dự đoán đúng hay sai?</h2>
        </div>
        <p className="text-[13px] text-gray-500 dark:text-slate-400">Khi Argon đưa ra ước tính có con số, nó ghi lại; tới hạn thì đo lại và chấm. Giúp anh biết khi nào nên tin con số của nó.</p>
        {sum && (sum.scored > 0 || sum.open > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[["Độ đúng", sum.accuracyPct != null ? `${sum.accuracyPct}%` : "—"], ["Đã chấm", String(sum.scored)], ["Chờ đến hạn", String(sum.open)], ["Sai số TB", sum.avgErrorPct != null ? `${sum.avgErrorPct}%` : "—"]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-gray-50 dark:bg-slate-800/60 px-3.5 py-2.5"><div className="text-[11px] uppercase tracking-wide text-gray-400">{k}</div><div className="text-[20px] font-semibold tabular-nums text-gray-900 dark:text-slate-100">{v}</div></div>
            ))}
          </div>
        )}
        {forecasts.length === 0 ? <p className="rounded-xl bg-gray-50 dark:bg-slate-800/60 px-4 py-5 text-center text-[13px] text-gray-500">Chưa có dự đoán nào.</p> : (
          <ul className="space-y-2">
            {forecasts.slice(0, 20).map(f => (
              <li key={f.id} className="rounded-xl border border-gray-200 dark:border-slate-700 px-3.5 py-3 text-[13px]">
                <div className="flex flex-wrap items-start gap-2"><span className="min-w-0 flex-1 text-gray-900 dark:text-slate-100 leading-snug">{f.text}</span>
                  {f.status === "open" ? <span className="shrink-0 rounded-full bg-gray-100 dark:bg-slate-700 px-2.5 py-0.5 text-[11.5px] text-gray-600 dark:text-slate-300">Chờ chấm</span> : <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", VERDICT[f.verdict ?? "sai"][1])}>{VERDICT[f.verdict ?? "sai"][0]}</span>}
                </div>
                <div className="mt-1 text-[12px] text-gray-500">{f.expected !== undefined ? `Dự kiến ${f.expected}${f.unit ? " " + f.unit : ""} · ` : ""}hạn {f.checkDate}{f.status === "scored" && f.actual !== undefined ? ` · thực tế ${f.actual}${f.errorPct !== undefined ? ` (sai số ${f.errorPct}%)` : ""}` : ""}</div>
                {f.note && <div className="mt-0.5 text-[12px] text-gray-500">{f.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/analytics/creator/argon/nang-cao" className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3 text-[13px] text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800">
        Công cụ sứ mệnh kiểu cũ (workspace, file, kịch bản) <ChevronRight size={14} className="ml-auto" />
      </Link>
    </div>
  )
}
