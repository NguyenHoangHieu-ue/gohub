"use client"

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import {
  Package, Plus, Save, XCircle, Pencil, Trash2, Download,
  ChevronDown, ChevronRight, AlertTriangle, Clock, CheckCircle,
  History, RefreshCw, Filter, Eye, EyeOff, Wallet, Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { exportRawRows } from "@/lib/export-excel"
import { formatCompactNumber } from "@/lib/analytics-formatters"

// ─── Types ────────────────────────────────────────────────────────────────────
interface InventoryItem {
  sku_code: string; sim_type: string; vendor: string; status: string
  retail_price: number; safety_stock: number; reorder_point: number; note_permanent: string | null
  snapshot_date: string | null; stock_total: number; stock_warehouse: number
  stock_pq_hcm: number; stock_dd_hn: number; stock_tsn_hcm: number; stock_kg: number
  expiry_date: string | null; expiry_qty: number
  ops_qty: number; telco_qty: number; od_qty: number; ws_qty: number; b2c_qty: number; marketing_qty: number
  note: string; updated_by: string | null; updated_at: string | null
  sold_15d: number; sold_30d: number; avg_per_day: number; doi: number | null; est_out_of_stock: string | null
}

interface VendorBalance {
  vendor: string; balance: number; currency: string; credit_limit: number; note: string | null
  updated_by: string | null; updated_at: string | null
}

type SnapshotDraft = Pick<InventoryItem,
  "stock_total"|"stock_warehouse"|"stock_pq_hcm"|"stock_dd_hn"|"stock_tsn_hcm"|"stock_kg"|
  "expiry_date"|"expiry_qty"|"ops_qty"|"telco_qty"|"od_qty"|"ws_qty"|"b2c_qty"|"marketing_qty"|"note">

type ItemMeta = Pick<InventoryItem,
  "retail_price"|"safety_stock"|"reorder_point"|"status"|"vendor"|"sim_type"|"note_permanent">

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
const todayStr = fmt(new Date())

function doiLevel(doi: number | null, stock: number): "critical" | "warning" | "ok" | "none" {
  if (stock === 0 || doi === null) return "none"
  if (doi < 7)  return "critical"
  if (doi < 30) return "warning"
  return "ok"
}

function DoiBadge({ doi, stock }: { doi: number | null; stock: number }) {
  const lvl = doiLevel(doi, stock)
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap",
      lvl === "critical" && "bg-red-100 text-red-700",
      lvl === "warning"  && "bg-amber-100 text-amber-700",
      lvl === "ok"       && "bg-emerald-100 text-emerald-700",
      lvl === "none"     && "bg-slate-100 text-slate-400",
    )}>
      {lvl === "critical" && <AlertTriangle className="w-3 h-3" />}
      {lvl === "warning"  && <Clock className="w-3 h-3" />}
      {lvl === "ok"       && <CheckCircle className="w-3 h-3" />}
      {doi !== null ? `${doi}d` : stock === 0 ? "Out" : "—"}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-700", Inactive: "bg-slate-100 text-slate-500",
    Temporary: "bg-blue-100 text-blue-700",    Deleted: "bg-red-100 text-red-500",
  }
  return <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wide", cfg[status] ?? "bg-slate-100 text-slate-500")}>{status}</span>
}

function NumInput({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <input type="number" min={0} value={value || ""}
      onChange={e => onChange(parseInt(e.target.value) || 0)}
      placeholder="0"
      className={cn("w-20 text-right text-xs font-bold bg-white border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500", className)}
    />
  )
}

function Th({ children, right, border, className }: { children: React.ReactNode; right?: boolean; border?: boolean; className?: string }) {
  return (
    <th className={cn(
      "px-3 py-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap",
      right && "text-right", border && "border-l border-slate-200", className
    )}>{children}</th>
  )
}

function Td({ children, right, border, className }: { children: React.ReactNode; right?: boolean; border?: boolean; className?: string }) {
  return (
    <td className={cn("px-3 py-2.5 text-xs", right && "text-right", border && "border-l border-slate-100", className)}>
      {children}
    </td>
  )
}

