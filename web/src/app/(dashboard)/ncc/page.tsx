"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { Truck, Search, ChevronLeft, ChevronRight, RefreshCw, Globe } from "lucide-react"

const canSeeCost = (role?: string) => role === "admin" || role === "manager"

// ─── Types ──────────────────────────────────────────────────────────────────

interface WMProduct {
  id: number
  vendor_product_id: string
  vendor_internal_id: string | null
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
}

interface Zone3HK {
  id: number
  zone: string
  country: string
  network: string | null
  price_per_gb_hkd: number | null
  is_kyc: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtData(row: WMProduct): string {
  if (row.is_unlimited) return "Unlimited"
  if (row.data_gb == null) return "—"
  const label = row.data_gb < 1 ? `${(row.data_gb * 1000).toFixed(0)} MB` : `${row.data_gb} GB`
  return row.is_daily ? `${label}/day` : label
}

function fmtThrottle(kbps: number | null): string {
  if (kbps == null) return "—"
  if (kbps >= 1000) return `${kbps / 1000} Mbps`
  return `${kbps} kbps`
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const cls: Record<string, string> = {
    green:  "bg-emerald-50 text-emerald-700 border-emerald-200",
    red:    "bg-red-50 text-red-600 border-red-200",
    amber:  "bg-amber-50 text-amber-700 border-amber-200",
    gray:   "bg-gray-50 text-gray-500 border-gray-200",
    blue:   "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded border ${cls[color] ?? cls.gray}`}>
      {children}
    </span>
  )
}

function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center gap-3 text-sm text-gray-500">
      <span>{total.toLocaleString()} kết quả</span>
      <span className="text-gray-300">|</span>
      <button
        onClick={() => onChange(page - 1)} disabled={page <= 1}
        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
      ><ChevronLeft size={16} /></button>
      <span className="text-gray-700 font-medium">{page} / {totalPages}</span>
      <button
        onClick={() => onChange(page + 1)} disabled={page >= totalPages}
        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
      ><ChevronRight size={16} /></button>
    </div>
  )
}

// ─── WORLDMOVE Tab ───────────────────────────────────────────────────────────

const WM_SIM_TYPES = ["eSIM", "SIM", "Top-Up SIM"]

