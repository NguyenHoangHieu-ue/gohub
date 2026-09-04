"use client"

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import {
  Package, Plus, Save, XCircle, Pencil, Trash2, Download, ChevronDown, ChevronRight,
  AlertTriangle, Clock, CheckCircle, Settings, Truck, ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { exportRawRows } from "@/lib/export-excel"

// ─────────────────────────────────────────────────────────────────────────────
// Inventory — kế hoạch nhập hàng theo tuần (VN/US) + PO tracker.
// Thay tab Fulfillment cũ (theo dõi tồn kho theo kho vật lý + vendor balance, s147).
// Dựa theo "Plan nhập hàng theo tháng.xlsx" (Ops): mỗi SKU dự phóng Tồn thực tế / Bán dự kiến /
// Số nhập / Tồn cuối tuần theo từng tuần. Web tự gợi ý Bán dự kiến (tốc độ bán 30 ngày, gohub_dw)
// + Số nhập (reorder-to-target khi tồn dự phóng dưới ngưỡng an toàn); OPS chỉnh tay khi cần —
// xem docs/wiki/system/tabs/analytics-fulfillment.md.
// ─────────────────────────────────────────────────────────────────────────────

type AlertLevel = "critical" | "warning" | "ok" | "none"
type Company = "VN" | "US"

interface WeekMeta { weekStart: string; isActual: boolean }
interface ComputedWeek extends WeekMeta {
  beginStock: number; actualStock: number | null
  salesForecast: number; salesForecastAuto: boolean
  importQty: number; importQtyAuto: boolean
  suggestedImport: number; endStock: number; coverageWeeks: number | null
}
interface SkuRow {
  sku_code: string; vendor: string | null
  target_weeks_coverage: number; safety_weeks: number; lead_time_weeks: number; note: string | null
  velocity: number; currentStock: number; alert: AlertLevel
  needsOrderSoon: boolean; firstCriticalWeek: string | null
  weeks: ComputedWeek[]
}
interface GridResponse { weeks: WeekMeta[]; skus: SkuRow[] }

interface PoRow {
  id: number; vendor: string; sku_code: string; qty: number; company_code: string | null
  expected_stockout_date: string | null; need_by_date: string | null; payment_deadline: string | null
  expected_arrival_date: string | null; payment_status: string; payment_date: string | null
  delivery_status: string; expected_arrival_week: string | null; note: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtWeek = (ymd: string) => { const [, m, d] = ymd.split("-"); return `${d}/${m}` }
const n0 = (v: number) => Math.round(v).toLocaleString("vi-VN")

function AlertBadge({ level }: { level: AlertLevel }) {
  const cfg: Record<AlertLevel, { cls: string; icon: React.ReactNode; label: string }> = {
    critical: { cls: "bg-red-100 text-red-700", icon: <AlertTriangle className="w-3 h-3" />, label: "Nguy hiểm" },
    warning:  { cls: "bg-amber-100 text-amber-700", icon: <Clock className="w-3 h-3" />, label: "Cần chú ý" },
    ok:       { cls: "bg-emerald-100 text-emerald-700", icon: <CheckCircle className="w-3 h-3" />, label: "Đủ hàng" },
    none:     { cls: "bg-slate-100 text-slate-400", icon: null, label: "—" },
  }
  const c = cfg[level]
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap", c.cls)}>
      {c.icon}{c.label}
    </span>
  )
}

function StatusPill({ text }: { text: string }) {
  const cfg: Record<string, string> = {
    "Đã thanh toán": "bg-emerald-100 text-emerald-700", "Chưa thanh toán": "bg-slate-100 text-slate-500",
    "Đã nhập kho": "bg-emerald-100 text-emerald-700", "Chờ nhận": "bg-blue-100 text-blue-700",
    "Chờ thanh toán": "bg-amber-100 text-amber-700",
  }
  return <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap", cfg[text] ?? "bg-slate-100 text-slate-500")}>{text}</span>
}

// Component ở MODULE LEVEL (không định nghĩa trong .map()) — tránh remount/mất focus mỗi phím gõ
// (lý do y hệt TargetCell ở tab Staff).
function WeekCell({ value, placeholder, isAuto, disabled, onChange }: {
  value: number | null; placeholder: number; isAuto: boolean; disabled?: boolean; onChange: (v: number | null) => void
}) {
  const [str, setStr] = useState(value != null ? String(value) : "")
  useEffect(() => { setStr(value != null ? String(value) : "") }, [value])
  if (disabled) return <span className="text-xs font-bold text-slate-600">{value != null ? n0(value) : n0(placeholder)}</span>
  return (
    <input
      type="number" value={str}
      placeholder={String(Math.round(placeholder))}
      onChange={e => {
        const s = e.target.value
        setStr(s)
        onChange(s === "" ? null : Number(s))
      }}
      className={cn(
        "w-16 text-right text-xs font-bold border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500",
        isAuto && str === "" ? "border-dashed border-slate-300 text-slate-400 bg-slate-50" : "border-slate-300 bg-white",
      )}
    />
  )
}

// ─── Add / Edit SKU Modal ──────────────────────────────────────────────────────
function SkuModal({ company, existing, onClose, onSaved }: {
  company: Company; existing?: SkuRow; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    sku_code: existing?.sku_code ?? "", vendor: existing?.vendor ?? "",
    target_weeks_coverage: existing?.target_weeks_coverage ?? 8,
    safety_weeks: existing?.safety_weeks ?? 3, lead_time_weeks: existing?.lead_time_weeks ?? 4,
    note: existing?.note ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!existing && !form.sku_code.trim()) { setError("SKU code bắt buộc"); return }
    setSaving(true); setError("")
    const url = "/api/analytics/inventory-plan/skus"
    const method = existing ? "PATCH" : "POST"
    const body = existing
      ? { sku_code: existing.sku_code, vendor: form.vendor, target_weeks_coverage: form.target_weeks_coverage,
          safety_weeks: form.safety_weeks, lead_time_weeks: form.lead_time_weeks, note: form.note || null }
      : { ...form, sku_code: form.sku_code.trim(), company_code: company, note: form.note || null }
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json()
    if (!r.ok) { setError(j.error ?? "Lỗi"); setSaving(false); return }
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-black text-slate-900 mb-1">{existing ? "Sửa SKU theo dõi" : "Thêm SKU theo dõi"}</h3>
        <p className="text-xs text-slate-500 mb-4 font-bold">Thị trường {company}</p>
        <div className="space-y-3">
          {!existing && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">SKU Code *</label>
              <input value={form.sku_code} onChange={e => set("sku_code", e.target.value)} placeholder="vd. 1D0003DK00000"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vendor <span className="normal-case font-normal">(tự lookup nếu để trống)</span></label>
            <input value={form.vendor} onChange={e => set("vendor", e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["Mục tiêu (tuần)", "target_weeks_coverage"], ["An toàn (tuần)", "safety_weeks"], ["Lead time (tuần)", "lead_time_weeks"]].map(([label, key]) => (
              <div key={key}>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                <input type="number" min={0} value={(form as any)[key]} onChange={e => set(key, Number(e.target.value))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none" />
              </div>
            ))}
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ghi chú</label>
            <textarea value={form.note} onChange={e => set("note", e.target.value)} rows={2}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-xs text-red-600 font-bold">{error}</p>}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Hủy</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Đang lưu…" : existing ? "Lưu" : "Thêm SKU"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Weekly grid row (expand) ──────────────────────────────────────────────────
type WeeklyDraft = Record<string, { actual_stock?: number | null; sales_forecast?: number | null; import_qty?: number | null }>

function WeeklyGrid({ sku, onRefresh }: { sku: SkuRow; onRefresh: () => void }) {
  const [drafts, setDrafts] = useState<WeeklyDraft>({})
  const [saving, setSaving] = useState(false)
  const hasChanges = Object.keys(drafts).length > 0

  const setField = (week: string, field: "actual_stock" | "sales_forecast" | "import_qty", v: number | null) => {
    setDrafts(p => ({ ...p, [week]: { ...p[week], [field]: v } }))
  }

  const save = async () => {
    setSaving(true)
    const updates = Object.entries(drafts).map(([week_start_date, fields]) => ({ sku_code: sku.sku_code, week_start_date, ...fields }))
    await fetch("/api/analytics/inventory-plan/weekly", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }),
    })
    setSaving(false); setDrafts({}); onRefresh()
  }

  return (
    <div className="p-3 bg-slate-50 border-t border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Lưới tuần · Vận tốc bán trung bình {n0(sku.velocity)}/tuần
        </p>
        {hasChanges && (
          <div className="flex gap-2">
            <button onClick={() => setDrafts({})} className="text-[11px] font-bold text-slate-500 hover:text-slate-700 px-2 py-1">Hủy</button>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1 text-[11px] font-black bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
              <Save className="w-3 h-3" />{saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-1 text-left text-[10px] font-bold text-slate-500 uppercase w-32">Tuần</th>
              {sku.weeks.map(w => (
                <th key={w.weekStart} className={cn("px-2 py-1 text-center text-[10px] font-bold whitespace-nowrap",
                  w.isActual ? "text-slate-400" : "text-blue-600")}>
                  {fmtWeek(w.weekStart)}<br /><span className="font-normal">{w.isActual ? "Actual" : "Forecast"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { key: "actual", label: "Tồn thực tế" },
              { key: "begin", label: "Đầu tuần", readonly: true },
              { key: "sales", label: "Bán dự kiến" },
              { key: "import", label: "Số nhập" },
              { key: "end", label: "Cuối tuần", readonly: true },
            ].map(row => (
              <tr key={row.key} className="border-t border-slate-200">
                <td className="sticky left-0 z-10 bg-slate-50 px-2 py-1 font-bold text-slate-600 whitespace-nowrap">{row.label}</td>
                {sku.weeks.map(w => {
                  const d = drafts[w.weekStart]
                  if (row.key === "begin") return <td key={w.weekStart} className="px-2 py-1 text-right text-slate-500">{n0(w.beginStock)}</td>
                  if (row.key === "end") return (
                    <td key={w.weekStart} className={cn("px-2 py-1 text-right font-bold", w.endStock < 0 ? "text-red-600" : "text-slate-700")}>
                      {n0(w.endStock)}
                    </td>
                  )
                  if (row.key === "actual") return (
                    <td key={w.weekStart} className="px-2 py-1 text-right">
                      <WeekCell value={d?.actual_stock !== undefined ? d.actual_stock : w.actualStock} placeholder={0} isAuto={false}
                        onChange={v => setField(w.weekStart, "actual_stock", v)} />
                    </td>
                  )
                  if (row.key === "sales") return (
                    <td key={w.weekStart} className="px-2 py-1 text-right">
                      <WeekCell value={d?.sales_forecast !== undefined ? d.sales_forecast : (w.salesForecastAuto ? null : w.salesForecast)}
                        placeholder={w.salesForecast} isAuto={w.salesForecastAuto}
                        onChange={v => setField(w.weekStart, "sales_forecast", v)} />
                    </td>
                  )
                  return (
                    <td key={w.weekStart} className="px-2 py-1 text-right">
                      <WeekCell value={d?.import_qty !== undefined ? d.import_qty : (w.importQtyAuto ? null : w.importQty)}
                        placeholder={w.suggestedImport} isAuto={w.importQtyAuto}
                        onChange={v => setField(w.weekStart, "import_qty", v)} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5">Ô nét đứt = số gợi ý tự động (chưa chỉnh tay). Gõ số để ghi đè — số đã ghi đè không bị gợi ý tính lại đè lên nữa.</p>
    </div>
  )
}

// ─── PO Tracker ────────────────────────────────────────────────────────────────
const EMPTY_PO = () => ({
  vendor: "", sku_code: "", qty: 0, expected_stockout_date: "", need_by_date: "", payment_deadline: "",
  expected_arrival_date: "", payment_status: "Chưa thanh toán", payment_date: "", delivery_status: "Chờ thanh toán",
  expected_arrival_week: "", note: "",
})

function PoTracker({ company }: { company: Company }) {
  const [rows, setRows] = useState<PoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, Partial<PoRow>>>({})
  const [newRows, setNewRows] = useState<ReturnType<typeof EMPTY_PO>[]>([])
  const [saving, setSaving] = useState(false)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/inventory-po?company=${company}`)
    setRows(r.ok ? await r.json() : [])
    setLoading(false)
  }, [company])
  useEffect(() => { fetchRows() }, [fetchRows])

  const enterEdit = () => { setDrafts({}); setNewRows([]); setEditMode(true) }
  const setDraft = (id: number, field: keyof PoRow, v: any) => setDrafts(p => ({ ...p, [id]: { ...p[id], [field]: v } }))
  const addRow = () => setNewRows(p => [...p, EMPTY_PO()])
  const setNewField = (i: number, field: string, v: any) => setNewRows(p => p.map((r, idx) => idx === i ? { ...r, [field]: v } : r))

  const save = async () => {
    setSaving(true)
    const updates = Object.entries(drafts).map(([id, f]) => ({ id: Number(id), ...f }))
    if (updates.length) {
      await fetch("/api/analytics/inventory-po", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) })
    }
    for (const nr of newRows) {
      if (!nr.vendor || !nr.sku_code || !nr.qty) continue
      await fetch("/api/analytics/inventory-po", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...nr, company_code: company, qty: Number(nr.qty) || 0 }),
      })
    }
    setSaving(false); setEditMode(false); fetchRows()
  }

  const del = async (id: number) => {
    if (!confirm("Xoá PO này?")) return
    await fetch("/api/analytics/inventory-po", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    fetchRows()
  }

  const dateCols: [string, keyof PoRow][] = [
    ["Ngày hết hàng DK", "expected_stockout_date"], ["Ngày cần có hàng", "need_by_date"],
    ["Trễ nhất TT", "payment_deadline"], ["Ngày về kho DK", "expected_arrival_date"],
  ]

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-black text-slate-900">PO Tracker — Đơn nhập hàng</h3>
        </div>
        {editMode ? (
          <div className="flex gap-2">
            <button onClick={addRow} className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 px-2 py-1">
              <Plus className="w-3 h-3" />Thêm PO
            </button>
            <button onClick={() => setEditMode(false)} className="text-[11px] font-bold text-slate-500 px-2 py-1">Hủy</button>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1 text-[11px] font-black bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
              <Save className="w-3 h-3" />{saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        ) : (
          <button onClick={enterEdit} className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 px-2 py-1">
            <Pencil className="w-3 h-3" />Sửa
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              {["Vendor", "SKU", "SL", ...dateCols.map(c => c[0]), "TT Thanh toán", "TT Giao hàng", "Ghi chú", ""].map(h => (
                <th key={h} className="px-2 py-2 text-left text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="px-4 py-6 text-center text-slate-400">Đang tải…</td></tr>}
            {!loading && !rows.length && !editMode && <tr><td colSpan={11} className="px-4 py-6 text-center text-slate-400">Chưa có PO nào</td></tr>}
            {rows.map(r => {
              const d = drafts[r.id]
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-bold">{editMode ? <input defaultValue={r.vendor} onChange={e => setDraft(r.id, "vendor", e.target.value)} className="w-24 border rounded px-1 py-0.5" /> : r.vendor}</td>
                  <td className="px-2 py-1.5 font-mono">{editMode ? <input defaultValue={r.sku_code} onChange={e => setDraft(r.id, "sku_code", e.target.value)} className="w-32 border rounded px-1 py-0.5" /> : r.sku_code}</td>
                  <td className="px-2 py-1.5 text-right">{editMode ? <input type="number" defaultValue={r.qty} onChange={e => setDraft(r.id, "qty", Number(e.target.value))} className="w-16 border rounded px-1 py-0.5 text-right" /> : n0(r.qty)}</td>
                  {dateCols.map(([, key]) => (
                    <td key={key as string} className="px-2 py-1.5 whitespace-nowrap">
                      {editMode
                        ? <input type="date" defaultValue={(r[key] as string) ?? ""} onChange={e => setDraft(r.id, key, e.target.value || null)} className="border rounded px-1 py-0.5 text-[11px]" />
                        : (r[key] ? String(r[key]) : "—")}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    {editMode
                      ? <select defaultValue={r.payment_status} onChange={e => setDraft(r.id, "payment_status", e.target.value)} className="border rounded px-1 py-0.5 text-[11px]">
                          <option>Chưa thanh toán</option><option>Đã thanh toán</option>
                        </select>
                      : <StatusPill text={r.payment_status} />}
                  </td>
                  <td className="px-2 py-1.5">
                    {editMode
                      ? <select defaultValue={r.delivery_status} onChange={e => setDraft(r.id, "delivery_status", e.target.value)} className="border rounded px-1 py-0.5 text-[11px]">
                          <option>Chờ thanh toán</option><option>Chờ nhận</option><option>Đã nhập kho</option>
                        </select>
                      : <StatusPill text={r.delivery_status} />}
                  </td>
                  <td className="px-2 py-1.5 max-w-[160px] truncate">{editMode ? <input defaultValue={r.note ?? ""} onChange={e => setDraft(r.id, "note", e.target.value)} className="w-full border rounded px-1 py-0.5" /> : (r.note || "—")}</td>
                  <td className="px-2 py-1.5">{editMode && <button onClick={() => del(r.id)}><Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" /></button>}</td>
                </tr>
              )
            })}
            {editMode && newRows.map((nr, i) => (
              <tr key={`new-${i}`} className="border-t border-blue-100 bg-blue-50/40">
                <td className="px-2 py-1.5"><input value={nr.vendor} onChange={e => setNewField(i, "vendor", e.target.value)} placeholder="Vendor" className="w-24 border rounded px-1 py-0.5" /></td>
                <td className="px-2 py-1.5"><input value={nr.sku_code} onChange={e => setNewField(i, "sku_code", e.target.value)} placeholder="SKU" className="w-32 border rounded px-1 py-0.5" /></td>
                <td className="px-2 py-1.5"><input type="number" value={nr.qty || ""} onChange={e => setNewField(i, "qty", e.target.value)} className="w-16 border rounded px-1 py-0.5 text-right" /></td>
                {dateCols.map(([, key]) => (
                  <td key={key as string} className="px-2 py-1.5"><input type="date" value={(nr as any)[key]} onChange={e => setNewField(i, key as string, e.target.value)} className="border rounded px-1 py-0.5 text-[11px]" /></td>
                ))}
                <td className="px-2 py-1.5">
                  <select value={nr.payment_status} onChange={e => setNewField(i, "payment_status", e.target.value)} className="border rounded px-1 py-0.5 text-[11px]">
                    <option>Chưa thanh toán</option><option>Đã thanh toán</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select value={nr.delivery_status} onChange={e => setNewField(i, "delivery_status", e.target.value)} className="border rounded px-1 py-0.5 text-[11px]">
                    <option>Chờ thanh toán</option><option>Chờ nhận</option><option>Đã nhập kho</option>
                  </select>
                </td>
                <td className="px-2 py-1.5"><input value={nr.note} onChange={e => setNewField(i, "note", e.target.value)} className="w-full border rounded px-1 py-0.5" /></td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
function InventoryInner() {
  const [company, setCompany] = useState<Company>("VN")
  const [grid, setGrid] = useState<GridResponse>({ weeks: [], skus: [] })
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<"critical" | "orderSoon" | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editSku, setEditSku] = useState<SkuRow | null>(null)

  const fetchGrid = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/inventory-plan/weekly?company=${company}&weeks=14`)
    setGrid(r.ok ? await r.json() : { weeks: [], skus: [] })
    setLoading(false)
  }, [company])
  useEffect(() => { fetchGrid() }, [fetchGrid])

  const filtered = useMemo(() => {
    if (filter === "critical") return grid.skus.filter(s => s.alert === "critical")
    if (filter === "orderSoon") return grid.skus.filter(s => s.needsOrderSoon)
    return grid.skus
  }, [grid.skus, filter])

  const criticalCount = grid.skus.filter(s => s.alert === "critical").length
  const orderSoonCount = grid.skus.filter(s => s.needsOrderSoon).length

  const deleteSku = async (sku_code: string) => {
    if (!confirm(`Bỏ theo dõi SKU ${sku_code}? (xoá luôn dữ liệu tuần đã nhập)`)) return
    await fetch("/api/analytics/inventory-plan/skus", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_code }) })
    fetchGrid()
  }

  const exportData = () => {
    const rows = grid.skus.flatMap(s => s.weeks.map(w => ({
      sku_code: s.sku_code, vendor: s.vendor, company, week: w.weekStart, loai: w.isActual ? "Actual" : "Forecast",
      ton_thuc_te: w.actualStock ?? "", ton_dau_tuan: w.beginStock, ban_du_kien: w.salesForecast,
      so_nhap: w.importQty, ton_cuoi_tuan: w.endStock, canh_bao: s.alert,
    })))
    exportRawRows(rows, `inventory_plan_${company}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center"><Package className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-lg font-black text-slate-900">Inventory — Kế hoạch nhập hàng</h1>
            <p className="text-xs text-slate-500 font-bold">Dự phóng tồn kho theo tuần từng SKU · gợi ý bán/nhập tự động, OPS chỉnh tay khi cần</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {(["VN", "US"] as Company[]).map(c => (
              <button key={c} onClick={() => setCompany(c)}
                className={cn("px-3 py-1.5 rounded-md text-xs font-black", company === c ? "bg-white shadow text-blue-600" : "text-slate-500")}>
                {c}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 text-xs font-bold bg-white border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
            <Plus className="w-3.5 h-3.5" />Thêm SKU
          </button>
          <button onClick={exportData} className="flex items-center gap-1 text-xs font-bold bg-white border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" />Export
          </button>
        </div>
      </div>

      {(criticalCount > 0 || orderSoonCount > 0) && (
        <div className="flex gap-2 flex-wrap">
          {criticalCount > 0 && (
            <button onClick={() => setFilter(filter === "critical" ? null : "critical")}
              className={cn("flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border",
                filter === "critical" ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-700 border-red-200")}>
              <AlertTriangle className="w-3.5 h-3.5" />{criticalCount} SKU nguy hiểm (dưới ngưỡng an toàn)
            </button>
          )}
          {orderSoonCount > 0 && (
            <button onClick={() => setFilter(filter === "orderSoon" ? null : "orderSoon")}
              className={cn("flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border",
                filter === "orderSoon" ? "bg-amber-600 text-white border-amber-600" : "bg-amber-50 text-amber-700 border-amber-200")}>
              <ClipboardList className="w-3.5 h-3.5" />{orderSoonCount} SKU cần đặt PO trong lead time
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              {["", "SKU", "Vendor", "Tồn hiện tại", "Vận tốc bán/tuần", "Số nhập tuần này", "Cảnh báo", ""].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Đang tải…</td></tr>}
            {!loading && !filtered.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Chưa có SKU nào theo dõi cho {company}</td></tr>}
            {filtered.map(s => {
              const isOpen = expanded === s.sku_code
              const thisWeek = s.weeks.find(w => !w.isActual) ?? s.weeks[s.weeks.length - 1]
              return (
                <React.Fragment key={s.sku_code}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setExpanded(isOpen ? null : s.sku_code)}>
                    <td className="px-3 py-2.5">{isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-900">{s.sku_code}</td>
                    <td className="px-3 py-2.5 text-slate-600">{s.vendor || "—"}</td>
                    <td className="px-3 py-2.5 font-bold">{n0(s.currentStock)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{n0(s.velocity)}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-bold">{n0(thisWeek?.importQty ?? 0)}</span>
                      {thisWeek?.importQtyAuto && thisWeek.importQty > 0 && <span className="ml-1 text-[10px] text-blue-500 font-bold">(gợi ý)</span>}
                    </td>
                    <td className="px-3 py-2.5"><AlertBadge level={s.alert} /></td>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setEditSku(s)}><Settings className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" /></button>
                        <button onClick={() => deleteSku(s.sku_code)}><Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-600" /></button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} className="p-0"><WeeklyGrid sku={s} onRefresh={fetchGrid} /></td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <PoTracker company={company} />

      {showAdd && <SkuModal company={company} onClose={() => setShowAdd(false)} onSaved={fetchGrid} />}
      {editSku && <SkuModal company={company} existing={editSku} onClose={() => setEditSku(null)} onSaved={fetchGrid} />}
    </div>
  )
}

export default function FulfillmentPage() {
  return <Suspense><InventoryInner /></Suspense>
}
