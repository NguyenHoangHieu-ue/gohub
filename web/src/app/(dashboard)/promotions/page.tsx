"use client"

import { useEffect, useState } from "react"
import { Gift, Search } from "lucide-react"

interface Promotion {
  product_code:        string
  vendor_code:         string | null
  type_of_sim:         string | null
  product_type:        string | null
  supported_countries: string | null
  telco_perks:         string
  tenant:              string | null
  status:              string | null
}

function vendorBadge(vendor: string | null) {
  if (!vendor) return null
  const colors: Record<string, string> = {
    WM:   "bg-blue-100 text-blue-700",
    "3H": "bg-purple-100 text-purple-700",
    BC:   "bg-orange-100 text-orange-700",
    SS:   "bg-teal-100 text-teal-700",
  }
  const cls = colors[vendor] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>
      {vendor}
    </span>
  )
}

function simBadge(sim: string | null) {
  if (!sim) return null
  const isEsim = sim.toLowerCase().includes("esim")
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
      isEsim ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
    }`}>
      {sim}
    </span>
  )
}

function parseCountries(raw: string | null): string {
  if (!raw) return ""
  const codes = raw.split(",").map(s => s.trim()).filter(Boolean)
  if (codes.length === 0) return ""
  if (codes.length <= 3) return codes.join(", ")
  return `${codes.slice(0, 3).join(", ")} +${codes.length - 3}`
}

export default function PromotionsPage() {
  const [items,   setItems]   = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")

  useEffect(() => {
    fetch("/api/promotions")
      .then(r => r.json())
      .then(d => { setItems(d.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = search.trim()
    ? items.filter(p =>
        p.product_code.toLowerCase().includes(search.toLowerCase()) ||
        (p.vendor_code ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (p.supported_countries ?? "").toLowerCase().includes(search.toLowerCase()) ||
        p.telco_perks.toLowerCase().includes(search.toLowerCase())
      )
    : items

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-baseline gap-2">
        <Gift size={20} className="text-brand-600 mt-0.5" />
        <h1 className="text-xl font-bold text-gray-900">Khuyến Mãi</h1>
        {!loading && (
          <span className="text-sm text-gray-400 ml-1">{items.length} sản phẩm</span>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo mã, vendor, nước, nội dung..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          {search ? "Không tìm thấy kết quả" : "Chưa có sản phẩm nào có khuyến mãi"}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 font-medium">Mã sản phẩm</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Loại</th>
                <th className="px-4 py-3 font-medium">Nước</th>
                <th className="px-4 py-3 font-medium">Nội dung khuyến mãi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => (
                <tr key={p.product_code} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-brand-700 whitespace-nowrap">
                    {p.product_code}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {vendorBadge(p.vendor_code)}
                      {p.tenant && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {p.tenant}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{simBadge(p.type_of_sim)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px]">
                    {parseCountries(p.supported_countries)}
                  </td>
                  <td className="px-4 py-3 text-gray-800 max-w-md whitespace-pre-wrap leading-relaxed">
                    {p.telco_perks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
