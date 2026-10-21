"use client"
// View THÁNG của tab B2B Performance — dùng ĐÚNG nguồn và component của Quarter Report
// (quarterly-report + quarterly-b2b-customers + B2BTierSection) để số hai tab luôn khớp cho cùng tháng.
// Khác Quarter Report: chọn 1 tháng, %MoM thay %QoQ, không hiện target / Tổng Quý.
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { fc, pct } from "@/lib/quarterly-format"
import { B2BTierSection } from "@/components/quarterly/b2b-tier-section"
import type { MonthStats, MonthSummary } from "@/lib/quarterly-types"

const pad = (n: number) => String(n).padStart(2, "0")
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const shiftMonth = (m: string, delta: number) => { const [y, mo] = m.split("-").map(Number); return monthKey(new Date(y, mo - 1 + delta, 1)) }
const quarterOf = (m: string) => { const [y, mo] = m.split("-").map(Number); return { quarter: `Q${Math.ceil(mo / 3)}`, year: y } }
const mLabel = (m: string) => `T${parseInt(m.split("-")[1])}/${m.split("-")[0]}`

type Region = "ALL" | "VN" | "US"

function delta(cur: number, prev: number | null): number | null {
  return prev != null && prev !== 0 ? (cur - prev) / Math.abs(prev) * 100 : null
}

function DeltaBadge({ v, pp }: { v: number | null; pp?: boolean }) {
  if (v == null) return <span className="text-[11.5px] text-slate-300">—</span>
  return (
    <span className={cn("text-[11.5px] font-bold tabular-nums", v >= 0 ? "text-green-600" : "text-red-500")}>
      {v >= 0 ? "+" : ""}{v.toFixed(1)}{pp ? " đ.%" : "%"}
    </span>
  )
}

function Card({ title, main, sub, mom, pp, accent }: { title: string; main: string; sub?: string; mom: number | null; pp?: boolean; accent?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider">{title}</span>
      <span className={cn("text-xl font-black tabular-nums", accent ?? "text-slate-800")}>{main}</span>
      {sub && <span className="text-[11.5px] text-slate-400">{sub}</span>}
      <div className="flex items-center gap-1.5 mt-0.5">
        <DeltaBadge v={mom} pp={pp} />
        <span className="text-[11.5px] text-slate-400">so với tháng trước</span>
      </div>
    </div>
  )
}

