"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { RefreshCw, Save, Building2, ShoppingBag, TrendingUp, ChevronRight, ChevronDown, Search, Users, CalendarDays, Pencil, Plus, X, Trash2, Settings2, Upload, FileDown, Shield, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { useRoleGuard } from "@/lib/use-role-guard"
import type { MonthStats, MonthSummary, ChannelMonth, Channel, QReport, Targets } from "@/lib/quarterly-types"
import { EMPTY_TARGETS } from "@/lib/quarterly-types"
import { fc, pct, parseFmt, fmtInput, cm1Color, momColor, prColor, fck } from "@/lib/quarterly-format"
import { KpiCard } from "@/components/quarterly/kpi-card"
import { TableHead } from "@/components/quarterly/table-head"
import { ColInfo } from "@/components/quarterly/col-info"
import { MomBadge } from "@/components/quarterly/mom-badge"
import { MonthSubRow } from "@/components/quarterly/month-sub-row"
import { QtSummaryRow } from "@/components/quarterly/qt-summary-row"
import { QtTargetRow } from "@/components/quarterly/qt-target-row"
import { PivotTable } from "@/components/quarterly/pivot-table"
import { B2BTierSection } from "@/components/quarterly/b2b-tier-section"
import { QtVsTargetPanel } from "@/components/quarterly/qt-vs-target-bullets"
import { MonthlyTrendChart } from "@/components/quarterly/monthly-trend-chart"

