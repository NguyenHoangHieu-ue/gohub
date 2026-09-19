"use client"

import React from "react"
import { Globe2, IdCard, Phone, Signal, Wifi, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CatalogueProductLite } from "@/lib/catalogue/types"
import type { CarrierResult } from "@/lib/catalogue/carriers"
import { dataKindLabel, rangeLabel, simLabel, statusLabel, tenantLabel, throttleSummary } from "@/lib/catalogue/plain-language"
import { Badge } from "./catalogue-ui"

export function carrierLine(r: CarrierResult): string | null {
  if (r.mode === "single" || r.mode === "country") return r.text
  return null
}

export function ProductCard({ product, carrier, onOpen, active }: {
  product: CatalogueProductLite
  carrier: CarrierResult
  onOpen: () => void
  active?: boolean
}) {
  const p = product
  const range = rangeLabel(p.sku, p.dataKind)
  const carrierText = carrierLine(carrier)
  const regional = p.countries.length > 1
  const afterQuota = throttleSummary(p.sku.throttles)
  return (
    <button
      type="button" onClick={onOpen}
      className={cn(
        "group flex h-full w-full flex-col rounded-2xl border bg-white p-4 text-left shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        active ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={p.sim === "eSIM" ? "brand" : "amber"} title={p.sim === "eSIM" ? "Không có thẻ nhựa, quét mã QR để cài" : "Thẻ nhựa lắp vào điện thoại"}>
          {simLabel(p.sim)}
        </Badge>
        <Badge tone="slate" title="Cách tính dung lượng">{dataKindLabel(p.dataKind)}</Badge>
        {p.network && <Badge tone="violet"><Signal className="h-3 w-3" />{p.network}</Badge>}
        {p.status !== "Active" && <Badge tone={p.status === "Temporary" ? "amber" : "red"}>{statusLabel(p.status)}</Badge>}
        {p.tenant && <Badge tone="slate" title={tenantLabel(p.tenant)}>Pháp nhân {p.tenant}</Badge>}
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        <p className="text-slate-500">
          <span className="text-slate-400">Nhà mạng: </span>
          {carrierText
            ? <span className="font-semibold text-slate-800">{carrierText}</span>
            : <span className="text-slate-400">{carrier.mode === "none" ? "Chưa có thông tin" : "Xem chi tiết"}</span>}
        </p>
        <p className="text-slate-500">
          <span className="text-slate-400">Gói có sẵn: </span>
          {range
            ? <span className="font-semibold text-slate-800">{range}</span>
            : <span className="text-slate-400">Chưa có gói nào</span>}
          {p.sku.count > 0 && <span className="text-slate-400"> ({p.sku.count} lựa chọn)</span>}
        </p>
        {afterQuota && (
          <p className="text-slate-500">
            <span className="text-slate-400">Khi hết mức data: </span>
            <span className="font-semibold text-slate-800">{afterQuota}</span>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        {p.localNumber && <span className="inline-flex items-center gap-1 text-emerald-700"><Phone className="h-3.5 w-3.5" />Có số điện thoại</span>}
        {p.hotspot === true && <span className="inline-flex items-center gap-1"><Wifi className="h-3.5 w-3.5" />Phát WiFi được</span>}
        {p.kycNeeded === true && <span className="inline-flex items-center gap-1 text-amber-700"><IdCard className="h-3.5 w-3.5" />Cần xác minh (KYC)</span>}
        {p.kycNeeded === false && <span className="inline-flex items-center gap-1"><IdCard className="h-3.5 w-3.5" />Không cần KYC</span>}
        {regional && <span className="inline-flex items-center gap-1"><Globe2 className="h-3.5 w-3.5" />Dùng ở {p.countries.length} nước</span>}
      </div>

      <div className="mt-auto flex items-center justify-between pt-3 text-xs">
        <span className="font-mono text-slate-300">{p.code}</span>
        <span className="inline-flex items-center gap-0.5 font-semibold text-brand-600 group-hover:gap-1.5">
          Xem chi tiết <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  )
}
