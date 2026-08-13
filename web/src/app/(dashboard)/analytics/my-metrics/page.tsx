"use client"

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import {
  Target, Pencil, Save, XCircle, RefreshCw,
  AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp,
  Zap, BarChart3, Bot, TrendingUp, Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompactNumber } from "@/lib/analytics-formatters"

// ─── Types ────────────────────────────────────────────────────────────────────
interface AutoMetrics {
  quarter: string; year: number; start: string; end: string
  hk3: {
    pct: number; hk3_rev: number; total_rev: number
    monthly: { month: string; hk3_rev: number; total_rev: number }[]
  }
  begau: {
    total: number; web: number; lark: number
    monthly: Record<string, { total: number; web: number; lark: number }>
  }
}

interface ManualMetrics {
  sla_time: number; sla_pct: number; vendor_speed: number
  gm_baseline: number; gm_actual: number
  updated_by?: string; updated_at?: string
}

// ─── OKR targets ─────────────────────────────────────────────────────────────
const TARGETS = {
  Q3: { sla_time: 5, sla_pct: 80, vendor_speed: 15, gm_delta: 2.5, hk3_pct: 74, begau: 450 },
  Q4: { sla_time: 1, sla_pct: 90, vendor_speed: 5,  gm_delta: 5.0, hk3_pct: 80, begau: 650 },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fck = (n: number) => formatCompactNumber(n)
const pct = (n: number) => `${n.toFixed(1)}%`

function currentQuarter(): { q: "Q3" | "Q4"; year: number } {
  const m = new Date().getMonth() + 1 // 1-12
  const y = new Date().getFullYear()
  if (m <= 3)  return { q: "Q3", year: y - 1 } // edge case tháng 1-3 năm sau
  if (m <= 6)  return { q: "Q3", year: y }      // không dùng Q1/Q2 vì OKR chỉ có Q3/Q4
  if (m <= 9)  return { q: "Q3", year: y }
  return { q: "Q4", year: y }
}

function progressColor(actual: number, target: number) {
  if (target <= 0) return "gray"
  const p = actual / target
  if (p >= 1)    return "green"
  if (p >= 0.75) return "blue"
  return "amber"
}

function ProgressBadge({ actual, target, unit = "" }: { actual: number; target: number; unit?: string }) {
  const color = progressColor(actual, target)
  const pctVal = target > 0 ? (actual / target) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all",
          color === "green" ? "bg-emerald-500" : color === "blue" ? "bg-[#003B95]" : "bg-amber-400"
        )} style={{ width: `${Math.min(pctVal, 100)}%` }} />
      </div>
      <span className={cn("text-xs font-black w-14 text-right",
        color === "green" ? "text-emerald-600" : color === "blue" ? "text-[#003B95]" : "text-amber-600"
      )}>
        {pctVal.toFixed(1)}%
      </span>
    </div>
  )
}

