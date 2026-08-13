"use client"

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import {
  Package, Plus, Save, XCircle, Pencil, Trash2, Download,
  ChevronDown, ChevronRight, AlertTriangle, Clock, CheckCircle, History,
  RefreshCw, Filter, Eye, EyeOff,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { exportRawRows } from "@/lib/export-excel"
import { formatCompactNumber } from "@/lib/analytics-formatters"

// ─── Types ────────────────────────────────────────────────────────────────────
interface InventoryItem {
  sku_code:        string
  sim_type:        string
  vendor:          string
  status:          string
  retail_price:    number
  safety_stock:    number
  reorder_point:   number
  note_permanent:  string | null
  // snapshot
  snapshot_date:   string | null
  stock_total:     number
  stock_warehouse: number
  stock_pq_hcm:    number
  stock_dd_hn:     number
  stock_tsn_hcm:   number
  stock_kg:        number
  expiry_date:     string | null
  expiry_qty:      number
  ops_qty:         number
  telco_qty:       number
  od_qty:          number
  ws_qty:          number
  b2c_qty:         number
  marketing_qty:   number
  note:            string
  updated_by:      string | null
  updated_at:      string | null
  // computed
  sold_15d:        number
  sold_30d:        number
  avg_per_day:     number
  doi:             number | null
  est_out_of_stock: string | null
}

type DraftItem = Pick<InventoryItem,
  "stock_total"|"stock_warehouse"|"stock_pq_hcm"|"stock_dd_hn"|"stock_tsn_hcm"|"stock_kg"|
  "expiry_date"|"expiry_qty"|"ops_qty"|"telco_qty"|"od_qty"|"ws_qty"|"b2c_qty"|"marketing_qty"|"note">

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fck = (n: number) => formatCompactNumber(n)
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
const todayStr = fmt(new Date())

function doiColor(doi: number | null, stock: number): "red" | "yellow" | "green" | "gray" {
  if (stock === 0) return "gray"
  if (doi === null) return "gray"
  if (doi < 7)  return "red"
  if (doi < 30) return "yellow"
  return "green"
}

function DoiBadge({ doi, stock }: { doi: number | null; stock: number }) {
  const color = doiColor(doi, stock)
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full",
      color === "red"    && "bg-red-100 text-red-700",
      color === "yellow" && "bg-amber-100 text-amber-700",
      color === "green"  && "bg-emerald-100 text-emerald-700",
      color === "gray"   && "bg-slate-100 text-slate-400",
    )}>
      {color === "red"    && <AlertTriangle className="w-3 h-3" />}
      {color === "yellow" && <Clock className="w-3 h-3" />}
      {color === "green"  && <CheckCircle className="w-3 h-3" />}
      {doi !== null ? `${doi}N` : stock === 0 ? "Hết" : "—"}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    Active:    "bg-emerald-100 text-emerald-700",
    Inactive:  "bg-slate-100 text-slate-500",
    Temporary: "bg-blue-100 text-blue-700",
    Deleted:   "bg-red-100 text-red-500",
  }
  return <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase", cfg[status] ?? "bg-slate-100 text-slate-500")}>{status}</span>
}

function NumInput({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <input type="number" min={0} value={value || ""}
      onChange={e => onChange(parseInt(e.target.value) || 0)}
      placeholder="0"
      className={cn("w-20 text-right text-xs font-bold bg-white border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500", className)}
    />
  )
}