// s183 Phase 5: Types/format helpers/component con (KpiCard, TableHead, ColInfo, MomBadge, MonthSubRow,
// QtSummaryRow, QtTargetRow, PivotTable, B2BTierSection) đã tách sang lib/quarterly-types.ts,
// lib/quarterly-format.ts, components/quarterly/* — tách CƠ HỌC (move nguyên khung, KHÔNG đổi JSX/logic).

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

  const RISK_META: Record<string, { label: string; short: string; color: string; bg: string; ring: string; dot: string; border: string }> = {
    very_safe:  { label: "Rất an toàn",    short: "Rất AT",   color: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200", dot: "bg-emerald-500", border: "border-emerald-500" },
    safe:       { label: "An toàn",         short: "An toàn",  color: "text-green-700",   bg: "bg-green-50",   ring: "ring-green-200",   dot: "bg-green-500",   border: "border-green-500"   },
    safe_low:   { label: "An toàn ít",      short: "AT ít",    color: "text-amber-700",   bg: "bg-amber-50",   ring: "ring-amber-200",   dot: "bg-amber-500",   border: "border-amber-500"   },
    danger_low: { label: "Nguy hiểm ít",    short: "NH ít",    color: "text-orange-700",  bg: "bg-orange-50",  ring: "ring-orange-200",  dot: "bg-orange-500",  border: "border-orange-500"  },
    danger_high:{ label: "Nguy hiểm nhiều", short: "NH nhiều", color: "text-red-700",     bg: "bg-red-50",     ring: "ring-red-200",     dot: "bg-red-500",     border: "border-red-500"     },
    no_target:  { label: "Chưa có target",  short: "Chưa TGT", color: "text-slate-500",   bg: "bg-slate-100",  ring: "ring-slate-200",   dot: "bg-slate-300",   border: "border-slate-300"   },
  }
  // Mức xấu nhất đang hiện diện trong squad (chỉ để tô 1 dải màu cảnh báo bên trái card — không đổi cách tính risk)
  const worstRiskIn = (counts: Record<string, number> | undefined): string | null => {
    if (!counts) return null
    for (const k of RISK_ORDER) { if (k !== "no_target" && counts[k] > 0) return k }
    return null
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

  // MoM: so sánh tháng hiện tại vs tháng trước trong cùng quý.
  // Tháng hiện tại CHƯA hết tháng → phải so PRO-RATA (dim/elapsed) của tháng này với ACTUAL (đã hoàn thành)
  // tháng trước, không so actual-vs-actual (actual tháng chưa xong luôn thấp hơn actual tháng đã xong → %MoM
  // âm ảo). Tháng đã xong: prFactor=1 nên PR=actual, không đổi kết quả.
  const momData = useMemo(() => {
    const chg = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : null
    const prFactor = (m: MonthSummary) => m.elapsed > 0 && m.elapsed < m.dim ? m.dim / m.elapsed : 1
    return summary.map((m, i) => {
      if (i === 0) return { rev: null as number | null, cm1: null as number | null, b2bRev: null as number | null, b2bCm1: null as number | null, b2cRev: null as number | null, b2cCm1: null as number | null }
      const p = summary[i - 1]
      const f    = prFactor(m)
      const aR   = (m.total.actualRevenue ?? m.total.revenue) * f
      const pR   = p.total.actualRevenue ?? p.total.revenue
      const aC   = (m.total.actualCm1 ?? m.total.cm1) * f
      const pC   = p.total.actualCm1 ?? p.total.cm1
      return {
        rev:    chg(aR, pR),
        cm1:    chg(aC, pC),
        b2bRev: chg((m.b2b.actualRevenue ?? m.b2b.revenue) * f, p.b2b.actualRevenue ?? p.b2b.revenue),
        b2bCm1: chg((m.b2b.actualCm1 ?? m.b2b.cm1) * f, p.b2b.actualCm1 ?? p.b2b.cm1),
        b2cRev: chg((m.b2c.actualRevenue ?? m.b2c.revenue) * f, p.b2c.actualRevenue ?? p.b2c.revenue),
        b2cCm1: chg((m.b2c.actualCm1 ?? m.b2c.cm1) * f, p.b2c.actualCm1 ?? p.b2c.cm1),
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
              <CalendarDays className="w-3.5 h-3.5 text-[#0f4c81]" />
              <span className="text-slate-600">Dữ liệu tính:{" "}
                <b className="text-slate-800 tabular-nums">{fmtD(periodStart)} → {fmtD(periodThrough)}</b>
                {isCurrentQ && <span className="text-[#0f4c81] font-medium"> (đến hôm qua)</span>}
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
                className={cn("px-3 py-1.5 text-xs font-semibold rounded-md transition-all", selQ === q ? "bg-[#0f4c81] text-white" : "text-slate-500 hover:bg-slate-50")}>
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
                  companyCode === code ? "bg-[#0f4c81] text-white" : "text-slate-500 hover:bg-slate-50")}>
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
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0f4c81] hover:bg-[#0a3560] text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50">
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
                ? "border-[#0f4c81] text-[#0f4c81]"
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
                settingsDirty && !savingSettings ? "bg-[#0f4c81] hover:bg-[#0a3560] text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed")}>
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
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0f4c81]/40 placeholder-slate-400" />
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
                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0f4c81]/40 placeholder-slate-400"
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
                      targetDirty && !saving ? "bg-[#0f4c81] hover:bg-[#0a3560] text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed")}>
                    <Save className="w-3.5 h-3.5" />{saving ? "Đang lưu…" : "Lưu"}
                  </button>
                </div>
              ) : (
                <button onClick={e => { e.stopPropagation(); startEditTarget() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#0f4c81] border border-[#0f4c81]/30 hover:bg-blue-50 text-xs font-semibold rounded-lg transition-all">
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
                        ? "bg-white border-[#0f4c81]/40 focus:border-[#0f4c81] focus:ring-1 focus:ring-[#0f4c81]/30 text-slate-800"
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
          <KpiCard label="B2B" icon={Building2} accent="#0f4c81" expectedPct={expectedPct}
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
                showMonthBreakdown ? "bg-[#0f4c81] text-white border-[#0f4c81]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
              {showMonthBreakdown ? "Ẩn B2B/B2C" : "Xem B2B/B2C"}
            </button>
          </div>
          {/* Đề xuất redesign (Hiếu duyệt qua mockup) — line-chart thay bảng làm view chính, bảng gốc
              vẫn xem được qua "Xem bảng số liệu" bên dưới. Không đổi số liệu — cùng `summary` state. */}
          <div className="px-5 py-4">
            <MonthlyTrendChart summary={summary} />
          </div>
          <details className="border-t border-slate-100">
            <summary className="cursor-pointer select-none px-5 py-2.5 text-xs font-bold text-[#0f4c81] hover:bg-slate-50">
              Xem bảng số liệu gốc theo tháng
            </summary>
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
                              {fc(m.total.actualRevenue ?? m.total.revenue)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                              {showPr ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  {fc(prRevTotal)}
                                  <MomBadge v={mom.rev} />
                                </div>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{fc(m.total.actualGp ?? m.total.gp)}</td>
                            <td className="px-4 py-3 text-right text-slate-500">{pct(m.total.gpPct)}</td>
                            <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{m.total.channelCost > 0 ? fc(m.total.actualCc ?? m.total.channelCost) : <span className="text-slate-300">—</span>}</td>
                            <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{m.total.groupCost > 0 ? fc(m.total.actualGc ?? m.total.groupCost) : <span className="text-slate-300">—</span>}</td>
                            <td className={cn("px-4 py-3 text-right font-bold tabular-nums text-[13px]", cm1Color(m.total.actualCm1 ?? m.total.cm1))}>
                              {fc(m.total.actualCm1 ?? m.total.cm1)}
                            </td>
                            <td className={cn("px-4 py-3 text-right tabular-nums", cm1Color(prCm1Total))}>
                              {showPr ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  {fc(prCm1Total)}
                                  <MomBadge v={mom.cm1} />
                                </div>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
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
          </details>
        </div>
      )}

      {/* ── Quarter total vs target ── */}
      {qt && (
        <div className={cn("bg-white border border-slate-200 rounded-xl overflow-hidden transition-opacity", loading && "opacity-50 pointer-events-none")}>
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-900">Tổng hợp cả Quý — So sánh với Target</h2>
          </div>
          {/* Đề xuất redesign (Hiếu duyệt qua mockup) — bullet-chart thay bảng 12 cột làm view chính,
              bảng gốc vẫn xem được qua "Xem bảng số liệu" bên dưới. Số liệu y hệt (cùng biến state). */}
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {qt.b2b && (
              <QtVsTargetPanel label="B2B (Thực tế)" qoqPct={b2bQoQ}
                actRev={b2bRevRaw} prRev={b2bRevPr} targetRev={targets.b2bRev}
                cm1Act={b2bCm1Raw} cm1Pr={b2bCm1Pr} cm1Target={targets.b2bCm1} />
            )}
            {qt.b2c && (
              <QtVsTargetPanel label="B2C (Thực tế)" qoqPct={b2cQoQ}
                actRev={b2cRevRaw} prRev={b2cRevPr} targetRev={targets.b2cRev}
                cm1Act={b2cCm1Raw} cm1Pr={b2cCm1Pr} cm1Target={targets.b2cCm1} />
            )}
          </div>
          <details className="border-t border-slate-100">
            <summary className="cursor-pointer select-none px-5 py-2.5 text-xs font-bold text-[#0f4c81] hover:bg-slate-50">
              Xem bảng số liệu gốc
            </summary>
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
                <tr className="bg-[#0f4c81] text-white text-[11px]">
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
          </details>
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
                editingSquad ? "bg-[#0f4c81] text-white border-[#0f4c81]" : "bg-white text-slate-600 border-slate-200 hover:border-[#0f4c81]/60 hover:text-[#0f4c81]")}>
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
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f4c81]" />
                      <button onClick={() => setDraftSquads(prev => prev.filter((_, i) => i !== si))}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Leader</p>
                      <select value={sq.leader ?? ""}
                        onChange={e => setDraftSquads(prev => prev.map((s, i) => i === si ? { ...s, leader: e.target.value } : s))}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f4c81] bg-white">
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
                              <span key={code} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0f4c81] text-white text-xs rounded-full font-medium">
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
                                className="px-2 py-0.5 text-[11px] bg-slate-100 text-slate-600 rounded-full hover:bg-[#0f4c81] hover:text-white transition-colors">
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
                  className="flex items-center gap-1.5 px-4 py-2 text-sm border border-dashed border-slate-300 text-slate-500 rounded-lg hover:border-[#0f4c81] hover:text-[#0f4c81] transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Thêm squad
                </button>
                <button onClick={saveSquadConfig} disabled={savingSquad}
                  className="flex items-center gap-1.5 px-5 py-2 text-sm bg-[#0f4c81] text-white rounded-lg hover:bg-[#0a3560] disabled:opacity-50 transition-colors">
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
                                className="w-36 px-2 py-1 text-right tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f4c81]" />
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
                  className="flex items-center gap-1.5 px-5 py-2 text-sm bg-[#0f4c81] text-white rounded-lg hover:bg-[#0a3560] disabled:opacity-50 transition-colors">
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
                <h2 className="text-base font-bold text-slate-900">Squad Progress — {selQ} {selYear} <span className="text-slate-400 font-semibold">· {companyCode === "ALL" ? "Toàn công ty" : companyCode}</span></h2>
                {squadData && <p className="text-xs text-slate-400 mt-0.5">{squadData.elapsed_days}/{squadData.quarter_days} ngày · Pro-rata ×{squadData.pr_factor?.toFixed(2)}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportSquadProgress} disabled={!squadData?.squads?.length || squadLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 text-xs font-semibold rounded-lg disabled:opacity-40 transition-all">
                  <FileDown className="w-3.5 h-3.5" />Export Excel
                </button>
                <button onClick={fetchSquadProgress} disabled={squadLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f4c81] text-white text-xs font-semibold rounded-lg hover:bg-[#0a3560] disabled:opacity-50 transition-colors">
                  <RefreshCw className={cn("w-3.5 h-3.5", squadLoading && "animate-spin")} />
                  {squadLoading ? "Đang tải…" : "Làm mới"}
                </button>
              </div>
            </div>

            {squadLoading ? (
              <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-[#0f4c81]" /></div>
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
                    className={cn("flex items-center gap-0.5 text-left whitespace-nowrap", active ? "text-[#0f4c81] font-bold" : "text-slate-500 hover:text-slate-800")}>
                    {label}{active ? (sqSortDir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                )
              }

              // B1 fix: renamed to pctV to avoid shadowing outer pct
              const pctV = (v: number | null) => v != null ? `${v}%` : "—"
              const pctCol = (v: number | null) => v == null ? "text-slate-400" : v >= 100 ? "text-emerald-600 font-bold" : v >= 85 ? "text-amber-600 font-semibold" : "text-red-500 font-semibold"
              const pctColor = (v: number | null) => v == null ? "text-slate-400" : v >= 100 ? "text-emerald-600" : v >= 85 ? "text-amber-600" : "text-red-500"
              const barColor = (v: number | null) => v == null ? "#cbd5e1" : v >= 100 ? "#059669" : v >= 85 ? "#d97706" : "#dc2626"

              // Badge đánh giá — dot + label, dùng chung cho mọi bảng (không đổi giá trị risk_level, chỉ đổi cách hiển thị)
              const RiskBadge = ({ level, dense }: { level: string; dense?: boolean }) => {
                const rm = RISK_META[level] ?? RISK_META["no_target"]
                return (
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full font-bold whitespace-nowrap ring-1 ring-inset",
                    rm.bg, rm.color, rm.ring, dense ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]")}>
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", rm.dot)} />
                    {dense ? rm.short : rm.label}
                  </span>
                )
              }

              // Thanh tiến độ mini cho từng metric trong stat tile (Rev/CM1/3HK) — chỉ hiển thị, không đổi công thức %
              const MetricBar = ({ pct }: { pct: number | null }) => (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(Math.max(pct ?? 0, 0), 100)}%`, background: barColor(pct) }} />
                </div>
              )

              // Stat tile 1 metric (Doanh thu/CM1/3HK): số PR lớn làm trọng tâm, actual+target phụ, viền đỏ khi % < 85
              // (chỉ đổi cách trình bày — số liệu/pct truyền vào nguyên như API trả về)
              const StatTile = ({ label, actual, pr, target, pct, actualNote }:
                { label: string; actual: number; pr?: number; target?: number; pct: number | null; actualNote?: string }) => (
                <div className={cn("rounded-lg border p-3",
                  pct == null ? "border-slate-200 bg-slate-50/70"
                    : pct >= 80 ? "border-emerald-200 bg-emerald-50/40"
                    : pct >= 50 ? "border-amber-200 bg-amber-50/40"
                    : "border-red-200 bg-red-50/40")}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                    {pct != null
                      ? <span className={cn("text-[11px] font-bold tabular-nums", pctColor(pct))}>{pct}%</span>
                      : <span className="text-[10px] text-slate-300">chưa target</span>}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-bold text-slate-900 tabular-nums leading-none">{formatCompactNumber(pr ?? actual)}</span>
                    {pr != null && <span className="text-[10px] text-blue-500 font-semibold">PR</span>}
                  </div>
                  <div className="text-[10px] text-slate-400 tabular-nums mt-1">
                    {pr != null ? `Thực tế ${formatCompactNumber(actual)}${actualNote ? ` · ${actualNote}` : ""}` : actualNote}
                    {target ? ` · Target ${formatCompactNumber(target)}` : ""}
                  </div>
                  <MetricBar pct={pct} />
                </div>
              )

              return (
                <>
                  {/* S3: Filter bar — 1 tầng */}
                  <div className="px-4 py-3 border-b border-slate-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input value={sqSearch} onChange={e => setSqSearch(e.target.value)}
                          placeholder="Tìm khách hàng..."
                          className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f4c81] w-40" />
                      </div>
                      <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                        {(["ALL","VN","US"] as const).map(v => (
                          <button key={v} onClick={() => setSqFilterRegion(v)}
                            className={cn("px-2 py-1 text-[11px] font-bold rounded-md transition-all", sqFilterRegion === v ? "bg-[#0f4c81] text-white" : "text-slate-500 hover:bg-slate-200")}>
                            {v === "VN" ? "🇻🇳 VN" : v === "US" ? "🇺🇸 US" : "ALL"}
                          </button>
                        ))}
                      </div>
                      <select value={sqFilterTier} onChange={e => setSqFilterTier(e.target.value)}
                        className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f4c81] bg-white">
                        <option value="ALL">Tất cả tier</option>
                        {["Strategic","VIP","Gold","Silver"].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {squadNames.length > 1 && (
                        <select value={sqFilterSquad} onChange={e => setSqFilterSquad(e.target.value)}
                          className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f4c81] bg-white">
                          <option value="ALL">Tất cả squad</option>
                          {squadNames.map((n: string) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      )}
                      {uniquePics.length > 0 && (
                        <select value={sqFilterPic} onChange={e => setSqFilterPic(e.target.value)}
                          className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f4c81] bg-white">
                          <option value="ALL">Tất cả PIC</option>
                          {uniquePics.map(code => {
                            const info = squadData.available_pics?.find((p: any) => p.code === code)
                            return <option key={code} value={code}>{info?.name ?? code}</option>
                          })}
                        </select>
                      )}
                      <select value={sqFilterRisk} onChange={e => setSqFilterRisk(e.target.value)}
                        className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f4c81] bg-white">
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
                      <div className="mt-2 text-[11px] text-[#0f4c81] bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <span className="font-semibold">Đang xem phẳng</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500">{filtered.length} khách hàng phù hợp</span>
                      </div>
                    )}
                    {/* Legend đánh giá — dùng chung cho mọi chip/badge bên dưới (ưu tiên mức xấu nhất) */}
                    <div className="mt-2 flex items-center gap-3 flex-wrap text-[10px] text-slate-500">
                      <span className="font-semibold text-slate-400">Đánh giá:</span>
                      {(["very_safe","safe","safe_low","danger_low","danger_high"] as const).map(k => (
                        <span key={k} className="inline-flex items-center gap-1">
                          <span className={cn("w-1.5 h-1.5 rounded-full", RISK_META[k].dot)} />
                          {RISK_META[k].label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    {hasFilter ? (
                      /* ── S4: Flat filtered view — 10 cột (bỏ bớt Rev Actual, gộp 3HK) ── */
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 uppercase text-[9px] border-b-2 border-slate-100">
                              <th className="px-4 py-2.5 text-left">{sortBtn("customer_name","Khách hàng")}</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Squad · PIC</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Tier</th>
                              <th className="px-3 py-2.5 text-right">{sortBtn("revenue_pr","Rev PR")}</th>
                              <th className="px-3 py-2.5 text-right border-l border-slate-200 font-semibold">CM1 PR</th>
                              <th className="px-3 py-2.5 text-right font-semibold">CM1 Tgt</th>
                              <th className="px-3 py-2.5 text-right">{sortBtn("cm1_tgt_pct","%TGT CM1")}</th>
                              <th className="px-3 py-2.5 text-right border-l border-slate-200 font-semibold">3HK PR / Tgt%</th>
                              <th className="px-3 py-2.5 text-right">{sortBtn("hk3_tgt_pct","%TGT 3HK")}</th>
                              <th className="px-3 py-2.5 text-center border-l border-slate-200">{sortBtn("risk_level","Đánh giá")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filtered.length === 0 ? (
                              <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">Không có kết quả phù hợp.</td></tr>
                            ) : filtered.map((c: any, ci: number) => {
                              const rm = RISK_META[c.risk_level] ?? RISK_META["no_target"]
                              const picInfo = squadData.available_pics?.find((p: any) => p.code === c.sales_pic)
                              return (
                                <tr key={ci} className={cn("border-l-[3px]", rm.border, ci % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                                  <td className="px-4 py-2.5 font-medium text-slate-700">
                                    {c.customer_name}
                                    <span className={cn("ml-1.5 text-[9px] px-1 py-0.5 rounded font-bold", c.region === "US" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600")}>{c.region}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-500 text-[11px]">
                                    <span className="font-medium text-slate-700">{c.squad_name}</span>
                                    {picInfo && <span className="text-slate-400"> · {picInfo.name}</span>}
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-500">{c.tier}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-blue-600 font-medium">{formatCompactNumber(c.revenue_pr)}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 border-l border-slate-100">{formatCompactNumber(c.cm1_pr)}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{c.target_cm1 > 0 ? formatCompactNumber(c.target_cm1) : "—"}</td>
                                  <td className={cn("px-3 py-2.5 text-right tabular-nums", pctCol(c.cm1_tgt_pct))}>{pctV(c.cm1_tgt_pct)}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 border-l border-slate-100">
                                    <span className="text-[10px] text-slate-500">{formatCompactNumber(c.hk3_pr)}</span>
                                    <span className="text-slate-400 ml-0.5 text-[10px]">(TT {formatCompactNumber(c.hk3)})</span>
                                    {c.target_hk3pct > 0 && <span className="text-slate-400 text-[10px]"> / {c.target_hk3pct}%</span>}
                                  </td>
                                  <td className={cn("px-3 py-2.5 text-right tabular-nums", pctCol(c.hk3_tgt_pct))}>{pctV(c.hk3_tgt_pct)}</td>
                                  <td className="px-3 py-2.5 text-center border-l border-slate-100">
                                    <RiskBadge level={c.risk_level} dense />
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
                          const worst = worstRiskIn(sq.risk_counts)
                          const worstBorder = worst ? RISK_META[worst].border : "border-transparent"
                          return (
                            <div key={si} className={cn("border-b border-slate-100 last:border-0 border-l-4", worstBorder, si % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                              {/* ── Squad card header ── */}
                              <div className="px-5 py-4">
                                {/* Row 1: expand + name + leader + count + risk chips (dot+count, xem legend ở đầu bảng) */}
                                <div className="flex items-center gap-2 mb-3">
                                  <button onClick={() => setExpandedSquads(prev => { const next = new Set(prev); next.has(si) ? next.delete(si) : next.add(si); return next })}
                                    className="flex items-center gap-2 flex-1 text-left min-w-0 group">
                                    <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform shrink-0 group-hover:text-[#0f4c81]", expanded && "rotate-90")} />
                                    <span className="font-bold text-slate-900 text-sm">{sq.name}</span>
                                    {leaderUser && (
                                      <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">{leaderUser.name}</span>
                                    )}
                                    <span className="text-[11px] text-slate-400 shrink-0">{sq.customer_count} KH</span>
                                  </button>
                                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                                    {(["danger_high","danger_low","safe_low","safe","very_safe"] as const).map(k => {
                                      const cnt = sq.risk_counts?.[k] ?? 0
                                      if (!cnt) return null
                                      const m = RISK_META[k]
                                      return (
                                        <span key={k} title={m.label}
                                          className={cn("inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ring-1 ring-inset", m.bg, m.color, m.ring)}>
                                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", m.dot)} />
                                          {cnt}
                                        </span>
                                      )
                                    })}
                                  </div>
                                </div>

                                {/* Row 2: stat tiles — Doanh thu / CM1 / 3HK, cùng bố cục để so sánh nhanh */}
                                <div className="ml-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                  <StatTile label="Doanh thu" actual={sq.revenue} pr={sq.revenue_pr}
                                    target={sq.target_rev > 0 ? sq.target_rev : undefined} pct={sq.rev_pct} />
                                  <StatTile label="CM1" actual={sq.cm1} pr={sq.cm1_pr}
                                    target={sq.target_cm1 > 0 ? sq.target_cm1 : undefined} pct={sq.cm1_tgt_pct} />
                                  <StatTile label="3HK Revenue" actual={sq.hk3} pr={sq.hk3_pr}
                                    target={sq.target_hk3 > 0 ? sq.target_hk3 : undefined} pct={sq.hk3_tgt_pct}
                                    actualNote={`${sq.hk3_pct}% doanh thu`} />
                                </div>
                              </div>

                              {/* S4: Expanded customer table — 9 cột */}
                              {expanded && sq.customers?.length > 0 && (
                                <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/50">
                                  <table className="w-full text-[11px] border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100 text-slate-500 uppercase text-[9px] border-b-2 border-slate-200">
                                        <th className="px-4 py-2.5 text-left font-semibold">Khách hàng</th>
                                        <th className="px-3 py-2.5 text-left font-semibold">PIC · Tier</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">Rev PR</th>
                                        <th className="px-3 py-2.5 text-right font-semibold border-l border-slate-200">CM1 PR</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">CM1%</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">CM1 Tgt</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">%TGT CM1</th>
                                        <th className="px-3 py-2.5 text-right font-semibold border-l border-slate-200">3HK% / Tgt%</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">%TGT 3HK</th>
                                        <th className="px-3 py-2.5 text-center font-semibold border-l border-slate-200">Đánh giá</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {sq.customers.map((c: any, ci: number) => {
                                        const rm = RISK_META[c.risk_level] ?? RISK_META["no_target"]
                                        const picInfo = squadData.available_pics?.find((p: any) => p.code === c.sales_pic)
                                        return (
                                          <tr key={ci} className={cn("border-l-[3px]", rm.border, ci % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                                            <td className="px-4 py-2.5 font-medium text-slate-700">
                                              {c.customer_name}
                                              <span className={cn("ml-1.5 text-[9px] px-1 py-0.5 rounded font-bold", c.region === "US" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600")}>{c.region}</span>
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-500">
                                              {picInfo?.name ?? c.sales_pic}
                                              <span className="text-slate-300 mx-1">·</span>
                                              {c.tier}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-blue-600 font-medium">{formatCompactNumber(c.revenue_pr)}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 border-l border-slate-100">{formatCompactNumber(c.cm1_pr)}</td>
                                            <td className={cn("px-3 py-2.5 text-right tabular-nums text-[10px]", c.cm1_pct >= 0 ? "text-slate-500" : "text-red-500")}>{c.cm1_pct != null ? `${c.cm1_pct}%` : "—"}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">{c.target_cm1 > 0 ? formatCompactNumber(c.target_cm1) : "—"}</td>
                                            <td className={cn("px-3 py-2.5 text-right tabular-nums", pctCol(c.cm1_tgt_pct))}>{pctV(c.cm1_tgt_pct)}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 border-l border-slate-100">
                                              <span className="font-medium text-[10px] text-slate-500">{formatCompactNumber(c.hk3_pr)}</span>
                                              <span className="text-slate-400 ml-0.5 text-[10px]">(TT {formatCompactNumber(c.hk3)})</span>
                                              {c.target_hk3pct > 0 && <span className="text-slate-400 text-[10px]"> / {c.target_hk3pct}%</span>}
                                            </td>
                                            <td className={cn("px-3 py-2.5 text-right tabular-nums", pctCol(c.hk3_tgt_pct))}>{pctV(c.hk3_tgt_pct)}</td>
                                            <td className="px-3 py-2.5 text-center border-l border-slate-100">
                                              <RiskBadge level={c.risk_level} dense />
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
                          <div className="px-5 py-4 bg-[#0f4c81] flex items-center gap-6 flex-wrap">
                            <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider shrink-0">
                              Tổng · {squadData.squads.reduce((s: number, sq: any) => s + sq.customer_count, 0)} KH
                            </span>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[10px] text-white/50 uppercase font-semibold">Rev PR</span>
                              <span className="text-base font-bold text-white tabular-nums">{formatCompactNumber(squadData.totals.revenue_pr)}</span>
                              <span className="text-[10px] text-white/40 tabular-nums">(TT {formatCompactNumber(squadData.totals.revenue)})</span>
                            </div>
                            <div className="w-px h-4 bg-white/20 shrink-0" />
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[10px] text-white/50 uppercase font-semibold">CM1 PR</span>
                              <span className="text-base font-bold text-white tabular-nums">{formatCompactNumber(squadData.totals.cm1_pr)}</span>
                              <span className="text-[10px] text-white/40 tabular-nums">(TT {formatCompactNumber(squadData.totals.cm1)}{squadData.totals.cm1_pct != null ? ` · ${squadData.totals.cm1_pct}%` : ""})</span>
                            </div>
                            <div className="w-px h-4 bg-white/20 shrink-0" />
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[10px] text-white/50 uppercase font-semibold">3HK</span>
                              <span className="text-base font-bold text-white tabular-nums">{formatCompactNumber(squadData.totals.hk3)}</span>
                              <span className="text-[10px] text-white/40 tabular-nums">({squadData.totals.hk3_pct}%)</span>
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

// B2BTierSection — tách sang components/quarterly/b2b-tier-section.tsx (s183 Phase 5 tiếp, import ở đầu file).