function MetricCard({
  title, icon: Icon, badge, target, actual, unit, note,
  source, children, editContent,
}: {
  title: string; icon: React.ElementType; badge?: React.ReactNode
  target: string; actual: React.ReactNode; unit?: string; note?: string
  source: { table: string; filter?: string; type: "auto" | "manual" }
  children?: React.ReactNode; editContent?: React.ReactNode
}) {
  const [showSource, setShowSource] = useState(false)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-black text-slate-800">{title}</span>
          </div>
          {badge}
        </div>
        <div className="flex items-baseline gap-1.5 mt-3">
          <span className="text-2xl font-black text-slate-900">{actual}</span>
          {unit && <span className="text-sm font-bold text-slate-400">{unit}</span>}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">Target: {target}</div>
      </div>
      <div className="px-5 py-3 space-y-2">
        {children}
        {editContent}
        {note && <p className="text-[11px] text-slate-400 italic">{note}</p>}
        <button onClick={() => setShowSource(v => !v)}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors">
          <Info className="w-3 h-3" />
          {showSource ? "Ẩn nguồn" : "📊 Data Source"}
          {showSource ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showSource && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-[11px] text-slate-500 font-mono space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-black uppercase",
                source.type === "auto" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
              )}>{source.type === "auto" ? "AUTO" : "MANUAL"}</span>
              <span className="font-bold text-slate-600">{source.table}</span>
            </div>
            {source.filter && <div className="text-slate-400 pl-1">{source.filter}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function AutoBadge() {
  return <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">Auto</span>
}
function ManualBadge() {
  return <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 uppercase">Manual</span>
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function MyMetricsInner() {
  const def = currentQuarter()
  const [selQ,    setSelQ]    = useState<"Q3" | "Q4">(def.q)
  const [selYear, setSelYear] = useState(def.year)
  const [auto,    setAuto]    = useState<AutoMetrics | null>(null)
  const [manual,  setManual]  = useState<ManualMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [draft,    setDraft]    = useState<Partial<ManualMetrics>>({})
  const [saving,   setSaving]   = useState(false)

  const targets = TARGETS[selQ]

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [autoRes, manualRes] = await Promise.all([
      fetch(`/api/analytics/my-metrics?quarter=${selQ}&year=${selYear}`),
      fetch(`/api/analytics/my-metrics/manual?quarter=${selQ}&year=${selYear}`),
    ])
    if (autoRes.ok)   setAuto(await autoRes.json())
    if (manualRes.ok) { const d = await manualRes.json(); setManual(d) }
    else setManual(null)
    setLoading(false)
  }, [selQ, selYear])

  useEffect(() => { fetchAll() }, [fetchAll])

  const enterEdit = () => {
    setDraft({
      sla_time:     manual?.sla_time     ?? 0,
      sla_pct:      manual?.sla_pct      ?? 0,
      vendor_speed: manual?.vendor_speed ?? 0,
      gm_baseline:  manual?.gm_baseline  ?? 0,
      gm_actual:    manual?.gm_actual    ?? 0,
    })
    setEditMode(true)
  }

  const hasChanges = useMemo(() => {
    if (!editMode) return false
    return (
      draft.sla_time     !== (manual?.sla_time     ?? 0) ||
      draft.sla_pct      !== (manual?.sla_pct      ?? 0) ||
      draft.vendor_speed !== (manual?.vendor_speed ?? 0) ||
      draft.gm_baseline  !== (manual?.gm_baseline  ?? 0) ||
      draft.gm_actual    !== (manual?.gm_actual    ?? 0)
    )
  }, [editMode, draft, manual])

  const saveManual = async () => {
    if (!hasChanges || saving) return
    setSaving(true)
    const r = await fetch("/api/analytics/my-metrics/manual", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarter: selQ, year: String(selYear), ...draft }),
    })
    if (r.ok) { const j = await r.json(); setManual(j.data); setEditMode(false); setDraft({}) }
    setSaving(false)
  }

  const NumField = ({ field, unit }: { field: keyof ManualMetrics; unit?: string }) => (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        step="0.1"
        min={0}
        value={(draft[field] as number) || ""}
        onChange={e => setDraft(p => ({ ...p, [field]: parseFloat(e.target.value) || 0 }))}
        placeholder="0"
        className="w-24 text-right text-sm font-bold border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {unit && <span className="text-xs text-slate-400">{unit}</span>}
    </div>
  )

  const gmDelta = ((manual?.gm_actual ?? 0) - (manual?.gm_baseline ?? 0))
  const draftGmDelta = ((draft.gm_actual ?? 0) - (draft.gm_baseline ?? 0))

  // Monthly chart data for 3HK
  const hk3Monthly = auto?.hk3.monthly ?? []
  const begauMonthly = auto?.begau.monthly ?? {}

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1400px] mx-auto pb-24 lg:pb-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">My OKR Metrics</h1>
            <p className="text-sm text-slate-500 font-medium italic">
              Báo cáo tiến độ OKR — số liệu rõ nguồn · auto + manual
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quarter selector */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(["Q3", "Q4"] as const).map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={cn("px-4 py-1.5 text-xs font-black rounded-lg transition-all",
                  selQ === q ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {q} {selYear}
              </button>
            ))}
          </div>
          <button onClick={fetchAll} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
            <RefreshCw className={cn("w-4 h-4 text-slate-500", loading && "animate-spin")} />
          </button>
          {editMode ? (
            <>
              <button onClick={() => { setEditMode(false); setDraft({}) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                <XCircle className="w-3.5 h-3.5" /> Hủy
              </button>
              <button onClick={saveManual} disabled={!hasChanges || saving}
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-colors",
                  hasChanges && !saving ? "bg-slate-900 text-white hover:bg-slate-800 shadow-sm" : "bg-slate-100 text-slate-400 cursor-not-allowed")}>
                <Save className="w-3.5 h-3.5" /> {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </>
          ) : (
            <button onClick={enterEdit}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Cập nhật
            </button>
          )}
        </div>
      </div>

      {/* Last updated */}
      {manual?.updated_by && (
        <div className="text-[11px] text-slate-400 italic">
          Manual metrics cập nhật bởi <span className="font-bold">{manual.updated_by}</span>
          {" "} lúc {manual.updated_at?.slice(0, 16).replace("T", " ")}
        </div>
      )}

      {/* ── Section 1: Operational Excellence ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">1</span>
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">Operational Excellence</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* SLA */}
          <MetricCard
            title="Product Request SLA Handling Time"
            icon={Clock}
            badge={<ManualBadge />}
            target={`≤ ${targets.sla_time}h (${targets.sla_pct}% of requests)`}
            actual={
              editMode
                ? <input type="number" step="0.1" min={0} value={(draft.sla_time ?? 0) || ""} onChange={e => setDraft(p => ({ ...p, sla_time: parseFloat(e.target.value) || 0 }))} placeholder="0" className="w-24 text-2xl font-black border-b-2 border-blue-400 focus:outline-none bg-transparent" />
                : (manual?.sla_time ?? "—")
            }
            unit="giờ"
            source={{ table: "Manual entry", type: "manual" }}
          >
            <ProgressBadge
              actual={targets.sla_time > 0 ? Math.max(0, targets.sla_time - (manual?.sla_time ?? targets.sla_time)) : 0}
              target={targets.sla_time}
            />
            {editMode ? (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] text-slate-500">Compliance %:</span>
                <NumField field="sla_pct" unit="%" />
              </div>
            ) : (
              <div className="text-xs text-slate-500 mt-1">
                Compliance: <span className="font-bold text-slate-700">{manual?.sla_pct ?? "—"}%</span>
                <span className="text-slate-400 ml-1">(target: {targets.sla_pct}%)</span>
              </div>
            )}
          </MetricCard>

          {/* Vendor Speed */}
          <MetricCard
            title="Rate Comparison & Vendor Selection Speed"
            icon={TrendingUp}
            badge={<ManualBadge />}
            target={`≤ ${targets.vendor_speed} min / product query`}
            actual={
              editMode
                ? <input type="number" step="0.5" min={0} value={(draft.vendor_speed ?? 0) || ""} onChange={e => setDraft(p => ({ ...p, vendor_speed: parseFloat(e.target.value) || 0 }))} placeholder="0" className="w-24 text-2xl font-black border-b-2 border-blue-400 focus:outline-none bg-transparent" />
                : (manual?.vendor_speed ?? "—")
            }
            unit="phút/query"
            source={{ table: "Manual entry", type: "manual" }}
          >
            <ProgressBadge
              actual={targets.vendor_speed > 0 ? Math.max(0, targets.vendor_speed - (manual?.vendor_speed ?? targets.vendor_speed)) : 0}
              target={targets.vendor_speed}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Help Sales tìm vendor tối ưu nhanh hơn — dùng Bé Gấu + NCC catalog
            </p>
          </MetricCard>
        </div>
      </div>

      {/* ── Section 2: Product Performance ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">2</span>
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">Product Performance</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* 3HK % */}
          <MetricCard
            title="%3HK + Other Datapool Vendor"
            icon={BarChart3}
            badge={<AutoBadge />}
            target={`${targets.hk3_pct}% of Total Company Revenue`}
            actual={loading ? "…" : `${pct(auto?.hk3.pct ?? 0)}`}
            source={{
              table: "gohub_dw · fact_fulfillment_revenue",
              filter: "REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'",
              type: "auto",
            }}
            note={`QTD: ${fck(auto?.hk3.hk3_rev ?? 0)} / ${fck(auto?.hk3.total_rev ?? 0)} tổng revenue`}
          >
            <ProgressBadge actual={auto?.hk3.pct ?? 0} target={targets.hk3_pct} />
            {hk3Monthly.length > 0 && (
              <div className="mt-2 space-y-1">
                {hk3Monthly.map(m => {
                  const mp = m.total_rev > 0 ? (m.hk3_rev / m.total_rev) * 100 : 0
                  return (
                    <div key={m.month} className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-400 w-14">{m.month.slice(5)}</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#003B95] rounded-full" style={{ width: `${Math.min(mp, 100)}%` }} />
                      </div>
                      <span className="font-bold text-slate-600 w-12 text-right">{pct(mp)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </MetricCard>

          {/* SKU GM */}
          <MetricCard
            title="SKU Gross Margin"
            icon={Zap}
            badge={<ManualBadge />}
            target={`+${targets.gm_delta}% GM increase on key/new SKUs`}
            actual={
              editMode
                ? <span className={cn("text-2xl font-black", draftGmDelta >= targets.gm_delta ? "text-emerald-600" : draftGmDelta >= 0 ? "text-[#003B95]" : "text-slate-400")}>
                    {draftGmDelta >= 0 ? "+" : ""}{draftGmDelta.toFixed(2)}%
                  </span>
                : <span className={cn("text-2xl font-black", gmDelta >= targets.gm_delta ? "text-emerald-600" : gmDelta >= 0 ? "text-[#003B95]" : "text-slate-400")}>
                    {manual ? `${gmDelta >= 0 ? "+" : ""}${gmDelta.toFixed(2)}%` : "—"}
                  </span>
            }
            source={{ table: "Manual entry", type: "manual" }}
            note="Delta = GM% actual − GM% baseline"
          >
            <ProgressBadge
              actual={editMode ? Math.max(0, draftGmDelta) : Math.max(0, gmDelta)}
              target={targets.gm_delta}
            />
            {editMode ? (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Baseline GM%</label>
                  <NumField field="gm_baseline" unit="%" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actual GM%</label>
                  <NumField field="gm_actual" unit="%" />
                </div>
              </div>
            ) : (
              <div className="flex gap-4 mt-1 text-[11px]">
                <span className="text-slate-400">Baseline: <strong className="text-slate-600">{manual?.gm_baseline ?? "—"}%</strong></span>
                <span className="text-slate-400">Actual: <strong className="text-slate-600">{manual?.gm_actual ?? "—"}%</strong></span>
              </div>
            )}
          </MetricCard>
        </div>
      </div>

      {/* ── Section 3: BI & AI Automation ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[10px] font-black">3</span>
          <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">
            BI & AI Automation <span className="text-slate-400 font-normal normal-case">(weight 30%)</span>
          </h2>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Bot className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-black text-slate-800">Tasks Completed via Bé Gấu</span>
                  <AutoBadge />
                </div>
                <div className="flex items-baseline gap-1.5 mt-3">
                  <span className={cn("text-4xl font-black",
                    (auto?.begau.total ?? 0) >= targets.begau ? "text-emerald-600"
                    : (auto?.begau.total ?? 0) >= targets.begau * 0.75 ? "text-[#003B95]"
                    : "text-slate-900"
                  )}>
                    {loading ? "…" : (auto?.begau.total ?? 0).toLocaleString()}
                  </span>
                  <span className="text-lg text-slate-400 font-bold">/ {targets.begau.toLocaleString()}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Target {selQ}: {targets.begau} successful tasks per quarter</div>
              </div>
              <div className="text-right space-y-1 shrink-0">
                <div className="text-[11px] text-slate-500">Web: <span className="font-black text-slate-700">{auto?.begau.web ?? 0}</span></div>
                <div className="text-[11px] text-slate-500">Lark: <span className="font-black text-slate-700">{auto?.begau.lark ?? 0}</span></div>
              </div>
            </div>

            <div className="mt-4">
              <ProgressBadge actual={auto?.begau.total ?? 0} target={targets.begau} />
            </div>

            {/* Monthly breakdown */}
            {Object.keys(begauMonthly).length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {Object.entries(begauMonthly).sort(([a],[b]) => a.localeCompare(b)).map(([month, data]) => (
                  <div key={month} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{month.slice(5)}</p>
                    <p className="text-xl font-black text-slate-900">{data.total}</p>
                    <p className="text-[10px] text-slate-400">Web {data.web} · Lark {data.lark}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Source */}
            <div className="mt-4 bg-slate-50 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-500 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-blue-100 text-blue-700">AUTO</span>
                <span className="font-bold text-slate-600">Supabase · app_usage_events</span>
              </div>
              <div className="text-slate-400 pl-1">event_type = 'chat' AND ai_response IS NOT NULL</div>
              <div className="text-slate-400 pl-1">created_at BETWEEN {auto?.start ?? "…"} AND {auto?.end ?? "…"}</div>
              <div className="text-slate-400 pl-1">Lark: user_email LIKE 'lark:%' · Web: ngược lại</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MyMetricsPage() {
  return <Suspense><MyMetricsInner /></Suspense>
}
