"use client"

import { useEffect, useState, useMemo } from "react"
import { Gift, Search } from "lucide-react"
import { SkeletonTable } from "@/components/skeleton"
import { EmptyState } from "@/components/empty-state"
import { useUrlStates } from "@/hooks/use-url-state"
import { DataTable } from "@/components/dashboard-kit"

interface Promotion {
  product_code:        string
  vendor_code:         string | null
  type_of_sim:         string | null
  supported_countries: string | null
  telco_perks:         string
  telco_perks_start:   string | null
  telco_perks_end:     string | null
  tenant:              string | null
  listing_name_vn:     string | null
  telco_perks_vn:      string | null
  telco_perks_en:      string | null
}

function vendorBadge(vendor: string | null) {
  if (!vendor) return null
  const colors: Record<string, string> = {
    WM: "bg-blue-100 text-blue-700", "3H": "bg-purple-100 text-purple-700",
    BC: "bg-orange-100 text-orange-700", SS: "bg-teal-100 text-teal-700",
  }
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${colors[vendor] ?? "bg-gray-100 text-gray-600"}`}>
      {vendor}
    </span>
  )
}

function simBadge(sim: string | null) {
  if (!sim) return null
  const isEsim = sim.toLowerCase().includes("esim")
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${isEsim ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
      {sim}
    </span>
  )
}

function dateBadge(start: string | null, end: string | null) {
  if (!start && !end) return null
  const today = new Date().toISOString().slice(0, 10)
  const active = (!start || start <= today) && (!end || end >= today)
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
      {active ? "Đang KM" : "Hết hạn"}
    </span>
  )
}

function fmtDate(d: string | null) {
  if (!d) return null
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}

export default function PromotionsPage() {
  const [items,   setItems]   = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useUrlStates({ q: "", vendor: "", sim: "" })
  const search  = filters.q
  const vendor  = filters.vendor
  const simType = filters.sim

  useEffect(() => {
    fetch("/api/promotions")
      .then(r => r.json())
      .then(d => { setItems(d.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const vendors  = useMemo(() => [...new Set(items.map(p => p.vendor_code).filter(Boolean))].sort() as string[], [items])
  const simTypes = useMemo(() => [...new Set(items.map(p => p.type_of_sim).filter(Boolean))].sort() as string[], [items])

  const filtered = useMemo(() => {
    let out = items
    if (vendor)  out = out.filter(p => p.vendor_code  === vendor)
    if (simType) out = out.filter(p => p.type_of_sim  === simType)
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(p =>
        p.product_code.toLowerCase().includes(q) ||
        (p.vendor_code       ?? "").toLowerCase().includes(q) ||
        (p.supported_countries ?? "").toLowerCase().includes(q) ||
        p.telco_perks.toLowerCase().includes(q) ||
        (p.telco_perks_vn    ?? "").toLowerCase().includes(q)
      )
    }
    return out
  }, [items, vendor, simType, search])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline gap-2">
        <Gift size={20} className="text-brand-600 dark:text-brand-400 mt-0.5" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Khuyến Mãi</h1>
        {!loading && <span className="text-sm text-gray-400 ml-1">{filtered.length}/{items.length} sản phẩm</span>}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setFilters({ q: e.target.value })}
            placeholder="Tìm mã SP, nội dung, nước..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select value={vendor} onChange={e => setFilters({ vendor: e.target.value })}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100">
          <option value="">Tất cả Vendor</option>
          {vendors.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={simType} onChange={e => setFilters({ sim: e.target.value })}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:text-slate-100">
          <option value="">Tất cả SIM</option>
          {simTypes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(vendor || simType || search) && (
          <button onClick={() => setFilters({ q: "", vendor: "", sim: "" })}
            className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-red-600 border border-gray-200 dark:border-slate-700 rounded-xl hover:border-red-200 transition-colors">
            Xóa filter
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search || vendor || simType ? "Không tìm thấy kết quả" : "Chưa có sản phẩm nào có khuyến mãi"}
          description={search || vendor || simType ? "Thử bỏ bộ lọc hoặc đổi từ khoá" : undefined}
        />
      ) : (
        <DataTable
          rowKey={p => p.product_code}
          rows={filtered}
          pageSize={20}
          columns={[
            { key: "code", label: "Mã SP", render: p => <span className="font-mono text-brand-700 dark:text-brand-300 whitespace-nowrap">{p.product_code}</span> },
            { key: "vendor", label: "Vendor", render: p => <div className="flex flex-wrap gap-1">{vendorBadge(p.vendor_code)}{simBadge(p.type_of_sim)}</div> },
            { key: "tenant", label: "Loại", render: p => p.tenant ? <span className="bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-slate-300">{p.tenant}</span> : null },
            { key: "period", label: "Thời gian KM", render: p => (p.telco_perks_start || p.telco_perks_end) ? (
                <div className="space-y-1 whitespace-nowrap">
                  <div>{fmtDate(p.telco_perks_start) ?? "—"} → {fmtDate(p.telco_perks_end) ?? "—"}</div>
                  {dateBadge(p.telco_perks_start, p.telco_perks_end)}
                </div>
              ) : <span className="text-gray-400">-</span> },
            { key: "perks", label: "Nội dung", render: p => <span className="text-gray-800 dark:text-slate-200 max-w-[280px] block whitespace-pre-wrap leading-relaxed">{p.telco_perks}</span> },
            { key: "listing", label: "Tên gói (VN)", render: p => p.listing_name_vn ?? <span className="text-gray-300 dark:text-slate-600">—</span> },
          ]}
        />
      )}
    </div>
  )
}