function WorldmoveTab({ showCost }: { showCost: boolean }) {
  const [subTab, setSubTab] = useState<"catalog" | "gap">("catalog")
  const [products, setProducts] = useState<WMProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // Catalog filters
  const [search, setSearch]   = useState("")
  const [simType, setSimType] = useState("")
  const [region, setRegion]   = useState("")
  const [isLesim, setIsLesim] = useState("")
  const [isUnlim, setIsUnlim] = useState("")

  // Gap filter
  const [gap, setGap] = useState<"in_system" | "not_in_system">("not_in_system")

  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async (p: number, currentFilters: {
    search: string; simType: string; region: string; isLesim: string; isUnlim: string; gap: string; subTab: string
  }) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "50" })
      if (currentFilters.subTab === "gap") {
        params.set("gap", currentFilters.gap)
      } else {
        params.set("gap", "all")
        if (currentFilters.search)  params.set("search",       currentFilters.search)
        if (currentFilters.simType) params.set("sim_type",     currentFilters.simType)
        if (currentFilters.region)  params.set("region",       currentFilters.region)
        if (currentFilters.isLesim) params.set("is_lesim",     currentFilters.isLesim)
        if (currentFilters.isUnlim) params.set("is_unlimited", currentFilters.isUnlim)
      }
      const res = await fetch(`/api/ncc/worldmove?${params}`)
      const json = await res.json()
      setProducts(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Reload when page changes
  useEffect(() => {
    load(page, { search, simType, region, isLesim, isUnlim, gap, subTab })
  }, [page, gap, subTab, simType, isLesim, isUnlim]) // eslint-disable-line

  // Debounce search + region text inputs
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      load(1, { search, simType, region, isLesim, isUnlim, gap, subTab })
    }, 400)
  }, [search, region]) // eslint-disable-line

  function handleSubTab(t: "catalog" | "gap") {
    setSubTab(t)
    setPage(1)
  }

  function handleFilter(setter: (v: string) => void, value: string) {
    setter(value)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(["catalog", "gap"] as const).map(t => (
          <button
            key={t}
            onClick={() => handleSubTab(t)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
              subTab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "catalog" ? "Catalog NCC" : "So sánh Hệ Thống"}
          </button>
        ))}
      </div>

      {subTab === "catalog" && (
        /* Catalog filters */
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm product name, ID, region..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400"
            />
          </div>
          <select value={simType} onChange={e => handleFilter(setSimType, e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white">
            <option value="">SIM Type</option>
            {WM_SIM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={region} onChange={e => setRegion(e.target.value)}
            placeholder="Region..."
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 w-36"
          />
          <select value={isLesim} onChange={e => handleFilter(setIsLesim, e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white">
            <option value="">leSIM</option>
            <option value="true">leSIM</option>
            <option value="false">Dedicated</option>
          </select>
          <select value={isUnlim} onChange={e => handleFilter(setIsUnlim, e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 bg-white">
            <option value="">Data type</option>
            <option value="true">Unlimited</option>
            <option value="false">Fixed / Daily</option>
          </select>
        </div>
      )}

      {subTab === "gap" && (
        /* Gap filter */
        <div className="flex gap-2 items-center">
          <span className="text-sm text-gray-500">Hiện:</span>
          {(["not_in_system", "in_system"] as const).map(g => (
            <button
              key={g}
              onClick={() => { setGap(g); setPage(1) }}
              className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                gap === g
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {g === "not_in_system" ? "Chưa có trong hệ thống" : "Đã có trong hệ thống"}
            </button>
          ))}
        </div>
      )}

      {/* Table header + pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">WORLDMOVE • {total.toLocaleString()} sản phẩm</span>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw size={14} className="animate-spin text-gray-400" />}
          <Pagination page={page} total={total} pageSize={50} onChange={setPage} />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">Product ID</th>
              <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">Product Name</th>
              <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">Region</th>
              <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Type</th>
              <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Days</th>
              <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Data</th>
              <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Throttle</th>
              {showCost && <th className="text-right px-3 py-2.5 font-medium text-gray-500 text-xs">COGS (TWD)</th>}
              <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">leSIM</th>
              {subTab === "gap" && (
                <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">HT</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading && products.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-gray-400 text-sm">Đang tải...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-gray-400 text-sm">Không có dữ liệu</td></tr>
            ) : products.map(p => (
              <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-3 py-2 text-xs text-gray-400 font-mono whitespace-nowrap">{p.vendor_internal_id ?? p.vendor_product_id}</td>
                <td className="px-3 py-2 text-gray-800 max-w-[280px]">
                  <span className="line-clamp-2 text-xs leading-relaxed">{p.product_name}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[140px]">
                  <span className="line-clamp-1">{p.region ?? "—"}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <Badge color={p.sim_type === "eSIM" ? "blue" : p.sim_type === "SIM" ? "green" : "gray"}>
                    {p.sim_type ?? "—"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-center text-sm text-gray-700">{p.days ?? "—"}</td>
                <td className="px-3 py-2 text-center text-xs text-gray-700 whitespace-nowrap">{fmtData(p)}</td>
                <td className="px-3 py-2 text-center text-xs text-gray-500">{fmtThrottle(p.throttle_kbps)}</td>
                {showCost && (
                  <td className="px-3 py-2 text-right text-sm text-gray-800 font-mono">
                    {p.cogs != null ? p.cogs.toLocaleString() : "—"}
                  </td>
                )}
                <td className="px-3 py-2 text-center">
                  {p.is_lesim ? <Badge color="purple">leSIM</Badge> : <span className="text-gray-300 text-xs">—</span>}
                </td>
                {subTab === "gap" && (
                  <td className="px-3 py-2 text-center">
                    {gap === "in_system"
                      ? <Badge color="green">✓ Có</Badge>
                      : <Badge color="red">✗ Chưa</Badge>
                    }
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Pagination page={page} total={total} pageSize={50} onChange={setPage} />
      </div>
    </div>
  )
}

// ─── 3HK Tab ─────────────────────────────────────────────────────────────────

const ZONE_COLORS: Record<string, string> = {
  A1: "blue", A2: "purple", B: "green", C: "amber",
}

function ThreeHKTab({ showCost }: { showCost: boolean }) {
  const [zones, setZones] = useState<Zone3HK[]>([])
  const [loading, setLoading] = useState(true)
  const [searchCountry, setSearchCountry] = useState("")
  const [filterZone, setFilterZone] = useState("")

  useEffect(() => {
    fetch("/api/ncc/3hk-zones")
      .then(r => r.json())
      .then(j => { setZones(j.data ?? []) })
      .finally(() => setLoading(false))
  }, [])

  const uniqueZones = [...new Set(zones.map(z => z.zone))].sort()

  const filtered = zones.filter(z => {
    if (filterZone && z.zone !== filterZone) return false
    if (searchCountry && !z.country.toLowerCase().includes(searchCountry.toLowerCase())) return false
    return true
  })

  // Group by zone for display
  const groups: Record<string, Zone3HK[]> = {}
  for (const z of filtered) {
    groups[z.zone] = groups[z.zone] ?? []
    groups[z.zone].push(z)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchCountry} onChange={e => setSearchCountry(e.target.value)}
            placeholder="Tìm nước..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 w-48"
          />
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setFilterZone("")}
            className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
              !filterZone ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >Tất cả</button>
          {uniqueZones.map(z => (
            <button key={z} onClick={() => setFilterZone(filterZone === z ? "" : z)}
              className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                filterZone === z ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >Zone {z}</button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} nước</span>
      </div>

      {/* Zone reference table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">Zone</th>
              <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">Country</th>
              <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">Network</th>
              {showCost && <th className="text-right px-3 py-2.5 font-medium text-gray-500 text-xs">Price/GB (HKD)</th>}
              <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">KYC</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">Đang tải...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">Không có dữ liệu</td></tr>
            ) : Object.entries(groups).map(([zone, rows]) => (
              rows.map((z, i) => (
                <tr key={z.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  {i === 0 ? (
                    <td rowSpan={rows.length} className="px-3 py-2 align-top pt-3 border-r border-gray-100">
                      <Badge color={ZONE_COLORS[zone] ?? "gray"}>Zone {zone}</Badge>
                      {showCost && z.price_per_gb_hkd != null && (
                        <div className="text-xs text-gray-400 mt-1 font-mono">
                          {z.price_per_gb_hkd} HKD/GB
                        </div>
                      )}
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-gray-800 font-medium text-sm">{z.country}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{z.network ?? "—"}</td>
                  {showCost && (
                    <td className="px-3 py-2 text-right text-sm font-mono text-gray-700">
                      {z.price_per_gb_hkd != null ? z.price_per_gb_hkd : "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-center">
                    {z.is_kyc
                      ? <Badge color="amber">KYC</Badge>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>

      {/* COGS formula reference — admin/manager only */}
      {showCost && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 space-y-1">
          <p className="font-semibold mb-2 text-blue-900">Công thức tính COGS 3HK (E - US Datapool)</p>
          <p><span className="font-medium">Fixed:</span> GB × Price/GB × 55% × Tỷ giá HKD→USD</p>
          <p><span className="font-medium">Daily:</span> GB/day × Days × Price/GB × 40% × Tỷ giá</p>
          <p><span className="font-medium">Unlimited (10 Mbps throttle):</span> 1.8 GB/day × Days × Price/GB × Tỷ giá</p>
          <p><span className="font-medium">Unlimited (5 Mbps throttle):</span> 1.6 GB/day × Days × Price/GB × Tỷ giá</p>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const VENDORS = [
  { id: "WORLDMOVE", label: "WORLDMOVE" },
  { id: "3HK",       label: "3HK" },
]

export default function NccPage() {
  const [vendor, setVendor] = useState<"WORLDMOVE" | "3HK">("WORLDMOVE")
  const { data: session } = useSession()
  const showCost = canSeeCost((session?.user as any)?.role)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Truck size={20} className="text-brand-600" />
        <h1 className="text-xl font-bold text-gray-900">Sản Phẩm Nhà Cung Cấp</h1>
      </div>

      {/* Vendor selector */}
      <div className="flex gap-2">
        {VENDORS.map(v => (
          <button
            key={v.id}
            onClick={() => setVendor(v.id as "WORLDMOVE" | "3HK")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-medium text-sm transition-colors ${
              vendor === v.id
                ? "bg-brand-600 text-white border-brand-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            <Globe size={14} />
            {v.label}
          </button>
        ))}
      </div>

      {vendor === "WORLDMOVE" && <WorldmoveTab showCost={showCost} />}
      {vendor === "3HK"       && <ThreeHKTab  showCost={showCost} />}
    </div>
  )
}