// ─── Add SKU Modal ────────────────────────────────────────────────────────────
function AddSkuModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [skuCode,      setSkuCode]      = useState("")
  const [simType,      setSimType]      = useState("SIM")
  const [vendor,       setVendor]       = useState("")
  const [status,       setStatus]       = useState("Active")
  const [safetyStock,  setSafetyStock]  = useState(0)
  const [reorderPoint, setReorderPoint] = useState(0)
  const [retailPrice,  setRetailPrice]  = useState(0)
  const [notePerm,     setNotePerm]     = useState("")
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState("")

  const submit = async () => {
    if (!skuCode.trim()) { setError("SKU code không được trống"); return }
    setSaving(true); setError("")
    try {
      const r = await fetch("/api/analytics/inventory-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_code: skuCode.trim(), sim_type: simType, vendor, status,
          retail_price: retailPrice, safety_stock: safetyStock, reorder_point: reorderPoint,
          note_permanent: notePerm || null,
        }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error ?? "Lỗi"); return }
      onAdded(); onClose()
    } catch { setError("Lỗi kết nối") } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-black text-slate-900 mb-4">Thêm SKU theo dõi</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">SKU Code *</label>
            <input value={skuCode} onChange={e => setSkuCode(e.target.value)}
              placeholder="VD: 1D0003DK00000"
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Loại</label>
              <select value={simType} onChange={e => setSimType(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-slate-50 focus:outline-none">
                <option value="SIM">SIM</option>
                <option value="ESIM">ESIM</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-slate-50 focus:outline-none">
                {["Active","Inactive","Temporary","Deleted"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vendor</label>
            <input value={vendor} onChange={e => setVendor(e.target.value)}
              placeholder="VD: 3HKDATAPOOL (tự động lấy nếu để trống)"
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Retail Price</label>
              <input type="number" value={retailPrice || ""} onChange={e => setRetailPrice(Number(e.target.value))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Safety (15D)</label>
              <input type="number" value={safetyStock || ""} onChange={e => setSafetyStock(Number(e.target.value))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Reorder (30D)</label>
              <input type="number" value={reorderPoint || ""} onChange={e => setReorderPoint(Number(e.target.value))}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ghi chú cố định</label>
            <textarea value={notePerm} onChange={e => setNotePerm(e.target.value)} rows={2}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-xs text-red-600 font-bold">{error}</p>}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">Hủy</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-black bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving ? "Đang lưu…" : "Thêm SKU"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function FulfillmentInner() {
  const [items,        setItems]        = useState<InventoryItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [dates,        setDates]        = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>("")   // "" = latest
  const [filterType,   setFilterType]   = useState<"ALL"|"SIM"|"ESIM">("ALL")
  const [filterAlert,  setFilterAlert]  = useState<"ALL"|"red"|"yellow"|"green"|"gray">("ALL")
  const [filterVendor, setFilterVendor] = useState("")
  const [showChannels, setShowChannels] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedSku,  setExpandedSku]  = useState<string | null>(null)
  const [historyData,  setHistoryData]  = useState<{ snapshot_date: string; stock_total: number }[]>([])

  // Edit mode
  const [editMode,     setEditMode]     = useState(false)
  const [snapshotDate, setSnapshotDate] = useState(todayStr)
  const [drafts,       setDrafts]       = useState<Record<string, DraftItem>>({})
  const [saving,       setSaving]       = useState(false)

  // Fetch
  const fetchItems = useCallback(async (date?: string) => {
    setLoading(true)
    try {
      const url = date ? `/api/analytics/inventory-items?date=${date}` : "/api/analytics/inventory-items"
      const r = await fetch(url)
      if (r.ok) setItems(await r.json())
    } catch {} finally { setLoading(false) }
  }, [])

  const fetchDates = useCallback(async () => {
    try {
      const r = await fetch("/api/analytics/inventory-snapshots/dates")
      if (r.ok) setDates(await r.json())
    } catch {}
  }, [])

  useEffect(() => { fetchItems(); fetchDates() }, [fetchItems, fetchDates])

  // Filtered items
  const filtered = useMemo(() => items.filter(it => {
    if (filterType !== "ALL" && it.sim_type !== filterType) return false
    if (filterVendor && it.vendor !== filterVendor) return false
    if (filterAlert !== "ALL" && doiColor(it.doi, it.stock_total) !== filterAlert) return false
    return true
  }), [items, filterType, filterVendor, filterAlert])

  const vendors = useMemo(() => [...new Set(items.map(i => i.vendor).filter(Boolean))].sort(), [items])

  // Alerts summary
  const alerts = useMemo(() => ({
    red:    items.filter(i => doiColor(i.doi, i.stock_total) === "red").length,
    yellow: items.filter(i => doiColor(i.doi, i.stock_total) === "yellow").length,
    expiry: items.filter(i => i.expiry_date && new Date(i.expiry_date) <= new Date(Date.now() + 30*86400000)).length,
  }), [items])

  // Edit mode helpers
  const enterEdit = () => {
    const d: Record<string, DraftItem> = {}
    for (const it of filtered) {
      d[it.sku_code] = {
        stock_total: it.stock_total, stock_warehouse: it.stock_warehouse,
        stock_pq_hcm: it.stock_pq_hcm, stock_dd_hn: it.stock_dd_hn,
        stock_tsn_hcm: it.stock_tsn_hcm, stock_kg: it.stock_kg,
        expiry_date: it.expiry_date, expiry_qty: it.expiry_qty,
        ops_qty: it.ops_qty, telco_qty: it.telco_qty, od_qty: it.od_qty,
        ws_qty: it.ws_qty, b2c_qty: it.b2c_qty, marketing_qty: it.marketing_qty,
        note: it.note,
      }
    }
    setDrafts(d); setEditMode(true)
  }

  const setField = (code: string, field: keyof DraftItem, val: any) =>
    setDrafts(p => ({ ...p, [code]: { ...p[code], [field]: val } }))

  const hasChanges = useMemo(() => {
    if (!editMode) return false
    return Object.entries(drafts).some(([code, d]) => {
      const it = items.find(i => i.sku_code === code)
      if (!it) return false
      return d.stock_total !== it.stock_total || d.note !== it.note ||
        d.stock_pq_hcm !== it.stock_pq_hcm || d.stock_dd_hn !== it.stock_dd_hn
    })
  }, [editMode, drafts, items])

  const saveSnapshot = async () => {
    if (saving) return
    setSaving(true)
    try {
      const updates = Object.entries(drafts).map(([sku_code, d]) => ({ sku_code, ...d }))
      const r = await fetch("/api/analytics/inventory-snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot_date: snapshotDate, updates }),
      })
      if (r.ok) {
        setEditMode(false); setDrafts({})
        await fetchItems(selectedDate || undefined); await fetchDates()
      }
    } catch {} finally { setSaving(false) }
  }

  const deleteItem = async (code: string) => {
    if (!confirm(`Xóa ${code} khỏi danh sách theo dõi?`)) return
    await fetch("/api/analytics/inventory-items", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_code: code }),
    })
    await fetchItems(selectedDate || undefined)
  }

  const expandHistory = async (code: string) => {
    if (expandedSku === code) { setExpandedSku(null); return }
    setExpandedSku(code)
    try {
      const r = await fetch(`/api/analytics/inventory-snapshots?sku_code=${code}`)
      if (r.ok) setHistoryData(await r.json())
    } catch {}
  }

  // Export
  const exportData = () => {
    const rows = filtered.map((it, i) => ({
      "No.": i + 1, "SKU": it.sku_code, "Type": it.sim_type, "Vendor": it.vendor,
      "Status": it.status, "Snapshot Date": it.snapshot_date ?? "",
      "Tổng tồn": it.stock_total, "Kho tổng": it.stock_warehouse,
      "Phổ Quang HCM": it.stock_pq_hcm, "Đống Đa HN": it.stock_dd_hn,
      "TSN HCM": it.stock_tsn_hcm, "Ký gửi": it.stock_kg,
      "Bán 15D": it.sold_15d, "Bán 30D": it.sold_30d,
      "Avg/ngày": it.avg_per_day, "DOI": it.doi ?? "",
      "Hết hàng dự kiến": it.est_out_of_stock ?? "",
      "Safety Stock": it.safety_stock, "Reorder Point": it.reorder_point,
      "Hạn SD": it.expiry_date ?? "", "SL sắp hết hạn": it.expiry_qty,
      "Retail Price": it.retail_price,
      "Total Value": it.stock_total * it.retail_price,
      "OPS": it.ops_qty, "Telco": it.telco_qty, "OD": it.od_qty,
      "WS": it.ws_qty, "B2C": it.b2c_qty, "Marketing": it.marketing_qty,
      "Ghi chú": it.note, "Cập nhật bởi": it.updated_by ?? "",
    }))
    exportRawRows(rows, `Inventory_${todayStr}`, "Inventory")
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1800px] mx-auto pb-24 lg:pb-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 rotate-3">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">Inventory Management</h1>
            <p className="text-sm text-slate-500 font-medium italic">Quản lý tồn kho · Bán 15D/30D auto từ hệ thống</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors">
            <Plus className="w-3.5 h-3.5" /> Thêm SKU
          </button>
          <button onClick={exportData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {(alerts.red > 0 || alerts.yellow > 0 || alerts.expiry > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {alerts.red > 0 && (
            <button onClick={() => setFilterAlert(filterAlert === "red" ? "ALL" : "red")}
              className={cn("flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left",
                filterAlert === "red" ? "border-red-400 bg-red-50" : "border-red-200 bg-red-50/60 hover:border-red-300")}>
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
              <div><p className="text-lg font-black text-red-700">{alerts.red} SKU</p><p className="text-xs text-red-600 font-semibold">Cần nhập gấp (DOI &lt; 7 ngày)</p></div>
            </button>
          )}
          {alerts.yellow > 0 && (
            <button onClick={() => setFilterAlert(filterAlert === "yellow" ? "ALL" : "yellow")}
              className={cn("flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left",
                filterAlert === "yellow" ? "border-amber-400 bg-amber-50" : "border-amber-200 bg-amber-50/60 hover:border-amber-300")}>
              <Clock className="w-6 h-6 text-amber-600 shrink-0" />
              <div><p className="text-lg font-black text-amber-700">{alerts.yellow} SKU</p><p className="text-xs text-amber-600 font-semibold">Sắp hết hàng (7–30 ngày)</p></div>
            </button>
          )}
          {alerts.expiry > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-2xl border-2 border-orange-200 bg-orange-50/60">
              <AlertTriangle className="w-6 h-6 text-orange-600 shrink-0" />
              <div><p className="text-lg font-black text-orange-700">{alerts.expiry} SKU</p><p className="text-xs text-orange-600 font-semibold">Hạn sử dụng &lt; 30 ngày</p></div>
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" />
        {(["ALL","SIM","ESIM"] as const).map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-all",
              filterType === t ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white")}>
            {t === "ALL" ? "Tất cả" : t}
          </button>
        ))}
        <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
          className="bg-slate-50 border-slate-200 rounded-full text-xs font-bold text-slate-600 px-3 py-1">
          <option value="">All Vendors</option>
          {vendors.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        {/* Snapshot date */}
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Xem ngày:</label>
          <select value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); fetchItems(e.target.value || undefined) }}
            className="bg-slate-50 border-slate-200 rounded-lg text-xs font-bold text-slate-700 px-2 py-1">
            <option value="">Mới nhất</option>
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={() => fetchItems(selectedDate || undefined)}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
            <RefreshCw className={cn("w-3.5 h-3.5 text-slate-500", loading && "animate-spin")} />
          </button>
        </div>

        <button onClick={() => setShowChannels(v => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100 transition-colors">
          {showChannels ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          Kênh phân bổ
        </button>
      </div>

      {/* Main table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">Danh sách tồn kho</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length} SKU{selectedDate ? ` · Snapshot ${selectedDate}` : " · Snapshot mới nhất"} · Bán 15D/30D từ gohub_dw
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editMode ? (
              <>
                <div className="flex items-center gap-1.5 mr-1">
                  <label className="text-[11px] font-bold text-slate-500">Ngày nhập:</label>
                  <input type="date" value={snapshotDate} onChange={e => setSnapshotDate(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <button onClick={() => { setEditMode(false); setDrafts({}) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                  <XCircle className="w-3.5 h-3.5" /> Hủy
                </button>
                <button onClick={saveSnapshot} disabled={saving}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                    hasChanges && !saving ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm" : "bg-slate-100 text-slate-400 cursor-not-allowed")}>
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Đang lưu…" : "Lưu snapshot"}
                </button>
              </>
            ) : (
              <button onClick={enterEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Cập nhật tồn kho
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              {/* Group row */}
              <tr className="bg-slate-50 border-b border-slate-100">
                <th colSpan={4} className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase">SKU Info</th>
                <th colSpan={6} className="px-4 py-1.5 text-[10px] font-bold text-emerald-600 uppercase text-center border-l border-emerald-100 bg-emerald-50/40">Tồn kho</th>
                <th colSpan={4} className="px-4 py-1.5 text-[10px] font-bold text-blue-600 uppercase text-center border-l border-blue-100 bg-blue-50/40">Tốc độ bán (gohub_dw)</th>
                <th colSpan={2} className="px-4 py-1.5 text-[10px] font-bold text-purple-600 uppercase text-center border-l border-purple-100 bg-purple-50/40">Ngưỡng</th>
                <th colSpan={2} className="px-4 py-1.5 text-[10px] font-bold text-orange-600 uppercase text-center border-l border-orange-100 bg-orange-50/40">Hạn SD</th>
                {showChannels && <th colSpan={6} className="px-4 py-1.5 text-[10px] font-bold text-rose-600 uppercase text-center border-l border-rose-100 bg-rose-50/40">Kênh phân bổ</th>}
                <th className="px-4 py-1.5" />
              </tr>
              {/* Column row */}
              <tr className="bg-slate-50 border-b border-slate-200">
                {/* SKU info */}
                <th className="px-4 py-2 font-bold text-slate-500 uppercase tracking-wider w-8">#</th>
                <th className="px-4 py-2 font-bold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="px-4 py-2 font-bold text-slate-500 uppercase tracking-wider">Vendor</th>
                <th className="px-4 py-2 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                {/* Stock */}
                <th className="px-3 py-2 font-bold text-emerald-600 uppercase text-right border-l border-emerald-100 bg-emerald-50/30">Tổng</th>
                <th className="px-3 py-2 font-bold text-emerald-500 uppercase text-right bg-emerald-50/20 whitespace-nowrap">Kho TC</th>
                <th className="px-3 py-2 font-bold text-emerald-500 uppercase text-right bg-emerald-50/20 whitespace-nowrap">PQ-HCM</th>
                <th className="px-3 py-2 font-bold text-emerald-500 uppercase text-right bg-emerald-50/20 whitespace-nowrap">ĐĐ-HN</th>
                <th className="px-3 py-2 font-bold text-emerald-500 uppercase text-right bg-emerald-50/20 whitespace-nowrap">TSN-HCM</th>
                <th className="px-3 py-2 font-bold text-emerald-500 uppercase text-right bg-emerald-50/20 whitespace-nowrap">KG</th>
                {/* Bán */}
                <th className="px-3 py-2 font-bold text-blue-500 uppercase text-right border-l border-blue-100 bg-blue-50/30 whitespace-nowrap">Bán 15D</th>
                <th className="px-3 py-2 font-bold text-blue-500 uppercase text-right bg-blue-50/20 whitespace-nowrap">Bán 30D</th>
                <th className="px-3 py-2 font-bold text-blue-600 uppercase text-right bg-blue-50/20 whitespace-nowrap">Avg/N</th>
                <th className="px-3 py-2 font-bold text-blue-700 uppercase text-center bg-blue-50/20">DOI</th>
                {/* Ngưỡng */}
                <th className="px-3 py-2 font-bold text-purple-500 uppercase text-right border-l border-purple-100 bg-purple-50/30 whitespace-nowrap">Safety</th>
                <th className="px-3 py-2 font-bold text-purple-500 uppercase text-right bg-purple-50/20 whitespace-nowrap">Reorder</th>
                {/* Hạn SD */}
                <th className="px-3 py-2 font-bold text-orange-500 uppercase text-right border-l border-orange-100 bg-orange-50/30 whitespace-nowrap">Hạn SD</th>
                <th className="px-3 py-2 font-bold text-orange-500 uppercase text-right bg-orange-50/20 whitespace-nowrap">SL HSD</th>
                {/* Kênh */}
                {showChannels && <>
                  <th className="px-2 py-2 font-bold text-rose-500 uppercase text-right border-l border-rose-100 bg-rose-50/30">OPS</th>
                  <th className="px-2 py-2 font-bold text-rose-500 uppercase text-right bg-rose-50/20">Telco</th>
                  <th className="px-2 py-2 font-bold text-rose-500 uppercase text-right bg-rose-50/20">OD</th>
                  <th className="px-2 py-2 font-bold text-rose-500 uppercase text-right bg-rose-50/20">WS</th>
                  <th className="px-2 py-2 font-bold text-rose-500 uppercase text-right bg-rose-50/20">B2C</th>
                  <th className="px-2 py-2 font-bold text-rose-500 uppercase text-right bg-rose-50/20">Mkt</th>
                </>}
                <th className="px-3 py-2 font-bold text-slate-400 uppercase">Ghi chú / Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={20} className="px-6 py-10 text-center text-sm text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" /> Đang tải…
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={20} className="px-6 py-10 text-center text-sm text-slate-400">
                  Chưa có SKU nào. Click "Thêm SKU" để bắt đầu.
                </td></tr>
              )}
              {!loading && filtered.map((it, idx) => {
                const d    = drafts[it.sku_code]
                const isEx = expandedSku === it.sku_code
                const color = doiColor(it.doi, it.stock_total)
                const expiryAlert = it.expiry_date && new Date(it.expiry_date) <= new Date(Date.now() + 30*86400000)

                // Stock display value (draft or actual)
                const sv = (field: keyof DraftItem) => editMode && d ? (d[field] as number) : (it[field as keyof InventoryItem] as number)

                return (
                  <React.Fragment key={it.sku_code}>
                    <tr className={cn("transition-colors hover:bg-slate-50/60",
                      color === "red" && "bg-red-50/30",
                      isEx && "bg-blue-50/40",
                    )}>
                      {/* # */}
                      <td className="px-4 py-2.5 text-slate-400 font-bold">{idx + 1}</td>
                      {/* SKU */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => expandHistory(it.sku_code)} className="text-slate-400 hover:text-blue-600 transition-colors">
                            {isEx ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <div>
                            <p className="font-black text-slate-900 text-[11px] leading-tight">{it.sku_code}</p>
                            <p className="text-[9px] text-slate-400">{it.sim_type}</p>
                          </div>
                        </div>
                      </td>
                      {/* Vendor */}
                      <td className="px-4 py-2.5 font-bold text-slate-600 text-[11px]">{it.vendor || "—"}</td>
                      {/* Status */}
                      <td className="px-4 py-2.5"><StatusBadge status={it.status} /></td>

                      {/* Stock */}
                      {editMode && d ? <>
                        <td className="px-2 py-2 border-l border-emerald-100 bg-emerald-50/30">
                          <NumInput value={d.stock_total} onChange={v => setField(it.sku_code, "stock_total", v)} className="w-20" />
                        </td>
                        <td className="px-2 py-2 bg-emerald-50/20"><NumInput value={d.stock_warehouse} onChange={v => setField(it.sku_code, "stock_warehouse", v)} /></td>
                        <td className="px-2 py-2 bg-emerald-50/20"><NumInput value={d.stock_pq_hcm}   onChange={v => setField(it.sku_code, "stock_pq_hcm",   v)} /></td>
                        <td className="px-2 py-2 bg-emerald-50/20"><NumInput value={d.stock_dd_hn}    onChange={v => setField(it.sku_code, "stock_dd_hn",    v)} /></td>
                        <td className="px-2 py-2 bg-emerald-50/20"><NumInput value={d.stock_tsn_hcm}  onChange={v => setField(it.sku_code, "stock_tsn_hcm",  v)} /></td>
                        <td className="px-2 py-2 bg-emerald-50/20"><NumInput value={d.stock_kg}        onChange={v => setField(it.sku_code, "stock_kg",        v)} /></td>
                      </> : <>
                        <td className="px-3 py-2.5 text-right font-black text-emerald-700 border-l border-emerald-100 bg-emerald-50/30">{it.stock_total.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-600 bg-emerald-50/20">{it.stock_warehouse || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-600 bg-emerald-50/20">{it.stock_pq_hcm    || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-600 bg-emerald-50/20">{it.stock_dd_hn     || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-600 bg-emerald-50/20">{it.stock_tsn_hcm   || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-600 bg-emerald-50/20">{it.stock_kg         || "—"}</td>
                      </>}

                      {/* Bán — read only */}
                      <td className="px-3 py-2.5 text-right font-bold text-blue-600 border-l border-blue-100 bg-blue-50/30">{it.sold_15d.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-blue-700 bg-blue-50/20">{it.sold_30d.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-blue-500 bg-blue-50/20">{it.avg_per_day.toFixed(1)}</td>
                      <td className="px-3 py-2.5 text-center bg-blue-50/20"><DoiBadge doi={it.doi} stock={it.stock_total} /></td>

                      {/* Ngưỡng — read only */}
                      <td className="px-3 py-2.5 text-right font-bold text-purple-600 border-l border-purple-100 bg-purple-50/30">{it.safety_stock || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-purple-500 bg-purple-50/20">{it.reorder_point || "—"}</td>

                      {/* Hạn SD */}
                      {editMode && d ? <>
                        <td className="px-2 py-2 border-l border-orange-100 bg-orange-50/30">
                          <input type="date" value={d.expiry_date ?? ""}
                            onChange={e => setField(it.sku_code, "expiry_date", e.target.value || null)}
                            className="text-[11px] font-bold border border-orange-200 rounded px-1 py-0.5 w-32 focus:outline-none focus:ring-1 focus:ring-orange-400" />
                        </td>
                        <td className="px-2 py-2 bg-orange-50/20">
                          <NumInput value={d.expiry_qty} onChange={v => setField(it.sku_code, "expiry_qty", v)} />
                        </td>
                      </> : <>
                        <td className={cn("px-3 py-2.5 text-right font-bold border-l border-orange-100 bg-orange-50/30",
                          expiryAlert ? "text-orange-700" : "text-slate-500")}>
                          {it.expiry_date ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-orange-600 bg-orange-50/20">{it.expiry_qty || "—"}</td>
                      </>}

                      {/* Kênh */}
                      {showChannels && (editMode && d ? <>
                        {(["ops_qty","telco_qty","od_qty","ws_qty","b2c_qty","marketing_qty"] as (keyof DraftItem)[]).map((f,fi) => (
                          <td key={f} className={cn("px-1 py-2", fi===0 && "border-l border-rose-100 bg-rose-50/30", fi>0 && "bg-rose-50/20")}>
                            <NumInput value={d[f] as number} onChange={v => setField(it.sku_code, f, v)} className="w-16" />
                          </td>
                        ))}
                      </> : <>
                        {([it.ops_qty,it.telco_qty,it.od_qty,it.ws_qty,it.b2c_qty,it.marketing_qty]).map((v,fi) => (
                          <td key={fi} className={cn("px-2 py-2.5 text-right font-bold text-rose-600",
                            fi===0 && "border-l border-rose-100 bg-rose-50/30", fi>0 && "bg-rose-50/20")}>
                            {v || "—"}
                          </td>
                        ))}
                      </>)}

                      {/* Ghi chú + actions */}
                      <td className="px-3 py-2.5">
                        {editMode && d ? (
                          <input value={d.note} onChange={e => setField(it.sku_code, "note", e.target.value)}
                            placeholder="Ghi chú…"
                            className="w-44 text-xs border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        ) : (
                          <div className="flex items-center gap-2">
                            {it.note && <span className="text-[11px] text-slate-500 max-w-[160px] truncate" title={it.note}>{it.note}</span>}
                            {it.note_permanent && <span className="text-[11px] text-purple-500 italic max-w-[120px] truncate" title={it.note_permanent}>[{it.note_permanent}]</span>}
                            <button onClick={() => deleteItem(it.sku_code)}
                              className="ml-1 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* History expand */}
                    {isEx && (
                      <tr>
                        <td colSpan={showChannels ? 25 : 19} className="px-0 py-0">
                          <div className="bg-blue-50/60 border-b border-blue-100 px-6 py-3">
                            <p className="text-[11px] font-black text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <History className="w-3.5 h-3.5" /> Lịch sử tồn kho — {it.sku_code}
                            </p>
                            {historyData.length === 0 ? (
                              <p className="text-xs text-slate-400">Chưa có lịch sử</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {historyData.map(h => (
                                  <div key={h.snapshot_date} className="bg-white rounded-lg px-3 py-2 border border-blue-100 text-center">
                                    <p className="text-[10px] text-blue-600 font-bold">{h.snapshot_date}</p>
                                    <p className="text-sm font-black text-slate-900">{h.stock_total.toLocaleString()}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <AddSkuModal onClose={() => setShowAddModal(false)} onAdded={() => { fetchItems(selectedDate || undefined); fetchDates() }} />
      )}
    </div>
  )
}

export default function FulfillmentPage() {
  return <Suspense><FulfillmentInner /></Suspense>
}