export function B2BMonthView({ initialMonth }: { initialMonth?: string }) {
  const today = new Date()
  const [month, setMonth] = useState<string>(initialMonth ?? monthKey(today))
  const [region, setRegion] = useState<Region>("ALL")
  const [includeShip, setIncludeShip] = useState(true)
  const [includeInternalOps, setIncludeInternalOps] = useState(true)
  const [tiers, setTiers] = useState<any>(null)
  const [reports, setReports] = useState<Record<string, { summary: MonthSummary[] }>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [userRole, setUserRole] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  useEffect(() => {
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => { if (d?.role) setUserRole(String(d.role)) }).catch(() => {})
  }, [])
  const canEditCost = ["admin", "creator", "bod", "b2b", "b2c", "staff"].includes(userRole)
  const isCreator = userRole === "creator"

  const prevMonth = shiftMonth(month, -1)
  const cur = quarterOf(month)
  const prv = quarterOf(prevMonth)
  const prevSameQuarter = cur.quarter === prv.quarter && cur.year === prv.year

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError(null)
    const q = (qq: { quarter: string; year: number }) => {
      const p = new URLSearchParams({ quarter: qq.quarter, year: String(qq.year), companyCode: "ALL" })
      if (includeShip) p.set("includeShip", "1")
      if (includeInternalOps) p.set("includeInternalOps", "1")
      if (refresh) p.set("refresh", "1")
      return p.toString()
    }
    const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status}`); return r.json() }
    try {
      if (refresh) await fetch("/api/analytics/quarterly-cache-flush", { method: "POST" }).catch(() => {})
      const jobs: Promise<any>[] = [
        get(`/api/analytics/quarterly-b2b-customers?${q(cur)}`),
        get(`/api/analytics/quarterly-report?${q(cur)}`),
      ]
      if (!prevSameQuarter) jobs.push(get(`/api/analytics/quarterly-report?${q(prv)}`))
      const [t, rep, repPrev] = await Promise.all(jobs)
      setTiers(t)
      setReports({ [`${cur.quarter}-${cur.year}`]: rep, ...(repPrev ? { [`${prv.quarter}-${prv.year}`]: repPrev } : {}) })
    } catch (e: any) {
      setError("Hiếu đang fix, vui lòng đợi")
      console.error("B2BMonthView load:", e)
    } finally { setLoading(false) }
  }, [cur.quarter, cur.year, prv.quarter, prv.year, prevSameQuarter, includeShip, includeInternalOps]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const curSummary: MonthSummary[] = reports[`${cur.quarter}-${cur.year}`]?.summary ?? []
  const prevSummary: MonthSummary[] = reports[`${prv.quarter}-${prv.year}`]?.summary ?? []
  const sCur = curSummary.find(s => s.month === month)
  const sPrev = (prevSameQuarter ? curSummary : prevSummary).find(s => s.month === prevMonth)
  const b2b: MonthStats | undefined = sCur?.b2b
  const b2bPrev: MonthStats | undefined = sPrev?.b2b
  const running = !!sCur?.isProjected
  const isFuture = !sCur && !loading && !!tiers && curSummary.length > 0

  const view = useMemo(() => {
    if (!b2b) return null
    const rev = b2b.revenue, gp = b2b.gp, cm1 = b2b.cm1, hk3 = b2b.hk3Rev ?? 0
    const cc = b2b.channelCost + b2b.groupCost
    const p = b2bPrev
    return {
      rev, gp, cm1, hk3, cc,
      revAct: b2b.actualRevenue, gpAct: b2b.actualGp, cm1Act: b2b.actualCm1, hk3Act: b2b.actualHk3,
      momRev: delta(rev, p?.revenue ?? null),
      momGp: delta(gp, p?.gp ?? null),
      momCm1: delta(cm1, p?.cm1 ?? null),
      momHk3: delta(hk3, p?.hk3Rev ?? null),
      // Tháng trước không có lãi gộp (dữ liệu cũ, vd 12/2025) thì %CM1 tháng trước vô nghĩa → không so điểm %.
      momCm1Pct: p && p.gp !== 0 ? b2b.cm1Pct - p.cm1Pct : null,
      momGpPct: p ? b2b.gpPct - p.gpPct : null,
      momHk3Pct: p && p.hk3Pct != null && b2b.hk3Pct != null ? b2b.hk3Pct - p.hk3Pct : null,
    }
  }, [b2b, b2bPrev])

  const maxMonth = monthKey(today)

  return (
    <div className="space-y-5">
      {/* Điều khiển: tháng, vùng, hộp tích, tải lại */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-1 px-2">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1 rounded-md hover:bg-slate-100" aria-label="Tháng trước"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
          <input type="month" value={month} max={maxMonth} onChange={e => e.target.value && setMonth(e.target.value)}
            className="bg-transparent text-sm font-bold focus:outline-none cursor-pointer" />
          <button onClick={() => month < maxMonth && setMonth(shiftMonth(month, 1))} disabled={month >= maxMonth}
            className="p-1 rounded-md hover:bg-slate-100 disabled:opacity-30" aria-label="Tháng sau"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="flex items-center gap-2">
          {([["Phí ship", includeShip, setIncludeShip], ["Đơn nội bộ", includeInternalOps, setIncludeInternalOps]] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
            <label key={label} className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="w-3 h-3 accent-amber-500" />
              <span className={cn("text-[11.5px] font-semibold", val ? "text-amber-600" : "text-slate-500")}>{label}</span>
            </label>
          ))}
        </div>
        <button onClick={() => load(true)} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />Tải lại mới
        </button>
        {running && <span className="text-[12px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg">Pro-rata tháng hiện tại</span>}
      </div>

      {msg && <div className={cn("p-3 rounded-xl text-xs font-semibold", msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>{msg.text}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {/* Thẻ tổng B2B của tháng — cùng số với dòng B2B của Quarter Report */}
      {view && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card title={`Revenue ${mLabel(month)}`} main={fc(view.rev)} sub={running && view.revAct != null ? `Actual ${fc(view.revAct)}` : undefined} mom={view.momRev} />
          <Card title="Gross Margin" main={fc(view.gp)} sub={`GM% ${pct(b2b!.gpPct)}${running && view.gpAct != null ? ` · Actual ${fc(view.gpAct)}` : ""}`} mom={view.momGp} />
          <Card title="CM1" main={fc(view.cm1)} accent={view.cm1 >= 0 ? "text-emerald-700" : "text-red-600"}
            sub={`%CM1 ${pct(b2b!.cm1Pct)} (${view.momCm1Pct != null ? `${view.momCm1Pct >= 0 ? "+" : ""}${view.momCm1Pct.toFixed(1)} đ.%` : "—"})${running && view.cm1Act != null ? ` · Actual ${fc(view.cm1Act)}` : ""}`} mom={view.momCm1} />
          <Card title="Ch.Cost + Group Cost" main={fc(view.cc)} sub={`Ch.Cost ${fc(b2b!.channelCost)} · Group ${fc(b2b!.groupCost)}`} mom={delta(view.cc, b2bPrev ? b2bPrev.channelCost + b2bPrev.groupCost : null)} />
          <Card title="3HK Revenue" main={fc(view.hk3)} sub={`3HK% ${pct(b2b!.hk3Pct ?? 0)}`} mom={view.momHk3} />
        </div>
      )}
      {isFuture && <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">Tháng {mLabel(month)} chưa có dữ liệu.</div>}
      {view && (
        <p className="text-[11.5px] text-slate-400">CM1 ở thẻ = Gross Margin − Ch.Cost − Group Cost (khớp dòng B2B của Quarter Report). Bảng Nhóm bên dưới là CM1 theo khách, chưa trừ Group Cost.</p>
      )}

      <B2BTierSection
        b2bTiers={tiers}
        loading={loading}
        months={tiers?.months ?? []}
        allMonths={tiers?.months}
        region={region}
        onRegionChange={r => setRegion(r as Region)}
        expanded={expanded}
        onToggle={() => setExpanded(v => !v)}
        canEditCost={canEditCost}
        isCreator={isCreator}
        onSaved={() => load(true)}
        notify={notify}
        quarterLabel={`${cur.quarter}-${cur.year}`}
        summary={curSummary}
        fixedMonth={month}
      />
    </div>
  )
}
