"use client"

import { useCallback, useEffect, useState } from "react"
import { Search, Check, X, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react"

// Tách khỏi page.tsx (s196+21, tách admin/page.tsx 2120 dòng — cùng nguyên tắc Phase 5: chỉ move
// nguyên khung JSX/logic, KHÔNG đổi hành vi). Nạp qua next/dynamic ở page.tsx.

interface PromoProduct {
  product_code:        string
  vendor_code:         string | null
  type_of_sim:         string | null
  supported_countries: string | null
  telco_perks:         string | null
  telco_perks_start:   string | null
  telco_perks_end:     string | null
  status:              string | null
  sku_codes:           string[]
}

const PROMO_PAGE_SIZE = 50

export default function PromotionsTab({ onNotify }: {
  onNotify: (type: "success" | "error", text: string) => void
}) {
  const [items,    setItems]    = useState<PromoProduct[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState("")
  const [onlyHas,  setOnlyHas]  = useState(false)
  const [editing,    setEditing]    = useState<string | null>(null)
  const [editVal,    setEditVal]    = useState("")
  const [editStart,  setEditStart]  = useState("")
  const [editEnd,    setEditEnd]    = useState("")
  const [saving,     setSaving]     = useState(false)

  const fetchItems = useCallback(async (pg: number, q: string, has: boolean) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(pg) })
    if (q)   params.set("search",   q)
    if (has) params.set("only_has", "1")
    const res  = await fetch(`/api/admin/promotions?${params}`)
    const data = await res.json()
    setItems(data.data ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems(page, search, onlyHas) }, [page]) // eslint-disable-line

  const doSearch = () => { setPage(1); fetchItems(1, search, onlyHas) }
  const toggleFilter = () => { const next = !onlyHas; setOnlyHas(next); setPage(1); fetchItems(1, search, next) }

  const startEdit = (p: PromoProduct) => {
    setEditing(p.product_code)
    setEditVal(p.telco_perks ?? "")
    setEditStart(p.telco_perks_start ?? "")
    setEditEnd(p.telco_perks_end ?? "")
  }
  const cancelEdit = () => { setEditing(null); setEditVal(""); setEditStart(""); setEditEnd("") }

  const saveEdit = async (product_code: string) => {
    setSaving(true)
    const res = await fetch("/api/admin/promotions", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        product_code,
        telco_perks:       editVal,
        telco_perks_start: editStart || null,
        telco_perks_end:   editEnd   || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setItems(prev => prev.map(p =>
        p.product_code === product_code
          ? { ...p, telco_perks: editVal.trim() || null, telco_perks_start: editStart || null, telco_perks_end: editEnd || null }
          : p
      ))
      setEditing(null)
      onNotify("success", `Đã lưu khuyến mãi cho ${product_code}`)
    } else {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    }
  }

  const clearPerk = async (product_code: string) => {
    setSaving(true)
    const res = await fetch("/api/admin/promotions", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ product_code, telco_perks: "" }),
    })
    setSaving(false)
    if (res.ok) {
      setItems(prev => prev.map(p =>
        p.product_code === product_code ? { ...p, telco_perks: null } : p
      ))
      onNotify("success", `Đã xóa khuyến mãi cho ${product_code}`)
    } else {
      onNotify("error", "Hiếu đang fix, vui lòng đợi")
    }
  }

  const totalPages = Math.ceil(total / PROMO_PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            placeholder="Tìm mã SP hoặc vendor..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button onClick={doSearch}
          className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors">
          Tìm
        </button>
        <button
          onClick={toggleFilter}
          className={`px-4 py-2 text-sm rounded-xl border font-medium transition-colors ${
            onlyHas
              ? "bg-brand-50 border-brand-300 text-brand-700"
              : "border-gray-300 text-gray-600 dark:text-slate-300 hover:border-gray-400"
          }`}
        >
          {onlyHas ? "Có khuyến mãi" : "Tất cả SP"}
        </button>
        <span className="text-sm text-gray-400">{total} sản phẩm</span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
              <th className="px-4 py-3 font-medium">Mã SP</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Loại</th>
              <th className="px-4 py-3 font-medium">SKUs</th>
              <th className="px-4 py-3 font-medium w-1/3">Nội dung + Ngày</th>
              <th className="px-4 py-3 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3">
                  <div className="h-4 bg-gray-100 rounded animate-pulse" />
                </td></tr>
              ))
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Không có dữ liệu</td></tr>
            ) : items.map(p => (
              <tr key={p.product_code} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${editing === p.product_code ? "bg-brand-50/40" : ""}`}>
                <td className="px-4 py-3 font-mono text-xs text-brand-700 whitespace-nowrap">{p.product_code}</td>
                <td className="px-4 py-3">
                  {p.vendor_code && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">
                      {p.vendor_code}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{p.type_of_sim}</td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500">{(p.sku_codes ?? []).length} SKUs</span>
                </td>
                <td className="px-4 py-3">
                  {editing === p.product_code ? (
                    <div className="space-y-2">
                      <textarea
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="Nhập nội dung khuyến mãi..."
                        className="w-full px-3 py-2 text-sm border border-brand-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] text-gray-400 mb-0.5">Từ ngày</label>
                          <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] text-gray-400 mb-0.5">Đến ngày</label>
                          <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <span className={`text-sm whitespace-pre-wrap ${p.telco_perks ? "text-gray-800 dark:text-slate-100" : "text-gray-300 italic"}`}>
                        {p.telco_perks || "Chưa có"}
                      </span>
                      {(p.telco_perks_start || p.telco_perks_end) && (
                        <div className="text-[10px] text-gray-400">
                          {p.telco_perks_start ?? "?"} → {p.telco_perks_end ?? "?"}
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {editing === p.product_code ? (
                      <>
                        <button
                          onClick={() => saveEdit(p.product_code)}
                          disabled={saving}
                          title="Lưu"
                          className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-50 transition-colors"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          title="Hủy"
                          className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(p)}
                          title="Sửa"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        {p.telco_perks && (
                          <button
                            onClick={() => clearPerk(p.product_code)}
                            title="Xóa khuyến mãi"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Trang {page}/{totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
