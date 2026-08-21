"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { RefreshCw, Save, Building2, ShoppingBag, TrendingUp, ChevronRight, ChevronDown, Search, Users, CalendarDays, Pencil, Plus, X, Trash2, Settings2, Upload, FileDown, Shield, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { useRoleGuard } from "@/lib/use-role-guard"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthStats {
  revenue: number; gp: number; gpPct: number
  channelCost: number; groupCost: number; cm1: number; cm1Pct: number
  hk3Pct?: number; hk3Rev?: number
  actualRevenue?: number; actualGp?: number; actualCc?: number; actualGc?: number; actualCm1?: number; actualHk3?: number
}
interface MonthSummary {
  month: string; isProjected: boolean; factor: number; elapsed: number; dim: number
  hk3Pct: number; hk3Rev: number; actualHk3: number
  total: MonthStats; b2b: MonthStats; b2c: MonthStats
}
interface ChannelMonth {
  month: string; revenue: number; gp: number
  channelCost: number; cm1: number; cm1Pct: number; momPct: number | null
  three_hk_rev?: number; three_hk_pct?: number
  isProjected?: boolean
  actualRevenue?: number; actualGp?: number; actualCc?: number; actualCm1?: number
}
interface Channel { name: string; totalRevenue: number; months: ChannelMonth[] }
interface QReport {
  quarter: string; year: number; months: string[]
  summary: MonthSummary[]
  quarterTotal: MonthStats & { hk3Pct: number; b2b: MonthStats; b2c: MonthStats }
  prevQuarterTotals?: { b2bRevenue: number; b2bGp: number; b2bCm1: number; b2cRevenue: number; b2cGp: number; b2cCm1: number }
  b2bChannels: Channel[]; b2cChannels: Channel[]
  elapsed_days: number; quarter_days: number
}
interface Targets { b2bRev: number; b2bCm1: number; b2bThk: number; b2cRev: number; b2cCm1: number; b2cThk: number }

const EMPTY_TARGETS: Targets = { b2bRev: 0, b2bCm1: 0, b2bThk: 0, b2cRev: 0, b2cCm1: 0, b2cThk: 0 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Hiển thị số đầy đủ với dấu phân cách hàng nghìn (vi-VN: dấu chấm)
const fc  = (n: number) => Math.round(n).toLocaleString("vi-VN")
const pct = (v: number) => `${v.toFixed(1)}%`

function parseFmt(s: string): number { return parseFloat(s.replace(/[^\d.-]/g, "")) || 0 }
function fmtInput(n: number): string { return n > 0 ? Math.round(n).toLocaleString("vi-VN") : "" }

const cm1Color  = (v: number) => v >= 0 ? "text-blue-700" : "text-red-600"
const momColor  = (v: number | null) => v == null ? "text-slate-400" : v >= 0 ? "text-green-600" : "text-red-500"
const prColor   = "text-slate-500"

// ─── KPI Progress Card — big % = PR CM1/Target, 3-row table (Rev/CM1/3HK) ────
// Dùng số compact ("18.7 Tỷ") thay số đầy đủ để tránh chồng lấn trong grid.

const fck = (n: number) => formatCompactNumber(n)  // compact cho card (tránh overflow)

function KpiCard({ label, icon: Icon, actual, prRev, target, cm1Actual, prCm1, cm1Target, hk3Pct, hk3Rev = 0, hk3Target, expectedPct = 0, accent = "#003B95" }:
  { label: string; icon: React.ElementType; actual: number; prRev: number; target: number; cm1Actual: number; prCm1: number; cm1Target: number; hk3Pct: number; hk3Rev?: number; hk3Target: number; expectedPct?: number; accent?: string }) {

  const cm1PrPct = cm1Target > 0 ? (prCm1 / cm1Target) * 100 : 0
  const revPrPct = target    > 0 ? (prRev / target)    * 100 : 0

  const colorFor = (p: number) =>
    p >= 100 ? "text-green-600" : (expectedPct > 0 ? p >= expectedPct : p >= 75) ? "text-[#003B95]" : "text-amber-600"

  const badge = (p: number) => (
    <span className={cn("px-1 py-0.5 rounded text-[10px] font-bold tabular-nums whitespace-nowrap",
      p >= 100 ? "bg-green-100 text-green-700"
               : (expectedPct > 0 ? p >= expectedPct : p >= 75) ? "bg-blue-100 text-[#003B95]"
               : "bg-amber-50 text-amber-600")}>
      {pct(p)}
    </span>
  )

  return (
    <div className="relative bg-white border border-slate-200 rounded-xl p-5 overflow-hidden shadow-sm">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accent }} />

      {/* Header: icon + label + big CM1% */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${accent}1a` }}>
            <Icon className="w-4 h-4" style={{ color: accent }} />
          </div>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-tight">
            {label}<br /><span className="text-slate-400 font-semibold">CM1 Progress</span>
          </span>
        </div>
        <span className={cn("text-3xl font-extrabold tabular-nums", colorFor(cm1PrPct))}>
          {cm1Target > 0 ? pct(cm1PrPct) : "—"}
        </span>
      </div>

      {/* Progress bar: PR CM1 / Target CM1 */}
      <div className="relative h-2 bg-slate-100 rounded-full mb-3">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(Math.max(cm1PrPct, 0), 100)}%`, background: accent }} />
        {expectedPct > 0 && (
          <div className="absolute -top-1 -bottom-1 w-[2px] bg-slate-700 rounded"
            style={{ left: `${Math.min(expectedPct, 100)}%` }}
            title={`Kỳ vọng pro-rata: ${pct(expectedPct)}`} />
        )}
      </div>

      {/* Table: 2 hàng header + 3 hàng data — mỗi hàng: label | Actual | Pro-rata | Target | % */}
      <div className="text-[10px]">
        {/* Header */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_36px] gap-x-1.5 mb-1 pb-1 border-b border-slate-100">
          <span />
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">Actual</span>
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">Pro-rata</span>
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">Target</span>
          <span className="text-right font-bold text-slate-400 uppercase tracking-wide">%</span>
        </div>
        {/* Revenue */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_36px] gap-x-1.5 py-1 border-b border-slate-50 items-center">
          <span className="font-bold text-slate-400 uppercase text-[9px]">Rev</span>
          <span className="text-right text-slate-700 font-semibold tabular-nums">{fck(actual)}</span>
          <span className="text-right text-slate-600 tabular-nums">{fck(prRev)}</span>
          <span className="text-right text-slate-500 tabular-nums">{target > 0 ? fck(target) : "—"}</span>
          <span className="text-right">{target > 0 ? badge(revPrPct) : <span className="text-slate-300">—</span>}</span>
        </div>
        {/* CM1 */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_36px] gap-x-1.5 py-1 border-b border-slate-50 items-center">
          <span className="font-bold text-slate-400 uppercase text-[9px]">CM1</span>
          <span className={cn("text-right font-semibold tabular-nums", cm1Color(cm1Actual))}>{fck(cm1Actual)}</span>
          <span className={cn("text-right tabular-nums", cm1Color(prCm1))}>{fck(prCm1)}</span>
          <span className="text-right text-slate-500 tabular-nums">{cm1Target > 0 ? fck(cm1Target) : "—"}</span>
          <span className="text-right">{cm1Target > 0 ? badge(cm1PrPct) : <span className="text-slate-300">—</span>}</span>
        </div>
        {/* 3HK% + 3HK Rev */}
        <div className="grid grid-cols-[36px_1fr_1fr_1fr_36px] gap-x-1.5 py-1 items-center">
          <span className="font-bold text-slate-400 uppercase text-[9px]">3HK</span>
          <span className="text-right text-slate-700 font-semibold tabular-nums">
            {hk3Rev > 0 && <span className="block text-[10px]">{fck(hk3Rev)}</span>}
            <span className="text-slate-500 font-normal">{pct(hk3Pct)}</span>
          </span>
          <span className="text-right text-slate-300">—</span>
          <span className="text-right text-slate-500 tabular-nums">{hk3Target > 0 ? pct(hk3Target) : "—"}</span>
          <span className="text-right text-slate-300">—</span>
        </div>
      </div>
    </div>
  )
}

// ─── Table header row ─────────────────────────────────────────────────────────

const TH_COLS: { label: string; tip: string }[] = [
  { label: "Tháng",        tip: "Tháng trong quý (T7, T8, T9)" },
  { label: "Revenue",      tip: "Doanh thu thực tế (Đạt TT)\nNguồn: gohub_dw SUM(fulfilled_revenue_amount_vnd)\nfilter: fulfiled_date trong kỳ" },
  { label: "PR Rev",       tip: "Revenue chiếu cả tháng (Đạt PR)\nCT: Revenue_TT × factor\nfactor = ngày_trong_tháng / ngày_đã_trôi_qua\nChỉ hiện khi elapsed ≥ 7 ngày" },
  { label: "Gross Margin", tip: "GP = Revenue - COGS (thực tế)\nNguồn: gohub_dw SUM(gross_profit_vnd)" },
  { label: "GM%",          tip: "GP / Revenue × 100%\nDùng số thực tế (actual)\nNếu tháng đang chiếu: GP_act / Rev_act" },
  { label: "Channel Cost", tip: "Chi phí kênh (thực tế)\nNguồn: Supabase analytics_channel_costs\namount → × dayRatio (ngày_trong_kỳ / ngày_trong_tháng)\npercent → × Revenue thực tế" },
  { label: "Group Cost",   tip: "Chi phí nhóm B2B/B2C (thực tế)\nNguồn: Supabase analytics_channel_group_costs\nTháng đang chạy (< 7 ngày): × (elapsed/dim)\nTháng đang chiếu: full budget\nTháng hoàn thành: full budget" },
  { label: "CM1",          tip: "CM1 = GP - Channel Cost - Group Cost (thực tế)\nSố thực (actual): elapsed=0..dim-1\nActual = GP_act - CC_act - GC_act" },
  { label: "PR CM1",       tip: "CM1 chiếu cả tháng\nCT: CM1_actual × factor\nChỉ hiện khi elapsed ≥ 7 ngày\nfactor = dim / elapsed" },
  { label: "CM1%",         tip: "CM1 / Revenue × 100%\nDùng CM1 thực tế / Revenue thực tế" },
  { label: "%QoQ CM1",     tip: "So sánh CM1 PR quý này vs CM1 TT quý trước\nCT: (CM1_PR_Q_này - CM1_TT_Q_trước) / |CM1_TT_Q_trước|\nCùng hàng cho tất cả tháng (quarter-level)" },
  { label: "3HK%",         tip: "Doanh thu 3HK / Tổng Revenue × 100%\nNguồn: dim_sku WHERE vendor='3HKDATAPOOL'" },
]

const QT_COLS: { label: string; tip: string }[] = [
  { label: "Chỉ số Quý", tip: "Chỉ số tổng hợp cả quý" },
  { label: "Revenue",    tip: "Tổng Revenue thực tế\n= Σ(Revenue_tháng_actual)" },
  { label: "Proj.Rev",   tip: "Revenue chiếu cả quý\n= Σ(Rev_actual_tháng × kpiPrFactor)\nkpiPrFactor: dim/elapsed (tháng chưa xong), 1 (tháng xong)" },
  { label: "GP",         tip: "Tổng GP thực tế\n= Σ(GP_tháng_actual)" },
  { label: "GP%",        tip: "GP / Revenue (actual)" },
  { label: "Ch.Cost",    tip: "Tổng Channel Cost thực tế\n= Σ(CC_tháng_actual)" },
  { label: "Gr.Cost",    tip: "Tổng Group Cost thực tế\n= Σ(GC_tháng_actual)\nPro-rata theo số ngày tháng đang chạy" },
  { label: "CM1",        tip: "CM1 thực tế = GP - Ch.Cost - Gr.Cost (actual)" },
  { label: "Proj.CM1",   tip: "CM1 chiếu cả quý\n= Σ(CM1_actual_tháng × kpiPrFactor)\nkpiPrFactor: dim/elapsed (tháng chưa xong), 1 (tháng xong)" },
  { label: "CM1%",       tip: "CM1 / Revenue (actual) × 100%" },
  { label: "3HK%",       tip: "3HK Revenue / Total Revenue × 100% (actual)" },
  { label: "QoQ",        tip: "QoQ(CM1) = (CM1_PR_quý_này - CM1_TT_quý_trước) / |CM1_TT_quý_trước|\nDùng Proj.CM1 quý này vs CM1 actual quý trước" },
]

function TableHead({ cols, compact = false }: { cols: { label: string; tip?: string }[]; compact?: boolean }) {
  return (
    <tr className="bg-[#003B95]">
      {cols.map((col, i) => {
        const h = col.label
        const tip = col.tip
        return (
          <th key={h} className={cn(
            compact ? "px-2 py-2" : "px-4 py-2.5",
            "text-[10px] font-semibold text-slate-300 uppercase tracking-wider whitespace-nowrap",
            i === 0 ? "text-left" : "text-right"
          )}>
            {h}{tip && <ColInfo tip={tip} />}
          </th>
        )
      })}
    </tr>
  )
}

// ─── ColInfo — tooltip công thức cột ──────────────────────────────────────────
// Dùng createPortal + position:fixed để thoát overflow-hidden của parent container.
function ColInfo({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const show = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.top - 6, left: r.left + r.width / 2 })
    }
    setOpen(true)
  }

  return (
    <span className="inline-flex items-center align-middle ml-1">
      <button
        ref={btnRef}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onClick={e => { e.stopPropagation(); if (!open) show(); else setOpen(false) }}
        className="w-3 h-3 rounded-full bg-blue-400/25 text-[7px] font-black text-blue-200 hover:bg-blue-400/60 transition-colors inline-flex items-center justify-center leading-none select-none"
      >i</button>
      {open && typeof window !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, -100%)", zIndex: 9999 }}
          className="w-56 bg-slate-900 text-white text-[10px] rounded-lg shadow-2xl p-2.5 leading-relaxed whitespace-pre-line pointer-events-none"
        >
          {tip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>,
        document.body,
      )}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QuarterlyPage() {
  const { ready } = useRoleGuard(["admin", "creator", "bod", "b2b", "b2c", "staff"])
  if (!ready) return null
  return <QuarterlyContent />
}

