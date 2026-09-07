"use client"

// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { useState, useEffect, useCallback } from "react"
import { BarChart3, Search } from "lucide-react"
import { DataTable, SourceBox } from "@/components/my-metrics/shared-ui"
import { fck } from "@/lib/my-metrics-format"
import type { DatapoolDetailData, DatapoolDetailItem } from "@/lib/my-metrics-types"

export function DatapoolDetailTable({ quarter }: { quarter: string }) {
  const [data, setData] = useState<DatapoolDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [vendorFilter, setVendorFilter] = useState<"all" | "3HK Datapool" | "BC Datapool">("all")

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/analytics/my-metrics/datapool-detail?quarter=${quarter}`)
    if (r.ok) setData(await r.json())
    setLoading(false)
  }, [quarter])

  useEffect(() => { fetchData() }, [fetchData])

  const items = data?.items ?? []
  const filtered = items.filter(it => {
    if (vendorFilter !== "all" && it.vendor !== vendorFilter) return false
    if (search.trim() && ![it.sku, it.category, it.vendor].some(v => (v ?? "").toLowerCase().includes(search.trim().toLowerCase()))) return false
    return true
  })

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-black text-slate-800">Datapool Rev — chi tiết theo SKU</span>
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">Auto</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value as any)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500">
              <option value="all">Mọi vendor</option>
              <option value="3HK Datapool">3HK Datapool</option>
              <option value="BC Datapool">BC Datapool</option>
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-300 absolute left-2 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm SKU / category…"
                className="pl-7 pr-2 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 w-44" />
            </div>
          </div>
        </div>
        <div className="text-[11px] text-slate-400 mt-1.5">
          {data ? `${items.length} SKU · ${fck(data.total_rev)} rev · ${data.total_orders.toLocaleString()} đơn · ${data.total_units.toLocaleString()} units` : "…"}
          {filtered.length !== items.length && ` — đang lọc còn ${filtered.length} SKU`}
        </div>
      </div>
      <div className="px-5 py-3">
        <DataTable<DatapoolDetailItem>
          rows={filtered}
          rowKey={it => it.sku}
          emptyLabel={loading ? "Đang tải…" : "Không có SKU nào khớp."}
          columns={[
            { key: "sku", label: "SKU", render: it => <span className="font-black text-slate-800">{it.sku}</span> },
            { key: "vendor", label: "Vendor", render: it => <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide">{it.vendor}</span> },
            { key: "orders", label: "Đơn", align: "right", render: it => it.orders.toLocaleString() },
            { key: "units", label: "Units", align: "right", render: it => it.units.toLocaleString() },
            { key: "rev", label: "Revenue", align: "right", render: it => <span className="font-black">{fck(it.rev)}</span> },
          ]}
        />
        <SourceBox type="auto" table="gohub_dw · fact_fulfillment_revenue (GROUP BY sku, vendor)"
          filter="REPLACE(UPPER(TRIM(vendor)),' ','') IN ('3HKDATAPOOL','BCDATAPOOL')" />
      </div>
    </div>
  )
}
