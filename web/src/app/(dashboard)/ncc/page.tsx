"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { Truck, Search, ChevronLeft, ChevronRight, RefreshCw, Globe, ChevronDown, X } from "lucide-react"

const canSeeCost = (role?: string) => role === "admin" || role === "manager"

// ─── Types ──────────────────────────────────────────────────────────────────

interface WMProduct {
  id: number
  vendor_product_id: string
  product_name: string | null
  region: string | null
  sim_type: string | null
  days: number | null
  data_gb: number | null
  is_daily: boolean
  is_unlimited: boolean
  throttle_kbps: number | null
  cogs: number | null
  cogs_currency: string | null
  is_kyc: boolean
  is_lesim: boolean
  status: string
  apn: string | null
  network_type: string | null
  onsite_carrier: string | null
  providers: string | null
  coverage: string | null
  data_reset: string | null
  notification: string | null
  prepaid_card: string | null
  in_system: boolean
  system_skus: SystemSku[]
}

interface SystemSku {
  sku_code: string
  tenant: string
  status: string
  sim_esim: string | null
  data_amount: number | null
  data_amount_unit: string | null
  day_amount: number | null
  throttle_speed: string | null
  latest_cogs: number | null
  latest_cogs_currency: string | null
}

interface Zone {
  id: number
  zone: string
  country: string
  network: string | null
  price_per_gb_hkd: number | null
  is_kyc: boolean
}

type GapFilter = "all" | "in_system" | "not_in_system"
type VendorTab = "wm" | "3hk"

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtData(p: WMProduct) {
  if (p.is_unlimited) return "Unlimited"
  if (!p.data_gb) return "—"
  const gb = p.data_gb < 1 ? `${Math.round(p.data_gb * 1000)}MB` : `${p.data_gb}GB`
  return p.is_daily ? `${gb}/ngày` : gb
}

function fmtThrottle(kbps: number | null) {
  if (!kbps) return "No limit"
  if (kbps >= 1000) return `${kbps / 1000} Mbps`
  return `${kbps} kbps`
}

function apnNote(p: WMProduct): string {
  return [p.apn, p.network_type, p.onsite_carrier].filter(Boolean).join(" • ")
}

// ─── APN Modal ──────────────────────────────────────────────────────────────

