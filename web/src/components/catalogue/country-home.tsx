"use client"

import React, { useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import type { CatalogueCountryRef } from "@/lib/catalogue/types"
import { CONTINENT_ORDER, continentLabel } from "@/lib/catalogue/plain-language"
import { searchCountries, type CountryStat } from "@/lib/catalogue/country-index"
import { Flag } from "./catalogue-ui"

const POPULAR = ["JP", "KR", "TH", "US", "SG", "CN", "TW", "HK", "MY", "VN", "AU", "GB", "FR", "DE", "IT", "ES"]

export function CountryCard({ stat, onPick }: { stat: CountryStat; onPick: (code: string) => void }) {
  return (
    <button
      type="button" onClick={() => onPick(stat.code)}
      className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <Flag code={stat.code} width={36} />
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold text-slate-800 group-hover:text-brand-700">{stat.name}</span>
        <span className="block text-xs text-slate-500">
          {stat.productCount} gói · {stat.vendorCodes.length} nhà cung cấp
        </span>
      </span>
    </button>
  )
}

export function CountryHome({ stats, refs, onPick }: {
  stats: CountryStat[]; refs: CatalogueCountryRef[]; onPick: (code: string) => void
}) {
  const [query, setQuery] = useState("")
  const results = useMemo(() => (query.trim() ? searchCountries(stats, refs, query) : null), [query, stats, refs])
  const byCode = useMemo(() => new Map(stats.map(s => [s.code, s])), [stats])
  const popular = POPULAR.map(c => byCode.get(c)).filter((s): s is CountryStat => !!s)

  const groups = useMemo(() => {
    const m = new Map<string, CountryStat[]>()
    for (const s of stats) {
      const k = s.continent ?? "_other"
      const a = m.get(k) ?? []; a.push(s); m.set(k, a)
    }
    const order = [...CONTINENT_ORDER, "_other"]
    return order.filter(k => m.has(k)).map(k => ({ key: k, label: k === "_other" ? "Khác" : continentLabel(k), items: m.get(k)! }))
  }, [stats])

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-6 sm:p-8">
        <h2 className="text-xl font-bold text-slate-800 sm:text-2xl">Bạn cần sản phẩm cho nước nào?</h2>
        <p className="mt-1 text-sm text-slate-500">Gõ tên nước hoặc chọn bên dưới. Không cần biết mã sản phẩm hay tên nhà cung cấp.</p>
        <div className="relative mt-4 max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={query} onChange={e => setQuery(e.target.value)} autoFocus
            placeholder="Ví dụ: Nhật, Thái Lan, Mỹ, Pháp…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-11 text-base shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Xoá" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {!results && popular.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Phổ biến</span>
            {popular.map(s => (
              <button key={s.code} type="button" onClick={() => onPick(s.code)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50">
                <Flag code={s.code} width={20} />{s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {results ? (
        results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <p className="text-sm font-semibold text-slate-600">Không tìm thấy nước nào tên “{query}”.</p>
            <p className="mt-1 text-sm text-slate-400">Thử gõ ngắn hơn hoặc gõ không dấu (ví dụ “nhat”). Nước chưa có gói đang bán sẽ không hiện ở đây.</p>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-slate-500">{results.length} nước phù hợp</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map(s => <CountryCard key={s.code} stat={s} onPick={onPick} />)}
            </div>
          </div>
        )
      ) : (
        groups.map(g => (
          <section key={g.key}>
            <h3 className="mb-3 flex items-baseline gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              {g.label}<span className="text-xs font-medium normal-case text-slate-400">{g.items.length} nước</span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {g.items.map(s => <CountryCard key={s.code} stat={s} onPick={onPick} />)}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
