"use client"

import { useState, useEffect, useMemo } from "react"
import { Info, Search } from "lucide-react"
import { SkeletonTable } from "@/components/skeleton"
import { useUrlStates } from "@/hooks/use-url-state"
import { DataTable } from "@/components/dashboard-kit"

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
        className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:border-brand-400 w-56"
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
  const [f, setF] = useUrlStates({ tab: "countries", qc: "", qs: "", qv: "", qcat: "" })
  const activeTab = f.tab as Tab
  const setActiveTab = (t: Tab) => setF({ tab: t })
  const searchC   = f.qc;   const setSearchC   = (v: string) => setF({ qc:   v })
  const searchSC  = f.qs;   const setSearchSC  = (v: string) => setF({ qs:   v })
  const searchV   = f.qv;   const setSearchV   = (v: string) => setF({ qv:   v })
  const searchCat = f.qcat; const setSearchCat = (v: string) => setF({ qcat: v })

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
        <Info size={20} className="text-brand-600 dark:text-brand-400" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Thông tin</h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
              activeTab === t.key ? "bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 shadow-sm" : "text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonTable rows={10} cols={3} />
      ) : activeTab === "countries" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{filteredC.length} / {countries.length} nước</p>
            <SearchInput value={searchC} onChange={setSearchC} placeholder="Tìm code, tên nước..." />
          </div>
          <DataTable
            rowKey={c => c.code}
            rows={filteredC}
            pageSize={20}
            emptyLabel="Không tìm thấy — thử từ khoá khác"
            columns={[
              { key: "code", label: "Code", render: c => <span className="font-mono font-semibold text-brand-700">{c.code}</span> },
              { key: "name", label: "Tên (EN)", render: c => <span className="text-gray-800 dark:text-slate-200">{c.name}</span> },
              { key: "name_vn", label: "Tên (VN)", render: c => c.name_vn ?? <span className="text-gray-300 dark:text-slate-600">—</span> },
            ]}
          />
        </div>
      ) : activeTab === "support" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{filteredSC.length} / {supportCountries.length} nhóm</p>
            <SearchInput value={searchSC} onChange={setSearchSC} placeholder="Tìm mã, tên nước..." />
          </div>
          <DataTable
            rowKey={sc => sc.code}
            rows={filteredSC}
            pageSize={20}
            emptyLabel="Không tìm thấy — thử từ khoá khác"
            columns={[
              { key: "code", label: "Mã", render: sc => <span className="font-mono font-semibold text-brand-700 whitespace-nowrap">{sc.code}</span> },
              { key: "support_country", label: "Nước hỗ trợ", render: sc => <span className="leading-relaxed">{sc.support_country ?? <span className="text-gray-300 dark:text-slate-600">—</span>}</span> },
              { key: "country_codes", label: "Country Codes", render: sc => <span className="text-gray-400 font-mono leading-relaxed">{sc.country_codes ?? <span className="text-gray-300 dark:text-slate-600">—</span>}</span> },
            ]}
          />
        </div>
      ) : activeTab === "categories" ? (
        /* ── Category ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{filteredCat.length} / {categories.length} category</p>
            <SearchInput value={searchCat} onChange={setSearchCat} placeholder="Tìm mã, tên..." />
          </div>
          <DataTable
            rowKey={c => c.category_code}
            rows={filteredCat}
            pageSize={20}
            emptyLabel="Không tìm thấy — thử từ khoá khác"
            columns={[
              { key: "code", label: "Mã", render: c => <span className="font-mono font-semibold text-brand-700">{c.category_code}</span> },
              { key: "name_en", label: "Tên (EN)", render: c => <span className="text-gray-800 dark:text-slate-200">{c.name_en}</span> },
              { key: "name_vn", label: "Tên (VN)", render: c => c.name_vn ?? <span className="text-gray-300 dark:text-slate-600">—</span> },
              { key: "iso_code", label: "ISO Code", render: c => <span className="font-mono text-gray-400">{c.iso_code ?? <span className="text-gray-300 dark:text-slate-600">—</span>}</span> },
              { key: "region_type", label: "Loại", render: c => c.region_type === "Multi-Country"
                  ? <span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-[11px] font-medium">Đa quốc gia</span>
                  : <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[11px]">Đơn</span> },
            ]}
          />
        </div>
      ) : (
        /* ── Mã Vendor ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">{filteredV.length} / {vendors.length} vendor</p>
            <SearchInput value={searchV} onChange={setSearchV} placeholder="Tìm mã, tên vendor..." />
          </div>
          <DataTable
            rowKey={v => v.vendor_code}
            rows={filteredV}
            pageSize={20}
            emptyLabel="Không tìm thấy — thử từ khoá khác"
            columns={[
              { key: "code", label: "Mã", render: v => <span className="font-mono font-semibold text-brand-700">{v.vendor_code}</span> },
              { key: "name", label: "Tên vendor", render: v => <span className="text-gray-800 font-medium">{v.name}</span> },
              { key: "description", label: "Ghi chú", render: v => v.description ?? <span className="text-gray-300 dark:text-slate-600">—</span> },
            ]}
          />
        </div>
      )}
    </div>
  )
}
