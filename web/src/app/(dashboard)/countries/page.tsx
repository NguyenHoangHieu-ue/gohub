"use client"

import { useState, useEffect, useMemo } from "react"
import { Info, Search } from "lucide-react"

interface Country      { code: string; name: string; name_vn: string | null }
interface SupportCountry {
  code: string; name: string
  support_country: string | null; support_country_vn: string | null
  country_codes: string | null
}
interface Vendor { vendor_code: string; name: string; description: string | null }
interface Category { category_code: string; name_en: string; name_vn: string | null; iso_code: string | null; region_type: string | null }

function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 w-56"
      />
    </div>
  )
}

type Tab = "countries" | "support" | "vendors" | "categories"

export default function InfoPage() {
  const [countries, setCountries]               = useState<Country[]>([])
  const [supportCountries, setSupportCountries] = useState<SupportCountry[]>([])
  const [vendors, setVendors]                   = useState<Vendor[]>([])
  const [categories, setCategories]             = useState<Category[]>([])
  const [loading, setLoading]                   = useState(true)
  const [activeTab, setActiveTab]               = useState<Tab>("countries")
  const [searchC, setSearchC]   = useState("")
  const [searchSC, setSearchSC] = useState("")
  const [searchV, setSearchV]   = useState("")
  const [searchCat, setSearchCat] = useState("")

  useEffect(() => {
    fetch("/api/countries")
      .then(r => r.json())
      .then(j => {
        setCountries(j.countries ?? [])
        setSupportCountries(j.supportCountries ?? [])
        setVendors(j.vendors ?? [])
        setCategories(j.categories ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredC = useMemo(() => {
    if (!searchC) return countries
    const q = searchC.toLowerCase()
    return countries.filter(c =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) ||
      (c.name_vn ?? "").toLowerCase().includes(q)
    )
  }, [countries, searchC])

  const filteredSC = useMemo(() => {
    if (!searchSC) return supportCountries
    const q = searchSC.toLowerCase()
    return supportCountries.filter(sc =>
      sc.code.toLowerCase().includes(q) ||
      (sc.support_country ?? "").toLowerCase().includes(q) ||
      (sc.country_codes ?? "").toLowerCase().includes(q)
    )
  }, [supportCountries, searchSC])

  const filteredV = useMemo(() => {
    if (!searchV) return vendors
    const q = searchV.toLowerCase()
    return vendors.filter(v =>
      v.vendor_code.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)
    )
  }, [vendors, searchV])

  const filteredCat = useMemo(() => {
    if (!searchCat) return categories
    const q = searchCat.toLowerCase()
    return categories.filter(c =>
      c.category_code.toLowerCase().includes(q) ||
      c.name_en.toLowerCase().includes(q) ||
      (c.name_vn ?? "").toLowerCase().includes(q) ||
      (c.iso_code ?? "").toLowerCase().includes(q)
    )
  }, [categories, searchCat])

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "countries",  label: "Mã Nước",           count: countries.length },
    { key: "support",    label: "Nhóm Nước Hỗ Trợ", count: supportCountries.length },
    { key: "categories", label: "Category",           count: categories.length },
    { key: "vendors",    label: "Mã Vendor",          count: vendors.length },
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Info size={20} className="text-brand-600" />
        <h1 className="text-xl font-bold text-gray-900">Thông tin</h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
              activeTab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Đang tải...</div>
      ) : activeTab === "countries" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{filteredC.length} / {countries.length} nước</p>
            <SearchInput value={searchC} onChange={setSearchC} placeholder="Tìm code, tên nước..." />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs w-20">Code</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Tên (EN)</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Tên (VN)</th>
                </tr>
              </thead>
              <tbody>
                {filteredC.length === 0
                  ? <tr><td colSpan={3} className="text-center py-8 text-gray-400">Không tìm thấy</td></tr>
                  : filteredC.map(c => (
                    <tr key={c.code} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-mono text-xs font-semibold text-brand-700">{c.code}</td>
                      <td className="px-4 py-2 text-gray-800">{c.name}</td>
                      <td className="px-4 py-2 text-gray-500">{c.name_vn ?? <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "support" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{filteredSC.length} / {supportCountries.length} nhóm</p>
            <SearchInput value={searchSC} onChange={setSearchSC} placeholder="Tìm mã, tên nước..." />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs w-20">Mã</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Nước hỗ trợ</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs w-56">Country Codes</th>
                </tr>
              </thead>
              <tbody>
                {filteredSC.length === 0
                  ? <tr><td colSpan={3} className="text-center py-8 text-gray-400">Không tìm thấy</td></tr>
                  : filteredSC.map(sc => (
                    <tr key={sc.code} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-mono text-xs font-semibold text-brand-700 whitespace-nowrap">{sc.code}</td>
                      <td className="px-4 py-2 text-gray-700 text-xs leading-relaxed">{sc.support_country ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs font-mono leading-relaxed">{sc.country_codes ?? <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "categories" ? (
        /* ── Category ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{filteredCat.length} / {categories.length} category</p>
            <SearchInput value={searchCat} onChange={setSearchCat} placeholder="Tìm mã, tên..." />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs w-24">Mã</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Tên (EN)</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Tên (VN)</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs w-32">ISO Code</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs w-28">Loại</th>
                </tr>
              </thead>
              <tbody>
                {filteredCat.length === 0
                  ? <tr><td colSpan={5} className="text-center py-8 text-gray-400">Không tìm thấy</td></tr>
                  : filteredCat.map(c => (
                    <tr key={c.category_code} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-mono text-xs font-semibold text-brand-700">{c.category_code}</td>
                      <td className="px-4 py-2 text-gray-800">{c.name_en}</td>
                      <td className="px-4 py-2 text-gray-500">{c.name_vn ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-400">{c.iso_code ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2 text-xs">
                        {c.region_type === "Multi-Country"
                          ? <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[11px] font-medium">Đa quốc gia</span>
                          : <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[11px]">Đơn</span>
                        }
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Mã Vendor ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{filteredV.length} / {vendors.length} vendor</p>
            <SearchInput value={searchV} onChange={setSearchV} placeholder="Tìm mã, tên vendor..." />
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs w-20">Mã</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs w-48">Tên vendor</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {filteredV.length === 0
                  ? <tr><td colSpan={3} className="text-center py-8 text-gray-400">Không tìm thấy</td></tr>
                  : filteredV.map(v => (
                    <tr key={v.vendor_code} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-mono text-xs font-semibold text-brand-700">{v.vendor_code}</td>
                      <td className="px-4 py-2 text-gray-800 font-medium">{v.name}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{v.description ?? <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