function ApnModal({ product, onClose }: { product: WMProduct; onClose: () => void }) {
  const rows = [
    ["APN",          product.apn],
    ["Network",      product.network_type],
    ["Carrier",      product.onsite_carrier],
    ["Providers",    product.providers],
    ["Coverage",     product.coverage],
    ["Data Reset",   product.data_reset],
    ["Notification", product.notification],
    ["Prepaid Card", product.prepaid_card],
  ].filter(([, v]) => v)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[480px] max-h-[80vh] overflow-y-auto p-5 space-y-3"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{product.vendor_product_id}</p>
            <p className="text-xs text-gray-400">{product.product_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="divide-y divide-gray-100">
          {rows.map(([label, val]) => (
            <div key={label} className="py-2 grid grid-cols-[120px_1fr] gap-2">
              <span className="text-xs text-gray-400 font-medium">{label}</span>
              <span className="text-xs text-gray-700 whitespace-pre-wrap break-words">{val}</span>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Không có thông tin APN</p>}
        </div>
      </div>
    </div>
  )
}

// ─── SKU sub-table (expanded row) ───────────────────────────────────────────

function SkuSubTable({ skus, showCost }: { skus: SystemSku[]; showCost: boolean }) {
  if (!skus.length) return <div className="px-6 py-3 text-xs text-gray-400">Không tìm thấy SKU</div>
  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 font-medium">
            <th className="text-left pb-1.5 pr-4">SKU Code</th>
            <th className="text-left pb-1.5 pr-4">Tenant</th>
            <th className="text-left pb-1.5 pr-4">Status</th>
            <th className="text-left pb-1.5 pr-4">Data</th>
            <th className="text-left pb-1.5 pr-4">Days</th>
            <th className="text-left pb-1.5 pr-4">Throttle</th>
            {showCost && <th className="text-left pb-1.5">COGS</th>}
          </tr>
        </thead>
        <tbody>
          {skus.map(s => (
            <tr key={s.sku_code} className="border-t border-gray-100">
              <td className="py-1.5 pr-4 font-mono font-semibold text-brand-700 whitespace-nowrap">{s.sku_code}</td>
              <td className="py-1.5 pr-4 text-gray-600">{s.tenant}</td>
              <td className="py-1.5 pr-4">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  s.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}>{s.status}</span>
              </td>
              <td className="py-1.5 pr-4 text-gray-700">
                {s.data_amount ? `${s.data_amount}${s.data_amount_unit ?? "GB"}` : "—"}
              </td>
              <td className="py-1.5 pr-4 text-gray-700">{s.day_amount ?? "—"}</td>
              <td className="py-1.5 pr-4 text-gray-500">{s.throttle_speed || "—"}</td>
              {showCost && (
                <td className="py-1.5 text-gray-700">
                  {s.latest_cogs ? `${s.latest_cogs} ${s.latest_cogs_currency ?? ""}` : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── WM Tab ─────────────────────────────────────────────────────────────────

function WMTab({ role }: { role?: string }) {
  const showCost = canSeeCost(role)
  const [products, setProducts] = useState<WMProduct[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [gap, setGap]           = useState<GapFilter>("all")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [apnModal, setApnModal] = useState<WMProduct | null>(null)

  const [search,   setSearch]   = useState("")
  const [simType,  setSimType]  = useState("")
  const [region,   setRegion]   = useState("")
  const [isLesim,  setIsLesim]  = useState("")
  const [isUnlim,  setIsUnlim]  = useState("")
  const [days,     setDays]     = useState("")
  const [dataMin,  setDataMin]  = useState("")
  const [dataMax,  setDataMax]  = useState("")

  const searchRef = useRef(search)
  searchRef.current = search

  const PAGE_SIZE = 50

  const fetchData = useCallback(async (pg: number, currentGap: GapFilter) => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(pg), gap: currentGap,
      ...(searchRef.current && { search: searchRef.current }),
      ...(simType  && { sim_type:     simType  }),
      ...(region   && { region:       region   }),
      ...(isLesim  && { is_lesim:     isLesim  }),
      ...(isUnlim  && { is_unlimited: isUnlim  }),
      ...(days     && { days:         days     }),
      ...(dataMin  && { data_min:     dataMin  }),
      ...(dataMax  && { data_max:     dataMax  }),
    })
    try {
      const res = await fetch(`/api/ncc/worldmove?${params}`)
      const j   = await res.json()
      setProducts(j.data ?? [])
      setTotal(j.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [simType, region, isLesim, isUnlim, days, dataMin, dataMax])

  useEffect(() => { fetchData(page, gap) }, [fetchData, page, gap])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function applySearch() {
    setPage(1)
    setExpanded(null)
    fetchData(1, gap)
  }

  function changeGap(g: GapFilter) {
    setGap(g)
    setPage(1)
    setExpanded(null)
  }

  const gapBtns: { key: GapFilter; label: string }[] = [
    { key: "all",           label: "Tất cả"       },
    { key: "in_system",     label: "Đã có trong HT" },
    { key: "not_in_system", label: "Chưa có trong HT" },
  ]

  return (
    <div className="space-y-3">
      {apnModal && <ApnModal product={apnModal} onClose={() => setApnModal(null)} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applySearch()}
            placeholder="Tìm ID, tên, vùng..." className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 w-52" />
        </div>
        {[
          { val: simType,  set: setSimType,  opts: ["eSIM","SIM","Top-Up SIM"],   ph: "SIM type" },
          { val: isLesim,  set: setIsLesim,  opts: ["true","false"],              ph: "leSIM" },
          { val: isUnlim,  set: setIsUnlim,  opts: ["true","false"],              ph: "Unlimited" },
        ].map(({ val, set, opts, ph }) => (
          <select key={ph} value={val} onChange={e => { set(e.target.value); setPage(1); }}
            className="py-1.5 px-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white text-gray-700">
            <option value="">{ph}</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <input value={days} onChange={e => { setDays(e.target.value); setPage(1); }} placeholder="Days"
          type="number" min="1" className="w-20 py-1.5 px-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
        <input value={dataMin} onChange={e => { setDataMin(e.target.value); setPage(1); }} placeholder="GB min"
          type="number" step="0.1" className="w-24 py-1.5 px-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
        <input value={dataMax} onChange={e => { setDataMax(e.target.value); setPage(1); }} placeholder="GB max"
          type="number" step="0.1" className="w-24 py-1.5 px-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
        <button onClick={() => fetchData(page, gap)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Gap filter + count */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {gapBtns.map(b => (
            <button key={b.key} onClick={() => changeGap(b.key)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                gap === b.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>{b.label}</button>
          ))}
        </div>
        <p className="text-xs text-gray-400">{total.toLocaleString()} sản phẩm</p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium">
              <th className="text-left px-4 py-2.5">Vendor ID</th>
              <th className="text-left px-4 py-2.5">Tên</th>
              <th className="text-left px-4 py-2.5">Vùng</th>
              <th className="text-left px-4 py-2.5">Type</th>
              <th className="text-left px-4 py-2.5">Days</th>
              <th className="text-left px-4 py-2.5">Data</th>
              <th className="text-left px-4 py-2.5">Throttle</th>
              {showCost && <th className="text-left px-4 py-2.5">COGS</th>}
              <th className="text-left px-4 py-2.5">KYC</th>
              <th className="text-left px-4 py-2.5">APN</th>
              <th className="text-left px-4 py-2.5">Trong HT</th>
              <th className="text-left px-4 py-2.5">SKU HT</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: showCost ? 12 : 11 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : products.length === 0 ? (
              <tr><td colSpan={showCost ? 12 : 11} className="text-center py-12 text-gray-400">Không có dữ liệu</td></tr>
            ) : products.map(p => (
              <>
                <tr key={p.vendor_product_id}
                  onClick={() => p.in_system && setExpanded(prev => prev === p.vendor_product_id ? null : p.vendor_product_id)}
                  onDoubleClick={() => setApnModal(p)}
                  className={`border-b border-gray-50 transition-colors ${
                    p.in_system ? "cursor-pointer hover:bg-blue-50/40" : "hover:bg-gray-50/50"
                  } ${expanded === p.vendor_product_id ? "bg-blue-50/30" : ""}`}
                >
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-brand-700 whitespace-nowrap">{p.vendor_product_id}</td>
                  <td className="px-4 py-2.5 text-gray-700 text-xs max-w-[200px] truncate" title={p.product_name ?? ""}>{p.product_name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">{p.region ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                      p.sim_type === "eSIM" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"
                    }`}>{p.sim_type ?? "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 text-xs">{p.days ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-700 text-xs whitespace-nowrap">{fmtData(p)}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmtThrottle(p.throttle_kbps)}</td>
                  {showCost && (
                    <td className="px-4 py-2.5 text-gray-700 text-xs whitespace-nowrap">
                      {p.cogs ? `${p.cogs} ${p.cogs_currency ?? ""}` : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-xs">
                    {p.is_kyc
                      ? <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium text-[10px]">KYC</span>
                      : <span className="text-gray-300">No</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[160px]">
                    {apnNote(p) ? (
                      <span className="truncate block cursor-pointer hover:text-brand-600" title="Double-click để xem chi tiết">
                        {apnNote(p)}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {p.in_system
                      ? <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium text-[10px]">✓ Có</span>
                      : <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium text-[10px]">Chưa</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {p.in_system ? (
                      <span className="flex items-center gap-1">
                        <span className="font-mono text-brand-600 text-[10px]">{p.system_skus[0]?.sku_code ?? ""}</span>
                        {p.system_skus.length > 1 && <span className="text-gray-400">+{p.system_skus.length - 1}</span>}
                        <ChevronDown size={12} className={`text-gray-400 transition-transform ${expanded === p.vendor_product_id ? "rotate-180" : ""}`} />
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
                {expanded === p.vendor_product_id && (
                  <tr key={`${p.vendor_product_id}-expand`}>
                    <td colSpan={showCost ? 12 : 11} className="p-0">
                      <SkuSubTable skus={p.system_skus} showCost={showCost} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-400">Trang {page} / {totalPages}</p>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 3HK Tab ────────────────────────────────────────────────────────────────

function ThreeHKTab({ role }: { role?: string }) {
  const showCost = canSeeCost(role)
  const [zones, setZones]   = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetch("/api/ncc/3hk-zones")
      .then(r => r.json())
      .then(j => setZones(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = zones.filter(z => {
    if (!search) return true
    const q = search.toLowerCase()
    return z.zone.toLowerCase().includes(q) || z.country.toLowerCase().includes(q) ||
      (z.network ?? "").toLowerCase().includes(q)
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{filtered.length} / {zones.length} zones</p>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm zone, quốc gia..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 w-52" />
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium">
              <th className="text-left px-4 py-2.5 w-16">Zone</th>
              <th className="text-left px-4 py-2.5">Quốc gia</th>
              <th className="text-left px-4 py-2.5">Network</th>
              {showCost && <th className="text-left px-4 py-2.5">Giá/GB (HKD)</th>}
              <th className="text-left px-4 py-2.5 w-16">KYC</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {Array.from({ length: showCost ? 5 : 4 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={showCost ? 5 : 4} className="text-center py-8 text-gray-400">Không tìm thấy</td></tr>
            ) : filtered.map(z => (
              <tr key={z.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-brand-700">{z.zone}</td>
                <td className="px-4 py-2.5 text-gray-800 text-xs">{z.country}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{z.network ?? "—"}</td>
                {showCost && (
                  <td className="px-4 py-2.5 text-gray-700 text-xs font-medium">
                    {z.price_per_gb_hkd ? `${z.price_per_gb_hkd} HKD` : "—"}
                  </td>
                )}
                <td className="px-4 py-2.5 text-xs">
                  {z.is_kyc
                    ? <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium text-[10px]">KYC</span>
                    : <span className="text-gray-300">No</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NccPage() {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const [vendor, setVendor] = useState<VendorTab>("wm")

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Truck size={20} className="text-brand-600" />
        <h1 className="text-xl font-bold text-gray-900">SP Vendor</h1>
      </div>

      {/* Vendor tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {([["wm", "WORLDMOVE"], ["3hk", "3HK"]] as [VendorTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setVendor(key)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              vendor === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            <Globe size={13} />
            {label}
          </button>
        ))}
      </div>

      {vendor === "wm"  && <WMTab  role={role} />}
      {vendor === "3hk" && <ThreeHKTab role={role} />}
    </div>
  )
}
