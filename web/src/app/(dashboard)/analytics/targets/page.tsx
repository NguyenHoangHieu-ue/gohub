"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Target, Save, Calendar, AlertCircle, CheckCircle2,
  TrendingUp, Sparkles, Zap, Lock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/analytics-formatters"
import { SourceBadge } from "@/components/dashboard-kit"
import { useSession } from "next-auth/react"

interface PlanningData {
  channel: string
  group: string
  prevQuarterActuals: Record<string, number>
  prevQuarter3hkActuals: Record<string, number>
  prevQuarterGpm2Actuals: Record<string, number>
  monthlyTargets: Record<string, number>
  monthly3hkTargets: Record<string, number>
  monthlyGpm2Targets: Record<string, number>
}

interface PlanningResponse {
  quarter: string
  prevQuarter: string
  prevMonths: string[]
  currentMonths: string[]
  data: PlanningData[]
}

function getDefaultQuarter() {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3) + 1
  return `${now.getFullYear()}-Q${q}`
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-slate-200 rounded", className)} />
}

interface TableProps {
  title: string
  metricType: "currency" | "percent"
  targets: Record<string, number>
  prevActuals: (d: PlanningData) => Record<string, number>
  onChange: (key: string, val: number) => void
  data: PlanningResponse | null
  loading: boolean
  canEdit: boolean
}

