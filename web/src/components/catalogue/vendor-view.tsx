"use client"

import React, { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CatalogueIndex } from "@/lib/catalogue/types"
import { vendorDisplayName } from "@/lib/catalogue/plain-language"
import { countryNameVn, isSellable } from "@/lib/catalogue/country-index"
import { Flag } from "./catalogue-ui"

/** Tab "Theo nhà cung cấp": mỗi nhà cung cấp phủ những nước nào, bao nhiêu gói. Bấm nước → sang trang nước đó (đã lọc theo nhà cung cấp). */
export function VendorView({ index, onPick }: { index: CatalogueIndex; onPick: (country: string, vendor: string) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const refMap = useMemo(() => new Map(index.countries.map(c => [c.code.toUpperCase(), c])), [index.countries])
  const vendorRef = useMemo(() => new Map(index.vendors.map(v => [v.code, v.name])), [index.vendors])

  const vendors = useMemo(() => {
    const m = new Map<string, { esim: number; sim: number; countries: Map<string, number> }>()
    for (const p of index.products) {
      if (!isSellable(p)) continue
      const a = m.get(p.vendorCode) ?? { esim: 0, sim: 0, countries: new Map<string, number>() }
      if (p.sim === "eSIM") a.esim++; else a.sim++
      for (const c of p.countries) a.countries.set(c, (a.countries.get(c) ?? 0) + 1)
      m.set(p.vendorCode, a)
    }
    return Array.from(m, ([code, a]) => ({
      code, name: vendorDisplayName(code, vendorRef.get(code)), esim: a.esim, sim: a.sim,
      countries: Array.from(a.countries, ([c, n]) => ({ code: c, n, name: countryNameVn(c, refMap.get(c)) }))
        .sort((x, y) => x.name.localeCompare(y.name, "vi")),
    })).sort((a, b) => (b.esim + b.sim) - (a.esim + a.sim))
  }, [index.products, vendorRef, refMap])

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Nhà cung cấp là nơi GoHub mua data (WorldMove, 3HK, Joytel…). Bấm vào một nhà cung cấp để xem họ phủ những nước nào.</p>
      {vendors.map(v => {
        const isOpen = open === v.code
        return (
          <div key={v.code} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button type="button" onClick={() => setOpen(isOpen ? null : v.code)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
              <span>
                <span className="block text-base font-bold text-slate-800">{v.name}</span>
                <span className="block text-sm text-slate-500">
                  {v.esim + v.sim} gói ({v.esim} eSIM, {v.sim} SIM vật lý) · phủ {v.countries.length} nước
                </span>
              </span>
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
                {v.countries.map(c => (
                  <button key={c.code} type="button" onClick={() => onPick(c.code, v.code)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50">
                    <Flag code={c.code} width={18} />{c.name}
                    <span className="text-xs text-slate-400">{c.n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