// ─── Add SKU Modal ─────────────────────────────────────────────────────────────
function AddSkuModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ sku_code:"", sim_type:"SIM", vendor:"", status:"Active",
    retail_price:0, safety_stock:0, reorder_point:0, note_permanent:"" })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState("")
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.sku_code.trim()) { setError("SKU code is required"); return }
    setSaving(true); setError("")
    const r = await fetch("/api/analytics/inventory-items", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ ...form, sku_code: form.sku_code.trim(), note_permanent: form.note_permanent || null }),
    })
    const j = await r.json()
    if (!r.ok) { setError(j.error ?? "Error"); setSaving(false); return }
    onAdded(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-black text-slate-900 mb-4">Add SKU to Track</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">SKU Code *</label>
            <input value={form.sku_code} onChange={e => set("sku_code", e.target.value)} placeholder="e.g. 1D0003DK00000"
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Type</label>
              <select value={form.sim_type} onChange={e => set("sim_type", e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-slate-50">
                <option value="SIM">SIM</option><option value="ESIM">ESIM</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-slate-50">
                {["Active","Inactive","Temporary","Deleted"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vendor <span className="normal-case font-normal">(auto-filled if blank)</span></label>
            <input value={form.vendor} onChange={e => set("vendor", e.target.value)} placeholder="e.g. 3HKDATAPOOL"
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["Retail Price", "retail_price"],["Safety Stock (15D)", "safety_stock"],["Reorder Point (30D)", "reorder_point"]].map(([label, key]) => (
              <div key={key}>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                <input type="number" value={(form as any)[key] || ""} onChange={e => set(key, Number(e.target.value))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none" />
              </div>
            ))}
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Permanent Note</label>
            <textarea value={form.note_permanent} onChange={e => set("note_permanent", e.target.value)} rows={2}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-xs text-red-600 font-bold">{error}</p>}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving…" : "Add SKU"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Item Modal ───────────────────────────────────────────────────────────
function EditItemModal({ item, onClose, onSaved }: { item: InventoryItem; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ItemMeta>({
    retail_price: item.retail_price, safety_stock: item.safety_stock, reorder_point: item.reorder_point,
    status: item.status, vendor: item.vendor, sim_type: item.sim_type, note_permanent: item.note_permanent,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState("")
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    setSaving(true); setError("")
    const r = await fetch("/api/analytics/inventory-items", {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ sku_code: item.sku_code, ...form }),
    })
    if (!r.ok) { const j = await r.json(); setError(j.error ?? "Error"); setSaving(false); return }
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-black text-slate-900 mb-1">Edit SKU Settings</h3>
        <p className="text-xs text-slate-500 mb-4 font-bold">{item.sku_code}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Type</label>
              <select value={form.sim_type ?? "SIM"} onChange={e => set("sim_type", e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-slate-50">
                <option value="SIM">SIM</option><option value="ESIM">ESIM</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold bg-slate-50">
                {["Active","Inactive","Temporary","Deleted"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Vendor</label>
            <input value={form.vendor ?? ""} onChange={e => set("vendor", e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["Retail Price", "retail_price"],["Safety Stock (15D)", "safety_stock"],["Reorder Point (30D)", "reorder_point"]].map(([label, key]) => (
              <div key={key}>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                <input type="number" value={(form as any)[key] || ""}
                  onChange={e => set(key, Number(e.target.value))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none" />
              </div>
            ))}
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Permanent Note</label>
            <textarea value={form.note_permanent ?? ""} onChange={e => set("note_permanent", e.target.value || null)} rows={2}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-xs text-red-600 font-bold">{error}</p>}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-black bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Vendor Balance Section ────────────────────────────────────────────────────
function VendorBalanceSection({ vendors }: { vendors: string[] }) {
  const [balances,  setBalances]  = useState<VendorBalance[]>([])
  const [editMode,  setEditMode]  = useState(false)
  const [drafts,    setDrafts]    = useState<Record<string, VendorBalance>>({})
  const [saving,    setSaving]    = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const fetchBalances = useCallback(async () => {
    const r = await fetch("/api/analytics/vendor-balances")
    if (r.ok) setBalances(await r.json())
  }, [])

  useEffect(() => { fetchBalances() }, [fetchBalances])

  // Merge DB balances with tracked vendors (vendors not in DB yet → show empty row)
  const rows = useMemo(() => {
    const map = Object.fromEntries(balances.map(b => [b.vendor, b]))
    const allV = [...new Set([...vendors, ...balances.map(b => b.vendor)])].sort()
    return allV.map(v => map[v] ?? { vendor: v, balance: 0, currency: "USD", credit_limit: 0, note: null, updated_by: null, updated_at: null })
  }, [balances, vendors])

  const enterEdit = () => {
    const d: Record<string, VendorBalance> = {}
    for (const r of rows) d[r.vendor] = { ...r }
    setDrafts(d); setEditMode(true)
  }

  const save = async () => {
    setSaving(true)
    const updates = Object.values(drafts)
    const r = await fetch("/api/analytics/vendor-balances", {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ updates }),
    })
    if (r.ok) { await fetchBalances(); setEditMode(false); setDrafts({}) }
    setSaving(false)
  }

  const setField = (vendor: string, field: keyof VendorBalance, val: any) =>
    setDrafts(p => ({ ...p, [vendor]: { ...p[vendor], [field]: val } }))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <button onClick={() => setCollapsed(v => !v)} className="flex items-center gap-2 text-left group">
          <Wallet className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-black text-slate-900">Vendor Balances</span>
          <span className="text-xs text-slate-400 font-medium">{collapsed ? "▶ Show" : "▼ Hide"}</span>
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button onClick={() => { setEditMode(false); setDrafts({}) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                  <XCircle className="w-3.5 h-3.5" /> Cancel
                </button>
                <button onClick={save} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <button onClick={enterEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
                <Pencil className="w-3.5 h-3.5" /> Edit Balances
              </button>
            )}
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Vendor</Th>
                <Th right>Balance</Th>
                <Th>Currency</Th>
                <Th right>Credit Limit</Th>
                <Th>Note</Th>
                <Th>Last Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-4 text-center text-slate-400 text-xs">No vendors yet. Add SKUs first.</td></tr>
              )}
              {rows.map(row => {
                const d = drafts[row.vendor] ?? row
                const lowBalance = d.credit_limit > 0 && d.balance < d.credit_limit * 0.2
                return (
                  <tr key={row.vendor} className={cn("hover:bg-slate-50/60 transition-colors", lowBalance && "bg-red-50/40")}>
                    <Td><span className="font-bold text-slate-800">{row.vendor}</span></Td>
                    <Td right>
                      {editMode
                        ? <input type="number" value={d.balance || ""} onChange={e => setField(row.vendor,"balance",Number(e.target.value))}
                            className="w-28 text-right text-xs font-bold border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        : <span className={cn("font-black", lowBalance ? "text-red-600" : "text-slate-900")}>
                            {d.balance.toLocaleString()}
                          </span>
                      }
                    </Td>
                    <Td>
                      {editMode
                        ? <select value={d.currency} onChange={e => setField(row.vendor,"currency",e.target.value)}
                            className="border border-slate-300 rounded px-1.5 py-0.5 text-xs font-bold bg-white">
                            {["USD","VND","EUR","HKD","SGD"].map(c => <option key={c}>{c}</option>)}
                          </select>
                        : <span className="font-bold text-slate-500">{d.currency}</span>
                      }
                    </Td>
                    <Td right>
                      {editMode
                        ? <input type="number" value={d.credit_limit || ""} onChange={e => setField(row.vendor,"credit_limit",Number(e.target.value))}
                            className="w-28 text-right text-xs font-bold border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        : <span className="font-bold text-slate-500">{d.credit_limit ? d.credit_limit.toLocaleString() : "—"}</span>
                      }
                    </Td>
                    <Td>
                      {editMode
                        ? <input value={d.note ?? ""} onChange={e => setField(row.vendor,"note",e.target.value || null)}
                            placeholder="Note…"
                            className="w-48 text-xs border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        : <span className="text-slate-500">{d.note ?? "—"}</span>
                      }
                    </Td>
                    <Td>
                      {row.updated_by
                        ? <span className="text-slate-400">{row.updated_by} · {row.updated_at?.slice(0,10)}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </Td>
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

// ─── Main Component ────────────────────────────────────────────────────────────
function FulfillmentInner() {
  const [items,        setItems]        = useState<InventoryItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [dates,        setDates]        = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState("")
  const [filterType,   setFilterType]   = useState<"ALL"|"SIM"|"ESIM">("ALL")
  const [filterAlert,  setFilterAlert]  = useState<""|"critical"|"warning">("")
  const [filterVendor, setFilterVendor] = useState("")
  const [showChannels, setShowChannels] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editItemFor,  setEditItemFor]  = useState<InventoryItem | null>(null)
  const [expandedSku,  setExpandedSku]  = useState<string | null>(null)
  const [historyData,  setHistoryData]  = useState<{ snapshot_date: string; stock_total: number }[]>([])
  // Snapshot edit
  const [editMode,     setEditMode]     = useState(false)
  const [snapshotDate, setSnapshotDate] = useState(todayStr)
  const [drafts,       setDrafts]       = useState<Record<string, SnapshotDraft>>({})
  const [saving,       setSaving]       = useState(false)

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

  const filtered = useMemo(() => items.filter(it => {
    if (filterType !== "ALL" && it.sim_type !== filterType) return false
    if (filterVendor && it.vendor !== filterVendor) return false
    if (filterAlert && doiLevel(it.doi, it.stock_total) !== filterAlert) return false
    return true
  }), [items, filterType, filterVendor, filterAlert])

  const allVendors = useMemo(() => [...new Set(items.map(i => i.vendor).filter(Boolean))].sort(), [items])
  const alerts = useMemo(() => ({
    critical: items.filter(i => doiLevel(i.doi, i.stock_total) === "critical").length,
    warning:  items.filter(i => doiLevel(i.doi, i.stock_total) === "warning").length,
    expiry:   items.filter(i => i.expiry_date && new Date(i.expiry_date) <= new Date(Date.now() + 30*86400000)).length,
  }), [items])

  // Snapshot edit
  const enterEdit = () => {
    const d: Record<string, SnapshotDraft> = {}
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

  const setDraftField = (code: string, field: keyof SnapshotDraft, val: any) =>
    setDrafts(p => ({ ...p, [code]: { ...p[code], [field]: val } }))

  const hasChanges = useMemo(() => {
    if (!editMode) return false
    return Object.entries(drafts).some(([code, d]) => {
      const it = items.find(i => i.sku_code === code)
      return it && (d.stock_total !== it.stock_total || d.note !== it.note ||
        d.stock_pq_hcm !== it.stock_pq_hcm || d.stock_dd_hn !== it.stock_dd_hn ||
        d.stock_tsn_hcm !== it.stock_tsn_hcm || d.stock_kg !== it.stock_kg ||
        d.expiry_date !== it.expiry_date || d.expiry_qty !== it.expiry_qty)
    })
  }, [editMode, drafts, items])

  const saveSnapshot = async () => {
    if (saving) return; setSaving(true)
    const updates = Object.entries(drafts).map(([sku_code, d]) => ({ sku_code, ...d }))
    const r = await fetch("/api/analytics/inventory-snapshots", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ snapshot_date: snapshotDate, updates }),
    })
    if (r.ok) { setEditMode(false); setDrafts({}); await fetchItems(selectedDate || undefined); await fetchDates() }
    setSaving(false)
  }

  const deleteItem = async (code: string) => {
    if (!confirm(`Remove "${code}" from tracking?`)) return
    await fetch("/api/analytics/inventory-items", {
      method:"DELETE", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ sku_code: code }),
    })
    await fetchItems(selectedDate || undefined)
  }

  const expandHistory = async (code: string) => {
    if (expandedSku === code) { setExpandedSku(null); return }
    setExpandedSku(code)
    const r = await fetch(`/api/analytics/inventory-snapshots?sku_code=${code}`)
    if (r.ok) setHistoryData(await r.json())
  }

  const exportData = () => {
    const rows = filtered.map((it, i) => ({
      "#": i+1, "SKU Code": it.sku_code, "Type": it.sim_type, "Vendor": it.vendor, "Status": it.status,
      "Snapshot Date": it.snapshot_date ?? "",
      "Total Stock": it.stock_total, "Main Warehouse": it.stock_warehouse,
      "Pho Quang (HCM)": it.stock_pq_hcm, "Dong Da (HN)": it.stock_dd_hn,
      "Tan Son Nhat (HCM)": it.stock_tsn_hcm, "Consignment": it.stock_kg,
      "Sold 15D": it.sold_15d, "Sold 30D": it.sold_30d, "Avg/Day": it.avg_per_day,
      "DOI (Days)": it.doi ?? "", "Est. Out of Stock": it.est_out_of_stock ?? "",
      "Safety Stock": it.safety_stock, "Reorder Point": it.reorder_point,
      "Expiry Date": it.expiry_date ?? "", "Expiry Qty": it.expiry_qty,
      "Retail Price": it.retail_price, "Total Retail Value": it.stock_total * it.retail_price,
      "OPS": it.ops_qty, "Telco": it.telco_qty, "OD": it.od_qty,
      "WS": it.ws_qty, "B2C": it.b2c_qty, "Marketing": it.marketing_qty,
      "Note": it.note, "Updated By": it.updated_by ?? "",
    }))
    exportRawRows(rows, `Inventory_${todayStr}`, "Inventory")
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-[1900px] mx-auto pb-24 lg:pb-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">Inventory Management</h1>
            <p className="text-sm text-slate-500 font-medium italic">OPS stock tracking · Sold 15D/30D auto-pulled from system</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add SKU
          </button>
          <button onClick={exportData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Alert banner */}
      {(alerts.critical > 0 || alerts.warning > 0 || alerts.expiry > 0) && (
        <div className="flex flex-wrap gap-3">
          {alerts.critical > 0 && (
            <button onClick={() => setFilterAlert(filterAlert === "critical" ? "" : "critical")}
              className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all text-left",
                filterAlert === "critical" ? "border-red-500 bg-red-50" : "border-red-200 bg-red-50/70 hover:border-red-400")}>
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <div><span className="text-base font-black text-red-700">{alerts.critical}</span>
                <span className="text-xs text-red-600 font-semibold ml-1">SKUs — Reorder Urgent (DOI &lt; 7 days)</span></div>
            </button>
          )}
          {alerts.warning > 0 && (
            <button onClick={() => setFilterAlert(filterAlert === "warning" ? "" : "warning")}
              className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all text-left",
                filterAlert === "warning" ? "border-amber-500 bg-amber-50" : "border-amber-200 bg-amber-50/70 hover:border-amber-400")}>
              <Clock className="w-5 h-5 text-amber-600 shrink-0" />
              <div><span className="text-base font-black text-amber-700">{alerts.warning}</span>
                <span className="text-xs text-amber-600 font-semibold ml-1">SKUs — Running Low (7–30 days)</span></div>
            </button>
          )}
          {alerts.expiry > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-orange-200 bg-orange-50/70">
              <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
              <div><span className="text-base font-black text-orange-700">{alerts.expiry}</span>
                <span className="text-xs text-orange-600 font-semibold ml-1">SKUs — Expiry Within 30 Days</span></div>
            </div>
          )}
          {filterAlert && (
            <button onClick={() => setFilterAlert("")}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50">
              <XCircle className="w-3.5 h-3.5" /> Clear filter
            </button>
          )}
        </div>
      )}

      {/* Vendor Balances */}
      <VendorBalanceSection vendors={allVendors} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <Filter className="w-4 h-4 text-slate-400 shrink-0" />
        {(["ALL","SIM","ESIM"] as const).map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={cn("px-3 py-1 rounded-full text-xs font-bold border transition-all",
              filterType === t ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}>
            {t === "ALL" ? "All Types" : t}
          </button>
        ))}
        <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
          className="bg-white border-slate-200 rounded-full text-xs font-bold text-slate-600 px-3 py-1 border">
          <option value="">All Vendors</option>
          {allVendors.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <button onClick={() => setShowChannels(v => !v)}
          className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50">
          {showChannels ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showChannels ? "Hide" : "Show"} Channel Qty
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">View date:</label>
          <select value={selectedDate}
            onChange={e => { setSelectedDate(e.target.value); fetchItems(e.target.value || undefined) }}
            className="bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 px-2 py-1">
            <option value="">Latest</option>
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={() => fetchItems(selectedDate || undefined)}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors">
            <RefreshCw className={cn("w-3.5 h-3.5 text-slate-500", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Main table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">Stock Inventory</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {filtered.length} SKU{selectedDate ? ` · Snapshot ${selectedDate}` : " · Latest snapshot"}
              {" · "}Sold figures auto from gohub_dw
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editMode ? (
              <>
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500">Snapshot date:</label>
                  <input type="date" value={snapshotDate} onChange={e => setSnapshotDate(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <button onClick={() => { setEditMode(false); setDrafts({}) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                  <XCircle className="w-3.5 h-3.5" /> Cancel
                </button>
                <button onClick={saveSnapshot} disabled={!hasChanges || saving}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                    hasChanges && !saving ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm" : "bg-slate-100 text-slate-400 cursor-not-allowed")}>
                  <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save Snapshot"}
                </button>
              </>
            ) : (
              <button onClick={enterEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Update Stock
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <Th className="w-8">#</Th>
                <Th>SKU Code</Th>
                <Th>Vendor</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                {/* Stock */}
                <Th right border>Total Stock</Th>
                <Th right>Main Warehouse</Th>
                <Th right>Pho Quang (HCM)</Th>
                <Th right>Dong Da (HN)</Th>
                <Th right>Tan Son Nhat (HCM)</Th>
                <Th right>Consignment</Th>
                {/* Sales */}
                <Th right border>Sold 15D</Th>
                <Th right>Sold 30D</Th>
                <Th right>Avg/Day</Th>
                <Th border>DOI</Th>
                <Th right>Est. Out of Stock</Th>
                {/* Config */}
                <Th right border>Safety Stock</Th>
                <Th right>Reorder Point</Th>
                <Th right>Retail Price</Th>
                {/* Expiry */}
                <Th border>Expiry Date</Th>
                <Th right>Expiry Qty</Th>
                {/* Channels */}
                {showChannels && <>
                  <Th right border>OPS</Th>
                  <Th right>Telco</Th>
                  <Th right>OD</Th>
                  <Th right>WS</Th>
                  <Th right>B2C</Th>
                  <Th right>Marketing</Th>
                </>}
                <Th border>Note</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={30} className="px-6 py-10 text-center text-sm text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2" />Loading…
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={30} className="px-6 py-10 text-center text-sm text-slate-400">
                  No SKUs tracked yet. Click "Add SKU" to start.
                </td></tr>
              )}
              {!loading && filtered.map((it, idx) => {
                const d     = drafts[it.sku_code]
                const isEx  = expandedSku === it.sku_code
                const level = doiLevel(it.doi, it.stock_total)
                const expiryAlert = it.expiry_date && new Date(it.expiry_date) <= new Date(Date.now() + 30*86400000)
                const rowBg = level === "critical" ? "bg-red-50/40" : level === "warning" ? "bg-amber-50/20" : ""

                return (
                  <React.Fragment key={it.sku_code}>
                    <tr className={cn("transition-colors hover:bg-slate-50/60", rowBg)}>
                      <Td><span className="text-slate-400 font-bold">{idx+1}</span></Td>
                      {/* SKU */}
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => expandHistory(it.sku_code)} className="text-slate-300 hover:text-blue-500 transition-colors shrink-0">
                            {isEx ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <span className="font-black text-slate-900 whitespace-nowrap">{it.sku_code}</span>
                        </div>
                      </Td>
                      <Td><span className="font-bold text-slate-700">{it.vendor || "—"}</span></Td>
                      <Td><span className="font-bold text-slate-500">{it.sim_type}</span></Td>
                      <Td><StatusBadge status={it.status} /></Td>

                      {/* Stock */}
                      {editMode && d ? <>
                        <td className="px-2 py-2 border-l border-slate-200">
                          <NumInput value={d.stock_total} onChange={v => setDraftField(it.sku_code,"stock_total",v)} className="w-24" />
                        </td>
                        <td className="px-2 py-2"><NumInput value={d.stock_warehouse} onChange={v => setDraftField(it.sku_code,"stock_warehouse",v)} /></td>
                        <td className="px-2 py-2"><NumInput value={d.stock_pq_hcm}    onChange={v => setDraftField(it.sku_code,"stock_pq_hcm",v)} /></td>
                        <td className="px-2 py-2"><NumInput value={d.stock_dd_hn}     onChange={v => setDraftField(it.sku_code,"stock_dd_hn",v)} /></td>
                        <td className="px-2 py-2"><NumInput value={d.stock_tsn_hcm}   onChange={v => setDraftField(it.sku_code,"stock_tsn_hcm",v)} /></td>
                        <td className="px-2 py-2"><NumInput value={d.stock_kg}         onChange={v => setDraftField(it.sku_code,"stock_kg",v)} /></td>
                      </> : <>
                        <Td right border><span className="font-black text-slate-900">{it.stock_total.toLocaleString()}</span></Td>
                        <Td right><span className="font-bold text-slate-600">{it.stock_warehouse || "—"}</span></Td>
                        <Td right><span className="font-bold text-slate-600">{it.stock_pq_hcm    || "—"}</span></Td>
                        <Td right><span className="font-bold text-slate-600">{it.stock_dd_hn     || "—"}</span></Td>
                        <Td right><span className="font-bold text-slate-600">{it.stock_tsn_hcm   || "—"}</span></Td>
                        <Td right><span className="font-bold text-slate-600">{it.stock_kg         || "—"}</span></Td>
                      </>}

                      {/* Sales — read only */}
                      <Td right border><span className="font-bold text-slate-700">{it.sold_15d.toLocaleString()}</span></Td>
                      <Td right><span className="font-bold text-slate-700">{it.sold_30d.toLocaleString()}</span></Td>
                      <Td right><span className="font-bold text-slate-600">{it.avg_per_day.toFixed(1)}</span></Td>
                      <Td border><DoiBadge doi={it.doi} stock={it.stock_total} /></Td>
                      <Td right>
                        <span className={cn("font-bold", level === "critical" ? "text-red-600" : level === "warning" ? "text-amber-600" : "text-slate-500")}>
                          {it.est_out_of_stock ?? "—"}
                        </span>
                      </Td>

                      {/* Config — read only (edit via Settings icon) */}
                      <Td right border><span className="font-bold text-slate-600">{it.safety_stock  || "—"}</span></Td>
                      <Td right>      <span className="font-bold text-slate-600">{it.reorder_point  || "—"}</span></Td>
                      <Td right>      <span className="font-bold text-slate-600">{it.retail_price   ? it.retail_price.toLocaleString() : "—"}</span></Td>

                      {/* Expiry */}
                      {editMode && d ? <>
                        <td className="px-2 py-2 border-l border-slate-200">
                          <input type="date" value={d.expiry_date ?? ""}
                            onChange={e => setDraftField(it.sku_code,"expiry_date", e.target.value || null)}
                            className="text-[11px] font-bold border border-slate-300 rounded px-1.5 py-0.5 w-32 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                        <td className="px-2 py-2">
                          <NumInput value={d.expiry_qty} onChange={v => setDraftField(it.sku_code,"expiry_qty",v)} />
                        </td>
                      </> : <>
                        <Td border>
                          <span className={cn("font-bold", expiryAlert ? "text-orange-600" : "text-slate-500")}>
                            {it.expiry_date ?? "—"}
                          </span>
                        </Td>
                        <Td right><span className={cn("font-bold", expiryAlert && it.expiry_qty ? "text-orange-600" : "text-slate-500")}>{it.expiry_qty || "—"}</span></Td>
                      </>}

                      {/* Channels */}
                      {showChannels && (editMode && d ? <>
                        {(["ops_qty","telco_qty","od_qty","ws_qty","b2c_qty","marketing_qty"] as (keyof SnapshotDraft)[]).map((f,fi) => (
                          <td key={f} className={cn("px-1 py-2", fi===0 && "border-l border-slate-200")}>
                            <NumInput value={d[f] as number} onChange={v => setDraftField(it.sku_code,f,v)} className="w-16" />
                          </td>
                        ))}
                      </> : <>
                        {([it.ops_qty,it.telco_qty,it.od_qty,it.ws_qty,it.b2c_qty,it.marketing_qty]).map((v,fi) => (
                          <Td key={fi} right border={fi===0}><span className="font-bold text-slate-600">{v || "—"}</span></Td>
                        ))}
                      </>)}

                      {/* Note */}
                      <Td border>
                        {editMode && d ? (
                          <input value={d.note} onChange={e => setDraftField(it.sku_code,"note",e.target.value)}
                            placeholder="Note…"
                            className="w-44 text-xs border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        ) : (
                          <div className="max-w-[200px]">
                            {it.note && <p className="text-slate-600 truncate" title={it.note}>{it.note}</p>}
                            {it.note_permanent && <p className="text-purple-500 italic text-[10px] truncate" title={it.note_permanent}>[{it.note_permanent}]</p>}
                          </div>
                        )}
                      </Td>

                      {/* Actions */}
                      <Td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditItemFor(it)} title="Edit SKU settings"
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteItem(it.sku_code)} title="Remove SKU"
                            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </Td>
                    </tr>

                    {/* History */}
                    {isEx && (
                      <tr>
                        <td colSpan={showChannels ? 32 : 26} className="px-0 py-0">
                          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
                            <p className="text-[11px] font-black text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <History className="w-3.5 h-3.5" /> Stock History — {it.sku_code}
                            </p>
                            {historyData.length === 0
                              ? <p className="text-xs text-slate-400">No history yet</p>
                              : <div className="flex flex-wrap gap-2">
                                  {historyData.map(h => (
                                    <button key={h.snapshot_date}
                                      onClick={() => { setSelectedDate(h.snapshot_date); fetchItems(h.snapshot_date) }}
                                      className="bg-white rounded-lg px-3 py-2 border border-slate-200 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors">
                                      <p className="text-[10px] text-slate-500 font-bold">{h.snapshot_date}</p>
                                      <p className="text-sm font-black text-slate-900">{h.stock_total.toLocaleString()}</p>
                                    </button>
                                  ))}
                                </div>
                            }
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
        <AddSkuModal onClose={() => setShowAddModal(false)}
          onAdded={() => { fetchItems(selectedDate || undefined); fetchDates() }} />
      )}
      {editItemFor && (
        <EditItemModal item={editItemFor} onClose={() => setEditItemFor(null)}
          onSaved={() => { fetchItems(selectedDate || undefined); setEditItemFor(null) }} />
      )}
    </div>
  )
}

export default function FulfillmentPage() {
  return <Suspense><FulfillmentInner /></Suspense>
}