function PlanningTable({ title, metricType, targets, prevActuals, onChange, data, loading, canEdit }: TableProps) {
  const formatVal = (v: number) => metricType === "percent" ? `${v.toFixed(2)}%` : formatCurrency(v)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
        <h2 className="font-bold text-slate-900 text-sm">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nhóm</th>
              {data?.prevMonths?.map(m => (
                <th key={m} className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                  {m}<br /><span className="text-slate-300">(Actual)</span>
                </th>
              ))}
              {data?.currentMonths?.map(m => (
                <th key={m} className="px-5 py-3 text-[10px] font-bold text-blue-600 uppercase tracking-widest text-right bg-blue-50/50">
                  {m}<br /><span className="text-blue-400">Target</span>
                </th>
              ))}
              <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                {metricType === "currency" ? "Tăng trưởng" : "Avg vs Q trước"}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                    <p className="text-sm text-slate-500">Đang tải dữ liệu...</p>
                  </div>
                </td>
              </tr>
            ) : (
              ["B2C", "B2B"].map(group => {
                const item = data?.data?.find(d => d.group === group)
                if (!item) return null

                const actuals = prevActuals(item)
                const prevTotal = Object.values(actuals).reduce((a, b) => a + b, 0)
                const targetTotal = (data?.currentMonths || []).reduce((sum, m) => sum + (targets[`${item.channel}_${m}`] || 0), 0)
                const growth = prevTotal > 0 ? ((targetTotal - prevTotal) / prevTotal) * 100 : 0

                return (
                  <tr key={group} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-bold text-slate-900 bg-slate-50/50 border-r border-slate-100">
                      {group}
                    </td>
                    {(data?.prevMonths || []).map(m => (
                      <td key={m} className="px-5 py-4 text-sm text-slate-500 text-right bg-slate-50/30 border-r border-slate-100">
                        {formatVal(actuals[m] || 0)}
                      </td>
                    ))}
                    {(data?.currentMonths || []).map(m => (
                      <td key={m} className="px-5 py-4 text-right bg-blue-50/20">
                        <div className="flex justify-end">
                          {canEdit ? (
                            <input type="number"
                              value={targets[`${item.channel}_${m}`] || ""}
                              onChange={e => onChange(`${item.channel}_${m}`, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="w-32 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                          ) : (
                            <span className="text-sm font-bold text-slate-700">
                              {formatVal(targets[`${item.channel}_${m}`] || 0)}
                            </span>
                          )}
                        </div>
                      </td>
                    ))}
                    <td className="px-5 py-4 text-right bg-slate-50/30">
                      {prevTotal > 0 && metricType === "currency" ? (
                        <span className={cn("text-xs font-bold flex items-center justify-end gap-1",
                          growth > 0 ? "text-emerald-600" : "text-rose-500")}>
                          <TrendingUp className={cn("w-3 h-3", growth < 0 && "rotate-180")} />
                          {growth.toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Cửa sổ 6 tháng (5 tháng trước + tháng hiện tại) — khớp dashboard B2C.
function last6Months(): string[] {
  const now = new Date(); const out: string[] = []
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`) }
  return out
}
const monthLabel = (m: string) => { const [y, mo] = m.split("-"); return `Thg ${parseInt(mo)}/${y}` }

function SaveBtn({ onClick, saving, disabled, dirty = true }: { onClick: () => void; saving: boolean; disabled?: boolean; dirty?: boolean }) {
  const idle = !dirty && !disabled   // chưa đổi (và không phải View Only) → mờ + khoá
  return (
    <button onClick={onClick} disabled={saving || disabled || !dirty}
      className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm",
        disabled ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-300",
        idle && "opacity-50 cursor-not-allowed")}>
      {saving ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        : disabled ? <Lock className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
      {disabled ? "View Only" : "Lưu"}
    </button>
  )
}

// KPI doanh thu B2C theo tháng × thị trường (VN / US / Total) — app_settings b2c_kpi_targets.
function B2CKpiTargetSection({ canEdit, onNotify }: { canEdit: boolean; onNotify: (ok: boolean, text: string) => void }) {
  type Cell = { vn: number; us: number; total: number }
  const months = last6Months()
  const [targets, setTargets] = useState<Record<string, Cell>>({})
  const [savedSnap, setSavedSnap] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(targets) !== savedSnap

  useEffect(() => {
    fetch("/api/config/b2c-kpi-targets").then(r => r.json()).then(d => { setTargets(d || {}); setSavedSnap(JSON.stringify(d || {})); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const cell = (m: string): Cell => targets[m] ?? { vn: 0, us: 0, total: 0 }
  const setField = (m: string, k: keyof Cell, v: number) => setTargets(t => ({ ...t, [m]: { ...cell(m), [k]: v } }))

  const save = async () => {
    setSaving(true)
    const cleaned: Record<string, Cell> = {}
    for (const [m, c] of Object.entries(targets)) if ((c?.vn || 0) + (c?.us || 0) + (c?.total || 0) > 0) cleaned[m] = c
    const res = await fetch("/api/config/b2c-kpi-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cleaned) })
    if (res.ok) setSavedSnap(JSON.stringify(targets))
    setSaving(false)
    onNotify(res.ok, res.ok ? "Đã lưu KPI target B2C" : "Hiếu đang fix, vui lòng đợi")
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900 text-sm">KPI Target B2C (theo thị trường)</h2>
          <p className="text-xs text-slate-400 mt-0.5">Target doanh thu B2C theo tháng × thị trường (VND) — hiển thị ở tab KPI của /analytics/b2c.</p>
        </div>
        {canEdit && <SaveBtn onClick={save} saving={saving} dirty={dirty} />}
      </div>
      {loading ? <div className="h-32 m-5 bg-slate-50 rounded-lg animate-pulse" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tháng</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">VN</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">US</th>
                <th className="px-5 py-3 text-[10px] font-bold text-blue-600 uppercase tracking-widest text-right bg-blue-50/50">Total</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const c = cell(m)
                return (
                  <tr key={m} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 text-sm font-bold text-slate-900 bg-slate-50/50 border-r border-slate-100">{monthLabel(m)}</td>
                    {(["vn", "us", "total"] as const).map(k => (
                      <td key={k} className={cn("px-5 py-3 text-right", k === "total" && "bg-blue-50/20")}>
                        {canEdit ? (
                          <div className="flex justify-end">
                            <input type="number" min={0} step="any" value={c[k] || ""} onChange={e => setField(m, k, parseFloat(e.target.value) || 0)} placeholder="0"
                              className="w-32 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                          </div>
                        ) : <span className="text-sm font-bold text-slate-700">{formatCurrency(c[k] || 0)}</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Ngân sách Marketing B2C theo tháng (VND) — app_settings b2c_budget; dùng tính spend pace.
function B2CMarketingBudgetSection({ canEdit, onNotify }: { canEdit: boolean; onNotify: (ok: boolean, text: string) => void }) {
  const months = last6Months()
  const [budget, setBudget] = useState<Record<string, number>>({})
  const [savedSnap, setSavedSnap] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(budget) !== savedSnap

  useEffect(() => {
    fetch("/api/config/b2c-budget").then(r => r.json()).then(d => { setBudget(d || {}); setSavedSnap(JSON.stringify(d || {})); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    const cleaned: Record<string, number> = {}
    for (const [m, v] of Object.entries(budget)) if (v > 0) cleaned[m] = v
    const res = await fetch("/api/config/b2c-budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cleaned) })
    if (res.ok) setSavedSnap(JSON.stringify(budget))
    setSaving(false)
    onNotify(res.ok, res.ok ? "Đã lưu ngân sách Marketing B2C" : "Hiếu đang fix, vui lòng đợi")
  }

  const total = months.reduce((s, m) => s + (budget[m] || 0), 0)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-900 text-sm">Ngân sách Marketing B2C</h2>
          <p className="text-xs text-slate-400 mt-0.5">Ngân sách kế hoạch theo tháng (VND) — Section 5 /analytics/b2c tính spend pace = chi phí thực tế ÷ ngân sách.</p>
        </div>
        {canEdit && <SaveBtn onClick={save} saving={saving} dirty={dirty} />}
      </div>
      {loading ? <div className="h-32 m-5 bg-slate-50 rounded-lg animate-pulse" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tháng</th>
                <th className="px-5 py-3 text-[10px] font-bold text-blue-600 uppercase tracking-widest text-right bg-blue-50/50">Ngân sách (VND)</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => (
                <tr key={m} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-bold text-slate-900 bg-slate-50/50 border-r border-slate-100">{monthLabel(m)}</td>
                  <td className="px-5 py-3 text-right bg-blue-50/20">
                    {canEdit ? (
                      <div className="flex justify-end">
                        <input type="number" min={0} step="any" value={budget[m] || ""} onChange={e => setBudget(b => ({ ...b, [m]: parseFloat(e.target.value) || 0 }))} placeholder="0"
                          className="w-40 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                      </div>
                    ) : <span className="text-sm font-bold text-slate-700">{formatCurrency(budget[m] || 0)}</span>}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50/50">
                <td className="px-5 py-3 text-sm font-bold text-slate-900">Tổng 6 tháng</td>
                <td className="px-5 py-3 text-right text-sm font-bold text-blue-700">{formatCurrency(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function TargetsPage() {
  const { data: session, status } = useSession()
  const [canEdit, setCanEdit] = useState(false)

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => r.json()).then((d: any) => {
      const role: string = d.role ?? ""
      const tabs: string[] = d.writable_tabs ?? []
      setCanEdit(["admin", "creator"].includes(role) || tabs.includes("targets"))
    }).catch(() => {
      setCanEdit(["admin", "creator"].includes(session?.user?.role ?? ""))
    })
  }, [status, session?.user?.username])

  const [quarter, setQuarter] = useState(getDefaultQuarter)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<PlanningResponse | null>(null)
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [targets3hk, setTargets3hk] = useState<Record<string, number>>({})
  const [targetsGpm2, setTargetsGpm2] = useState<Record<string, number>>({})
  const [savedSnap, setSavedSnap] = useState("")

  const dirty = JSON.stringify([targets, targets3hk, targetsGpm2]) !== savedSnap
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const notify = (ok: boolean, text: string) => { setMessage({ type: ok ? "success" : "error", text }); setTimeout(() => setMessage(null), 3000) }

  const fetchData = useCallback(async () => {
    setLoading(true); setMessage(null)
    try {
      const res = await fetch(`/api/planning/targets?quarter=${quarter}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)

      const t: Record<string, number> = {}, t3: Record<string, number> = {}, tg: Record<string, number> = {}
      ;(json.data || []).forEach((item: PlanningData) => {
        Object.entries(item.monthlyTargets).forEach(([m, v]) => { t[`${item.channel}_${m}`] = v as number })
        Object.entries(item.monthly3hkTargets).forEach(([m, v]) => { t3[`${item.channel}_${m}`] = v as number })
        Object.entries(item.monthlyGpm2Targets || {}).forEach(([m, v]) => { tg[`${item.channel}_${m}`] = v as number })
      })
      setTargets(t); setTargets3hk(t3); setTargetsGpm2(tg)
      setSavedSnap(JSON.stringify([t, t3, tg]))
    } catch (err: any) {
      console.error(err)
      setMessage({ type: "error", text: "Hiếu đang fix, vui lòng đợi" })
    } finally {
      setLoading(false)
    }
  }, [quarter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSave = async () => {
    if (!canEdit) return
    setSaving(true); setMessage(null)
    try {
      const allKeys = Array.from(new Set([...Object.keys(targets), ...Object.keys(targets3hk), ...Object.keys(targetsGpm2)]))
      const targetsArray = allKeys.map(key => {
        const li = key.lastIndexOf("_")
        return {
          channel: key.substring(0, li),
          month: key.substring(li + 1),
          target_revenue: targets[key] || 0,
          target_3hk_contribution: targets3hk[key] || 0,
          target_gpm2: targetsGpm2[key] || 0,
        }
      })

      const res = await fetch("/api/planning/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: targetsArray }),
      })

      if (res.ok) {
        setSavedSnap(JSON.stringify([targets, targets3hk, targetsGpm2]))
        setMessage({ type: "success", text: "Targets đã lưu thành công!" })
        setTimeout(() => setMessage(null), 3000)
      } else {
        throw new Error((await res.json()).error || "Lưu thất bại")
      }
    } catch (err: any) {
      console.error(err)
      setMessage({ type: "error", text: "Hiếu đang fix, vui lòng đợi" })
    } finally {
      setSaving(false)
    }
  }

  const quarterOptions = [2024, 2025, 2026].flatMap(y => [1, 2, 3, 4].map(q => `${y}-Q${q}`))

  return (
    <div className="p-4 lg:p-8 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            Target Planning
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-slate-500 text-sm">Đặt target doanh thu theo quý theo nhóm kênh</p>
            <SourceBadge source="admin" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select value={quarter} onChange={e => setQuarter(e.target.value)}
              className="bg-transparent text-sm font-medium focus:outline-none">
              {quarterOptions.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          <button onClick={handleSave} disabled={saving || loading || !canEdit || !dirty}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm",
              !canEdit ? "bg-slate-200 text-slate-400 cursor-not-allowed" :
              "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-300 shadow-blue-200",
              canEdit && !dirty && "opacity-50 cursor-not-allowed")}>
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
             !canEdit ? <Lock className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {!canEdit ? "View Only" : "Lưu Plan"}
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={cn("p-4 rounded-xl border flex items-center gap-3 text-sm",
          message.type === "success" ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-rose-50 border-rose-100 text-rose-700")}>
          {message.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Quarter info */}
      {data && (
        <div className="flex items-center gap-3 text-sm text-slate-500 bg-white px-5 py-3 rounded-xl border border-slate-200">
          <span className="font-bold text-slate-700">Quý hiện tại: {data.quarter}</span>
          <span className="text-slate-300">|</span>
          <span>So sánh vs: {data.prevQuarter}</span>
          <span className="text-slate-300">|</span>
          <span>Tháng target: {data.currentMonths?.join(", ")}</span>
        </div>
      )}

      {/* Planning Tables */}
      <PlanningTable
        title="Target Doanh Thu (Revenue)"
        metricType="currency"
        targets={targets}
        prevActuals={d => d.prevQuarterActuals}
        onChange={(key, val) => setTargets(prev => ({ ...prev, [key]: val }))}
        data={data} loading={loading} canEdit={canEdit}
      />

      <PlanningTable
        title="Target 3HK Datapool Contribution (%)"
        metricType="percent"
        targets={targets3hk}
        prevActuals={d => d.prevQuarter3hkActuals}
        onChange={(key, val) => setTargets3hk(prev => ({ ...prev, [key]: val }))}
        data={data} loading={loading} canEdit={canEdit}
      />

      <PlanningTable
        title="CM1 % Target Planning"
        metricType="percent"
        targets={targetsGpm2}
        prevActuals={d => d.prevQuarterGpm2Actuals}
        onChange={(key, val) => setTargetsGpm2(prev => ({ ...prev, [key]: val }))}
        data={data} loading={loading} canEdit={canEdit}
      />

      {/* B2C KPI & Marketing Budget (chuyển từ Admin sang đây cho đúng chỗ) */}
      <B2CKpiTargetSection canEdit={canEdit} onNotify={notify} />
      <B2CMarketingBudgetSection canEdit={canEdit} onNotify={notify} />

      {/* Tips */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Sparkles, color: "blue", title: "Smart Forecast Tips", body: "So sánh với cùng quý năm trước để tính yếu tố mùa vụ. Xem xét ngân sách marketing khi đặt target." },
          { icon: Zap, color: "amber", title: "Growth Analysis", body: "Tỷ lệ tăng trưởng được tính dựa trên tổng doanh thu quý trước. Hướng đến tăng trưởng bền vững 10–15% cho kênh ổn định." },
          { icon: TrendingUp, color: "emerald", title: "Bước tiếp theo", body: "Sau khi lưu, target này sẽ xuất hiện trong BOD Report và Channel Performance để theo dõi thực tế vs target." },
        ].map((tip, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3",
              tip.color === "blue" ? "bg-blue-50 text-blue-600" :
              tip.color === "amber" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
              <tip.icon className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mb-1.5">{tip.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{tip.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
