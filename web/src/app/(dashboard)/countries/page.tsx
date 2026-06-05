"use client"

import { useState, useEffect, useMemo } from "react"
import { Globe, Search } from "lucide-react"

interface Country { code: string; name: string; name_vn: string | null }
interface SupportCountry {
  code: string; name: string
  support_country: string | null; support_country_vn: string | null
  country_codes: string | null
}

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

export default function CountriesPage() {
  const [countries, setCountries]           = useState<Country[]>([])
  const [supportCountries, setSupportCountries] = useState<SupportCountry[]>([])
  const [loading, setLoading]               = useState(true)
  const [activeTab, setActiveTab]           = useState<"countries" | "support">("countries")
  const [searchC, setSearchC]               = useState("")
  const [searchSC, setSearchSC]             = useState("")

  useEffect(() => {
    fetch("/api/countries")
      .then(r => r.json())
      .then(j => { setCountries(j.countries ?? []); setSupportCountries(j.supportCountries ?? []) })
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Globe size={20} className="text-brand-600" />
        <h1 className="text-xl font-bold text-gray-900">Danh sách Nước</h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("countries")}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
            activeTab === "countries" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Mã Nước
          <span className="ml-1.5 text-xs text-gray-400">({countries.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("support")}
          className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
            activeTab === "support" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Nhóm Nước Hỗ Trợ
          <span className="ml-1.5 text-xs text-gray-400">({supportCountries.length})</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Đang tải...</div>
      ) : activeTab === "countries" ? (
        /* ── Mã Nước ── */
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
      ) : (
        /* ── Nhóm Nước Hỗ Trợ ── */
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
      )}
    </div>
  )
}
