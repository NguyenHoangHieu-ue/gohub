// Tách từ quarterly/page.tsx (s183 Phase 5 tiếp — tách cơ học, JSX/logic giữ nguyên y hệt bản gốc).
import React, { useState, useEffect, useMemo, useRef } from "react"
import { Building2, ChevronDown, ChevronRight, FileDown, Pencil, Plus, RefreshCw, Save, Search, Trash2, Upload, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { fc, pct, parseFmt, fmtInput, cm1Color } from "@/lib/quarterly-format"
import { ColInfo } from "@/components/quarterly/col-info"
import type { MonthSummary } from "@/lib/quarterly-types"

const TIER_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  Strategic: { bg: "bg-blue-50", text: "text-[#0f4c81]", badge: "bg-blue-100 text-[#0f4c81]" },
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

export function B2BTierSection({ b2bTiers, loading, months, allMonths, region, onRegionChange, expanded, onToggle, canEditCost, isCreator, onSaved, notify, quarterLabel, qFactor = 1, summary = [], futureScale = 1 }:
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
                  region === r ? "bg-[#0f4c81] text-white" : "text-slate-500 hover:bg-slate-50")}>
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
                    costDirty && !savingCost ? "bg-[#0f4c81] text-white border-[#0f4c81] hover:bg-[#0a3560]" : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed")}>
                  {savingCost ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu
                </button>
                <button onClick={cancelCostEdit} disabled={savingCost}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  <X className="w-3.5 h-3.5" />Hủy
                </button>
              </>
            ) : (
              <button onClick={() => { if (!expanded) onToggle(); startCostEdit() }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-[#0f4c81]/30 bg-white text-[#0f4c81] hover:bg-blue-50 transition-all">
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
                <tr className="bg-[#0f4c81]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-300 uppercase sticky left-0 bg-[#0f4c81] border-r border-[#0a3560] min-w-[160px]">Nhóm</th>
                  {quarterMonths.map(m => {
                    const [y, mo] = m.split("-")
                    const tierMonth = allTiers[0]?.months.find((x: any) => x.month === m)
                    const isPr = tierMonth?.isProjected ?? false
                    return (
                      <th key={m} colSpan={colCount} className="px-3 py-2.5 text-center text-[10px] font-semibold text-slate-300 border-l border-[#0a3560] whitespace-nowrap">
                        T{parseInt(mo)}/{y}{isPr ? " (PR)" : ""}
                      </th>
                    )
                  })}
                  <th colSpan={colCount} className="px-3 py-2.5 text-center text-[10px] font-semibold text-blue-200 border-l border-[#0a3560] whitespace-nowrap bg-[#1e3a8a]">
                    Tổng Quý<ColInfo tip={"Tổng Quý (PR)\nRevenue: Σ(PR monthly)\nGM: Σ(GP × factor)\nCh.Cost: Σ(custCost) + GroupCost × (tier_rev/total_B2B_rev)\nCM1: Σ(custCM1) - GroupCost × revenue-share"} />
                  </th>
                </tr>
                <tr className="bg-[#1565c0] text-[9px] text-blue-100 uppercase">
                  <th className="px-4 py-1.5 sticky left-0 bg-[#1565c0] border-r border-[#2e7dd4]" />
                  {quarterMonths.flatMap(m => SUB_COLS.map((col, i) => (
                    <th key={`${m}-${col.label}`} className={cn("px-2 py-1.5 whitespace-nowrap font-medium text-right", i === 0 && "border-l border-[#2e7dd4]", col.label === "CM1" && "text-blue-300")}>
                      {col.label}{col.tip && <ColInfo tip={col.tip} />}
                    </th>
                  )))}
                  {SUB_COLS.map((col, i) => (
                    <th key={`qt-${col.label}`} className={cn("px-2 py-1.5 whitespace-nowrap font-medium text-right bg-[#072448]", i === 0 && "border-l border-[#2e7dd4]", col.label === "CM1" && "text-blue-300")}>
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
                        isSel && "ring-1 ring-inset ring-[#0f4c81]",
                        "hover:bg-blue-50/30")}>
                      <td className="px-4 py-2.5 sticky left-0 border-r border-slate-100 font-bold" style={{ backgroundColor: ri % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                        <div className="flex items-center gap-2">
                          {isSel ? <ChevronDown className="w-3.5 h-3.5 text-[#0f4c81]" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
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
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f4c81]/40 w-56"
                  />
                </div>
              </div>
              {editMode && (
                <p className="text-[11px] text-[#0f4c81] bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
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
                      <span className="text-xs font-bold text-[#0f4c81] uppercase tracking-wide">{reg} — {REGION_META[reg].label}</span>
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
                                      {c.priceListName ? <span className="text-[9px] font-mono text-[#0f4c81] bg-blue-50 border border-blue-100 px-1 py-0.5 rounded">{c.priceListName}</span> : <span className="text-slate-300">—</span>}
                                    </td>
                                  )}
                                  <td className="px-1.5 py-1 text-right text-slate-700 tabular-nums font-semibold text-[10px] whitespace-nowrap">{fc(pr.prRev)}</td>
                                  <td className="px-1.5 py-1 text-right text-slate-600 tabular-nums text-[10px] whitespace-nowrap">{fc(pr.prGm)}</td>
                                  <td className="px-1.5 py-1 text-right text-slate-500 text-[10px]">{pct(prGmPct)}</td>
                                  <td className="px-1.5 py-1 text-right tabular-nums text-[10px]">
                                    {editMode && canEditCost
                                      ? <button onClick={() => openCostModal(c)} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#0f4c81]/30 bg-blue-50 text-[#0f4c81] font-semibold hover:bg-blue-100 text-[10px]" title="Nhập chi phí">
                                          <Pencil className="w-3 h-3" />{editedCustomerCost(c) > 0 ? fc(editedCustomerCost(c)) : "0"}
                                        </button>
                                      : <span className="text-slate-500 whitespace-nowrap">{c.cc > 0 ? fc(c.cc) : "—"}</span>}
                                  </td>
                                  <td className={cn("px-1.5 py-1 text-right font-semibold tabular-nums text-[10px] whitespace-nowrap", cm1Color(pr.prCm1))}>{fc(pr.prCm1)}</td>
                                  <td className="px-1.5 py-1 text-right text-[10px]">
                                    {tgt.cm1 > 0 ? (() => { const p = pr.prCm1 / tgt.cm1 * 100; return <span className={cn("inline-flex px-1 py-0.5 rounded font-bold tabular-nums", p >= 100 ? "bg-green-100 text-green-700" : p >= 75 ? "bg-blue-100 text-[#0f4c81]" : "bg-amber-50 text-amber-600")}>{p.toFixed(1)}%</span> })() : <span className="text-slate-300">—</span>}
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
                                            return <span className={cn("inline-flex px-1 py-0.5 rounded font-bold tabular-nums", p >= 100 ? "bg-green-100 text-green-700" : p >= 75 ? "bg-blue-100 text-[#0f4c81]" : "bg-amber-50 text-amber-600")}>{p.toFixed(1)}%</span>
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
                                                <tr className="bg-[#0f4c81]">
                                                  <th className="px-3 py-1.5 text-left text-[10px] text-slate-300 font-semibold uppercase w-20"></th>
                                                  {qm.map(m => isCurDetail(m) ? (
                                                    <React.Fragment key={m}>
                                                      <th className="px-3 py-1.5 text-right text-[10px] text-slate-300 font-semibold whitespace-nowrap border-l border-[#1565c0]">{fmtM(m)}<sup className="text-slate-400 text-[8px] ml-0.5">Act</sup></th>
                                                      <th className="px-3 py-1.5 text-right text-[10px] text-blue-200 font-semibold whitespace-nowrap">{fmtM(m)}<sup className="text-blue-300 text-[8px] ml-0.5">PR</sup></th>
                                                    </React.Fragment>
                                                  ) : (
                                                    <th key={m} className="px-3 py-1.5 text-right text-[10px] text-slate-300 font-semibold whitespace-nowrap border-l border-[#1565c0]">
                                                      {fmtM(m)}{futureMonthsFE.includes(m) ? <sup className="text-amber-300 text-[8px] ml-0.5">ƯT</sup> : ""}
                                                    </th>
                                                  ))}
                                                  <th className="px-3 py-1.5 text-right text-[10px] text-blue-200 font-semibold border-l border-[#1565c0] bg-[#1e3a8a]">Tổng Quý</th>
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
                                                  <button onClick={() => startEditTarget(c)} className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-[#0f4c81] border border-[#0f4c81]/30 bg-white hover:bg-blue-50 rounded-md">
                                                    <Pencil className="w-2.5 h-2.5" />Sửa target
                                                  </button>
                                                )}
                                                {isEditingTgt && (
                                                  <div className="flex gap-1.5 ml-auto">
                                                    <button onClick={() => saveTarget(c)} disabled={isSavingTgt}
                                                      className={cn("flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md", !isSavingTgt ? "bg-[#0f4c81] text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed")}>
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
                                                      className="flex-1 min-w-0 px-2 py-1 text-[11px] text-right border border-[#0f4c81]/40 rounded focus:outline-none focus:ring-1 focus:ring-[#0f4c81]/40" />
                                                  ) : tgt.rev > 0 ? (
                                                    <div className="text-right space-y-0.5">
                                                      <div className="text-slate-600 font-semibold tabular-nums text-[10px]">Target quý: {fc(tgt.rev)}</div>
                                                      <div className="flex gap-2 justify-end text-[10px]">
                                                        <span className="text-slate-400">Dự kiến:</span>
                                                        <span className={cn("font-bold", cPrRev / tgt.rev >= 1 ? "text-green-600" : cPrRev / tgt.rev >= 0.75 ? "text-[#0f4c81]" : "text-amber-600")}>
                                                          {pct(tgt.rev > 0 ? cPrRev / tgt.rev * 100 : 0)}
                                                        </span>
                                                      </div>
                                                      <div className="flex gap-2 justify-end text-[10px]">
                                                        <span className="text-slate-400">Tiến độ TT:</span>
                                                        <span className={cn("font-bold", actRev / tgt.rev >= 1 ? "text-green-600" : actRev / tgt.rev >= 0.75 ? "text-[#0f4c81]" : "text-amber-600")}>
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
                                                      className="flex-1 min-w-0 px-2 py-1 text-[11px] text-right border border-[#0f4c81]/40 rounded focus:outline-none focus:ring-1 focus:ring-[#0f4c81]/40" />
                                                  ) : tgt.cm1 > 0 ? (
                                                    <div className="text-right space-y-0.5">
                                                      <div className="text-slate-600 font-semibold tabular-nums text-[10px]">Target quý: {fc(tgt.cm1)}</div>
                                                      <div className="flex gap-2 justify-end text-[10px]">
                                                        <span className="text-slate-400">Dự kiến:</span>
                                                        <span className={cn("font-bold", cPrCm1 / tgt.cm1 >= 1 ? "text-green-600" : cPrCm1 / tgt.cm1 >= 0.75 ? "text-[#0f4c81]" : "text-amber-600")}>
                                                          {pct(tgt.cm1 > 0 ? cPrCm1 / tgt.cm1 * 100 : 0)}
                                                        </span>
                                                      </div>
                                                      <div className="flex gap-2 justify-end text-[10px]">
                                                        <span className="text-slate-400">Tiến độ TT:</span>
                                                        <span className={cn("font-bold", actCm1 / tgt.cm1 >= 1 ? "text-green-600" : actCm1 / tgt.cm1 >= 0.75 ? "text-[#0f4c81]" : "text-amber-600")}>
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
                                                      className="w-24 px-2 py-1 text-[11px] text-right border border-[#0f4c81]/40 rounded focus:outline-none focus:ring-1 focus:ring-[#0f4c81]/40" />
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
                                                        className="w-40 px-2 py-1 text-[11px] text-right border border-[#0f4c81]/40 rounded focus:outline-none focus:ring-1 focus:ring-[#0f4c81]/40" />
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
                <h3 className="text-sm font-bold text-slate-900">Chi phí kênh — <span className="text-[#0f4c81]">{costCust.name}</span></h3>
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
                        <button onClick={() => addLine(m)} className="flex items-center gap-1 text-[11px] font-bold text-[#0f4c81] hover:underline"><Plus className="w-3.5 h-3.5" />Thêm</button>
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
                                  className="flex-1 min-w-0 px-1.5 py-1 text-[11px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#0f4c81]/40" />
                                <select value={l.type} onChange={e => setLine(m, idx, { type: e.target.value as "amount" | "percent" })}
                                  className="px-1 py-1 text-[11px] border border-slate-200 rounded bg-white focus:outline-none">
                                  <option value="amount">đ</option>
                                  <option value="percent">%</option>
                                </select>
                                <div className="flex flex-col items-end gap-0.5">
                                  <input type="number" min="0" value={l.value || ""} onChange={e => setLine(m, idx, { value: parseFloat(e.target.value) || 0 })} placeholder="0"
                                    className={cn("w-24 px-2 py-1 text-[12px] text-right tabular-nums border rounded focus:outline-none focus:ring-1",
                                      (l.value as number) < 0 ? "border-red-400 bg-red-50 focus:ring-red-400/40" : "border-slate-200 focus:ring-[#0f4c81]/40")} />
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
