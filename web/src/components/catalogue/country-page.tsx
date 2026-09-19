"use client"

import React, { useMemo, useState } from "react"
import { ArrowLeft, Link2, RotateCcw } from "lucide-react"
import type { CatalogueIndex } from "@/lib/catalogue/types"
import { carrierForCountry } from "@/lib/catalogue/carriers"
import { simBreakdown } from "@/lib/catalogue/plain-language"
import { UNLIMITED_HINT, UNLIMITED_LABEL, filterDataHint, filterDataLabel, filterSimHint, filterSimLabel } from "@/lib/catalogue/filter-labels"
import { makeVendorNamer } from "@/lib/catalogue/auto-names"
import {
  countryAliases, countryNameVn, distinctDataKinds, distinctSims, filterProducts, groupByVendor, isSellable, productsOfCountry,
  type ProductFilters,
} from "@/lib/catalogue/country-index"
import { EmptyState } from "@/components/dashboard-kit"
import { CopyButton, FilterChip, Flag } from "./catalogue-ui"
import { ProductCard, carrierLine } from "./product-card"

export function CountryPage({ index, code, initialVendor, activeProduct, onBack, onOpenProduct }: {
  index: CatalogueIndex
  code: string
  initialVendor?: string | null
  activeProduct: string | null
  onBack: () => void
  onOpenProduct: (code: string) => void
}) {
  const [f, setF] = useState<ProductFilters>({ sellableOnly: true, vendor: initialVendor ?? null })

  const ref = useMemo(() => index.countries.find(c => c.code.toUpperCase() === code.toUpperCase()) ?? null, [index.countries, code])
  const name = countryNameVn(code, ref)
  const aliases = useMemo(() => countryAliases(code, ref), [code, ref])
  const knownLabels = useMemo(() => index.countries.map(c => c.name), [index.countries])
  const namer = useMemo(() => makeVendorNamer(index), [index])
  const vendorName = namer.name

  const all = useMemo(() => productsOfCountry(index.products, code), [index.products, code])
  const selling = useMemo(() => all.filter(isSellable), [all])
  const shown = useMemo(() => filterProducts(all, f), [all, f])
  const groups = useMemo(() => groupByVendor(shown), [shown])

  const simCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of selling) m[p.sim] = (m[p.sim] ?? 0) + 1
    return m
  }, [selling])
  const sims = useMemo(() => distinctSims(all), [all])
  const dataKinds = useMemo(() => distinctDataKinds(all), [all])
  const anyUnlimited = useMemo(() => all.some(p => p.sku.hasUnlimited), [all])
  const nameEn = ref?.name ?? name.split(" (")[0]
  const own = selling.filter(p => p.countries.length === 1).length
  const sharedCount = selling.length - own
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const PER_VENDOR = 6
  const vendors = new Set(selling.map(p => p.vendorCode)).size
  const filtersOn = !!(f.sim || f.localNumber || f.noKyc || f.dataKind || f.unlimited || f.vendor || f.scope)
  const set = (patch: Partial<ProductFilters>) => setF(cur => ({ ...cur, ...patch }))

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Tất cả các nước
      </button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Flag code={code} width={64} />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{name}</h2>
            {selling.length > 0 ? (
              <p className="mt-0.5 text-sm text-slate-600">
                Đang có <b>{selling.length} gói</b> ({simBreakdown(simCounts)}) từ <b>{vendors} nhà cung cấp</b>.
                {sharedCount > 0 && (own > 0
                  ? <span className="text-slate-500"> Trong đó <b>{own}</b> gói riêng cho {name} và <b>{sharedCount}</b> gói dùng chung với các nước khác.</span>
                  : <span className="text-slate-500"> Tất cả đều là gói dùng chung với các nước khác (không có gói riêng cho {name}).</span>)}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-slate-500">Hiện chưa có gói nào đang bán cho nước này.</p>
            )}
          </div>
        </div>
        <CopyButton label="Sao chép link" text={typeof window !== "undefined" ? window.location.href : ""} />
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {sharedCount > 0 && own > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Scope</span>
              <FilterChip active={!f.scope} onClick={() => set({ scope: null })}>All</FilterChip>
              <FilterChip active={f.scope === "own"} onClick={() => set({ scope: "own" })} title="Packages made only for this country">Only {nameEn}</FilterChip>
              <FilterChip active={f.scope === "shared"} onClick={() => set({ scope: "shared" })} title="One package usable in several countries (regional / global)">Multi-country</FilterChip>
            </div>
          )}
          {sims.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Type</span>
              <FilterChip active={!f.sim} onClick={() => set({ sim: null })}>All</FilterChip>
              {sims.map(s => (
                <FilterChip key={s} active={f.sim === s} onClick={() => set({ sim: s })} title={filterSimHint(s)}>{filterSimLabel(s)}</FilterChip>
              ))}
            </div>
          )}
          {(dataKinds.length > 1 || anyUnlimited) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Data</span>
              <FilterChip active={!f.dataKind && !f.unlimited} onClick={() => set({ dataKind: null, unlimited: false })}>All</FilterChip>
              {dataKinds.map(k => (
                <FilterChip key={k} active={f.dataKind === k} onClick={() => set({ dataKind: f.dataKind === k ? null : k })} title={filterDataHint(k)}>{filterDataLabel(k)}</FilterChip>
              ))}
              {anyUnlimited && (
                <FilterChip active={!!f.unlimited} onClick={() => set({ unlimited: !f.unlimited })} title={UNLIMITED_HINT}>{UNLIMITED_LABEL}</FilterChip>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Other</span>
            <FilterChip active={!!f.localNumber} onClick={() => set({ localNumber: !f.localNumber })} title="Local phone number — can receive calls / OTP">Phone number</FilterChip>
            <FilterChip active={!!f.noKyc} onClick={() => set({ noKyc: !f.noKyc })} title="Customer does not need identity verification">No KYC</FilterChip>
          </div>
          {f.vendor && (
            <FilterChip active onClick={() => set({ vendor: null })} title="Remove vendor filter">Only {vendorName(f.vendor)} ✕</FilterChip>
          )}
          {filtersOn && (
            <button type="button" onClick={() => setF({ sellableOnly: true, vendor: null, scope: null })} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
              <RotateCcw className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>
        {filtersOn && <p className="mt-3 text-xs text-slate-400">Showing {shown.length} of {all.length} packages.</p>}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white">
          <EmptyState
            icon={<Link2 className="h-8 w-8" />}
            message={filtersOn ? "Không có gói nào khớp bộ lọc." : "Chưa có gói nào cho nước này."}
            action={filtersOn ? <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setF({ sellableOnly: true, vendor: null, scope: null })}>Clear filters</button> : undefined}
          />
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(g => {
            const results = g.products.map(p => ({ p, carrier: carrierForCountry(p.carrierRaw, aliases, knownLabels) }))
            // gộp & bỏ trùng theo từng tên nhà mạng ("Rakuten, Docomo" và "Rakuten / Docomo" là cùng 2 nhà mạng)
            const seen = new Map<string, string>()
            for (const r of results) {
              const line = carrierLine(r.carrier)
              if (!line) continue
              for (const tok of line.split(/\s*(?:,|\/|&|;)\s*/)) { const t = tok.trim(); if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t) }
            }
            const carriers = Array.from(seen.values())
            return (
              <section key={g.vendorCode}>
                <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 pb-2">
                  <h3 className="text-lg font-bold text-slate-800">{vendorName(g.vendorCode)}</h3>
                  <span className="text-sm text-slate-400">nhà cung cấp · {g.products.length} gói</span>
                  {carriers.length > 0 && (
                    <span className="text-sm text-slate-600">
                      Nhà mạng tại {name}: <b className="text-slate-800">{carriers.slice(0, 4).join(" · ")}{carriers.length > 4 ? ` +${carriers.length - 4}` : ""}</b>
                    </span>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(expanded.has(g.vendorCode) ? results : results.slice(0, PER_VENDOR)).map(({ p, carrier }) => (
                    <ProductCard key={p.code} product={p} carrier={carrier} active={activeProduct === p.code} onOpen={() => onOpenProduct(p.code)} />
                  ))}
                </div>
                {results.length > PER_VENDOR && (
                  <button type="button" className="mt-3 text-sm font-semibold text-brand-600 hover:underline"
                    onClick={() => setExpanded(cur => { const n = new Set(cur); if (n.has(g.vendorCode)) n.delete(g.vendorCode); else n.add(g.vendorCode); return n })}>
                    {expanded.has(g.vendorCode) ? "Thu gọn" : `Xem thêm ${results.length - PER_VENDOR} gói của ${vendorName(g.vendorCode)}`}
                  </button>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
