"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { Package, Search, ChevronLeft, ChevronRight } from "lucide-react"

interface Sku {
  sku_code:             string
  product_code:         string
  tenant:               string
  status:               string
  sim_esim:             string
  data_amount:          number
  data_amount_unit:     string
  day_amount:           number
  day_amount_unit:      string
  throttle_speed:       string
  call:                 string
  expirations:          string
  vendor_sku:           string
  frame:                string
  datapack:             string
  latest_cogs:          number
  latest_cogs_currency: string
  note?:                string
}

const PAGE_SIZE = 50

const HEADERS_BASE = [
  { key: "status",        label: "Status",       note: "Active / Inactive" },
  { key: "tenant",        label: "Tenant",       note: "US / VN" },
  { key: "sku_code",      label: "SKU Code",     note: "Mã SKU hệ thống" },
  { key: "product_code",  label: "Product Code", note: "" },
  { key: "sim_esim",      label: "SIM/eSIM",     note: "" },
  { key: "data",          label: "Data",         note: "GB hoặc Unlimited" },
  { key: "days",          label: "Days",         note: "Số ngày sử dụng" },
  { key: "throttle_speed",label: "Throttle",     note: "Tốc độ sau khi hết data" },
  { key: "call",          label: "Call",         note: "Yes / No" },
  { key: "expirations",   label: "Expiration",   note: "Hạn kích hoạt (ngày)" },
  { key: "vendor_sku",    label: "Vendor SKU",   note: "Mã SKU bên NCC" },
  { key: "frame",         label: "Frame SKU",    note: "" },
  { key: "datapack",      label: "Datapack SKU", note: "" },
  { key: "note",          label: "Note",         note: "" },
]

const HEADERS_ADMIN = [
  { key: "latest_cogs",          label: "COGS",     note: "Giá nhập" },
  { key: "latest_cogs_currency", label: "Currency", note: "USD / VND" },
]

export default function SkusPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "admin"

  const [rows,    setRows]    = useState<Sku[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")
  const [query,   setQuery]   = useState("")
  const [tenant,  setTenant]  = useState("")
  const [status,  setStatus]  = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), search: query })
      if (tenant) p.set("tenant", tenant)
      if (status) p.set("status", status)
      const res  = await fetch(`/api/skus?${p}`)
      const json = await res.json()
      setRows(json.data  || [])
      setTotal(json.total || 0)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [page, query, tenant, status])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const t = setTimeout(() => { setQuery(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const headers = isAdmin
    ? [...HEADERS_BASE.slice(0, -1), ...HEADERS_ADMIN, HEADERS_BASE[HEADERS_BASE.length - 1]]
    : HEADERS_BASE

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Package size={20} className="text-brand-600" />
        <h1 className="text-xl font-bold text-gray-900">System SKUs</h1>
        <span className="text-sm text-gray-400">{total.toLocaleString()} records</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search SKU, product code, vendor SKU..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={tenant}
          onChange={e => { setTenant(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Tenants</option>
          <option value="US">US</option>
          <option value="VN">VN</option>
        </select>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {headers.map(h => (
                  <th
                    key={h.key}
                    title={h.note}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap select-none"
                  >
                    {h.label}
                    {h.note && <span className="ml-1 text-gray-300">·</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={headers.length} className="px-4 py-10 text-center text-sm text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length} className="px-4 py-10 text-center text-sm text-gray-400">
                    No data found
                  </td>
                </tr>
              ) : rows.map(row => (
                <tr key={row.sku_code} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      row.status === "Active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {row.status || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs font-medium">{row.tenant}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-brand-700">{row.sku_code}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{row.product_code}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{row.sim_esim}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {row.data_amount != null ? `${row.data_amount}${row.data_amount_unit}` : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {row.day_amount != null ? `${row.day_amount} ${row.day_amount_unit}` : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{row.throttle_speed || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{row.call || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{row.expirations || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{row.vendor_sku || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{row.frame || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{row.datapack || "—"}</td>
                  {isAdmin && (
                    <>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-right">
                        {row.latest_cogs != null ? row.latest_cogs.toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{row.latest_cogs_currency || "—"}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-xs text-gray-400">{row.note || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {total === 0 ? "0 records" : `${((page - 1) * PAGE_SIZE) + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString()}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-gray-600 px-2">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