function QuarterlyContent() {
  const today = new Date()
  const [selQ, setSelQ]       = useState(`Q${Math.ceil((today.getMonth() + 1) / 3)}`)
  const [selYear, setSelYear] = useState(today.getFullYear())
  const [includeShip,        setIncludeShip]        = useState(false)
  const [includeInternalOps, setIncludeInternalOps] = useState(false)
  const [report, setReport]   = useState<QReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null)
  const [targets, setTargets] = useState<Targets>(EMPTY_TARGETS)
  const [tgtInputs, setTgtInputs] = useState({ b2bRev: "", b2bCm1: "", b2bThk: "", b2cRev: "", b2cCm1: "", b2cThk: "" })
  const [expandB2B, setExpandB2B] = useState(true)
  const [expandB2C, setExpandB2C] = useState(false)
  const [b2bRegion, setB2bRegion] = useState<"ALL" | "VN" | "US">("ALL")
  const [companyCode, setCompanyCode] = useState<"ALL" | "VN" | "US">("ALL")
  const setTenantFilter = (code: "ALL" | "VN" | "US") => { setCompanyCode(code); setB2bRegion(code) }
  const [b2bTiers, setB2bTiers]   = useState<any>(null)
  const [b2bTiersLoading, setB2bTiersLoading] = useState(false)
  const [userRole, setUserRole] = useState<string>("")
  const [editTarget, setEditTarget] = useState(false)
  const [tgtSnapshot, setTgtSnapshot] = useState<Record<string, string> | null>(null)

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  // Role: quyền sửa chi phí/target (admin/creator) + cột nhạy cảm chỉ creator
  useEffect(() => {
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.role) setUserRole(String(d.role))
    }).catch(() => {})
  }, [])
  const canEditCost  = ["admin", "creator", "bod", "b2b", "b2c", "staff"].includes(userRole)
  const isCreator    = userRole === "creator"
  const canEditSettings = ["admin", "creator"].includes(userRole)

  // ── Settings (tier keywords + excluded customers) — chỉ admin/creator ──
  const [qSettings, setQSettings] = useState<{ excludedCustomers: string[]; tierKeywords: Record<string, string[]> } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [newExcluded, setNewExcluded] = useState("")
  const [custSuggestions, setCustSuggestions] = useState<{code: string; name: string}[]>([])
  const [loadingSugg, setLoadingSugg] = useState(false)

  // ── Squad Progress ──
  const [activeSection, setActiveSection]  = useState<"overview" | "squad">("overview")
  const [squadData,     setSquadData]      = useState<any>(null)
  const [squadLoading,  setSquadLoading]   = useState(false)
  const [squadConfig,   setSquadConfig]    = useState<{ squads: { name: string; leader?: string; sales_pics: string[] }[] } | null>(null)
  const [squadUsers,    setSquadUsers]     = useState<{ username: string; name: string; role: string }[]>([])
  const [editingSquad,  setEditingSquad]   = useState(false)
  const [draftSquads,   setDraftSquads]    = useState<{ name: string; leader: string; sales_pics: string[] }[]>([])
  const [savingSquad,   setSavingSquad]    = useState(false)
  const [squadMsg,      setSquadMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const [expandedSquads, setExpandedSquads] = useState<Set<number>>(new Set())
  // Filters
  const [sqSearch,       setSqSearch]       = useState("")
  const [sqFilterRegion, setSqFilterRegion] = useState<"ALL"|"VN"|"US">("ALL")
  const [sqFilterTier,   setSqFilterTier]   = useState<string>("ALL")
  const [sqFilterPic,    setSqFilterPic]    = useState<string>("ALL")
  const [sqFilterRisk,   setSqFilterRisk]   = useState<string>("ALL")
  const [sqFilterSquad,  setSqFilterSquad]  = useState<string>("ALL")
  const [sqSortCol,      setSqSortCol]      = useState<string>("risk_level")
  const [sqSortDir,      setSqSortDir]      = useState<"asc"|"desc">("asc")
  // Squad targets (theo quý)
  const [editingTargets, setEditingTargets] = useState(false)
  const [draftTargets,   setDraftTargets]   = useState<Record<string, { rev: string; cm1: string; hk3rev: string }>>({})
  const [savingTargets,  setSavingTargets]  = useState(false)

  const RISK_ORDER = ["danger_high","danger_low","safe_low","safe","very_safe","no_target"]
  const [showMonthBreakdown, setShowMonthBreakdown] = useState(false)
  const [targetCardOpen, setTargetCardOpen] = useState(false)

  const notifySquad = (ok: boolean, text: string) => { setSquadMsg({ ok, text }); setTimeout(() => setSquadMsg(null), 3000) }

  // Load squad config + users khi mở tab
  useEffect(() => {
    if (activeSection !== "squad") return
    fetch("/api/config/squad-config").then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setSquadConfig({ squads: d.squads ?? [] })
        setSquadUsers(d.users ?? [])
      }
    })
  }, [activeSection])

  const exportSquadProgress = async () => {
    if (!squadData?.squads?.length) return
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()
    const squadRows = squadData.squads.map((sq: any) => ({
      Squad: sq.name, Leader: sq.leader || "", "Số KH": sq.customer_count,
      "Revenue Actual": sq.revenue, "Revenue PR": sq.revenue_pr, "Target Revenue": sq.target_rev || "",
      "%TGT Rev": sq.rev_pct != null ? `${sq.rev_pct}%` : "",
      "CM1 Actual": sq.cm1, "CM1 PR": sq.cm1_pr, "CM1%": sq.cm1_pct != null ? `${sq.cm1_pct}%` : "", "Target CM1": sq.target_cm1 || "",
      "%TGT CM1": sq.cm1_tgt_pct != null ? `${sq.cm1_tgt_pct}%` : "",
      "3HK Rev": sq.hk3, "3HK%": `${sq.hk3_pct}%`, "Target 3HK Rev": sq.target_hk3 || "",
      "%TGT 3HK": sq.hk3_tgt_pct != null ? `${sq.hk3_tgt_pct}%` : "",
      "Rất an toàn": sq.risk_counts?.very_safe || 0, "An toàn": sq.risk_counts?.safe || 0,
      "An toàn ít": sq.risk_counts?.safe_low || 0, "Nguy hiểm ít": sq.risk_counts?.danger_low || 0,
      "Nguy hiểm nhiều": sq.risk_counts?.danger_high || 0, "Chưa target": sq.risk_counts?.no_target || 0,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(squadRows), "Squad Summary")
    const custRows = squadData.squads.flatMap((sq: any) =>
      (sq.customers ?? []).map((c: any) => {
        const picInfo = squadData.available_pics?.find((p: any) => p.code === c.sales_pic)
        return {
          Squad: sq.name, Leader: sq.leader || "", "Mã KH": c.customer_code, "Tên KH": c.customer_name,
          Region: c.region, Tier: c.tier, PIC: picInfo?.name || c.sales_pic || "",
          "Revenue Actual": c.revenue, "Revenue PR": c.revenue_pr, "Target Revenue": c.target_rev || "",
          "%TGT Rev": c.rev_pct != null ? `${c.rev_pct}%` : "",
          "CM1 PR": c.cm1_pr, "CM1%": c.cm1_pct != null ? `${c.cm1_pct}%` : "", "Target CM1": c.target_cm1 || "",
          "%TGT CM1": c.cm1_tgt_pct != null ? `${c.cm1_tgt_pct}%` : "",
          "3HK%": `${c.hk3_pct}%`, "Target 3HK%": c.target_hk3pct > 0 ? `${c.target_hk3pct}%` : "",
          "%TGT 3HK": c.hk3_tgt_pct != null ? `${c.hk3_tgt_pct}%` : "",
          "Đánh giá": RISK_META[c.risk_level as keyof typeof RISK_META]?.label || c.risk_level,
        }
      })
    )
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custRows), "Customer Detail")
    XLSX.writeFile(wb, `squad_progress_${selQ}_${selYear}.xlsx`)
  }

  const fetchSquadProgress = useCallback(async () => {
    setSquadLoading(true)
    setExpandedSquads(new Set())
    try {
      const params = new URLSearchParams({ quarter: selQ, year: String(selYear), companyCode })
      const res = await fetch(`/api/analytics/squad-progress?${params}`)
      if (res.ok) setSquadData(await res.json())
      else notifySquad(false, "Lỗi tải dữ liệu squad")
    } catch { notifySquad(false, "Lỗi kết nối") }
    finally { setSquadLoading(false) }
  }, [selQ, selYear, companyCode])

  useEffect(() => {
    if (activeSection === "squad") fetchSquadProgress()
  }, [activeSection, selQ, selYear, companyCode, fetchSquadProgress])

  const saveSquadConfig = async () => {
    setSavingSquad(true)
    try {
      const r = await fetch("/api/config/squad-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squads: draftSquads }),
      })
      let d: any = {}
      try { d = await r.json() } catch { /* non-JSON response */ }
      if (r.ok) {
        setSquadConfig({ squads: draftSquads })
        setEditingSquad(false)
        notifySquad(true, "Đã lưu cấu hình squad")
        fetchSquadProgress()
      } else notifySquad(false, d.error || `Lỗi ${r.status}: ${r.statusText}`)
    } catch (e: any) { notifySquad(false, `Lỗi kết nối: ${e.message}`) }
    finally { setSavingSquad(false) }
  }

  // Mở form nhập target: seed draft từ manual_target hiện có của mỗi squad
  const openEditTargets = () => {
    const seed: Record<string, { rev: string; cm1: string; hk3rev: string }> = {}
    for (const sq of (squadData?.squads ?? [])) {
      const mt = sq.manual_target ?? {}
      seed[sq.name] = {
        rev:    mt.rev    > 0 ? String(mt.rev)    : "",
        cm1:    mt.cm1    > 0 ? String(mt.cm1)    : "",
        hk3rev: mt.hk3rev > 0 ? String(mt.hk3rev) : "",
      }
    }
    setDraftTargets(seed)
    setEditingTargets(true)
  }

  const saveSquadTargets = async () => {
    setSavingTargets(true)
    try {
      const targets: Record<string, { rev: number; cm1: number; hk3rev: number }> = {}
      for (const [name, t] of Object.entries(draftTargets)) {
        targets[name] = {
          rev:    Math.round(Number(t.rev)    || 0),
          cm1:    Math.round(Number(t.cm1)    || 0),
          hk3rev: Math.round(Number(t.hk3rev) || 0),
        }
      }
      const r = await fetch("/api/analytics/squad-targets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarter: selQ, year: selYear, targets }),
      })
      let d: any = {}
      try { d = await r.json() } catch {}
      if (r.ok) {
        setEditingTargets(false)
        notifySquad(true, `Đã lưu target squad ${selQ} ${selYear}`)
        fetchSquadProgress()
      } else notifySquad(false, d.error || `Lỗi ${r.status}`)
    } catch (e: any) { notifySquad(false, `Lỗi kết nối: ${e.message}`) }
    finally { setSavingTargets(false) }
  }

  const RISK_META: Record<string, { label: string; color: string; bg: string }> = {
    very_safe:  { label: "Rất an toàn",    color: "text-emerald-700", bg: "bg-emerald-100" },
    safe:       { label: "An toàn",         color: "text-green-700",   bg: "bg-green-100"   },
    safe_low:   { label: "An toàn ít",      color: "text-yellow-700",  bg: "bg-yellow-100"  },
    danger_low: { label: "Nguy hiểm ít",    color: "text-orange-700",  bg: "bg-orange-100"  },
    danger_high:{ label: "Nguy hiểm nhiều", color: "text-red-700",     bg: "bg-red-100"     },
    no_target:  { label: "Chưa có target",  color: "text-slate-500",   bg: "bg-slate-100"   },
  }

  useEffect(() => {
    if (!canEditSettings) return
    fetch("/api/analytics/quarterly-settings").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setQSettings(d)
    }).catch(() => {})
  }, [canEditSettings])

  const saveSettings = async () => {
    if (!qSettings) return
    setSavingSettings(true)
    try {
      const res = await fetch("/api/analytics/quarterly-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(qSettings),
      })
      if (res.ok) {
        setSettingsDirty(false)
        notify(true, "Đã lưu cài đặt. Bấm \"Tải lại\" để áp dụng.")
      } else notify(false, "Lưu thất bại")
    } catch { notify(false, "Lỗi kết nối") }
    finally { setSavingSettings(false) }
  }

  const updateSettings = (patch: Partial<typeof qSettings>) => {
    setQSettings(prev => prev ? { ...prev, ...patch } : null)
    setSettingsDirty(true)
  }

  const fetchReport = useCallback(async (refresh = false) => {
    setLoading(true)
    // Abort sau 65s để FE KHÔNG treo loading vô hạn nếu server 504/hang → hiện lỗi rõ ràng.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 65000)
    try {
      const qParams = new URLSearchParams({ quarter: selQ, year: String(selYear), companyCode })
      if (refresh)           qParams.set("nocache", "1")
      if (includeShip)       qParams.set("includeShip", "1")
      if (includeInternalOps) qParams.set("includeInternalOps", "1")
      const res = await fetch(`/api/analytics/quarterly-report?${qParams}`, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`${res.status}`)
      setReport(await res.json())
    } catch (e: any) {
      notify(false, e.name === "AbortError" ? "Tải dữ liệu quá lâu (>65s) — thử bấm 'Tải lại mới' hoặc đợi giây lát" : `Lỗi tải dữ liệu: ${e.message}`)
    } finally { clearTimeout(timer); setLoading(false) }
  }, [selQ, selYear, includeShip, includeInternalOps, companyCode])

  const loadTargets = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/quarterly-targets?quarter=${selQ}&year=${selYear}`)
      if (res.ok) {
        const d = await res.json()
        const t: Targets = d.targets ?? EMPTY_TARGETS
        setTargets(t)
        setTgtInputs({ b2bRev: fmtInput(t.b2bRev), b2bCm1: fmtInput(t.b2bCm1), b2bThk: t.b2bThk > 0 ? t.b2bThk.toString() : "", b2cRev: fmtInput(t.b2cRev), b2cCm1: fmtInput(t.b2cCm1), b2cThk: t.b2cThk > 0 ? t.b2cThk.toString() : "" })
      }
    } catch {}
  }, [selQ, selYear])

  const fetchB2BTiers = useCallback(async (refresh = false) => {
    if (!refresh) setB2bTiers(null)
    setB2bTiersLoading(true)
    try {
      // Không truyền region — server trả đủ VN+US, filter ALL/VN/US xử lý client-side (tức thì, không re-fetch)
      // PHẢI truyền includeShip/includeInternalOps để tier B2B khớp summary (cùng loại/gồm phí ship + nội bộ).
      const tp = new URLSearchParams({ quarter: selQ, year: String(selYear), companyCode: "ALL" })
      if (refresh)            tp.set("refresh", "1")
      if (includeShip)        tp.set("includeShip", "1")
      if (includeInternalOps) tp.set("includeInternalOps", "1")
      const res = await fetch(`/api/analytics/quarterly-b2b-customers?${tp}`)
      if (res.ok) setB2bTiers(await res.json())
    } catch {} finally { setB2bTiersLoading(false) }
  }, [selQ, selYear, includeShip, includeInternalOps])

  const refreshAll = useCallback(async () => {
    // Xóa L2 Supabase cache quarterly trước, sau đó fetch fresh
    await fetch("/api/analytics/quarterly-cache-flush", { method: "POST" }).catch(() => {})
    await Promise.all([fetchReport(true), fetchB2BTiers(true)])
    notify(true, "Đã tải lại dữ liệu mới nhất từ database")
  }, [fetchReport, fetchB2BTiers])

  useEffect(() => { fetchReport(); loadTargets() }, [fetchReport, loadTargets])
  useEffect(() => { fetchB2BTiers() }, [fetchB2BTiers])

  const saveTargets = async () => {
    const t: Targets = { b2bRev: parseFmt(tgtInputs.b2bRev), b2bCm1: parseFmt(tgtInputs.b2bCm1), b2bThk: parseFloat(tgtInputs.b2bThk) || 0, b2cRev: parseFmt(tgtInputs.b2cRev), b2cCm1: parseFmt(tgtInputs.b2cCm1), b2cThk: parseFloat(tgtInputs.b2cThk) || 0 }
    setSaving(true)
    try {
      const res = await fetch("/api/analytics/quarterly-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quarter: selQ, year: selYear, targets: t }) })
      if (res.ok) { setTargets(t); setEditTarget(false); setTgtSnapshot({ ...tgtInputs }); notify(true, "Đã lưu target — đang tải lại…"); refreshAll() } else notify(false, "Lưu thất bại")
    } catch { notify(false, "Lỗi kết nối") }
    finally { setSaving(false) }
  }
  const startEditTarget  = () => { setTgtSnapshot({ ...tgtInputs }); setEditTarget(true) }
  const cancelEditTarget = () => { if (tgtSnapshot) setTgtInputs(tgtSnapshot as any); setEditTarget(false) }
  const targetDirty = editTarget && tgtSnapshot != null && JSON.stringify(tgtInputs) !== JSON.stringify(tgtSnapshot)

  const years   = [today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2]
  const quarters = ["Q1", "Q2", "Q3", "Q4"]
  const summary  = report?.summary ?? []
  const qt       = report?.quarterTotal

  // MoM: so sánh tháng hiện tại vs tháng trước trong cùng quý
  const momData = useMemo(() => {
    const chg = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : null
    return summary.map((m, i) => {
      if (i === 0) return { rev: null as number | null, cm1: null as number | null, b2bRev: null as number | null, b2bCm1: null as number | null, b2cRev: null as number | null, b2cCm1: null as number | null }
      const p = summary[i - 1]
      const aR   = m.total.actualRevenue ?? m.total.revenue
      const pR   = p.total.actualRevenue ?? p.total.revenue
      const aC   = m.total.actualCm1 ?? m.total.cm1
      const pC   = p.total.actualCm1 ?? p.total.cm1
      return {
        rev:    chg(aR, pR),
        cm1:    chg(aC, pC),
        b2bRev: chg(m.b2b.actualRevenue ?? m.b2b.revenue, p.b2b.actualRevenue ?? p.b2b.revenue),
        b2bCm1: chg(m.b2b.actualCm1 ?? m.b2b.cm1, p.b2b.actualCm1 ?? p.b2b.cm1),
        b2cRev: chg(m.b2c.actualRevenue ?? m.b2c.revenue, p.b2c.actualRevenue ?? p.b2c.revenue),
        b2cCm1: chg(m.b2c.actualCm1 ?? m.b2c.cm1, p.b2c.actualCm1 ?? p.b2c.cm1),
      }
    })
  }, [summary])
  const activeMonths = summary.map(m => m.month)

  // ── Reference computeSummary() logic (gohub.html) ─────────────────────────
  // qFactor = quarter_days / elapsed_days — dùng để project từ thực tế → cả quý
  const qElapsed = report?.elapsed_days ?? 0
  const qTotal   = report?.quarter_days ?? 92
  const qFactor  = qElapsed > 0 ? qTotal / qElapsed : 1
  const expectedPct = qTotal > 0 ? qElapsed / qTotal * 100 : 0  // kỳ vọng pro-rata cho marker KPI

  // KPI card PRO-RATA: project mọi tháng đang chạy kể cả < MIN_PROJECT_DAYS.
  // Khác bảng tháng (chỉ project khi >= 7 ngày để tránh nhảy số).
  // kpiPrFactor: dim/elapsed cho tháng chưa xong; 1 cho tháng xong/tương lai.
  const kpiPrFactor = (m: MonthSummary): number =>
    m.elapsed > 0 && m.elapsed < m.dim ? m.dim / m.elapsed : 1

  // ── ƯỚC TÍNH THÁNG TƯƠNG LAI (T9) trong Tổng Quý ──────────────────────────────
  // Số liệu tổng quý PR phải gồm ước tính các tháng CHƯA TỚI (không có trong summary).
  // CT: T9_est = (Σ per-month projected của tháng đã có) / (Σ ngày tháng đã có) × (Σ ngày tháng tương lai)
  //   → quarter_estimate = existing_projected × (quarter_days / existing_days)
  //   (existing_projected = actual T7 + prorata T8; existing_days = 31+31; quarter_days = 92)
  // Áp cho MỌI số liệu absolute (Rev/GM/Cost/CM1/3HK). Tỉ lệ (%) không đổi vì tử & mẫu cùng scale.
  const existingDays = summary.reduce((s, m) => s + m.dim, 0)
  const quarterDays  = report?.quarter_days ?? existingDays
  const futureScale  = existingDays > 0 ? quarterDays / existingDays : 1

  // PROJECTION THỐNG NHẤT (#1): PR = tổng per-month projected (m.b2b.revenue: tháng xong=actual, tháng hiện
  // tại=chiếu theo ngày) — KHỚP bảng "Tổng hợp theo tháng". Trước dùng raw × qFactor (quarter-level) → scale
  // nhầm tháng đã xong → KPI cards & Quarter Total lệch ~50% so với bảng tháng ("nhảy số").
  //   ...Raw = actual so far (Đạt TT) · ...Act/...Pr = per-month projected full quarter (Đạt PR).
  const b2bRevAct  = summary.reduce((s, m) => s + m.b2b.revenue, 0)
  const b2bRevRaw  = summary.reduce((s, m) => s + (m.b2b.actualRevenue ?? m.b2b.revenue), 0)
  const b2bGmRaw   = summary.reduce((s, m) => s + (m.b2b.actualGp ?? m.b2b.gp), 0)
  const b2bCcRaw   = summary.reduce((s, m) => s + (m.b2b.actualCc ?? m.b2b.channelCost), 0)
  const b2bGcRaw   = summary.reduce((s, m) => s + (m.b2b.actualGc ?? m.b2b.groupCost), 0)
  const b2bCm1Raw  = summary.reduce((s, m) => s + (m.b2b.actualCm1 ?? m.b2b.cm1), 0)
  const b2bCm1Act  = summary.reduce((s, m) => s + m.b2b.cm1, 0)
  const b2bThkAct  = summary.reduce((s, m) => s + (m.b2b.actualHk3 ?? 0), 0)
  // PR = existing_projected × futureScale (gồm ước tính T9)
  const b2bRevPr   = Math.round(summary.reduce((s, m) => s + (m.b2b.actualRevenue ?? m.b2b.revenue) * kpiPrFactor(m), 0) * futureScale)
  const b2bCm1Pr   = Math.round(summary.reduce((s, m) => s + (m.b2b.actualCm1 ?? m.b2b.cm1) * kpiPrFactor(m), 0) * futureScale)
  const b2bThkPct  = b2bRevRaw > 0 ? b2bThkAct / b2bRevRaw * 100 : 0

  const b2cRevAct  = summary.reduce((s, m) => s + m.b2c.revenue, 0)
  const b2cRevRaw  = summary.reduce((s, m) => s + (m.b2c.actualRevenue ?? m.b2c.revenue), 0)
  const b2cGmRaw   = summary.reduce((s, m) => s + (m.b2c.actualGp ?? m.b2c.gp), 0)
  const b2cCcRaw   = summary.reduce((s, m) => s + (m.b2c.actualCc ?? m.b2c.channelCost), 0)
  const b2cGcRaw   = summary.reduce((s, m) => s + (m.b2c.actualGc ?? m.b2c.groupCost), 0)
  const b2cCm1Raw  = summary.reduce((s, m) => s + (m.b2c.actualCm1 ?? m.b2c.cm1), 0)
  const b2cCm1Act  = summary.reduce((s, m) => s + m.b2c.cm1, 0)
  const b2cThkAct  = summary.reduce((s, m) => s + (m.b2c.actualHk3 ?? 0), 0)
  const b2cRevPr   = Math.round(summary.reduce((s, m) => s + (m.b2c.actualRevenue ?? m.b2c.revenue) * kpiPrFactor(m), 0) * futureScale)
  const b2cCm1Pr   = Math.round(summary.reduce((s, m) => s + (m.b2c.actualCm1 ?? m.b2c.cm1) * kpiPrFactor(m), 0) * futureScale)
  const b2cThkPct  = b2cRevRaw > 0 ? b2cThkAct / b2cRevRaw * 100 : 0

  const totRevAct  = b2bRevAct + b2cRevAct
  const totRevRaw  = b2bRevRaw + b2cRevRaw
  const totGmRaw   = b2bGmRaw + b2cGmRaw
  const totCcRaw   = b2bCcRaw + b2cCcRaw
  const totGcRaw   = b2bGcRaw + b2cGcRaw
  const totCm1Raw  = b2bCm1Raw + b2cCm1Raw
  const totCm1Act  = b2bCm1Act + b2cCm1Act
  const totRevPr   = b2bRevPr + b2cRevPr
  const totCm1Pr   = b2bCm1Pr + b2cCm1Pr
  const totThkPct  = totRevRaw > 0 ? (b2bThkAct + b2cThkAct) / totRevRaw * 100 : 0

  // QoQ(CM1): so sánh CM1 pro-rata quý này vs CM1 thực tế quý trước
  const pqt = report?.prevQuarterTotals
  const qoq = (prVal: number, prevVal: number | undefined) =>
    prevVal && prevVal !== 0 ? Math.round((prVal - prevVal) / Math.abs(prevVal) * 1000) / 10 : null
  const b2bQoQ = qoq(b2bCm1Pr, pqt?.b2bCm1)
  const b2cQoQ = qoq(b2cCm1Pr, pqt?.b2cCm1)
  const totQoQ = qoq(totCm1Pr, (pqt?.b2bCm1 ?? 0) + (pqt?.b2cCm1 ?? 0))
  // ──────────────────────────────────────────────────────────────────────────

  // Khoảng ngày dữ liệu đang được tính (khớp API: đầu quý → min(cuối quý, HÔM QUA)).
  // Mốc = hôm qua vì gohub_dw ETL theo ngày, hôm nay chưa đủ dữ liệu.
  const fmtD = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
  const asOf = new Date(today); asOf.setDate(asOf.getDate() - 1)
  const qNum = parseInt(selQ.replace("Q", "")) || 1
  const periodStart   = new Date(selYear, (qNum - 1) * 3, 1)
  const periodQEnd    = new Date(selYear, (qNum - 1) * 3 + 3, 0)   // ngày cuối quý
  const periodThrough = periodQEnd < asOf ? periodQEnd : (asOf < periodStart ? periodStart : asOf)
  const isFutureQ     = periodStart > today
  const isCurrentQ    = !isFutureQ && periodThrough < periodQEnd

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quarter Report</h1>
          <p className="text-sm text-slate-400 mt-0.5">Doanh thu · Lợi nhuận · CM1 theo quý</p>
          {!isFutureQ && (
            <p className="text-[13px] mt-1.5 flex items-center gap-1.5 flex-wrap">
              <CalendarDays className="w-3.5 h-3.5 text-[#003B95]" />
              <span className="text-slate-600">Dữ liệu tính:{" "}
                <b className="text-slate-800 tabular-nums">{fmtD(periodStart)} → {fmtD(periodThrough)}</b>
                {isCurrentQ && <span className="text-[#003B95] font-medium"> (đến hôm qua)</span>}
              </span>
              {report && report.quarter_days > 0 && (
                <span className="text-slate-400 tabular-nums">· {report.elapsed_days}/{report.quarter_days} ngày</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {quarters.map(q => (
              <button key={q} onClick={() => setSelQ(q)}
                className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", selQ === q ? "bg-[#003B95] text-white" : "text-slate-500 hover:bg-slate-50")}>
                {q}
              </button>
            ))}
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
              className="px-2 py-1.5 text-xs font-semibold bg-transparent text-slate-700 outline-none cursor-pointer">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {/* Tenant segment filter: ALL / VN / US */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {(["ALL", "VN", "US"] as const).map(code => (
              <button key={code} onClick={() => setTenantFilter(code)}
                className={cn("px-2.5 py-1 text-[11px] font-bold rounded-md transition-all",
                  companyCode === code ? "bg-[#003B95] text-white" : "text-slate-500 hover:bg-slate-50")}>
                {code === "VN" ? "🇻🇳 VN" : code === "US" ? "🇺🇸 US" : "ALL"}
              </button>
            ))}
          </div>
          {/* Ship / Internal Ops toggles */}
          {([["Phí ship", includeShip, setIncludeShip], ["Đơn nội bộ", includeInternalOps, setIncludeInternalOps]] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
            <label key={label} className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="w-3 h-3 accent-amber-500" />
              <span className={cn("text-[10px] font-semibold", val ? "text-amber-600" : "text-slate-500")}>{label}</span>
            </label>
          ))}
          <button onClick={() => fetchReport()} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#003B95] hover:bg-[#00337f] text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Đang tải…" : "Xem báo cáo"}
          </button>
          <button onClick={refreshAll} disabled={loading || b2bTiersLoading}
            title="Xóa cache cũ và tải lại dữ liệu mới nhất từ database"
            className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50">
            <RefreshCw className={cn("w-3.5 h-3.5", (loading || b2bTiersLoading) && "animate-spin")} />
            Tải lại mới
          </button>
          {canEditSettings && (
            <button onClick={() => setShowSettings(v => !v)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold rounded-lg transition-all",
                showSettings ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
              <Settings2 className="w-3.5 h-3.5" />
              Cài đặt
            </button>
          )}
          {summary.some(m => m.isProjected) && (
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg">
              Pro-rata tháng hiện tại
            </span>
          )}
        </div>
      </div>

      {msg && (
        <div className={cn("px-4 py-2.5 rounded-lg text-sm", msg.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700")}>
          {msg.text}
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-slate-200 -mb-4">
        {([["overview", Building2, "Tổng quan"], ["squad", Users, "Squad Progress"]] as const).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setActiveSection(id as any)}
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeSection === id
                ? "border-[#003B95] text-[#003B95]"
                : "border-transparent text-slate-500 hover:text-slate-700")}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Overview content (ẩn khi tab = squad) ── */}
      <div className={activeSection === "squad" ? "hidden" : ""}>

      {/* ── Settings panel (admin/creator only) ── */}
      {canEditSettings && showSettings && qSettings && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Cài đặt Quarter Report</h2>
            <button onClick={saveSettings} disabled={savingSettings || !settingsDirty}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                settingsDirty && !savingSettings ? "bg-[#003B95] hover:bg-[#00337f] text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed")}>
              <Save className="w-3.5 h-3.5" />{savingSettings ? "Đang lưu…" : "Lưu cài đặt"}
            </button>
          </div>

          {/* Excluded customers */}
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">KH bị loại khỏi báo cáo B2B</p>
            <p className="text-[10px] text-slate-400 mb-2">Lưu theo mã KH (ổn định khi đổi tên). Tìm theo tên hoặc mã → click để thêm.</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {qSettings.excludedCustomers.map(entry => (
                <span key={entry} className="flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-[11px] font-medium">
                  {entry}
                  <button onClick={() => updateSettings({ excludedCustomers: qSettings.excludedCustomers.filter(n => n !== entry) })}
                    className="hover:text-red-900 ml-0.5"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {qSettings.excludedCustomers.length === 0 && <span className="text-slate-400 text-xs italic">Chưa có KH nào bị loại</span>}
            </div>
            <div className="relative">
              <div className="flex gap-2">
                <input value={newExcluded}
                  onChange={async e => {
                    setNewExcluded(e.target.value)
                    const q = e.target.value.trim()
                    if (q.length < 2) { setCustSuggestions([]); return }
                    setLoadingSugg(true)
                    try {
                      const res = await fetch(`/api/analytics/quarterly-settings/search-customers?q=${encodeURIComponent(q)}`)
                      if (res.ok) setCustSuggestions(await res.json())
                    } finally { setLoadingSugg(false) }
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newExcluded.trim() && !qSettings.excludedCustomers.includes(newExcluded.trim())) {
                      updateSettings({ excludedCustomers: [...qSettings.excludedCustomers, newExcluded.trim()] })
                      setNewExcluded(""); setCustSuggestions([])
                    }
                    if (e.key === "Escape") setCustSuggestions([])
                  }}
                  placeholder="Tìm tên hoặc mã KH…"
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#003B95]/40 placeholder-slate-400" />
                <button onClick={() => {
                  if (newExcluded.trim() && !qSettings.excludedCustomers.includes(newExcluded.trim())) {
                    updateSettings({ excludedCustomers: [...qSettings.excludedCustomers, newExcluded.trim()] })
                    setNewExcluded(""); setCustSuggestions([])
                  }
                }} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition-all border border-slate-200">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Dropdown suggestions */}
              {(custSuggestions.length > 0 || loadingSugg) && (
                <div className="absolute z-50 top-full left-0 right-8 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {loadingSugg && <div className="px-3 py-2 text-xs text-slate-400 italic">Đang tìm…</div>}
                  {custSuggestions.map(s => {
                    const alreadyAdded = qSettings.excludedCustomers.includes(s.code)
                    return (
                      <button key={s.code} disabled={alreadyAdded}
                        onClick={() => {
                          if (!alreadyAdded) {
                            updateSettings({ excludedCustomers: [...qSettings.excludedCustomers, s.code] })
                            setNewExcluded(""); setCustSuggestions([])
                          }
                        }}
                        className={cn("w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors",
                          alreadyAdded ? "opacity-40 cursor-not-allowed" : "cursor-pointer")}>
                        <span className="font-medium text-slate-800 truncate">{s.name}</span>
                        <span className="font-mono text-[10px] text-slate-400 flex-shrink-0">{s.code}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Tier keywords */}
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Phân loại tầng KH (từ khóa trong Bảng giá)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {["Strategic", "VIP", "Gold", "Silver"].map(tier => (
                <div key={tier} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <p className="text-[11px] font-bold text-slate-700 mb-1.5">{tier}</p>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {(qSettings.tierKeywords[tier] ?? []).map(kw => (
                      <span key={kw} className="flex items-center gap-0.5 bg-white text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-medium">
                        {kw}
                        <button onClick={() => updateSettings({ tierKeywords: { ...qSettings.tierKeywords, [tier]: qSettings.tierKeywords[tier].filter(k => k !== kw) } })}
                          className="hover:text-red-500 ml-0.5"><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                  </div>
                  <input placeholder="+ từ khóa (Enter)"
                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#003B95]/40 placeholder-slate-400"
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const val = (e.target as HTMLInputElement).value.trim().toUpperCase()
                        if (val) {
                          updateSettings({ tierKeywords: { ...qSettings.tierKeywords, [tier]: [...(qSettings.tierKeywords[tier] ?? []), val] } })
                          ;(e.target as HTMLInputElement).value = ""
                        }
                      }
                    }} />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">* Strategic = mặc định khi không khớp từ khóa nào. Sau khi lưu, bấm "Tải lại mới" để áp dụng.</p>
          </div>
        </div>
      )}

      {/* ── Target inputs (collapsible) ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button onClick={() => setTargetCardOpen(v => !v)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-100">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-800">Target {selQ}-{selYear}</h2>
            {!targetCardOpen && targets.b2bRev > 0 && (
              <span className="text-[11px] text-slate-400 font-mono hidden md:flex items-center gap-2">
                <span>B2B Rev: {fck(targets.b2bRev)}</span>
                {targets.b2bCm1 > 0 && <span>· CM1: {fck(targets.b2bCm1)}</span>}
                {targets.b2cRev > 0 && <span>· B2C Rev: {fck(targets.b2cRev)}</span>}
              </span>
            )}
            {!targetCardOpen && targets.b2bRev === 0 && (
              <span className="text-[11px] text-amber-500 font-medium">Chưa nhập target</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canEditCost && targetCardOpen && (
              editTarget ? (
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button onClick={cancelEditTarget}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-all">Hủy</button>
                  <button onClick={saveTargets} disabled={saving || !targetDirty}
                    className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                      targetDirty && !saving ? "bg-[#003B95] hover:bg-[#00337f] text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed")}>
                    <Save className="w-3.5 h-3.5" />{saving ? "Đang lưu…" : "Lưu"}
                  </button>
                </div>
              ) : (
                <button onClick={e => { e.stopPropagation(); startEditTarget() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#003B95] border border-[#003B95]/30 hover:bg-blue-50 text-xs font-semibold rounded-lg transition-all">
                  <Pencil className="w-3.5 h-3.5" />Sửa
                </button>
              )
            )}
            <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", targetCardOpen && "rotate-180")} />
          </div>
        </button>
        {targetCardOpen && (
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { id: "b2bRev",  label: "B2B Doanh thu" },
                { id: "b2bCm1",  label: "B2B CM1 (VND)" },
                { id: "b2bThk",  label: "B2B %3HK" },
                { id: "b2cRev",  label: "B2C Doanh thu" },
                { id: "b2cCm1",  label: "B2C CM1 (VND)" },
                { id: "b2cThk",  label: "B2C %3HK" },
              ].map(f => (
                <div key={f.id} className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">{f.label}</label>
                  <input
                    type="text" value={(tgtInputs as any)[f.id]} disabled={!editTarget}
                    onChange={e => setTgtInputs(prev => ({ ...prev, [f.id]: e.target.value }))}
                    className={cn("w-full border outline-none font-semibold text-sm font-mono rounded-lg px-3 py-2 transition-colors",
                      editTarget
                        ? "bg-white border-[#003B95]/40 focus:border-[#003B95] focus:ring-1 focus:ring-[#003B95]/30 text-slate-800"
                        : "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed")}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── O3: Skeleton loading ── */}
      {loading && !report && (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0,1,2].map(i => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-8 bg-slate-200 rounded w-16" />
                </div>
                <div className="h-2 bg-slate-100 rounded-full" />
                <div className="space-y-2 pt-1">
                  {[0,1,2].map(j => <div key={j} className="flex justify-between"><div className="h-3 bg-slate-100 rounded w-1/4" /><div className="h-3 bg-slate-100 rounded w-1/3" /></div>)}
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
            <div className="h-5 bg-slate-200 rounded w-1/4 mb-4" />
            {[0,1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-8 bg-slate-100 rounded" />)}
          </div>
        </div>
      )}

      {/* ── KPI Progress cards ── */}
      {report && (
        <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-4 transition-opacity", loading && "opacity-50 pointer-events-none")}>
          <KpiCard label="B2B" icon={Building2} accent="#003B95" expectedPct={expectedPct}
            actual={b2bRevRaw} prRev={b2bRevPr} target={targets.b2bRev}
            cm1Actual={b2bCm1Raw} prCm1={b2bCm1Pr} cm1Target={targets.b2bCm1}
            hk3Pct={b2bThkPct} hk3Rev={b2bThkAct} hk3Target={targets.b2bThk} />
          <KpiCard label="B2C" icon={ShoppingBag} accent="#0ea5e9" expectedPct={expectedPct}
            actual={b2cRevRaw} prRev={b2cRevPr} target={targets.b2cRev}
            cm1Actual={b2cCm1Raw} prCm1={b2cCm1Pr} cm1Target={targets.b2cCm1}
            hk3Pct={b2cThkPct} hk3Rev={b2cThkAct} hk3Target={targets.b2cThk} />
          <KpiCard label="Tổng" icon={TrendingUp} accent="#1e3a8a" expectedPct={expectedPct}
            actual={totRevRaw} prRev={totRevPr} target={targets.b2bRev + targets.b2cRev}
            cm1Actual={totCm1Raw} prCm1={totCm1Pr} cm1Target={targets.b2bCm1 + targets.b2cCm1}
            hk3Pct={totThkPct} hk3Rev={b2bThkAct + b2cThkAct} hk3Target={0} />
        </div>
      )}

      {/* ── Monthly summary table ── */}
      {summary.length > 0 && (
        <div className={cn("bg-white border border-slate-200 rounded-xl overflow-hidden transition-opacity", loading && "opacity-50 pointer-events-none")}>
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Tổng hợp theo Tháng</h2>
            <button onClick={() => setShowMonthBreakdown(v => !v)}
              className={cn("flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all",
                showMonthBreakdown ? "bg-[#003B95] text-white border-[#003B95]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
              {showMonthBreakdown ? "Ẩn B2B/B2C" : "Xem B2B/B2C"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead><TableHead cols={TH_COLS} /></thead>
              <tbody>
                {/* hasCurrentMonth: quý có tháng đang chạy → hiện cột PR cho MỌI tháng (tháng xong: PR = actual vì
                    factor=1) → cột PR cộng lại = KPI card PR (nếu chỉ hiện PR tháng hiện tại thì cột không cộng khớp card). */}
                {(() => { const hasCurrentMonth = summary.some(m => m.elapsed > 0 && m.elapsed < m.dim); return summary.map((m, mi) => {
                  const [y, mo] = m.month.split("-")
                  const label  = `T${parseInt(mo)}/${y}`
                  const mom    = momData[mi]
                  return (
                    <React.Fragment key={m.month}>
                      {/* Revenue/GM/CM1 = actual; PR = actual × kpiFactor (factor=1 cho tháng đã xong → PR=actual) */}
                      {(() => {
                        const isCurrent = m.elapsed > 0 && m.elapsed < m.dim
                        const kpiFactor = isCurrent ? m.dim / m.elapsed : 1
                        const showPr = hasCurrentMonth  // hiện PR mọi tháng khi quý đang chạy → cột cộng khớp card
                        const prRevTotal = Math.round((m.total.actualRevenue ?? m.total.revenue) * kpiFactor)
                        const prCm1Total = Math.round((m.total.actualCm1 ?? m.total.cm1) * kpiFactor)
                        const factorLabel = isCurrent ? `×${kpiFactor.toFixed(1)}` : null
                        return (
                          <tr className={cn("border-b border-slate-100", isCurrent ? "bg-blue-50/30" : "bg-white hover:bg-slate-50")}>
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              {label}
                              {factorLabel && <span className="ml-1.5 text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">PR {factorLabel}</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">
                              <div className="flex flex-col items-end gap-0.5">
                                {fc(m.total.actualRevenue ?? m.total.revenue)}
                                <MomBadge v={mom.rev} />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">{showPr ? fc(prRevTotal) : <span className="text-slate-300">—</span>}</td>
                            <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{fc(m.total.actualGp ?? m.total.gp)}</td>
                            <td className="px-4 py-3 text-right text-slate-500">{pct(m.total.gpPct)}</td>
                            <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{m.total.channelCost > 0 ? fc(m.total.actualCc ?? m.total.channelCost) : <span className="text-slate-300">—</span>}</td>
                            <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{m.total.groupCost > 0 ? fc(m.total.actualGc ?? m.total.groupCost) : <span className="text-slate-300">—</span>}</td>
                            <td className={cn("px-4 py-3 text-right font-bold tabular-nums text-[13px]", cm1Color(m.total.actualCm1 ?? m.total.cm1))}>
                              <div className="flex flex-col items-end gap-0.5">
                                {fc(m.total.actualCm1 ?? m.total.cm1)}
                                <MomBadge v={mom.cm1} />
                              </div>
                            </td>
                            <td className={cn("px-4 py-3 text-right tabular-nums", cm1Color(prCm1Total))}>{showPr ? fc(prCm1Total) : <span className="text-slate-300">—</span>}</td>
                            <td className={cn("px-4 py-3 text-right font-semibold", cm1Color(m.total.cm1))}>{pct(m.total.cm1Pct)}</td>
                            <td className="px-4 py-3 text-right text-slate-300">—</td>
                            <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap">{fc(m.hk3Rev ?? 0)} <span className="text-slate-400 text-[10px]">({pct(m.hk3Pct ?? 0)})</span></td>
                          </tr>
                        )
                      })()}
                      {showMonthBreakdown && <MonthSubRow label="B2B" stats={m.b2b} kpiFactor={m.elapsed > 0 && m.elapsed < m.dim ? m.dim / m.elapsed : 1} showPr={hasCurrentMonth} momRev={mom.b2bRev} momCm1={mom.b2bCm1} qoqCm1={b2bQoQ} />}
                      {showMonthBreakdown && <MonthSubRow label="B2C" stats={m.b2c} kpiFactor={m.elapsed > 0 && m.elapsed < m.dim ? m.dim / m.elapsed : 1} showPr={hasCurrentMonth} momRev={mom.b2cRev} momCm1={mom.b2cCm1} qoqCm1={b2cQoQ} />}
                    </React.Fragment>
                  )
                }) })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Quarter total vs target ── */}
      {qt && (
        <div className={cn("bg-white border border-slate-200 rounded-xl overflow-hidden transition-opacity", loading && "opacity-50 pointer-events-none")}>
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-900">Tổng hợp cả Quý — So sánh với Target</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead><TableHead cols={QT_COLS} compact /></thead>
              <tbody>
                {qt.b2b && (
                  <>
                    <QtSummaryRow
                      label="B2B (Thực tế)"
                      actRev={b2bRevRaw} prRev={b2bRevPr}
                      gmRaw={b2bGmRaw} ccRaw={b2bCcRaw} gcRaw={b2bGcRaw}
                      cm1Raw={b2bCm1Raw} prCm1={b2bCm1Pr}
                      hk3Pct={b2bThkPct} hk3Rev={b2bThkAct} qoqPct={b2bQoQ}
                    />
                    {targets.b2bRev > 0 && (
                      <QtTargetRow
                        label="↳ Target B2B"
                        targetRev={targets.b2bRev} revPr={b2bRevPr} revAct={b2bRevRaw}
                        targetCm1={targets.b2bCm1} cm1Pr={b2bCm1Pr} cm1Act={b2bCm1Raw}
                      />
                    )}
                  </>
                )}
                {qt.b2c && (
                  <>
                    <QtSummaryRow
                      label="B2C (Thực tế)"
                      actRev={b2cRevRaw} prRev={b2cRevPr}
                      gmRaw={b2cGmRaw} ccRaw={b2cCcRaw} gcRaw={b2cGcRaw}
                      cm1Raw={b2cCm1Raw} prCm1={b2cCm1Pr}
                      hk3Pct={b2cThkPct} hk3Rev={b2cThkAct} qoqPct={b2cQoQ}
                    />
                    {targets.b2cRev > 0 && (
                      <QtTargetRow
                        label="↳ Target B2C"
                        targetRev={targets.b2cRev} revPr={b2cRevPr} revAct={b2cRevRaw}
                        targetCm1={targets.b2cCm1} cm1Pr={b2cCm1Pr} cm1Act={b2cCm1Raw}
                      />
                    )}
                  </>
                )}
                <tr className="bg-[#003B95] text-white text-[11px]">
                  <td className="px-2 py-2 font-bold text-white">Tổng {selQ}-{selYear}</td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums">{fc(totRevRaw)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-300">{fc(totRevPr)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fc(totGmRaw)}</td>
                  <td className="px-2 py-2 text-right text-slate-300">{totRevRaw > 0 ? pct(totGmRaw / totRevRaw * 100) : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-300">{totCcRaw > 0 ? fc(totCcRaw) : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-300">{totGcRaw > 0 ? fc(totGcRaw) : "—"}</td>
                  <td className={cn("px-2 py-2 text-right font-bold tabular-nums text-[12px]", totCm1Raw >= 0 ? "text-blue-300" : "text-red-300")}>{fc(totCm1Raw)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-300">{fc(totCm1Pr)}</td>
                  <td className={cn("px-2 py-2 text-right font-bold", totCm1Raw >= 0 ? "text-blue-300" : "text-red-300")}>{totRevRaw > 0 ? pct(totCm1Raw / totRevRaw * 100) : "—"}</td>
                  <td className="px-2 py-2 text-right text-slate-300 whitespace-nowrap">{fc(b2bThkAct + b2cThkAct)} <span className="opacity-70 text-[10px]">({pct(totThkPct)})</span></td>
                  <td className={cn("px-2 py-2 text-right font-bold tabular-nums", totQoQ == null ? "text-slate-400" : totQoQ >= 0 ? "text-green-300" : "text-red-300")}>
                    {totQoQ != null ? `${totQoQ >= 0 ? "+" : ""}${totQoQ.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── B2B tier breakdown (replaces channel pivot for B2B) ── */}
      <B2BTierSection
        b2bTiers={b2bTiers}
        loading={b2bTiersLoading}
        months={activeMonths}
        allMonths={report?.months ?? activeMonths}
        region={b2bRegion}
        onRegionChange={r => setB2bRegion(r as "ALL" | "VN" | "US")}
        expanded={expandB2B}
        onToggle={() => setExpandB2B(v => !v)}
        canEditCost={canEditCost}
        isCreator={isCreator}
        onSaved={refreshAll}
        notify={notify}
        quarterLabel={`${selQ}-${selYear}`}
        qFactor={qFactor}
        summary={summary}
        futureScale={futureScale}
      />

      {/* ── B2C channel pivot ── */}
      {report && report.b2cChannels.length > 0 && (
        <div className={cn("transition-opacity", loading && "opacity-50 pointer-events-none")}>
        <PivotTable title="B2C — Chi tiết theo Kênh × Tháng" icon={ShoppingBag}
          channels={report.b2cChannels} months={activeMonths}
          expanded={expandB2C} onToggle={() => setExpandB2C(v => !v)} />
        </div>
      )}

      {!loading && summary.length === 0 && report && (
        <div className="text-center py-16 text-slate-400 text-sm">Chưa có dữ liệu cho {selQ}-{selYear}.</div>
      )}
      </div>{/* end overview wrapper */}

      {/* ── Squad Progress tab ── */}
      {activeSection === "squad" && (
        <div className="space-y-4">

          {squadMsg && (
            <div className={cn("px-4 py-2.5 rounded-lg text-sm", squadMsg.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700")}>
              {squadMsg.text}
            </div>
          )}

          {/* ── S1: Admin toolbar compact ── */}
          {canEditSettings && (
            <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Admin</span>
              <div className="w-px h-4 bg-slate-200" />
              <button onClick={() => {
                if (!editingSquad) {
                  setDraftSquads((squadConfig?.squads ?? []).map(s => ({ name: s.name, leader: s.leader ?? "", sales_pics: [...s.sales_pics] })))
                  setEditingSquad(true)
                } else { setEditingSquad(false) }
              }} className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all",
                editingSquad ? "bg-[#003B95] text-white border-[#003B95]" : "bg-white text-slate-600 border-slate-200 hover:border-[#003B95]/60 hover:text-[#003B95]")}>
                <Shield className="w-3.5 h-3.5" />
                Cấu hình Squad
                {squadConfig && <span className="ml-1 opacity-60 text-[10px]">({squadConfig.squads.length})</span>}
              </button>
              {squadData?.squads?.length > 0 && (
                <button onClick={() => { if (!editingTargets) openEditTargets(); else setEditingTargets(false) }}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all",
                    editingTargets ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-200 hover:border-amber-400 hover:text-amber-600")}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  Target Squad — {selQ} {selYear}
                </button>
              )}
            </div>
          )}

          {/* ── Cấu hình Squad (collapsible panel) ── */}
          {canEditSettings && editingSquad && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
              {draftSquads.map((sq, si) => {
                const usedInOthers = new Set(draftSquads.flatMap((s, i) => i !== si ? s.sales_pics : []))
                const availPics = (squadData?.available_pics ?? []).filter((p: any) => !sq.sales_pics.includes(p.code) && !usedInOthers.has(p.code))
                return (
                  <div key={si} className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <input value={sq.name} onChange={e => setDraftSquads(prev => prev.map((s, i) => i === si ? { ...s, name: e.target.value } : s))}
                        placeholder="Tên squad (VD: Squad 1 Ngọc)"
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003B95]" />
                      <button onClick={() => setDraftSquads(prev => prev.filter((_, i) => i !== si))}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Leader</p>
                      <select value={sq.leader ?? ""}
                        onChange={e => setDraftSquads(prev => prev.map((s, i) => i === si ? { ...s, leader: e.target.value } : s))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003B95] bg-white">
                        <option value="">— Chọn leader —</option>
                        {squadUsers.map(u => <option key={u.username} value={u.username}>{u.name} (@{u.username})</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">Sales PIC trong squad</p>
                      {sq.sales_pics.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Chưa có — click thêm từ danh sách bên dưới</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {sq.sales_pics.map(code => {
                            const info = (squadData?.available_pics ?? []).find((p: any) => p.code === code)
                            return (
                              <span key={code} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#003B95] text-white text-xs rounded-full font-medium">
                                {info?.name ?? code}
                                <button onClick={() => setDraftSquads(prev => prev.map((s, i) => i === si ? { ...s, sales_pics: s.sales_pics.filter(c => c !== code) } : s))}
                                  className="hover:text-red-300 ml-0.5"><X className="w-3 h-3" /></button>
                              </span>
                            )
                          })}
                        </div>
                      )}
                      {availPics.length > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-400 mb-1">Click để thêm:</p>
                          <div className="flex flex-wrap gap-1">
                            {availPics.map((p: any) => (
                              <button key={p.code}
                                onClick={() => setDraftSquads(prev => prev.map((s, i) => i === si ? { ...s, sales_pics: [...s.sales_pics, p.code] } : s))}
                                className="px-2 py-0.5 text-[11px] bg-slate-100 text-slate-600 rounded-full hover:bg-[#003B95] hover:text-white transition-colors">
                                <Plus className="w-2.5 h-2.5 inline-block mr-0.5" />{p.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {availPics.length === 0 && sq.sales_pics.length > 0 && (
                        <p className="text-[10px] text-slate-400">Tất cả PIC đã được phân vào squad.</p>
                      )}
                    </div>
                  </div>
                )
              })}
              <div className="flex gap-2">
                <button onClick={() => setDraftSquads(prev => [...prev, { name: "", leader: "", sales_pics: [] }])}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm border border-dashed border-slate-300 text-slate-500 rounded-lg hover:border-[#003B95] hover:text-[#003B95] transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Thêm squad
                </button>
                <button onClick={saveSquadConfig} disabled={savingSquad}
                  className="flex items-center gap-1.5 px-5 py-2 text-sm bg-[#003B95] text-white rounded-lg hover:bg-[#00337f] disabled:opacity-50 transition-colors">
                  {savingSquad ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {savingSquad ? "Đang lưu…" : "Lưu cấu hình"}
                </button>
                <button onClick={() => setEditingSquad(false)} className="px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">Huỷ</button>
              </div>
            </div>
          )}

          {/* ── Target Squad panel (collapsible) ── */}
          {canEditSettings && editingTargets && squadData?.squads?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Nhập Revenue / CM1 / 3HK Revenue mục tiêu cho từng squad — {selQ} {selYear}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100 uppercase text-[10px]">
                      <th className="px-3 py-2 text-left font-semibold">Squad</th>
                      <th className="px-3 py-2 text-right font-semibold">Target Revenue (VND)</th>
                      <th className="px-3 py-2 text-right font-semibold">Target CM1 (VND)</th>
                      <th className="px-3 py-2 text-right font-semibold">Target 3HK Rev (VND)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {squadData.squads.map((sq: any) => {
                      const t = draftTargets[sq.name] ?? { rev: "", cm1: "", hk3rev: "" }
                      const upd = (field: "rev"|"cm1"|"hk3rev", v: string) =>
                        setDraftTargets(prev => ({ ...prev, [sq.name]: { ...(prev[sq.name] ?? { rev:"", cm1:"", hk3rev:"" }), [field]: v.replace(/[^0-9]/g, "") } }))
                      return (
                        <tr key={sq.name}>
                          <td className="px-3 py-2 font-medium text-slate-700">{sq.name}</td>
                          {(["rev","cm1","hk3rev"] as const).map(f => (
                            <td key={f} className="px-3 py-2 text-right">
                              <input value={t[f]} onChange={e => upd(f, e.target.value)} placeholder="0"
                                className="w-36 px-2 py-1 text-right tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003B95]" />
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={saveSquadTargets} disabled={savingTargets}
                  className="flex items-center gap-1.5 px-5 py-2 text-sm bg-[#003B95] text-white rounded-lg hover:bg-[#00337f] disabled:opacity-50 transition-colors">
                  {savingTargets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {savingTargets ? "Đang lưu…" : "Lưu target"}
                </button>
                <button onClick={() => setEditingTargets(false)} className="px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">Huỷ</button>
                <p className="text-[10px] text-slate-400 ml-2">Để trống / 0 = dùng tổng target per-customer. Target squad được ưu tiên.</p>
              </div>
            </div>
          )}

          {/* ── Squad progress main card ── */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-bold text-slate-900">Squad Progress — {selQ} {selYear}</h2>
                {squadData && <p className="text-xs text-slate-400 mt-0.5">{squadData.elapsed_days}/{squadData.quarter_days} ngày · Pro-rata ×{squadData.pr_factor?.toFixed(2)}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportSquadProgress} disabled={!squadData?.squads?.length || squadLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 text-xs font-semibold rounded-lg disabled:opacity-40 transition-all">
                  <FileDown className="w-3.5 h-3.5" />Export Excel
                </button>
                <button onClick={fetchSquadProgress} disabled={squadLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003B95] text-white text-xs font-semibold rounded-lg hover:bg-[#00337f] disabled:opacity-50 transition-colors">
                  <RefreshCw className={cn("w-3.5 h-3.5", squadLoading && "animate-spin")} />
                  {squadLoading ? "Đang tải…" : "Làm mới"}
                </button>
              </div>
            </div>

            {squadLoading ? (
              <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-[#003B95]" /></div>
            ) : !squadData ? (
              <div className="py-12 text-center text-slate-400 text-sm">Đang tải dữ liệu…</div>
            ) : !squadData.squads?.length ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                Chưa có squad nào. {canEditSettings && <span>Dùng nút <b className="text-slate-600">Cấu hình Squad</b> bên trên để thêm.</span>}
              </div>
            ) : (() => {
              const allCusts: any[] = squadData.squads.flatMap((sq: any) =>
                (sq.customers ?? []).map((c: any) => ({ ...c, squad_name: sq.name, leader: sq.leader })))
              const uniquePics = [...new Set(allCusts.map((c: any) => c.sales_pic).filter(Boolean))] as string[]
              const squadNames = squadData.squads.map((sq: any) => sq.name)
              const hasFilter = sqSearch || sqFilterRegion !== "ALL" || sqFilterTier !== "ALL" || sqFilterPic !== "ALL" || sqFilterRisk !== "ALL" || sqFilterSquad !== "ALL"

              let filtered = allCusts.filter(c => {
                if (sqSearch && !c.customer_name?.toLowerCase().includes(sqSearch.toLowerCase())) return false
                if (sqFilterRegion !== "ALL" && c.region !== sqFilterRegion) return false
                if (sqFilterTier   !== "ALL" && c.tier   !== sqFilterTier)   return false
                if (sqFilterPic    !== "ALL" && c.sales_pic !== sqFilterPic) return false
                if (sqFilterRisk   !== "ALL" && c.risk_level !== sqFilterRisk) return false
                if (sqFilterSquad  !== "ALL" && c.squad_name !== sqFilterSquad) return false
                return true
              })

              filtered = [...filtered].sort((a, b) => {
                let av: any, bv: any
                if (sqSortCol === "risk_level") { av = RISK_ORDER.indexOf(a.risk_level); bv = RISK_ORDER.indexOf(b.risk_level) }
                else if (sqSortCol === "customer_name") { av = a.customer_name; bv = b.customer_name }
                else if (sqSortCol === "revenue_pr") { av = a.revenue_pr; bv = b.revenue_pr }
                else if (sqSortCol === "cm1_pct")  { av = a.cm1_pct  ?? -999; bv = b.cm1_pct  ?? -999 }
                else if (sqSortCol === "hk3_tgt_pct") { av = a.hk3_tgt_pct ?? -999; bv = b.hk3_tgt_pct ?? -999 }
                else { av = a[sqSortCol]; bv = b[sqSortCol] }
                if (av === bv) return 0
                const d = av < bv ? -1 : 1
                return sqSortDir === "asc" ? d : -d
              })

              const sortBtn = (col: string, label: string) => {
                const active = sqSortCol === col
                return (
                  <button onClick={() => { if (active) setSqSortDir(d => d === "asc" ? "desc" : "asc"); else { setSqSortCol(col); setSqSortDir("asc") } }}
                    className={cn("flex items-center gap-0.5 text-left whitespace-nowrap", active ? "text-[#003B95] font-bold" : "text-slate-500 hover:text-slate-800")}>
                    {label}{active ? (sqSortDir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                )
              }

              // B1 fix: renamed to pctV to avoid shadowing outer pct
              const pctV = (v: number | null) => v != null ? `${v}%` : "—"
              const pctCol = (v: number | null) => v == null ? "text-slate-400" : v >= 100 ? "text-emerald-600 font-bold" : v >= 85 ? "text-amber-600 font-semibold" : "text-red-500 font-semibold"
              const pctColor = (v: number | null) => v == null ? "text-slate-400" : v >= 100 ? "text-emerald-600" : v >= 85 ? "text-amber-600" : "text-red-500"

              return (
                <>
                  {/* S3: Filter bar — 1 tầng */}
                  <div className="px-4 py-3 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input value={sqSearch} onChange={e => setSqSearch(e.target.value)}
                          placeholder="Tìm khách hàng..."
                          className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003B95] w-40" />
                      </div>
                      <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                        {(["ALL","VN","US"] as const).map(v => (
                          <button key={v} onClick={() => setSqFilterRegion(v)}
                            className={cn("px-2 py-1 text-[11px] font-bold rounded-md transition-all", sqFilterRegion === v ? "bg-[#003B95] text-white" : "text-slate-500 hover:bg-slate-200")}>
                            {v === "VN" ? "🇻🇳 VN" : v === "US" ? "🇺🇸 US" : "ALL"}
                          </button>
                        ))}
                      </div>
                      <select value={sqFilterTier} onChange={e => setSqFilterTier(e.target.value)}
                        className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003B95] bg-white">
                        <option value="ALL">Tất cả tier</option>
                        {["Strategic","VIP","Gold","Silver"].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {squadNames.length > 1 && (
                        <select value={sqFilterSquad} onChange={e => setSqFilterSquad(e.target.value)}
                          className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003B95] bg-white">
                          <option value="ALL">Tất cả squad</option>
                          {squadNames.map((n: string) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      )}
                      {uniquePics.length > 0 && (
                        <select value={sqFilterPic} onChange={e => setSqFilterPic(e.target.value)}
                          className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003B95] bg-white">
                          <option value="ALL">Tất cả PIC</option>
                          {uniquePics.map(code => {
                            const info = squadData.available_pics?.find((p: any) => p.code === code)
                            return <option key={code} value={code}>{info?.name ?? code}</option>
                          })}
                        </select>
                      )}
                      <select value={sqFilterRisk} onChange={e => setSqFilterRisk(e.target.value)}
                        className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003B95] bg-white">
                        <option value="ALL">Tất cả rủi ro</option>
                        {Object.entries(RISK_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      {hasFilter && (
                        <button onClick={() => { setSqSearch(""); setSqFilterRegion("ALL"); setSqFilterTier("ALL"); setSqFilterPic("ALL"); setSqFilterRisk("ALL"); setSqFilterSquad("ALL") }}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
                          <X className="w-3 h-3" />Xóa filter
                        </button>
                      )}
                    </div>
                    {/* S5: Flat view banner */}
                    {hasFilter && (
                      <div className="mt-2 text-[11px] text-[#003B95] bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <span className="font-semibold">Đang xem phẳng</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500">{filtered.length} khách hàng phù hợp</span>
                      </div>
                    )}
                  </div>

                  <div>
                    {hasFilter ? (
                      /* ── S4: Flat filtered view — 10 cột (bỏ bớt Rev Actual, gộp 3HK) ── */
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-500 uppercase text-[9px]">
                              <th className="px-4 py-2 text-left">{sortBtn("customer_name","Khách hàng")}</th>
                              <th className="px-3 py-2 text-left font-semibold">Squad · PIC</th>
                              <th className="px-3 py-2 text-left font-semibold">Tier</th>
                              <th className="px-3 py-2 text-right">{sortBtn("revenue_pr","Rev PR")}</th>
                              <th className="px-3 py-2 text-right border-l border-slate-200 font-semibold">GP PR</th>
                              <th className="px-3 py-2 text-right font-semibold">CM1 Tgt</th>
                              <th className="px-3 py-2 text-right">{sortBtn("cm1_pct","%TGT CM1")}</th>
                              <th className="px-3 py-2 text-right border-l border-slate-200 font-semibold">3HK% / Tgt%</th>
                              <th className="px-3 py-2 text-right">{sortBtn("hk3_tgt_pct","%TGT 3HK")}</th>
                              <th className="px-3 py-2 text-center border-l border-slate-200">{sortBtn("risk_level","Đánh giá")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filtered.length === 0 ? (
                              <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">Không có kết quả phù hợp.</td></tr>
                            ) : filtered.map((c: any, ci: number) => {
                              const rm = RISK_META[c.risk_level] ?? RISK_META["no_target"]
                              const picInfo = squadData.available_pics?.find((p: any) => p.code === c.sales_pic)
                              return (
                                <tr key={ci} className={ci % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                                  <td className="px-4 py-2 font-medium text-slate-700">
                                    {c.customer_name}
                                    <span className={cn("ml-1.5 text-[9px] px-1 py-0.5 rounded font-bold", c.region === "US" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600")}>{c.region}</span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-500 text-[11px]">
                                    <span className="font-medium text-slate-700">{c.squad_name}</span>
                                    {picInfo && <span className="text-slate-400"> · {picInfo.name}</span>}
                                  </td>
                                  <td className="px-3 py-2 text-slate-500">{c.tier}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-blue-600">{formatCompactNumber(c.revenue_pr)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 border-l border-slate-100">{formatCompactNumber(c.gp_pr)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">{c.target_cm1 > 0 ? formatCompactNumber(c.target_cm1) : "—"}</td>
                                  <td className={cn("px-3 py-2 text-right tabular-nums", pctCol(c.cm1_pct))}>{pctV(c.cm1_pct)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 border-l border-slate-100">
                                    <span className="text-[10px] text-slate-500">{formatCompactNumber(c.hk3)}</span>
                                    <span className="text-slate-400 ml-0.5 text-[10px]">({c.hk3_pct}%)</span>
                                    {c.target_hk3pct > 0 && <span className="text-slate-400 text-[10px]"> / {c.target_hk3pct}%</span>}
                                  </td>
                                  <td className={cn("px-3 py-2 text-right tabular-nums", pctCol(c.hk3_tgt_pct))}>{pctV(c.hk3_tgt_pct)}</td>
                                  <td className="px-3 py-2 text-center border-l border-slate-100">
                                    <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap", rm.bg, rm.color)}>{rm.label}</span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      /* ── S2: Per-squad view với redesigned card header ── */
                      <>
                        {squadData.squads.map((sq: any, si: number) => {
                          const expanded = expandedSquads.has(si)
                          const leaderUser = squadUsers.find(u => u.username === sq.leader)
                          const cm1TgtPct = sq.cm1_tgt_pct
                          const RISK_SHORT: Record<string, string> = {
                            very_safe: "Rất AT", safe: "AT", safe_low: "AT Ít", danger_low: "NH Ít", danger_high: "NH Nhiều",
                          }
                          return (
                            <div key={si} className={cn("border-b border-slate-100 last:border-0", si % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                              {/* ── Squad card header ── */}
                              <div className="px-5 py-4">
                                {/* Row 1: expand + name + leader + count + risk chips */}
                                <div className="flex items-center gap-2 mb-2.5">
                                  <button onClick={() => setExpandedSquads(prev => { const next = new Set(prev); next.has(si) ? next.delete(si) : next.add(si); return next })}
                                    className="flex items-center gap-2 flex-1 text-left min-w-0">
                                    <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform shrink-0", expanded && "rotate-90")} />
                                    <span className="font-bold text-slate-900 text-sm">{sq.name}</span>
                                    {leaderUser && (
                                      <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">{leaderUser.name}</span>
                                    )}
                                    <span className="text-[11px] text-slate-400 shrink-0">{sq.customer_count} KH</span>
                                  </button>
                                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                                    {(["very_safe","safe","safe_low","danger_low","danger_high"] as const).map(k => {
                                      const cnt = sq.risk_counts?.[k] ?? 0
                                      if (!cnt) return null
                                      const m = RISK_META[k]
                                      return (
                                        <span key={k} className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums", m.bg, m.color)}>
                                          {cnt} {RISK_SHORT[k]}
                                        </span>
                                      )
                                    })}
                                  </div>
                                </div>

                                {/* Row 2: CM1 progress bar */}
                                {sq.target_cm1 > 0 && (
                                  <div className="ml-6 mb-2.5">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] text-slate-400">CM1 vs Target</span>
                                      <span className={cn("text-[11px] font-bold tabular-nums", pctColor(cm1TgtPct))}>
                                        {cm1TgtPct != null ? `${cm1TgtPct}%` : "—"}
                                      </span>
                                    </div>
                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full transition-all duration-500"
                                        style={{
                                          width: `${Math.min(Math.max(cm1TgtPct ?? 0, 0), 100)}%`,
                                          background: (cm1TgtPct ?? 0) >= 100 ? "#059669" : (cm1TgtPct ?? 0) >= 85 ? "#d97706" : "#003B95",
                                        }} />
                                    </div>
                                  </div>
                                )}

                                {/* Row 3: key metrics */}
                                <div className="ml-6 flex items-center gap-4 text-xs flex-wrap">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400">Rev</span>
                                    <span className="tabular-nums text-slate-700 font-medium">{formatCompactNumber(sq.revenue)}</span>
                                    <span className="text-blue-600 font-medium">→ {formatCompactNumber(sq.revenue_pr)} PR</span>
                                    {sq.target_rev > 0 && sq.rev_pct != null && (
                                      <span className={cn("font-semibold", pctColor(sq.rev_pct))}>{sq.rev_pct}% tgt</span>
                                    )}
                                  </div>
                                  <div className="w-px h-3.5 bg-slate-200 shrink-0" />
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400">CM1</span>
                                    <span className="tabular-nums text-slate-700 font-medium">{formatCompactNumber(sq.cm1)}</span>
                                    <span className="text-blue-600">→ {formatCompactNumber(sq.cm1_pr)} PR</span>
                                    {sq.cm1_pct != null && (
                                      <span className="text-slate-400 text-[10px]">{sq.cm1_pct}%</span>
                                    )}
                                    {sq.cm1_tgt_pct != null && sq.target_cm1 > 0 && (
                                      <span className={cn("font-semibold", pctColor(sq.cm1_tgt_pct))}>{sq.cm1_tgt_pct}% tgt</span>
                                    )}
                                  </div>
                                  <div className="w-px h-3.5 bg-slate-200 shrink-0" />
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400">3HK</span>
                                    <span className="tabular-nums text-slate-700 font-medium">{formatCompactNumber(sq.hk3)}</span>
                                    <span className="text-slate-400 text-[10px]">({sq.hk3_pct}%)</span>
                                    {sq.target_hk3 > 0 && (
                                      <span className="text-slate-400 text-[10px]">/ {formatCompactNumber(sq.target_hk3)} tgt</span>
                                    )}
                                    {sq.hk3_tgt_pct != null && sq.target_hk3 > 0 && (
                                      <span className={cn("font-semibold", pctColor(sq.hk3_tgt_pct))}>{sq.hk3_tgt_pct}%</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* S4: Expanded customer table — 9 cột */}
                              {expanded && sq.customers?.length > 0 && (
                                <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50">
                                  <table className="w-full text-[11px] border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100 text-slate-500 uppercase text-[9px]">
                                        <th className="px-4 py-2 text-left font-semibold">Khách hàng</th>
                                        <th className="px-3 py-2 text-left font-semibold">PIC · Tier</th>
                                        <th className="px-3 py-2 text-right font-semibold">Rev PR</th>
                                        <th className="px-3 py-2 text-right font-semibold border-l border-slate-200">CM1 PR</th>
                                        <th className="px-3 py-2 text-right font-semibold">CM1%</th>
                                        <th className="px-3 py-2 text-right font-semibold">CM1 Tgt</th>
                                        <th className="px-3 py-2 text-right font-semibold">%TGT CM1</th>
                                        <th className="px-3 py-2 text-right font-semibold border-l border-slate-200">3HK% / Tgt%</th>
                                        <th className="px-3 py-2 text-right font-semibold">%TGT 3HK</th>
                                        <th className="px-3 py-2 text-center font-semibold border-l border-slate-200">Đánh giá</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {sq.customers.map((c: any, ci: number) => {
                                        const rm = RISK_META[c.risk_level] ?? RISK_META["no_target"]
                                        const picInfo = squadData.available_pics?.find((p: any) => p.code === c.sales_pic)
                                        return (
                                          <tr key={ci} className={ci % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                                            <td className="px-4 py-2 font-medium text-slate-700">
                                              {c.customer_name}
                                              <span className={cn("ml-1.5 text-[9px] px-1 py-0.5 rounded font-bold", c.region === "US" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600")}>{c.region}</span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">
                                              {picInfo?.name ?? c.sales_pic}
                                              <span className="text-slate-300 mx-1">·</span>
                                              {c.tier}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-blue-600">{formatCompactNumber(c.revenue_pr)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-600 border-l border-slate-100">{formatCompactNumber(c.cm1_pr)}</td>
                                            <td className={cn("px-3 py-2 text-right tabular-nums text-[10px]", c.cm1_pct >= 0 ? "text-slate-500" : "text-red-500")}>{c.cm1_pct != null ? `${c.cm1_pct}%` : "—"}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-400">{c.target_cm1 > 0 ? formatCompactNumber(c.target_cm1) : "—"}</td>
                                            <td className={cn("px-3 py-2 text-right tabular-nums", pctCol(c.cm1_tgt_pct))}>{pctV(c.cm1_tgt_pct)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-600 border-l border-slate-100">
                                              <span className="font-medium text-[10px] text-slate-500">{formatCompactNumber(c.hk3)}</span>
                                              <span className="text-slate-400 ml-0.5 text-[10px]">({c.hk3_pct}%)</span>
                                              {c.target_hk3pct > 0 && <span className="text-slate-400 text-[10px]"> / {c.target_hk3pct}%</span>}
                                            </td>
                                            <td className={cn("px-3 py-2 text-right tabular-nums", pctCol(c.hk3_tgt_pct))}>{pctV(c.hk3_tgt_pct)}</td>
                                            <td className="px-3 py-2 text-center border-l border-slate-100">
                                              <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap", rm.bg, rm.color)}>{rm.label}</span>
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {/* B4: Total row + CM1 */}
                        {squadData.totals && (
                          <div className="px-5 py-3 bg-[#003B95]/5 border-t-2 border-[#003B95]/20">
                            <div className="flex items-center gap-4 text-xs font-bold text-slate-800 flex-wrap">
                              <span className="font-semibold text-slate-500">
                                Tổng · {squadData.squads.reduce((s: number, sq: any) => s + sq.customer_count, 0)} KH
                              </span>
                              <span>Rev: {formatCompactNumber(squadData.totals.revenue)}</span>
                              <span className="text-blue-700">PR: {formatCompactNumber(squadData.totals.revenue_pr)}</span>
                              <span className="text-slate-600">CM1: {formatCompactNumber(squadData.totals.cm1)}</span>
                              <span className="text-blue-700">CM1 PR: {formatCompactNumber(squadData.totals.cm1_pr)}</span>
                              {squadData.totals.cm1_pct != null && (
                                <span className="text-slate-500">CM1%: {squadData.totals.cm1_pct}%</span>
                              )}
                              <span className="text-slate-500">3HK: {formatCompactNumber(squadData.totals.hk3)} <span className="font-normal text-slate-400">({squadData.totals.hk3_pct}%)</span></span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    <p className="px-5 py-2 text-[10px] text-slate-400 border-t border-slate-100">
                      CM1 = GP − chi phí KH (b2b_customer_cost_monthly). %TGT CM1 = CM1 PR / Target CM1 · %TGT 3HK = 3HK% / Target 3HK%.
                    </p>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MoM badge helper ────────────────────────────────────────────────────────
function MomBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[8px] text-slate-300">N/A</span>
  const pos = v >= 0
  return (
    <span className={`text-[8px] font-bold leading-none ${pos ? "text-[#10B981]" : "text-[#EF4444]"}`}>
      {pos ? "▲" : "▼"} {Math.abs(v).toFixed(1)}%
    </span>
  )
}

// ─── Sub-row (B2B / B2C within a month) ──────────────────────────────────────
function MonthSubRow({ label, stats, showPr = false, kpiFactor = 1, momRev, momCm1, qoqCm1 }: {
  label: string; stats: MonthStats; showPr?: boolean; kpiFactor?: number
  momRev?: number | null; momCm1?: number | null; qoqCm1?: number | null
}) {
  const actRev = stats.actualRevenue ?? stats.revenue
  const actGp  = stats.actualGp     ?? stats.gp
  const actCc  = stats.actualCc     ?? stats.channelCost
  const actGc  = stats.actualGc     ?? stats.groupCost
  const actCm1 = stats.actualCm1    ?? stats.cm1
  const prRev  = Math.round(actRev  * kpiFactor)
  const prCm1  = Math.round(actCm1  * kpiFactor)
  return (
    <tr className="border-b border-slate-100 bg-slate-50 text-[11px]">
      <td className="px-4 py-2 pl-9 text-slate-500 font-medium">↳ {label}</td>
      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">
        <div className="flex flex-col items-end gap-0.5">
          {fc(actRev)}
          {momRev !== undefined && <MomBadge v={momRev ?? null} />}
        </div>
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-400">{showPr ? fc(prRev) : <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{fc(actGp)}</td>
      <td className="px-4 py-2 text-right text-slate-400">{pct(stats.gpPct)}</td>
      <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{actCc > 0 ? fc(actCc) : <span className="text-slate-300">—</span>}</td>
      <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{actGc > 0 ? fc(actGc) : <span className="text-slate-300">—</span>}</td>
      <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", cm1Color(actCm1))}>
        <div className="flex flex-col items-end gap-0.5">
          {fc(actCm1)}
          {momCm1 !== undefined && <MomBadge v={momCm1 ?? null} />}
        </div>
      </td>
      <td className={cn("px-4 py-2 text-right tabular-nums", cm1Color(prCm1))}>{showPr ? fc(prCm1) : <span className="text-slate-300">—</span>}</td>
      <td className={cn("px-4 py-2 text-right font-semibold", cm1Color(stats.cm1))}>{pct(stats.cm1Pct)}</td>
      <td className={cn("px-4 py-2 text-right text-[11px] font-bold tabular-nums",
        qoqCm1 == null ? "text-slate-300" : qoqCm1 >= 0 ? "text-green-600" : "text-red-500")}>
        {qoqCm1 != null ? `${qoqCm1 >= 0 ? "+" : ""}${qoqCm1.toFixed(1)}%` : "—"}
      </td>
      <td className="px-4 py-2 text-right text-slate-400 whitespace-nowrap">{fc((stats.hk3Rev as number | undefined) ?? 0)} <span className="text-[10px]">({pct((stats.hk3Pct as number | undefined) ?? 0)})</span></td>
    </tr>
  )
}

// ─── Quarter summary row — actual (raw) values ────────────────────────────────

function QtSummaryRow({ label, actRev, prRev, gmRaw, ccRaw, gcRaw, cm1Raw, prCm1, hk3Pct, hk3Rev = 0, qoqPct }:
  { label: string; actRev: number; prRev: number; gmRaw: number; ccRaw: number; gcRaw: number; cm1Raw: number; prCm1: number; hk3Pct: number; hk3Rev?: number; qoqPct?: number | null }) {
  const gmPct  = actRev > 0 ? gmRaw  / actRev * 100 : 0
  const cm1Pct = actRev > 0 ? cm1Raw / actRev * 100 : 0
  const qoqCls = qoqPct == null ? "text-slate-300" : qoqPct >= 0 ? "text-green-600 font-bold" : "text-red-500 font-bold"
  return (
    <tr className="border-b border-slate-100 bg-white hover:bg-slate-50 text-[11px]">
      <td className="px-2 py-2 font-semibold text-slate-800">{label}</td>
      <td className="px-2 py-2 text-right font-semibold text-slate-800 tabular-nums">{fc(actRev)}</td>
      <td className={cn("px-2 py-2 text-right tabular-nums", prColor)}>{fc(prRev)}</td>
      <td className="px-2 py-2 text-right text-slate-700 tabular-nums">{fc(gmRaw)}</td>
      <td className="px-2 py-2 text-right text-slate-500">{pct(gmPct)}</td>
      <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{ccRaw > 0 ? fc(ccRaw) : "—"}</td>
      <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{gcRaw > 0 ? fc(gcRaw) : "—"}</td>
      <td className={cn("px-2 py-2 text-right font-bold tabular-nums text-[12px]", cm1Color(cm1Raw))}>{fc(cm1Raw)}</td>
      <td className={cn("px-2 py-2 text-right tabular-nums", prColor)}>{fc(prCm1)}</td>
      <td className={cn("px-2 py-2 text-right font-semibold", cm1Color(cm1Raw))}>{pct(cm1Pct)}</td>
      <td className="px-2 py-2 text-right text-slate-500 whitespace-nowrap">{hk3Rev > 0 ? <>{fc(hk3Rev)} <span className="text-[10px] text-slate-400">({pct(hk3Pct)})</span></> : pct(hk3Pct)}</td>
      <td className={cn("px-2 py-2 text-right tabular-nums", qoqCls)}>
        {qoqPct != null ? `${qoqPct >= 0 ? "+" : ""}${qoqPct.toFixed(1)}%` : "—"}
      </td>
    </tr>
  )
}

// ─── Quarter target row ───────────────────────────────────────────────────────
// Layout: label | target_rev | Đạt PR (rev_pr/tgt) | Đạt TT (rev_act/tgt) | — | — | — | target_cm1 | Đạt PR (cm1_pr/tgt) | Đạt TT (cm1_act/tgt) | —

function QtTargetRow({ label, targetRev, revPr, revAct, targetCm1, cm1Pr, cm1Act }:
  { label: string; targetRev: number; revPr: number; revAct: number; targetCm1: number; cm1Pr: number; cm1Act: number }) {
  const revPrPct  = targetRev > 0 ? revPr  / targetRev * 100 : 0
  const revActPct = targetRev > 0 ? revAct / targetRev * 100 : 0
  const cm1PrPct  = targetCm1 > 0 ? cm1Pr  / targetCm1 * 100 : 0
  const cm1ActPct = targetCm1 > 0 ? cm1Act / targetCm1 * 100 : 0
  const badge = (p: number) => (
    <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold",
      p >= 100 ? "bg-green-100 text-green-700" : p >= 75 ? "bg-blue-100 text-[#003B95]" : "bg-red-50 text-red-500")}>
      {pct(p)}
    </span>
  )
  return (
    <tr className="border-b border-dashed border-blue-100 bg-blue-50/20 text-[10px] text-slate-600">
      <td className="px-2 py-1.5 pl-6 italic text-slate-500">{label}</td>
      <td colSpan={3} className="px-2 py-1.5">
        <div className="flex items-center gap-1.5 justify-end flex-wrap">
          <span className="text-slate-500 tabular-nums">Rev: <b className="text-slate-700">{fc(targetRev)}</b></span>
          <span className="text-slate-400">PR {badge(revPrPct)}</span>
          <span className="text-slate-400">TT {badge(revActPct)}</span>
        </div>
      </td>
      <td className="px-2 py-1.5 text-right text-slate-300">—</td>
      <td className="px-2 py-1.5 text-right text-slate-300">—</td>
      <td className="px-2 py-1.5 text-right text-slate-300">—</td>
      <td colSpan={3} className="px-2 py-1.5">
        {targetCm1 > 0 ? (
          <div className="flex items-center gap-1.5 justify-end flex-wrap">
            <span className="text-slate-500 tabular-nums">CM1: <b className="text-slate-700">{fc(targetCm1)}</b></span>
            <span className="text-slate-400">PR {badge(cm1PrPct)}</span>
            <span className="text-slate-400">TT {badge(cm1ActPct)}</span>
          </div>
        ) : <span className="text-slate-300 float-right">—</span>}
      </td>
      <td className="px-2 py-1.5 text-right text-slate-300">—</td>
      <td className="px-2 py-1.5 text-right text-slate-300">—</td>
    </tr>
  )
}

// ─── B2B Tier Section ─────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  Strategic: { bg: "bg-blue-50", text: "text-[#003B95]", badge: "bg-blue-100 text-[#003B95]" },
  VIP:       { bg: "bg-purple-50", text: "text-purple-800", badge: "bg-purple-100 text-purple-700" },
  Gold:      { bg: "bg-yellow-50", text: "text-yellow-800", badge: "bg-yellow-100 text-yellow-700" },
  Silver:    { bg: "bg-slate-50", text: "text-slate-700", badge: "bg-slate-200 text-slate-600" },
}

const REGION_META: Record<string, { flag: string; label: string }> = {
  VN: { flag: "🇻🇳", label: "Việt Nam (VND)" },
  US: { flag: "🇺🇸", label: "Quốc tế (USD)" },
}

// ── Chi phí kênh nhập tay per-KH/tháng ──
interface CostLine { label: string; type: "amount" | "percent"; value: number }
type CustomerCostEdits = Record<string, Record<string, CostLine[]>>
function parseCostLines(raw?: string | null | unknown[]): CostLine[] {
  if (!raw) return []
  // Xử lý cả 2 trường hợp: JSON string (Turso) và array đã parse (Supabase JSONB)
  const arr: any[] = Array.isArray(raw)
    ? raw
    : (() => { try { const p = JSON.parse(raw as string); return Array.isArray(p) ? p : [] } catch { return [] } })()
  return arr.map((l: any) => ({ label: String(l?.label ?? ""), type: l?.type === "percent" ? "percent" : "amount", value: Number(l?.value) || 0 }))
}
// Nhãn hiển thị ô chi phí: "1.000.000đ + 5%"
function costLabel(lines: CostLine[]): string {
  let amt = 0, pct = 0
  lines.forEach(l => { if (l.type === "percent") pct += Number(l.value) || 0; else amt += Number(l.value) || 0 })
  const parts: string[] = []
  if (amt > 0) parts.push(Math.round(amt).toLocaleString("vi-VN") + "đ")
  if (pct > 0) parts.push(pct.toFixed(1) + "%")
  return parts.length ? parts.join(" + ") : "0đ"
}
function cloneCostLines(lines: CostLine[]): CostLine[] {
  return lines.map(l => ({ label: l.label, type: l.type, value: Number(l.value) || 0 }))
}
function lineTotal(lines: CostLine[], revenue: number): number {
  return lines.reduce((s, l) => s + (l.type === "percent" ? ((Number(l.value) || 0) / 100) * revenue : (Number(l.value) || 0)), 0)
}
const mLabel = (m: string) => { const [y, mo] = m.split("-"); return `T${parseInt(mo)}/${y}` }

function B2BTierSection({ b2bTiers, loading, months, allMonths, region, onRegionChange, expanded, onToggle, canEditCost, isCreator, onSaved, notify, quarterLabel, qFactor = 1, summary = [], futureScale = 1 }:
  { b2bTiers: any; loading: boolean; months: string[]; allMonths?: string[]; region: string; onRegionChange: (r: string) => void; expanded: boolean; onToggle: () => void
    canEditCost?: boolean; isCreator?: boolean; onSaved?: () => void; notify?: (ok: boolean, text: string) => void; quarterLabel?: string; qFactor?: number; summary?: MonthSummary[]; futureScale?: number }) {
  const [selectedTier, setSelectedTier] = useState<string | null>(null)
  const [custSearch, setCustSearch] = useState("")
  const [editMode, setEditMode] = useState(false)
  const [costCust, setCostCust] = useState<any | null>(null)
  const [costEdits, setCostEdits] = useState<CustomerCostEdits>({})
  const [costSnapshot, setCostSnapshot] = useState<string>("")
  const [savingCost, setSavingCost] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importMsg,     setImportMsg]     = useState("")
  const importFileRef = useRef<HTMLInputElement>(null)

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx")
    const rows: any[] = []
    for (const tier of allTiers) {
      const custs: any[] = Object.values(tier.byRegion ?? {}).flatMap((rd: any) => rd.customers ?? [])
      for (const c of custs) {
        for (const m of quarterMonths) {
          const existing = parseCostLines(c.monthsCost?.[m]?.cost_lines)
          if (existing.length > 0) {
            for (const l of existing) {
              rows.push({ customer_code: c.code, customer_name: c.name, month: m, cost_label: l.label, cost_type: l.type, cost_value: l.value })
            }
          } else {
            rows.push({ customer_code: c.code, customer_name: c.name, month: m, cost_label: "", cost_type: "amount", cost_value: "" })
          }
        }
      }
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, {
      header: ["customer_code","customer_name","month","cost_label","cost_type","cost_value"],
    }), "Chi phi B2B")
    XLSX.writeFile(wb, `b2b_cost_template_${(quarterLabel || "quarter").replace(/[^A-Za-z0-9-]/g, "_")}.xlsx`)
  }

  const handleImportFile = async (file: File) => {
    setImportLoading(true); setImportMsg("")
    try {
      const XLSX = await import("xlsx")
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf)
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any>(ws)

      const grouped = new Map<string, { code: string; month: string; lines: CostLine[] }>()
      for (const row of rows) {
        const code  = String(row.customer_code || "").trim()
        const month = String(row.month || "").trim()
        const label = String(row.cost_label || "").trim()
        const type  = row.cost_type === "percent" ? "percent" : "amount" as "amount" | "percent"
        const value = parseFloat(row.cost_value) || 0
        if (!code || !month) continue
        const key = `${code}__${month}`
        if (!grouped.has(key)) grouped.set(key, { code, month, lines: [] })
        if (label || value) grouped.get(key)!.lines.push({ label, type, value })
      }

      const costs = [...grouped.values()].map(g => ({
        month: g.month, customer_code: g.code, cost_lines: JSON.stringify(g.lines),
      }))
      if (costs.length === 0) { setImportMsg("File không có dữ liệu hợp lệ"); return }

      const res = await fetch("/api/analytics/b2b-customer-costs", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ costs }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setImportMsg(`✅ Đã import ${d.saved ?? 0} dòng (${grouped.size} customer×tháng)`)
        onSaved?.()
      } else { setImportMsg(`❌ ${d.error || "Lỗi import"}`) }
    } catch (e: any) {
      setImportMsg(`❌ ${e.message}`)
    } finally {
      setImportLoading(false)
      if (importFileRef.current) importFileRef.current.value = ""
    }
  }

  // ── Per-customer expand + target + creator orders ──
  const [expandedCusts, setExpandedCusts] = useState<Set<string>>(new Set())
  const [customerTargets, setCustomerTargets] = useState<Record<string, { cm1: number; thk: number; rev: number; hk3rev: number }>>({})
  const [editingTargetCode, setEditingTargetCode] = useState<string | null>(null)
  const [targetInputs, setTargetInputs] = useState<Record<string, { cm1: string; thk: string; rev: string; hk3rev: string }>>({})
  const [savingTargetCode, setSavingTargetCode] = useState<string | null>(null)
  // Creator: orders explorer per-customer
  const [ordersData, setOrdersData] = useState<Record<string, { rows: any[]; groupBy: string; loading: boolean }>>({})
  const [ordersGroupBy, setOrdersGroupBy] = useState<Record<string, "month" | "day">>({})
  const loadOrders = (c: any, gb: "month" | "day" = "month") => {
    if (!quarterLabel) return
    const parts = quarterLabel.split("-")
    if (parts.length !== 2) return
    const key = `${c.code}_${gb}`
    setOrdersData(prev => ({ ...prev, [key]: { rows: prev[key]?.rows ?? [], groupBy: gb, loading: true } }))
    fetch(`/api/analytics/b2b-customer-orders?customer_code=${encodeURIComponent(c.code)}&quarter=${parts[0]}&year=${parts[1]}&groupBy=${gb}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.data) setOrdersData(prev => ({ ...prev, [key]: { rows: d.data, groupBy: gb, loading: false } })) })
      .catch(() => setOrdersData(prev => ({ ...prev, [key]: { rows: [], groupBy: gb, loading: false } })))
  }

  const quarterMonths: string[] = (b2bTiers?.months ?? allMonths ?? months) as string[]

  // kpiPrFactor per tháng — project mọi tháng đang chạy kể cả elapsed < MIN_PROJECT_DAYS (giống KPI cards).
  const monthKpiFactor = useMemo(() => {
    const m: Record<string, number> = {}
    summary.forEach(s => { m[s.month] = s.elapsed > 0 && s.elapsed < s.dim ? s.dim / s.elapsed : 1 })
    return m
  }, [summary])

  // PR values của 1 KH: existing projected (Σ actual_monthly × kpiPrFactor) rồi × futureScale (gồm ước tính T9).
  // ex* = existing projected (chưa ×futureScale) → dùng để tính từng tháng tương lai trong bảng chi tiết.
  const custPr = (c: any) => {
    let exRev = 0, exGm = 0, exCm1 = 0, exHk3 = 0
    quarterMonths.forEach(m => {
      const f = monthKpiFactor[m] ?? 1
      const ms = c.monthSummary?.[m]
      if (!ms) return
      const revBase = ms.actualRevenue ?? ms.revenue
      exRev  += revBase * f
      exGm   += (ms.actualGm  ?? ms.gm)  * f
      exCm1  += (ms.actualCm1 ?? ms.cm1) * f
      // 3HK PR: dùng hk3Pct thực tế × revenue projected tháng đó
      exHk3  += (ms.hk3Pct / 100) * revBase * f
    })
    const exCc = exGm - exCm1
    const prRev = Math.round(exRev * futureScale), prGm = Math.round(exGm * futureScale), prCm1 = Math.round(exCm1 * futureScale)
    const prHk3 = Math.round(exHk3 * futureScale)
    // QoQ: PR CM1 (gồm T9) vs CM1 quý trước (BE trả prevCm1)
    const prevCm1 = c.prevCm1 ?? 0
    const qoqPct = prevCm1 !== 0 ? Math.round((prCm1 - prevCm1) / Math.abs(prevCm1) * 1000) / 10 : null
    return { prRev, prGm, prCm1, prHk3, exRev, exGm, exCm1, exHk3, exCc, prGmPct: prRev > 0 ? prGm/prRev*100 : 0, prCm1Pct: prRev > 0 ? prCm1/prRev*100 : 0, qoqPct }
  }
  // Ngày trong tháng "YYYY-MM" + tháng tương lai (chưa có trong summary) → để ước tính T9.
  const daysInMonthFE = (ym: string) => { const [yy, mm] = ym.split("-").map(Number); return new Date(yy, mm, 0).getDate() }
  const existingDaysFE = summary.reduce((s, m) => s + m.dim, 0)
  const futureMonthsFE = quarterMonths.filter(m => !summary.some(s => s.month === m))
  const allTiers: any[] = b2bTiers?.tiers ?? []

  // Load customer targets khi đổi quý
  useEffect(() => {
    if (!quarterLabel) return
    const parts = quarterLabel.split("-")  // "Q3-2026"
    if (parts.length !== 2) return
    setExpandedCusts(new Set())
    setEditingTargetCode(null)
    setCustomerTargets({})
    fetch(`/api/analytics/b2b-customer-targets?quarter=${parts[0]}&year=${parts[1]}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.targets) setCustomerTargets(d.targets) })
      .catch(() => {})
  }, [quarterLabel])

  // Ref để đọc editMode trong useEffect mà không cần capture closure
  const editModeRef = React.useRef(false)
  const prevMonthsKey = React.useRef("")

  // Helper: build costEdits từ danh sách tiers (dùng cả khi start edit lẫn khi rebuild sau refresh)
  const buildEditsFromTiers = (tiers: any[], qMonths: string[]): CustomerCostEdits => {
    const edits: CustomerCostEdits = {}
    tiers.forEach((tier: any) => {
      ;(tier.customers ?? []).forEach((c: any) => {
        if (!c?.code || edits[c.code]) return
        edits[c.code] = {}
        qMonths.forEach(m => { edits[c.code][m] = parseCostLines(c.monthsCost?.[m]?.cost_lines) })
      })
    })
    return edits
  }

  // Khi b2bTiers thay đổi:
  // - Đổi quarter → reset toàn bộ edit state
  // - Cùng quarter nhưng data refresh (sau lưu CH.Cost) → rebuild costEdits từ data mới, giữ editMode
  useEffect(() => {
    if (!b2bTiers) return
    const monthsKey = (b2bTiers.months ?? []).join(",")
    const sameQuarter = monthsKey === prevMonthsKey.current && prevMonthsKey.current !== ""
    prevMonthsKey.current = monthsKey

    if (!sameQuarter) {
      // Đổi quarter → reset hết
      setCostCust(null); setCostEdits({}); setCostSnapshot("")
      editModeRef.current = false
      setEditMode(false)
    } else if (editModeRef.current) {
      // Cùng quarter, data refresh khi đang trong edit mode → rebuild từ data mới, giữ edit mode
      setCostCust(null)
      const qMonths = (b2bTiers.months ?? allMonths ?? months) as string[]
      const newEdits = buildEditsFromTiers(b2bTiers.tiers ?? [], qMonths)
      setCostEdits(newEdits)
      setCostSnapshot(JSON.stringify(newEdits))
      // Không reset editMode → user tiếp tục edit được
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b2bTiers])

  const SUB_COLS: { label: string; tip: string }[] = [
    { label: "Revenue",      tip: "Doanh thu tier (PR)\nCT: Σ(actual_rev_KH × factor)\nfactor = dim/elapsed cho tháng đang chạy" },
    { label: "Gross Margin", tip: "GP tier (PR)\nCT: Σ(actual_GP_KH × factor)" },
    { label: "Ch.Cost",      tip: "Customer CH.Cost nhập tay (PR)\nTừ Turso b2b_customer_cost_monthly\namount: giữ nguyên (full budget tháng)\npercent: × revenue × factor\nKHÔNG gồm Group Cost (GC ở cột Tổng Quý)" },
    { label: "CM1",          tip: "CM1 tier per-month (PR)\n= GM - CH.Cost (customer-level)\nKHÔNG gồm Group Cost\nGroup Cost được khấu trừ ở cột Tổng Quý" },
    { label: "%CM1",         tip: "CM1 / Revenue × 100%\nDùng số PR (projected)" },
    { label: "%QoQ(CM1)",    tip: "So sánh CM1 PR quý này vs CM1 TT quý trước\nMức tier-level (aggregate toàn tier)\nCT: (CM1_PR - CM1_prev) / |CM1_prev|" },
    { label: "3HK%",         tip: "3HK Revenue / Tier Revenue × 100%" },
  ]
  const SUB = SUB_COLS.map(c => c.label)  // backward compat cho chỗ dùng SUB.length
  const colCount = SUB.length

  // Lấy view theo region hiện tại: ALL → dùng tổng tier; VN/US → dùng byRegion
  const pickView = (t: any) => (region === "ALL" ? t : { ...t, ...(t.byRegion?.[region] ?? {}) })
  // Chỉ hiện nhóm có dữ liệu ở region đang chọn
  const tiers = allTiers.filter((t: any) => (region === "ALL" ? t.totalRevenue > 0 : (t.byRegion?.[region]?.totalRevenue ?? 0) > 0))

  const selectedTierData = allTiers.find((t: any) => t.tier === selectedTier)
  // Các region cần hiển thị trong panel chi tiết
  const regionsToShow: ("VN" | "US")[] = region === "ALL" ? ["VN", "US"] : [region as "VN" | "US"]
  const matchSearch = (c: any) => !custSearch || c.name?.toLowerCase().includes(custSearch.toLowerCase()) || c.code?.toLowerCase().includes(custSearch.toLowerCase())

  // ── Chi phí KH: mở/sửa/lưu ──
  const buildCostEditState = () => buildEditsFromTiers(allTiers, quarterMonths)

  const startCostEdit = () => {
    const edits = buildCostEditState()
    setCostEdits(edits)
    setCostSnapshot(JSON.stringify(edits))
    editModeRef.current = true
    setEditMode(true)
  }
  const closeCostModal = () => { setCostCust(null) }
  const cancelCostEdit = () => {
    closeCostModal()
    setCostEdits({})
    setCostSnapshot("")
    editModeRef.current = false
    setEditMode(false)
  }
  // ── Per-customer target save ──
  const startEditTarget = (c: any) => {
    const tgt = customerTargets[c.code] ?? { cm1: 0, thk: 0, rev: 0, hk3rev: 0 }
    setTargetInputs(prev => ({ ...prev, [c.code]: {
      cm1:    fmtInput(tgt.cm1),
      thk:    tgt.thk > 0 ? tgt.thk.toString() : "",
      rev:    fmtInput(tgt.rev),
      hk3rev: fmtInput(tgt.hk3rev),
    }}))
    setEditingTargetCode(c.code)
  }
  const cancelEditTarget = () => { setEditingTargetCode(null) }
  const saveTarget = async (c: any) => {
    if (!quarterLabel) return
    const parts = quarterLabel.split("-")
    if (parts.length !== 2) return
    setSavingTargetCode(c.code)
    try {
      const inp = targetInputs[c.code] ?? { cm1: "", thk: "", rev: "", hk3rev: "" }
      const cm1Val    = parseFmt(inp.cm1 ?? "")
      const thkVal    = parseFloat(inp.thk || "0") || 0
      const revVal    = parseFmt(inp.rev ?? "")
      const hk3revVal = parseFmt(inp.hk3rev ?? "")
      const res = await fetch("/api/analytics/b2b-customer-targets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarter: parts[0], year: parseInt(parts[1]), customer_code: c.code, target_cm1: cm1Val, target_3hk_pct: thkVal, target_rev: revVal, target_3hk_rev: hk3revVal }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d?.ok) {
        setCustomerTargets(prev => ({ ...prev, [c.code]: { cm1: cm1Val, thk: thkVal, rev: revVal, hk3rev: hk3revVal } }))
        setEditingTargetCode(null)
        notify?.(true, `Đã lưu target KH ${c.name}`)
      } else notify?.(false, d?.error || "Lưu thất bại")
    } catch (e: any) { notify?.(false, e?.message || "Lỗi kết nối") }
    finally { setSavingTargetCode(null) }
  }

  const openCostModal = (c: any) => {
    if (!editMode) return
    setCostEdits(prev => {
      if (prev[c.code]) return prev
      const lines: Record<string, CostLine[]> = {}
      quarterMonths.forEach(m => { lines[m] = parseCostLines(c.monthsCost?.[m]?.cost_lines) })
      return { ...prev, [c.code]: lines }
    })
    setCostCust(c)
  }
  const setLine = (m: string, idx: number, patch: Partial<CostLine>) =>
    costCust && setCostEdits(prev => ({
      ...prev,
      [costCust.code]: {
        ...(prev[costCust.code] || {}),
        [m]: (prev[costCust.code]?.[m] || []).map((l, i) => i === idx ? { ...l, ...patch } : l),
      },
    }))
  const addLine = (m: string) => costCust && setCostEdits(prev => ({
    ...prev,
    [costCust.code]: {
      ...(prev[costCust.code] || {}),
      [m]: [...(prev[costCust.code]?.[m] || []), { label: "", type: "amount", value: 0 }],
    },
  }))
  const removeLine = (m: string, idx: number) => costCust && setCostEdits(prev => ({
    ...prev,
    [costCust.code]: {
      ...(prev[costCust.code] || {}),
      [m]: (prev[costCust.code]?.[m] || []).filter((_, i) => i !== idx),
    },
  }))
  const costDirty = editMode && JSON.stringify(costEdits) !== costSnapshot
  const editedLines = (c: any, m: string) => costEdits[c.code]?.[m] ?? parseCostLines(c.monthsCost?.[m]?.cost_lines)
  const editedCustomerCost = (c: any) => quarterMonths.reduce((s, m) => s + lineTotal(editedLines(c, m), c.monthsCost?.[m]?.revenue ?? 0), 0)

  // C4: tập mã KH có thay đổi chưa lưu
  const dirtyCodes = useMemo(() => {
    if (!editMode || !costSnapshot) return new Set<string>()
    try {
      const snap = JSON.parse(costSnapshot) as CustomerCostEdits
      return new Set(Object.keys(costEdits).filter(code =>
        JSON.stringify(costEdits[code]) !== JSON.stringify(snap[code] ?? {})
      ))
    } catch { return new Set<string>() }
  }, [costEdits, costSnapshot, editMode])

  const saveCost = async () => {
    if (!costDirty) return
    setSavingCost(true)
    try {
      const baseline = costSnapshot ? JSON.parse(costSnapshot) as CustomerCostEdits : {}
      const costs: { month: string; customer_code: string; cost_lines: string }[] = []
      Object.entries(costEdits).forEach(([code, monthsMap]) => {
        quarterMonths.forEach(m => {
          const current = cloneCostLines(monthsMap[m] || [])
          const prev = cloneCostLines(baseline[code]?.[m] || [])
          if (JSON.stringify(current) !== JSON.stringify(prev)) {
            costs.push({
              month: m,
              customer_code: code,
              cost_lines: JSON.stringify(current.filter(l => (Number(l.value) || 0) !== 0 || l.label.trim())),
            })
          }
        })
      })
      if (costs.length === 0) { cancelCostEdit(); return }
      const res = await fetch("/api/analytics/b2b-customer-costs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costs }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d?.ok) {
        notify?.(true, "Đã lưu chi phí B2B — đang cập nhật dữ liệu…")
        closeCostModal()  // Chỉ đóng modal, GIỮ edit mode
        // onSaved = refreshAll: flush cache + fetch mới → useEffect rebuilds costEdits, user tiếp tục edit
        onSaved?.()
      } else {
        notify?.(false, d?.error || "Lưu chi phí thất bại")
      }
    } catch (e: any) {
      notify?.(false, "Lỗi kết nối khi lưu chi phí")
    } finally { setSavingCost(false) }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button className="w-full px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-bold text-slate-900">B2B — Chi tiết theo Nhóm (Hàng) × Tháng (Cột)</h2>
        </div>
        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
          {/* Region filter */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5">
            {(["ALL", "VN", "US"] as const).map(r => (
              <button key={r} onClick={() => onRegionChange(r)}
                className={cn("px-2.5 py-1 text-[11px] font-bold rounded-md transition-all",
                  region === r ? "bg-[#003B95] text-white" : "text-slate-500 hover:bg-slate-50")}>
                {r === "ALL" ? "ALL" : `${REGION_META[r].flag} ${r}`}
              </button>
            ))}
          </div>
          <input ref={importFileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }} />
          {canEditCost && !editMode && (
            <div className="flex items-center gap-1.5">
              <button onClick={downloadTemplate}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all">
                <FileDown className="w-3 h-3" />Template
              </button>
              <button onClick={() => importFileRef.current?.click()} disabled={importLoading}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-50">
                {importLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}Import
              </button>
              {importMsg && <span className="text-[10px] font-semibold text-slate-500 max-w-[200px] truncate">{importMsg}</span>}
            </div>
          )}
          {canEditCost && (
            editMode ? (
              <>
                <button onClick={saveCost} disabled={savingCost || !costDirty}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all",
                    costDirty && !savingCost ? "bg-[#003B95] text-white border-[#003B95] hover:bg-[#00337f]" : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed")}>
                  {savingCost ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu
                </button>
                <button onClick={cancelCostEdit} disabled={savingCost}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  <X className="w-3.5 h-3.5" />Hủy
                </button>
              </>
            ) : (
              <button onClick={() => { if (!expanded) onToggle(); startCostEdit() }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-[#003B95]/30 bg-white text-[#003B95] hover:bg-blue-50 transition-all">
                <Pencil className="w-3.5 h-3.5" />Sửa chi tiết
              </button>
            )
          )}
          {loading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
          <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", expanded && "rotate-90")} />
        </div>
      </button>

      {expanded && (
        <div>
          {/* Tier pivot table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse" style={{ minWidth: `${Math.max(500, 160 + (quarterMonths.length + 1) * colCount * 72)}px` }}>
              <thead>
                <tr className="bg-[#003B95]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-300 uppercase sticky left-0 bg-[#003B95] border-r border-[#0a4a9e] min-w-[160px]">Nhóm</th>
                  {quarterMonths.map(m => {
                    const [y, mo] = m.split("-")
                    const tierMonth = allTiers[0]?.months.find((x: any) => x.month === m)
                    const isPr = tierMonth?.isProjected ?? false
                    return (
                      <th key={m} colSpan={colCount} className="px-3 py-2.5 text-center text-[10px] font-semibold text-slate-300 border-l border-[#0a4a9e] whitespace-nowrap">
                        T{parseInt(mo)}/{y}{isPr ? " (PR)" : ""}
                      </th>
                    )
                  })}
                  <th colSpan={colCount} className="px-3 py-2.5 text-center text-[10px] font-semibold text-blue-200 border-l border-[#0a4a9e] whitespace-nowrap bg-[#1e3a8a]">
                    Tổng Quý<ColInfo tip={"Tổng Quý (PR)\nRevenue: Σ(PR monthly)\nGM: Σ(GP × factor)\nCh.Cost: Σ(custCost) + GroupCost × (tier_rev/total_B2B_rev)\nCM1: Σ(custCM1) - GroupCost × revenue-share"} />
                  </th>
                </tr>
                <tr className="bg-[#1a4d99] text-[9px] text-blue-100 uppercase">
                  <th className="px-4 py-1.5 sticky left-0 bg-[#1a4d99] border-r border-[#1a56b0]" />
                  {quarterMonths.flatMap(m => SUB_COLS.map((col, i) => (
                    <th key={`${m}-${col.label}`} className={cn("px-2 py-1.5 whitespace-nowrap font-medium text-right", i === 0 && "border-l border-[#1a56b0]", col.label === "CM1" && "text-blue-300")}>
                      {col.label}{col.tip && <ColInfo tip={col.tip} />}
                    </th>
                  )))}
                  {SUB_COLS.map((col, i) => (
                    <th key={`qt-${col.label}`} className={cn("px-2 py-1.5 whitespace-nowrap font-medium text-right bg-[#162d74]", i === 0 && "border-l border-[#1a56b0]", col.label === "CM1" && "text-blue-300")}>
                      {col.label}{col.tip && <ColInfo tip={col.tip} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={1 + (quarterMonths.length + 1) * colCount} className="px-4 py-8 text-center text-slate-400 text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Đang tải dữ liệu nhóm...
                  </td></tr>
                )}
                {!loading && tiers.length === 0 && (
                  <tr><td colSpan={1 + (quarterMonths.length + 1) * colCount} className="px-4 py-8 text-center text-slate-400 text-xs italic">Chưa có dữ liệu B2B {region !== "ALL" ? `${REGION_META[region]?.flag} ${region} ` : ""}cho kỳ này.</td></tr>
                )}
                {!loading && tiers.map((tierRaw: any, ri: number) => {
                  const tier = pickView(tierRaw)
                  const colors = TIER_COLORS[tierRaw.tier] || TIER_COLORS.Strategic
                  const isSel = selectedTier === tierRaw.tier

                  // Tổng Quý: PR = tier.total* (BE đã chiếu theo THÁNG — tháng xong dùng actual, tháng hiện tại
                  // chiếu theo ngày). ĐỒNG BỘ với các dòng tháng + %QoQ. (Trước dùng actualYTD × qFactor → scale
                  // nhầm cả tháng đã xong → Tổng Quý và QoQ đều cao ảo.)
                  const tierMonths: any[] = tier.months ?? []
                  const hasProjectedMonth = tierMonths.some((d: any) => d.isProjected && d.hasData)
                  const qActRev = tierMonths.reduce((s: number, d: any) => s + (d.isProjected ? (d.actualRevenue ?? d.revenue) : d.revenue), 0)
                  const qActGm  = tierMonths.reduce((s: number, d: any) => s + (d.isProjected ? (d.actualGm  ?? d.gm)  : d.gm),  0)
                  const qActCc  = tierMonths.reduce((s: number, d: any) => s + (d.actualCc ?? d.cc), 0) // luôn dùng actualCc khi có (pro-rated cho mọi tháng đang chạy)
                  const qActCm1 = tierMonths.reduce((s: number, d: any) => s + (d.isProjected ? (d.actualCm1 ?? d.cm1) : d.cm1), 0)
                  const r2 = Math.round
                  // Tổng Quý PR = existing_projected (BE) × futureScale (gồm ước tính T9 tháng chưa tới).
                  const qPrRev  = r2(tier.totalRevenue * futureScale)
                  const qPrGm   = r2(tier.totalGm * futureScale)
                  const qPrCc   = r2(tier.totalCc * futureScale)
                  const qPrCm1  = r2(tier.totalCm1 * futureScale)

                  // Helper: stacked PR (blue) / Actual (slate) — dùng fc() cho số đầy đủ, font nhỏ
                  const dual = (pr: number, act: number | undefined, cls = "text-slate-700") => act != null ? (
                    <div className="flex flex-col items-end leading-snug gap-0">
                      <span className={cn("tabular-nums font-semibold text-[10px] whitespace-nowrap", cls)}>{fc(pr)}<sup className="text-[8px] font-bold text-blue-400 ml-0.5">PR</sup></span>
                      <span className="tabular-nums font-semibold text-[9px] text-blue-600 whitespace-nowrap">{fc(act)}<sup className="text-[8px] font-bold text-blue-400 ml-0.5">Act</sup></span>
                    </div>
                  ) : <span className={cn("tabular-nums text-[10px] font-semibold", cls)}>{fc(pr)}</span>

                  return (
                    <tr key={tierRaw.tier}
                      onClick={() => setSelectedTier(isSel ? null : tierRaw.tier)}
                      className={cn("border-b border-slate-100 cursor-pointer transition-colors",
                        ri % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                        isSel && "ring-1 ring-inset ring-[#003B95]",
                        "hover:bg-blue-50/30")}>
                      <td className="px-4 py-2.5 sticky left-0 border-r border-slate-100 font-bold" style={{ backgroundColor: ri % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                        <div className="flex items-center gap-2">
                          {isSel ? <ChevronDown className="w-3.5 h-3.5 text-[#003B95]" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                          <span className={cn("text-xs font-bold", colors.text)}>{tierRaw.tier}</span>
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-bold", colors.badge)}>{tier.customerCount} KH</span>
                        </div>
                      </td>
                      {quarterMonths.flatMap((m: string) => {
                        const d = tier.months.find((x: any) => x.month === m)
                        if (!d?.hasData) {
                          return SUB.map((_: string, i: number) => (
                            <td key={`${m}-${i}`} className={cn("px-2 py-2.5 text-right text-slate-300", i === 0 && "border-l border-slate-100")}>—</td>
                          ))
                        }
                        const pr = d.isProjected  // tháng đang chạy → hiện cả actual + PR
                        return [
                          <td key="rev" className="px-2 py-2.5 text-right border-l border-slate-100">{dual(d.revenue, pr ? d.actualRevenue : undefined, "text-slate-700")}</td>,
                          <td key="gm"  className="px-2 py-2.5 text-right">{dual(d.gm, pr ? d.actualGm : undefined, "text-slate-600")}</td>,
                          <td key="cc"  className="px-2 py-2.5 text-right text-slate-500 tabular-nums">{d.cc > 0 ? (d.actualCc != null ? (pr ? dual(d.cc, d.actualCc, "text-slate-500") : fc(d.actualCc)) : fc(d.cc)) : "—"}</td>,
                          <td key="cm1" className={cn("px-2 py-2.5 text-right font-semibold", cm1Color(d.cm1))}>{dual(d.cm1, pr ? d.actualCm1 : undefined, cm1Color(d.cm1))}</td>,
                          <td key="pct" className={cn("px-2 py-2.5 text-right", cm1Color(d.cm1))}>{pct(d.cm1Pct)}</td>,
                          <td key="qoq" className="px-2 py-2.5 text-right text-slate-300">—</td>,
                          <td key="3hk" className="px-2 py-2.5 text-right text-slate-500 whitespace-nowrap">{fc(d.hk3Rev ?? 0)} <span className="text-[9px] text-slate-400">({pct(d.hk3Pct)})</span></td>,
                        ]
                      })}
                      {/* Tổng Quý: PR = BE per-month projected sum, Act = actualYTD */}
                      <td className="px-2 py-2.5 text-right border-l border-blue-200 bg-blue-50/60">{dual(qPrRev, hasProjectedMonth ? qActRev : undefined, "text-slate-700")}</td>
                      <td className="px-2 py-2.5 text-right bg-blue-50/60">{dual(qPrGm, hasProjectedMonth ? qActGm : undefined, "text-slate-600")}</td>
                      <td className="px-2 py-2.5 text-right text-slate-500 tabular-nums bg-blue-50/60">{qPrCc > 0 ? dual(qPrCc, hasProjectedMonth ? qActCc : undefined, "text-slate-500") : "—"}</td>
                      <td className={cn("px-2 py-2.5 text-right bg-blue-50/60", cm1Color(qPrCm1))}>{dual(qPrCm1, hasProjectedMonth ? qActCm1 : undefined, cm1Color(qPrCm1))}</td>
                      <td className={cn("px-2 py-2.5 text-right bg-blue-50/60", cm1Color(qPrCm1))}>{pct(qPrRev > 0 ? qPrCm1 / qPrRev * 100 : 0)}</td>
                      {(() => {
                        // QoQ: PR CM1 (gồm T9) vs CM1 quý trước (BE trả prevCm1)
                        const tierQoQ = tier.prevCm1 && tier.prevCm1 !== 0 ? Math.round((qPrCm1 - tier.prevCm1) / Math.abs(tier.prevCm1) * 1000) / 10 : null
                        return (
                          <td className={cn("px-2 py-2.5 text-right font-semibold tabular-nums bg-blue-50/60", tierQoQ == null ? "text-slate-300" : tierQoQ >= 0 ? "text-green-600" : "text-red-500")}>
                            {tierQoQ != null ? `${tierQoQ >= 0 ? "+" : ""}${tierQoQ.toFixed(1)}%` : "—"}
                          </td>
                        )
                      })()}
                      <td className="px-2 py-2.5 text-right text-slate-500 bg-blue-50/60 whitespace-nowrap">{fc(tier.totalHk3Rev ?? 0)} <span className="text-[9px] text-slate-400">({pct(tier.totalHk3Pct)})</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Customer detail panel — tách theo region VN / US */}
          {selectedTierData && (
            <div className="border-t border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                    Khách hàng nhóm: <span className={TIER_COLORS[selectedTierData.tier]?.text ?? "text-slate-700"}>{selectedTierData.tier}</span>
                  </h3>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text" placeholder="Tìm tên, mã KH..."
                    value={custSearch} onChange={e => setCustSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003B95]/40 w-56"
                  />
                </div>
              </div>
              {editMode && (
                <p className="text-[11px] text-[#003B95] bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
                  💡 Bấm vào ô <b>Ch.Cost</b> của từng khách hàng để nhập chi phí kênh theo tháng (nhiều dòng: số tiền hoặc %). CM1 = Gross Margin − Chi phí.
                </p>
              )}

              {regionsToShow.map(reg => {
                const rd = selectedTierData.byRegion?.[reg]
                const custs = (rd?.customers ?? []).filter(matchSearch)
                if (!rd || (rd.customerCount ?? 0) === 0) return null
                return (
                  <div key={reg} className="space-y-2">
                    {/* Region sub-header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base">{REGION_META[reg].flag}</span>
                      <span className="text-xs font-bold text-[#003B95] uppercase tracking-wide">{reg} — {REGION_META[reg].label}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-semibold">{rd.customerCount} KH</span>
                      <span className="text-[10px] text-slate-400">Revenue {fc(rd.totalRevenue)} · CM1 <span className={cm1Color(rd.totalCm1)}>{fc(rd.totalCm1)}</span> ({pct(rd.totalCm1Pct)})</span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-100">
                      <table className="w-full text-[10px] border-collapse">
                        <thead>
                          <tr className="bg-slate-100">
                            {isCreator && <th className="px-1.5 py-1.5 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">Mã KH</th>}
                            <th className="px-1.5 py-1.5 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wide">Tên KH</th>
                            {isCreator && <th className="px-1.5 py-1.5 text-left text-[9px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">Bảng giá</th>}
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">Revenue</th>
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">G.Margin</th>
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide">GM%</th>
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">Ch.Cost</th>
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide">CM1</th>
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">%Tgt CM1</th>
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide">%CM1</th>
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">%QoQ</th>
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide">3HK%</th>
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">3HK Rev TGT</th>
                            <th className="px-1.5 py-1.5 text-right text-[9px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">%TGT 3HK</th>
                          </tr>
                        </thead>
                        <tbody>
                          {custs.map((c: any, i: number) => {
                            const isExpanded = expandedCusts.has(c.code)
                            const toggleExpand = () => setExpandedCusts(prev => { const s = new Set(prev); s.has(c.code) ? s.delete(c.code) : s.add(c.code); return s })
                            const hp = c.hasProjected === true
                            // Actual YTD (dùng trong expanded sub-row + target progress)
                            const actRev = hp ? (c.actualRevenue ?? c.revenue) : c.revenue
                            const actGm  = hp ? (c.actualGm  ?? c.gm)  : c.gm
                            const actCc  = hp ? (c.actualCc  ?? c.cc)  : c.cc
                            const actCm1 = hp ? (c.actualCm1 ?? c.cm1) : c.cm1
                            // Main row: Pro-rata values (kpiPrFactor + futureScale gồm ước tính T9)
                            const pr = custPr(c)
                            const prGmPct = pr.prGmPct
                            const qoqCls = pr.qoqPct == null ? "text-slate-300" : pr.qoqPct >= 0 ? "text-green-600 font-bold" : "text-red-500 font-bold"
                            // Target
                            const tgt = customerTargets[c.code] ?? { cm1: 0, thk: 0, rev: 0, hk3rev: 0 }
                            const isEditingTgt = editingTargetCode === c.code
                            const isSavingTgt  = savingTargetCode  === c.code
                            const colSpanAll = 12 + (isCreator ? 2 : 0)
                            return (
                              <React.Fragment key={c.code}>
                                {/* ── Main row: Pro-rata values (mặc định) — bấm tên để expand xem chi tiết ── */}
                                <tr className={cn("border-t border-slate-50 cursor-pointer", i % 2 === 0 ? "bg-white" : "bg-slate-50/50", "hover:bg-blue-50/10")}>
                                  {isCreator && <td className="px-1.5 py-1 font-mono text-slate-500 whitespace-nowrap text-[9px]">{c.code}</td>}
                                  <td className="px-1.5 py-1 text-slate-700 font-medium max-w-[130px]" onClick={toggleExpand}>
                                    <div className="flex items-center gap-1">
                                      <ChevronRight className={cn("w-3 h-3 text-slate-400 flex-shrink-0 transition-transform", isExpanded && "rotate-90")} />
                                      <span className="truncate text-[10px]" title={c.name}>{c.name}</span>
                                      {editMode && dirtyCodes.has(c.code) && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                                    </div>
                                  </td>
                                  {isCreator && (
                                    <td className="px-1.5 py-1 whitespace-nowrap">
                                      {c.priceListName ? <span className="text-[9px] font-mono text-[#003B95] bg-blue-50 border border-blue-100 px-1 py-0.5 rounded">{c.priceListName}</span> : <span className="text-slate-300">—</span>}
                                    </td>
                                  )}
                                  <td className="px-1.5 py-1 text-right text-slate-700 tabular-nums font-semibold text-[10px] whitespace-nowrap">{fc(pr.prRev)}</td>
                                  <td className="px-1.5 py-1 text-right text-slate-600 tabular-nums text-[10px] whitespace-nowrap">{fc(pr.prGm)}</td>
                                  <td className="px-1.5 py-1 text-right text-slate-500 text-[10px]">{pct(prGmPct)}</td>
                                  <td className="px-1.5 py-1 text-right tabular-nums text-[10px]">
                                    {editMode && canEditCost
                                      ? <button onClick={() => openCostModal(c)} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#003B95]/30 bg-blue-50 text-[#003B95] font-semibold hover:bg-blue-100 text-[10px]" title="Nhập chi phí">
                                          <Pencil className="w-3 h-3" />{editedCustomerCost(c) > 0 ? fc(editedCustomerCost(c)) : "0"}
                                        </button>
                                      : <span className="text-slate-500 whitespace-nowrap">{c.cc > 0 ? fc(c.cc) : "—"}</span>}
                                  </td>
                                  <td className={cn("px-1.5 py-1 text-right font-semibold tabular-nums text-[10px] whitespace-nowrap", cm1Color(pr.prCm1))}>{fc(pr.prCm1)}</td>
                                  <td className="px-1.5 py-1 text-right text-[10px]">
                                    {tgt.cm1 > 0 ? (() => { const p = pr.prCm1 / tgt.cm1 * 100; return <span className={cn("inline-flex px-1 py-0.5 rounded font-bold tabular-nums", p >= 100 ? "bg-green-100 text-green-700" : p >= 75 ? "bg-blue-100 text-[#003B95]" : "bg-amber-50 text-amber-600")}>{p.toFixed(1)}%</span> })() : <span className="text-slate-300">—</span>}
                                  </td>
                                  <td className={cn("px-1.5 py-1 text-right text-[10px]", cm1Color(pr.prCm1))}>{pct(pr.prCm1Pct)}</td>
                                  <td className={cn("px-1.5 py-1 text-right text-[10px]", qoqCls)}>{pr.qoqPct != null ? `${pr.qoqPct >= 0 ? "+" : ""}${pr.qoqPct.toFixed(1)}%` : "—"}</td>
                                  <td className="px-1.5 py-1 text-right text-slate-500 text-[10px] whitespace-nowrap">{fc(c.hk3Rev)} <span className="text-[9px] text-slate-400">({pct(c.hk3Pct)})</span></td>
                                  {/* Target 3HK Revenue: dùng hk3rev nếu nhập, fallback computed */}
                                  {(() => {
                                    const tgt3hk = tgt.hk3rev > 0 ? tgt.hk3rev
                                      : (tgt.rev > 0 && tgt.thk > 0 ? Math.round(tgt.rev * tgt.thk / 100) : 0)
                                    return (
                                      <>
                                        <td className="px-1.5 py-1 text-right text-slate-500 text-[10px] tabular-nums whitespace-nowrap">
                                          {tgt3hk > 0 ? fc(tgt3hk) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-1.5 py-1 text-right text-[10px]">
                                          {tgt3hk > 0 ? (() => {
                                            const p = pr.prHk3 / tgt3hk * 100
                                            return <span className={cn("inline-flex px-1 py-0.5 rounded font-bold tabular-nums", p >= 100 ? "bg-green-100 text-green-700" : p >= 75 ? "bg-blue-100 text-[#003B95]" : "bg-amber-50 text-amber-600")}>{p.toFixed(1)}%</span>
                                          })() : <span className="text-slate-300">—</span>}
                                        </td>
                                      </>
                                    )
                                  })()}
                                </tr>

                                {/* ── Sub-row expanded ── */}
                                {isExpanded && (() => {
                                  const ms: Record<string, any> = c.monthSummary ?? {}
                                  const qm: string[] = quarterMonths
                                  const fmtM = (m: string) => { const [y, mo] = m.split("-"); return `T${parseInt(mo)}/${y}` }
                                  // Metrics rows: label | T7 | T8[Actual|Pro-rata] | T9(ước tính) | Tổng Quý
                                  // Tháng hiện tại (mf>1) → 2 sub-cột Actual & Pro-rata. Tháng xong/tương lai → 1 cột.
                                  type MRow = { label: string
                                    actCell: (mk: string) => React.ReactNode   // T8 — Actual
                                    prCell: (mk: string) => React.ReactNode      // T8 — Pro-rata
                                    single: (mk: string) => React.ReactNode      // tháng xong / tương lai
                                    tot: React.ReactNode }
                                  // Tổng Quý per-customer = pr.* (existing projected × futureScale, GỒM ước tính T9).
                                  const cPrRev = pr.prRev
                                  const cPrGm  = pr.prGm
                                  const cPrCc  = pr.prGm - pr.prCm1  // = exCc × futureScale
                                  const cPrCm1 = pr.prCm1
                                  const futRatio = (mk: string) => existingDaysFE > 0 ? daysInMonthFE(mk) / existingDaysFE : 0
                                  const mf = (mk: string) => monthKpiFactor[mk] ?? 1        // hệ số chiếu tháng đó (>1 = tháng hiện tại)
                                  const isCurDetail = (mk: string) => (monthKpiFactor[mk] ?? 1) > 1
                                  const isFut = (mk: string) => futureMonthsFE.includes(mk)
                                  // accessor actual per metric (tháng hiện tại)
                                  const aRev = (m: any) => m.actualRevenue ?? m.revenue
                                  const aGm  = (m: any) => m.actualGm ?? m.gm
                                  const aCc  = (m: any) => m.actualCc ?? m.cc
                                  const aCm1 = (m: any) => m.actualCm1 ?? m.cm1
                                  const numC = (v: number, cls = "text-slate-700") => <span className={cn("tabular-nums text-[10px] font-semibold whitespace-nowrap", cls)}>{fc(v)}</span>
                                  const prLine = (val: React.ReactNode, cls = "text-blue-700") => (
                                    <div className="flex items-baseline justify-end gap-1 leading-snug">
                                      <span className="text-[9px] font-bold text-blue-400 flex-shrink-0">Pr.</span>
                                      <span className={cn("tabular-nums font-semibold text-[10px] whitespace-nowrap", cls)}>{val}</span>
                                    </div>
                                  )
                                  const actLine = (val: React.ReactNode, cls = "text-slate-700") => (
                                    <div className="flex items-baseline justify-end gap-1 leading-snug">
                                      <span className="text-[9px] font-bold text-slate-400 flex-shrink-0">Act.</span>
                                      <span className={cn("tabular-nums font-semibold text-[9px] whitespace-nowrap", cls)}>{val}</span>
                                    </div>
                                  )
                                  const estLine = (val: React.ReactNode, cls = "text-amber-600") => (
                                    <div className="flex items-baseline justify-end gap-1 leading-snug">
                                      <span className="text-[9px] font-bold text-amber-400 flex-shrink-0">~ƯT</span>
                                      <span className={cn("tabular-nums font-semibold text-[10px] italic whitespace-nowrap", cls)}>{val}</span>
                                    </div>
                                  )
                                  const mRows: MRow[] = [
                                    { label: "Revenue",
                                      actCell: (mk) => numC(Math.round(aRev(ms[mk])), "text-slate-600"),
                                      prCell:  (mk) => numC(Math.round(aRev(ms[mk]) * mf(mk)), "text-blue-700"),
                                      single:  (mk) => { const m = ms[mk]; return m ? numC(Math.round(m.revenue), "text-slate-700") : isFut(mk) ? estLine(fc(Math.round(pr.exRev * futRatio(mk))), "text-slate-600") : <span className="text-slate-200">—</span> },
                                      tot: hp ? <>{prLine(fc(cPrRev))}{actLine(fc(actRev))}</> : numC(actRev, "text-slate-700") },
                                    { label: "G.Margin",
                                      actCell: (mk) => numC(Math.round(aGm(ms[mk])), "text-slate-600"),
                                      prCell:  (mk) => numC(Math.round(aGm(ms[mk]) * mf(mk)), "text-blue-700"),
                                      single:  (mk) => { const m = ms[mk]; return m ? numC(Math.round(m.gm), "text-slate-600") : isFut(mk) ? estLine(fc(Math.round(pr.exGm * futRatio(mk))), "text-slate-600") : <span className="text-slate-200">—</span> },
                                      tot: hp ? <>{prLine(fc(cPrGm), "text-blue-700")}{actLine(fc(actGm), "text-slate-600")}</> : numC(actGm, "text-slate-600") },
                                    { label: "Ch.Cost",
                                      actCell: (mk) => { const v = Math.round(aCc(ms[mk])); return v > 0 ? numC(v, "text-slate-500") : <span className="text-slate-200">—</span> },
                                      prCell:  (mk) => { const v = Math.round(aCc(ms[mk]) * mf(mk)); return v > 0 ? numC(v, "text-slate-500") : <span className="text-slate-200">—</span> },
                                      single:  (mk) => { const m = ms[mk]; if (m) { const v = m.actualCc ?? m.cc; return v > 0 ? numC(Math.round(v), "text-slate-500") : <span className="text-slate-200">—</span> } return isFut(mk) && pr.exCc > 0 ? estLine(fc(Math.round(pr.exCc * futRatio(mk))), "text-slate-500") : <span className="text-slate-200">—</span> },
                                      tot: hp ? <>{prLine(fc(cPrCc), "text-slate-500")}{actLine(fc(actCc), "text-slate-500")}</> : <span className="tabular-nums text-slate-500 text-[10px] whitespace-nowrap">{actCc > 0 ? fc(actCc) : "—"}</span> },
                                    { label: "CM1",
                                      actCell: (mk) => { const v = Math.round(aCm1(ms[mk])); return numC(v, cm1Color(v)) },
                                      prCell:  (mk) => { const v = Math.round(aCm1(ms[mk]) * mf(mk)); return numC(v, cm1Color(v)) },
                                      single:  (mk) => { const m = ms[mk]; if (m) { const v = m.actualCm1 ?? m.cm1; return numC(Math.round(v), cm1Color(v)) } return isFut(mk) ? estLine(fc(Math.round(pr.exCm1 * futRatio(mk))), cm1Color(pr.exCm1)) : <span className="text-slate-200">—</span> },
                                      tot: hp ? <>{prLine(fc(cPrCm1), cm1Color(cPrCm1))}{actLine(fc(actCm1), cm1Color(actCm1))}</> : numC(actCm1, cm1Color(actCm1)) },
                                    { label: "CM1%",
                                      actCell: (mk) => { const m = ms[mk]; const r = aRev(m) > 0 ? aCm1(m) / aRev(m) * 100 : 0; return <span className={cn("text-[10px]", cm1Color(r))}>{pct(r)}</span> },
                                      prCell:  (mk) => { const m = ms[mk]; const r = aRev(m) > 0 ? aCm1(m) / aRev(m) * 100 : 0; return <span className={cn("text-[10px]", cm1Color(r))}>{pct(r)}</span> },
                                      single:  (mk) => { const m = ms[mk]; if (m) return <span className={cn("text-[10px]", cm1Color(m.cm1))}>{pct(m.cm1Pct)}</span>; return isFut(mk) ? <span className={cn("text-[10px] italic", cm1Color(pr.exCm1))}>{pct(pr.prCm1Pct)}</span> : <span className="text-slate-200">—</span> },
                                      tot: <span className={cn("text-[10px]", cm1Color(cPrCm1))}>{pct(cPrRev > 0 ? cPrCm1 / cPrRev * 100 : 0)}</span> },
                                    { label: "3HK",
                                      actCell: (mk) => <span className="tabular-nums text-slate-500 text-[10px] whitespace-nowrap">{fc(ms[mk].hk3Rev ?? 0)} <span className="text-[9px] text-slate-400">({pct(ms[mk].hk3Pct)})</span></span>,
                                      prCell:  (mk) => <span className="tabular-nums text-slate-500 text-[10px] whitespace-nowrap">{fc(ms[mk].hk3Rev ?? 0)} <span className="text-[9px] text-slate-400">({pct(ms[mk].hk3Pct)})</span></span>,
                                      single:  (mk) => { const m = ms[mk]; if (m) return <span className="tabular-nums text-slate-500 text-[10px] whitespace-nowrap">{fc(m.hk3Rev ?? 0)} <span className="text-[9px] text-slate-400">({pct(m.hk3Pct)})</span></span>; return isFut(mk) ? <span className="tabular-nums text-slate-400 text-[10px] italic">{pct(c.hk3Pct)}</span> : <span className="text-slate-200">—</span> },
                                      tot: <span className="tabular-nums text-slate-500 text-[10px] whitespace-nowrap">{fc(c.hk3Rev)} <span className="text-[9px] text-slate-400">({pct(c.hk3Pct)})</span></span> },
                                  ]
                                  // Creator orders explorer state
                                  const gb = ordersGroupBy[c.code] ?? "month"
                                  const odKey = `${c.code}_${gb}`
                                  const od = ordersData[odKey]
                                  return (
                                    <tr className="border-t border-slate-200">
                                      <td colSpan={colSpanAll} className="p-0">
                                        <div className="bg-slate-50 border-b border-slate-200">
                                          {/* ── Per-month breakdown table ── */}
                                          <div className="px-4 pt-3 pb-2 overflow-x-auto">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Chi tiết theo Tháng</p>
                                            <table className="text-[11px] border-collapse w-full" style={{ minWidth: 360 }}>
                                              <thead>
                                                <tr className="bg-[#003B95]">
                                                  <th className="px-3 py-1.5 text-left text-[10px] text-slate-300 font-semibold uppercase w-20"></th>
                                                  {qm.map(m => isCurDetail(m) ? (
                                                    <React.Fragment key={m}>
                                                      <th className="px-3 py-1.5 text-right text-[10px] text-slate-300 font-semibold whitespace-nowrap border-l border-[#1a4d99]">{fmtM(m)}<sup className="text-slate-400 text-[8px] ml-0.5">Act</sup></th>
                                                      <th className="px-3 py-1.5 text-right text-[10px] text-blue-200 font-semibold whitespace-nowrap">{fmtM(m)}<sup className="text-blue-300 text-[8px] ml-0.5">PR</sup></th>
                                                    </React.Fragment>
                                                  ) : (
                                                    <th key={m} className="px-3 py-1.5 text-right text-[10px] text-slate-300 font-semibold whitespace-nowrap border-l border-[#1a4d99]">
                                                      {fmtM(m)}{futureMonthsFE.includes(m) ? <sup className="text-amber-300 text-[8px] ml-0.5">ƯT</sup> : ""}
                                                    </th>
                                                  ))}
                                                  <th className="px-3 py-1.5 text-right text-[10px] text-blue-200 font-semibold border-l border-[#1a4d99] bg-[#1e3a8a]">Tổng Quý</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {mRows.map((row, ri) => (
                                                  <tr key={row.label} className={ri % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                                                    <td className="px-3 py-1.5 font-bold text-slate-500 uppercase text-[9px] tracking-wider whitespace-nowrap">{row.label}</td>
                                                    {qm.map(m => isCurDetail(m) ? (
                                                      <React.Fragment key={m}>
                                                        <td className="px-3 py-1.5 text-right border-l border-slate-100">{ms[m] ? row.actCell(m) : <span className="text-slate-200">—</span>}</td>
                                                        <td className="px-3 py-1.5 text-right bg-blue-50/40">{ms[m] ? row.prCell(m) : <span className="text-slate-200">—</span>}</td>
                                                      </React.Fragment>
                                                    ) : (
                                                      <td key={m} className="px-3 py-1.5 text-right border-l border-slate-100">{row.single(m)}</td>
                                                    ))}
                                                    <td className="px-3 py-1.5 text-right border-l border-blue-200 bg-blue-50/60">{row.tot}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>

                                          {/* ── Bottom: Target + Creator explorer ── */}
                                          <div className="px-4 pb-3 grid grid-cols-2 gap-6 border-t border-slate-100 pt-2.5">
                                            {/* Target & Progress */}
                                            <div>
                                              <div className="flex items-center gap-2 mb-2">
                                                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Target & Progress</p>
                                                {canEditCost && !isEditingTgt && (
                                                  <button onClick={() => startEditTarget(c)} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-[#003B95] border border-[#003B95]/30 bg-white hover:bg-blue-50 rounded-md">
                                                    <Pencil className="w-2.5 h-2.5" />Sửa target
                                                  </button>
                                                )}
                                                {isEditingTgt && (
                                                  <div className="flex gap-1.5 ml-auto">
                                                    <button onClick={() => saveTarget(c)} disabled={isSavingTgt}
                                                      className={cn("flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md", !isSavingTgt ? "bg-[#003B95] text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed")}>
                                                      {isSavingTgt ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Save className="w-2.5 h-2.5" />}Lưu
                                                    </button>
                                                    <button onClick={cancelEditTarget} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-md">
                                                      <X className="w-2.5 h-2.5" />Hủy
                                                    </button>
                                                  </div>
                                                )}
                                              </div>
                                              <div className="space-y-2 text-[11px]">
                                                {/* Target Revenue */}
                                                <div className="flex items-center justify-between gap-3">
                                                  <span className="text-slate-500 flex-shrink-0">Revenue Target</span>
                                                  {isEditingTgt ? (
                                                    <input type="text" value={targetInputs[c.code]?.rev ?? ""} placeholder="VD: 2.000.000.000"
                                                      onChange={e => setTargetInputs(prev => ({ ...prev, [c.code]: { ...(prev[c.code] ?? { cm1: "", thk: "", rev: "" }), rev: e.target.value } }))}
                                                      className="flex-1 min-w-0 px-2 py-1 text-[11px] text-right border border-[#003B95]/40 rounded focus:outline-none focus:ring-1 focus:ring-[#003B95]/40" />
                                                  ) : tgt.rev > 0 ? (
                                                    <div className="text-right space-y-0.5">
                                                      <div className="text-slate-600 font-semibold tabular-nums text-[10px]">Target quý: {fc(tgt.rev)}</div>
                                                      <div className="flex gap-2 justify-end text-[10px]">
                                                        <span className="text-slate-400">Dự kiến:</span>
                                                        <span className={cn("font-bold", cPrRev / tgt.rev >= 1 ? "text-green-600" : cPrRev / tgt.rev >= 0.75 ? "text-[#003B95]" : "text-amber-600")}>
                                                          {pct(tgt.rev > 0 ? cPrRev / tgt.rev * 100 : 0)}
                                                        </span>
                                                      </div>
                                                      <div className="flex gap-2 justify-end text-[10px]">
                                                        <span className="text-slate-400">Tiến độ TT:</span>
                                                        <span className={cn("font-bold", actRev / tgt.rev >= 1 ? "text-green-600" : actRev / tgt.rev >= 0.75 ? "text-[#003B95]" : "text-amber-600")}>
                                                          {pct(tgt.rev > 0 ? actRev / tgt.rev * 100 : 0)}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  ) : <span className="text-slate-300">Chưa đặt</span>}
                                                </div>
                                                {/* Target CM1 */}
                                                <div className="flex items-center justify-between gap-3">
                                                  <span className="text-slate-500 flex-shrink-0">CM1 Target</span>
                                                  {isEditingTgt ? (
                                                    <input type="text" value={targetInputs[c.code]?.cm1 ?? ""} placeholder="VD: 500.000.000"
                                                      onChange={e => setTargetInputs(prev => ({ ...prev, [c.code]: { ...(prev[c.code] ?? { cm1: "", thk: "", rev: "" }), cm1: e.target.value } }))}
                                                      className="flex-1 min-w-0 px-2 py-1 text-[11px] text-right border border-[#003B95]/40 rounded focus:outline-none focus:ring-1 focus:ring-[#003B95]/40" />
                                                  ) : tgt.cm1 > 0 ? (
                                                    <div className="text-right space-y-0.5">
                                                      <div className="text-slate-600 font-semibold tabular-nums text-[10px]">Target quý: {fc(tgt.cm1)}</div>
                                                      <div className="flex gap-2 justify-end text-[10px]">
                                                        <span className="text-slate-400">Dự kiến:</span>
                                                        <span className={cn("font-bold", cPrCm1 / tgt.cm1 >= 1 ? "text-green-600" : cPrCm1 / tgt.cm1 >= 0.75 ? "text-[#003B95]" : "text-amber-600")}>
                                                          {pct(tgt.cm1 > 0 ? cPrCm1 / tgt.cm1 * 100 : 0)}
                                                        </span>
                                                      </div>
                                                      <div className="flex gap-2 justify-end text-[10px]">
                                                        <span className="text-slate-400">Tiến độ TT:</span>
                                                        <span className={cn("font-bold", actCm1 / tgt.cm1 >= 1 ? "text-green-600" : actCm1 / tgt.cm1 >= 0.75 ? "text-[#003B95]" : "text-amber-600")}>
                                                          {pct(tgt.cm1 > 0 ? actCm1 / tgt.cm1 * 100 : 0)}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  ) : <span className="text-slate-300">Chưa đặt</span>}
                                                </div>
                                                {/* Target 3HK% */}
                                                <div className="flex items-center justify-between gap-3">
                                                  <span className="text-slate-500 flex-shrink-0">3HK% Target</span>
                                                  {isEditingTgt ? (
                                                    <input type="number" min="0" max="100" step="0.1" value={targetInputs[c.code]?.thk ?? ""} placeholder="VD: 70.0"
                                                      onChange={e => setTargetInputs(prev => ({ ...prev, [c.code]: { ...(prev[c.code] ?? { cm1: "", thk: "", rev: "" }), thk: e.target.value } }))}
                                                      className="w-24 px-2 py-1 text-[11px] text-right border border-[#003B95]/40 rounded focus:outline-none focus:ring-1 focus:ring-[#003B95]/40" />
                                                  ) : tgt.thk > 0 ? (
                                                    <div className="text-right space-y-0.5 text-[10px]">
                                                      <div className="flex gap-2 justify-end">
                                                        <span className="text-slate-400">Target:</span>
                                                        <span className="font-semibold text-slate-700">{pct(tgt.thk)}</span>
                                                      </div>
                                                      <div className="flex gap-2 justify-end">
                                                        <span className="text-slate-400">Actual:</span>
                                                        <span className={cn("font-bold", c.hk3Pct >= tgt.thk ? "text-green-600" : "text-amber-600")}>{pct(c.hk3Pct)}</span>
                                                      </div>
                                                    </div>
                                                  ) : <span className="text-slate-300">Chưa đặt</span>}
                                                </div>
                                                {/* Target 3HK Revenue — nhập tay hoặc fallback computed */}
                                                <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
                                                  <span className="text-slate-500 flex-shrink-0 text-[11px]">3HK Rev Target</span>
                                                  {isEditingTgt ? (
                                                    <div className="flex flex-col items-end gap-0.5">
                                                      <input type="text" value={targetInputs[c.code]?.hk3rev ?? ""} placeholder="VD: 1.500.000.000"
                                                        onChange={e => setTargetInputs(prev => ({ ...prev, [c.code]: { ...(prev[c.code] ?? { cm1: "", thk: "", rev: "", hk3rev: "" }), hk3rev: e.target.value } }))}
                                                        className="w-40 px-2 py-1 text-[11px] text-right border border-[#003B95]/40 rounded focus:outline-none focus:ring-1 focus:ring-[#003B95]/40" />
                                                      {tgt.rev > 0 && tgt.thk > 0 && (
                                                        <span className="text-[9px] text-slate-300">auto: {fc(Math.round(tgt.rev * tgt.thk / 100))}</span>
                                                      )}
                                                    </div>
                                                  ) : (() => {
                                                    const val = tgt.hk3rev > 0 ? tgt.hk3rev : (tgt.rev > 0 && tgt.thk > 0 ? Math.round(tgt.rev * tgt.thk / 100) : 0)
                                                    if (val <= 0) return <span className="text-slate-300 text-[10px]">Chưa đặt</span>
                                                    return (
                                                      <div className="text-right text-[10px]">
                                                        <span className="font-semibold text-slate-600 tabular-nums">{fc(val)}</span>
                                                        {tgt.hk3rev <= 0 && tgt.rev > 0 && tgt.thk > 0 && (
                                                          <span className="text-slate-300 ml-1 text-[9px]">(auto)</span>
                                                        )}
                                                      </div>
                                                    )
                                                  })()}
                                                </div>
                                              </div>
                                            </div>

                                            {/* Chi tiết số liệu — tất cả roles */}
                                            <div>
                                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                  <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">Chi tiết số liệu</p>
                                                  <div className="flex items-center gap-1 ml-auto">
                                                    <button onClick={() => { setOrdersGroupBy(prev => ({ ...prev, [c.code]: "month" })); loadOrders(c, "month") }}
                                                      className={cn("px-2 py-0.5 text-[10px] font-bold rounded-md border transition-all", (ordersGroupBy[c.code] ?? "month") === "month" ? "bg-purple-700 text-white border-purple-700" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
                                                      Tháng
                                                    </button>
                                                    <button onClick={() => { setOrdersGroupBy(prev => ({ ...prev, [c.code]: "day" })); loadOrders(c, "day") }}
                                                      className={cn("px-2 py-0.5 text-[10px] font-bold rounded-md border transition-all", ordersGroupBy[c.code] === "day" ? "bg-purple-700 text-white border-purple-700" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
                                                      Ngày
                                                    </button>
                                                  </div>
                                                </div>
                                                {!od ? (
                                                  <button onClick={() => loadOrders(c, "month")}
                                                    className="text-[11px] text-purple-700 font-semibold hover:underline">
                                                    Tải số liệu →
                                                  </button>
                                                ) : od.loading ? (
                                                  <div className="flex items-center gap-1 text-[11px] text-slate-400"><RefreshCw className="w-3 h-3 animate-spin" />Đang tải…</div>
                                                ) : od.rows.length === 0 ? (
                                                  <p className="text-[11px] text-slate-400 italic">Không có dữ liệu</p>
                                                ) : (
                                                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                                                    <table className="text-[10px] border-collapse w-full">
                                                      <thead className="sticky top-0 bg-purple-50">
                                                        <tr>
                                                          <th className="px-2 py-1 text-left font-bold text-purple-700 uppercase">Kỳ</th>
                                                          <th className="px-2 py-1 text-left font-bold text-purple-700 uppercase">Kênh</th>
                                                          <th className="px-2 py-1 text-right font-bold text-purple-700 uppercase">Đơn</th>
                                                          <th className="px-2 py-1 text-right font-bold text-purple-700 uppercase">Revenue</th>
                                                          <th className="px-2 py-1 text-right font-bold text-purple-700 uppercase">GP</th>
                                                          <th className="px-2 py-1 text-right font-bold text-purple-700 uppercase">GP%</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        {od.rows.map((r: any, ri: number) => (
                                                          <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-purple-50/30"}>
                                                            <td className="px-2 py-0.5 tabular-nums text-slate-500 whitespace-nowrap">{r.period}</td>
                                                            <td className="px-2 py-0.5 text-slate-700 max-w-[120px] truncate">{r.channel}</td>
                                                            <td className="px-2 py-0.5 text-right tabular-nums text-slate-600">{r.orders.toLocaleString("vi-VN")}</td>
                                                            <td className="px-2 py-0.5 text-right tabular-nums text-slate-700 font-semibold">{fc(r.revenue)}</td>
                                                            <td className={cn("px-2 py-0.5 text-right tabular-nums font-semibold", r.gp >= 0 ? "text-blue-700" : "text-red-500")}>{fc(r.gp)}</td>
                                                            <td className="px-2 py-0.5 text-right text-slate-500">{r.revenue > 0 ? pct(r.gp / r.revenue * 100) : "—"}</td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                    </table>
                                                  </div>
                                                )}
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })()}
                              </React.Fragment>
                            )
                          })}
                          {custs.length === 0 && (
                            <tr><td colSpan={10 + (isCreator ? 2 : 0)} className="px-3 py-6 text-center text-slate-400 italic text-xs">
                              {custSearch ? `Không tìm thấy KH khớp "${custSearch}"` : "Không có khách hàng"}
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
              {regionsToShow.every(reg => (selectedTierData.byRegion?.[reg]?.customerCount ?? 0) === 0) && (
                <p className="text-center text-slate-400 italic text-xs py-4">Nhóm này không có khách hàng ở {region !== "ALL" ? region : "khu vực nào"}.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modal nhập chi phí kênh per-KH/tháng ── */}
      {costCust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={closeCostModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Chi phí kênh — <span className="text-[#003B95]">{costCust.name}</span></h3>
                <p className="text-[11px] text-slate-400 font-mono">{costCust.code}{costCust.priceListName ? ` · ${costCust.priceListName}` : ""}{quarterLabel ? ` · ${quarterLabel}` : ""}</p>
              </div>
              <button onClick={closeCostModal} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {quarterMonths.map(m => {
                  const lines = costEdits[costCust.code]?.[m] || []
                  const rev = costCust.monthsCost?.[m]?.revenue ?? 0
                  const hasData = rev > 0 || lines.length > 0
                  const total = lineTotal(lines, rev)
                  return (
                    <div key={m} className={cn("border rounded-lg p-3 flex flex-col", hasData ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50/50")}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700">{mLabel(m)}</span>
                        <button onClick={() => addLine(m)} className="flex items-center gap-1 text-[11px] font-bold text-[#003B95] hover:underline"><Plus className="w-3.5 h-3.5" />Thêm</button>
                      </div>
                      {!hasData ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
                          <span className="text-2xl text-slate-300 font-bold">—</span>
                          <span className="text-[10px] text-slate-400 mt-1">Chưa có dữ liệu</span>
                        </div>
                      ) : (
                        <>
                          <p className="text-[10px] text-slate-400 mb-1.5">Revenue {fc(rev)}</p>
                          <div className="space-y-1.5 flex-1">
                            {lines.length === 0 && <p className="text-[11px] text-slate-400 italic">Chưa nhập. Bấm "Thêm".</p>}
                            {lines.map((l, idx) => (
                              <div key={idx} className="flex items-center gap-1">
                                <input value={l.label} onChange={e => setLine(m, idx, { label: e.target.value })} placeholder="Ghi chú"
                                  className="flex-1 min-w-0 px-1.5 py-1 text-[11px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#003B95]/40" />
                                <select value={l.type} onChange={e => setLine(m, idx, { type: e.target.value as "amount" | "percent" })}
                                  className="px-1 py-1 text-[11px] border border-slate-200 rounded bg-white focus:outline-none">
                                  <option value="amount">đ</option>
                                  <option value="percent">%</option>
                                </select>
                                <div className="flex flex-col items-end gap-0.5">
                                  <input type="number" min="0" value={l.value || ""} onChange={e => setLine(m, idx, { value: parseFloat(e.target.value) || 0 })} placeholder="0"
                                    className={cn("w-24 px-2 py-1 text-[12px] text-right tabular-nums border rounded focus:outline-none focus:ring-1",
                                      (l.value as number) < 0 ? "border-red-400 bg-red-50 focus:ring-red-400/40" : "border-slate-200 focus:ring-[#003B95]/40")} />
                                  {(l.value as number) < 0 && <span className="text-[9px] text-red-500 font-medium">Phải nhập số dương</span>}
                                </div>
                                <button onClick={() => removeLine(m, idx)} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 pt-2 border-t border-slate-100 text-right text-[11px]">
                            Tổng: <span className="font-bold text-slate-800 tabular-nums">{fc(total)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
              <span className="mr-auto text-[11px] text-slate-400">Thay đổi sẽ được lưu khi bấm Lưu ở thanh chi tiết.</span>
              <button onClick={closeCostModal} className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">Xong</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pivot table ──────────────────────────────────────────────────────────────

function PivotTable({ title, icon: Icon, channels, months, expanded, onToggle }:
  { title: string; icon: React.ElementType; channels: Channel[]; months: string[]; expanded: boolean; onToggle: () => void }) {
  const SUB = ["Revenue", "Gross Margin", "Ch.Cost", "CM1", "%CM1", "%MoM", "3HK Rev (%)"]
  const colCount = SUB.length
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button className="w-full px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse" style={{ minWidth: `${Math.max(500, 160 + months.length * colCount * 72)}px` }}>
            <thead>
              <tr className="bg-[#003B95]">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-300 uppercase sticky left-0 bg-[#003B95] border-r border-[#0a4a9e] min-w-[160px]">Kênh</th>
                {months.map(m => {
                  const [y, mo] = m.split("-")
                  const isPr = channels[0]?.months.find((x: any) => x.month === m)?.isProjected ?? false
                  return (
                    <th key={m} colSpan={colCount} className="px-3 py-2.5 text-center text-[10px] font-semibold text-slate-300 border-l border-[#0a4a9e] whitespace-nowrap">
                      T{parseInt(mo)}/{y}{isPr ? " (PR)" : ""}
                    </th>
                  )
                })}
              </tr>
              <tr className="bg-[#1a4d99] text-[9px] text-blue-100 uppercase">
                <th className="px-4 py-1.5 sticky left-0 bg-[#1a4d99] border-r border-[#1a56b0]" />
                {months.flatMap(m => SUB.map((h, i) => (
                  <th key={`${m}-${h}`} className={cn("px-2 py-1.5 whitespace-nowrap font-medium text-right", i === 0 && "border-l border-[#1a56b0]", h === "CM1" && "text-blue-300")}>
                    {h}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {channels.map((ch, ri) => (
                <tr key={ch.name} className={cn("border-b border-slate-100", ri % 2 === 0 ? "bg-white" : "bg-slate-50/60", "hover:bg-blue-50/30 transition-colors")}>
                  <td className="px-4 py-2.5 font-medium text-slate-700 sticky left-0 border-r border-slate-100" style={{ backgroundColor: ri % 2 === 0 ? "#ffffff" : "#f8fafc" }}>{ch.name}</td>
                  {months.flatMap(m => {
                    const d = ch.months.find((x: any) => x.month === m)
                    if (!d || d.revenue === 0) {
                      return SUB.map((_, i) => (
                        <td key={`${m}-${i}`} className={cn("px-2 py-2.5 text-right text-slate-300", i === 0 && "border-l border-slate-100")}>—</td>
                      ))
                    }
                    const pr = (d as any).isProjected
                    const dualC = (prVal: number, actVal: number | undefined, cls = "text-slate-700") => actVal != null ? (
                      <div className="flex flex-col items-end leading-snug">
                        <span className={cn("tabular-nums font-semibold text-[11px]", cls)}>{fck(prVal)}<sup className="text-[8px] font-bold text-blue-400 ml-0.5">PR</sup></span>
                        <span className="tabular-nums font-semibold text-[10px] text-blue-600">{fck(actVal)}<sup className="text-[8px] font-bold text-blue-400 ml-0.5">Act</sup></span>
                      </div>
                    ) : <span className={cn("tabular-nums", cls)}>{fc(prVal)}</span>
                    return [
                      <td key="rev" className="px-2 py-2.5 text-right border-l border-slate-100">{dualC(d.revenue, pr ? (d as any).actualRevenue : undefined, "text-slate-700")}</td>,
                      <td key="gm"  className="px-2 py-2.5 text-right">{dualC(d.gp, pr ? (d as any).actualGp : undefined, "text-slate-600")}</td>,
                      <td key="cc"  className="px-2 py-2.5 text-right text-slate-500 tabular-nums">{d.channelCost > 0 ? (pr && (d as any).actualCc != null ? dualC(d.channelCost, (d as any).actualCc, "text-slate-500") : fc(d.channelCost)) : "—"}</td>,
                      <td key="cm1" className={cn("px-2 py-2.5 text-right font-semibold", cm1Color(d.cm1))}>{dualC(d.cm1, pr ? (d as any).actualCm1 : undefined, cm1Color(d.cm1))}</td>,
                      <td key="pct" className={cn("px-2 py-2.5 text-right", cm1Color(d.cm1))}>{pct(d.cm1Pct)}</td>,
                      <td key="mom" className={cn("px-2 py-2.5 text-right font-medium", momColor(d.momPct))}>
                        {d.momPct != null ? `${d.momPct >= 0 ? "+" : ""}${d.momPct.toFixed(1)}%` : "—"}
                      </td>,
                      <td key="3hk" className="px-2 py-2.5 text-right text-slate-500">
                        {d.three_hk_pct != null ? pct(d.three_hk_pct) : "—"}
                      </td>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
