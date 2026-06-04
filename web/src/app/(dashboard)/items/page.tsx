"use client"

import { useState, useEffect, useCallback } from "react"
import { ShoppingCart, Search, ChevronLeft, ChevronRight, Download } from "lucide-react"
import { MetricCard } from "@/components/metric-card"

const ITEM_TYPES = [
  "VN B2C Website","VN B2B - Ecom","VN OD Momo","VN OD ZaloPay","VN OD Traveloka",
  "VN OD KLOOK","VN OD BIDV","VN OD Shopeepay Vietnam","VN OD Onepay","VN OD Vietravel",
  "VN OD Én Việt","VN OD DL Phương Nam","VN OD Kỷ Nguyên Mới","VN OD Divine Shop",
  "VN DEAL 50 (MOQ)","VN DEAL 200 (MOQ)","VN DEAL 500 (MOQ)","VN DEAL 1K (MOQ)",
  "VN WS Portal Silver","VN WS Portal Gold","VN WS Portal VIP","VN WS Portal Exclusive",
  "VN WS Portal Infigate","VN WS Custom","VN SILVER","VN TIER GOLD (CN)","VN TIER GOLD (KCN)",
  "VN TIER VIP (CN)","VN TIER VIP (KCN)",
  "US B2C Website","US OD Traveloka","US OD KKday","US OD Headout","US OD Simstation",
  "US OD Pelago","US OD Trazy","US OD Tiket","US OD Shopeepay Singapore",
  "US OD Shopeepay Thailand","US OD Shopeepay Malaysia","US OD Shopeepay Philippines",
  "US OD Shopeepay Indonesia","US DEAL 50 (MOQ)","US DEAL 200 (MOQ)","US DEAL 500 (MOQ)",
  "US DEAL 1K (MOQ)","US WS Portal Silver","US WS Portal Gold","US WS Portal VIP",
  "US WS Portal Exclusive","US WS Custom","US TIER SILVER","US TIER GOLD","US TIER VIP",
]

const PRICE_LISTS = ["BUS","BVN","LU1","LU2","LU3","LU4","LV1","LV2","LV3","LV4",
                     "TU2","TU3","TV1","TV2","TV3","TV4","TV5","WV2","WV4"]

const COLS = [
  { key: "item_code",       label: "Item Code" },
  { key: "sku_code",        label: "SKU" },
  { key: "item_name_vn",    label: "Tên VN" },
  { key: "item_type",       label: "Type" },
  { key: "channel",         label: "Channel" },
  { key: "status",          label: "Status" },
  { key: "day_amount",      label: "Ngày" },
  { key: "data_amount",     label: "Data" },
  { key: "data_amount_unit",label: "Unit" },
  { key: "unitprice",       label: "Giá" },
  { key: "currency",        label: "Currency" },
  { key: "price_list",      label: "Price List" },
  { key: "category_code",   label: "Category" },
]

interface Filters {
  search:    string
  status:    string
  tenant:    string
  channel:   string
  itemType:  string
  priceList: string
  minPrice:  string
  maxPrice:  string
  minDays:   string
  maxDays:   string
}

const DEFAULT_FILTERS: Filters = {
  search: "", status: "Active", tenant: "", channel: "",
  itemType: "", priceList: "", minPrice: "", maxPrice: "", minDays: "", maxDays: "",
}

export default function ItemsPage() {
  const [filters, setFilters]   = useState<Filters>(DEFAULT_FILTERS)
  const [applied, setApplied]   = useState<Filters>(DEFAULT_FILTERS)
  const [data, setData]         = useState<Record<string, unknown>[]>([])
  const [count, setCount]       = useState(0)
  const [page, setPage]         = useState(1)
  const [pages, setPages]       = useState(1)
  const [loading, setLoading]   = useState(false)
  const [totalActive, setTotal] = useState(0)

  const fetchData = useCallback(async (f: Filters, pg: number) => {
    setLoading(true)
    const params = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v) })
    params.set("page", String(pg))
    try {
      const res  = await fetch(`/api/items?${params}`)
      const json = await res.json()
      setData(json.data ?? [])
      setCount(json.count ?? 0)
      setPages(json.pages ?? 1)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(applied, page)
  }, [applied, page, fetchData])

  useEffect(() => {
    fetch("/api/items?status=Active&page=1")
      .then(r => r.json())
      .then(j => setTotal(j.count ?? 0))
  }, [])

  const handleSearch = () => {
    setApplied(filters)
    setPage(1)
  }

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS)
    setApplied(DEFAULT_FILTERS)
    setPage(1)
  }

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters(prev => ({ ...prev, [k]: e.target.value }))

  const exportCSV = () => {
    const header = COLS.map(c => `"${c.label}"`).join(",")
    const rows   = data.map(r =>
      COLS.map(c => {
        const v = r[c.key]
        return v == null ? "" : `"${String(v).replace(/"/g, '""')}"`
      }).join(",")
    )
    const csv  = [header, ...rows].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `items_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline gap-2">
        <ShoppingCart size={20} className="text-brand-600 mt-0.5 flex-shrink-0" />
        <h1 className="text-xl font-bold text-gray-900">Items</h1>
        <span className="text-sm text-gray-400">Đơn vị bán lẻ theo kênh phân phối</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Tổng Active" value={totalActive} accent="green" />
        <MetricCard label="Kết quả tìm"  value={count}       accent="blue"  />
      </div>

      {/* Filter panel */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text" value={filters.search} onChange={set("search")}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Tìm tên, item code, SKU code..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {/* Status */}
          <select value={filters.status} onChange={set("status")}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Tất cả Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          {/* Tenant */}
          <select value={filters.tenant} onChange={set("tenant")}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Tất cả Tenant</option>
            <option value="VN">VN</option>
            <option value="US">US</option>
          </select>
          {/* Channel */}
          <select value={filters.channel} onChange={set("channel")}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Tất cả Channel</option>
            <option value="B2C">B2C</option>
            <option value="OD">OD</option>
            <option value="WS">WS</option>
          </select>
          {/* Item Type */}
          <select value={filters.itemType} onChange={set("itemType")}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-56">
            <option value="">Tất cả Item Type</option>
            {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* Price List */}
          <select value={filters.priceList} onChange={set("priceList")}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Tất cả Price List</option>
            {PRICE_LISTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Range filters */}
        <div className="flex flex-wrap gap-4 pt-1 border-t border-gray-200">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500">Số ngày:</span>
            <input type="number" placeholder="Min" value={filters.minDays} onChange={set("minDays")}
              className="w-16 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <span className="text-xs text-gray-400">–</span>
            <input type="number" placeholder="Max" value={filters.maxDays} onChange={set("maxDays")}
              className="w-16 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500">Giá:</span>
            <input type="number" placeholder="Min" value={filters.minPrice} onChange={set("minPrice")}
              className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <span className="text-xs text-gray-400">–</span>
            <input type="number" placeholder="Max" value={filters.maxPrice} onChange={set("maxPrice")}
              className="w-24 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={handleReset}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Reset
            </button>
            <button onClick={handleSearch}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
              <Search size={12} /> Tìm kiếm
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {COLS.map(c => (
                  <th key={c.key} className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={COLS.length} className="px-4 py-10 text-center text-gray-400 text-sm">
                    Đang tải...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length} className="px-4 py-10 text-center text-gray-400 text-sm">
                    Không có kết quả
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                  <tr key={String(row.item_code)} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/30"} hover:bg-blue-50/40 transition-colors`}>
                    {COLS.map(c => {
                      const v = row[c.key]
                      const isStatus = c.key === "status"
                      if (isStatus) {
                        const active = String(v ?? "").toLowerCase() === "active"
                        return (
                          <td key={c.key} className="px-3 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                              {String(v ?? "")}
                            </span>
                          </td>
                        )
                      }
                      return (
                        <td key={c.key} className="px-3 py-2.5 text-gray-700">
                          {v == null || v === "" ? <span className="text-gray-300">—</span> : (
                            <span className="block max-w-[220px] truncate" title={String(v)}>{String(v)}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between bg-gray-50">
          <span className="text-xs text-gray-500">
            {count > 0 ? `Trang ${page}/${pages} — ${count.toLocaleString()} kết quả` : "Không có kết quả"}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs text-gray-600 px-2 tabular-nums">{page} / {pages || 1}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages}
              className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Export current page */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Export trang hiện tại:</span>
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors">
          <Download size={13} /> CSV
        </button>
      </div>
    </div>
  )
}
