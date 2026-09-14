"use client"

import React, { useEffect, useState } from "react"
import { Globe, Package, TrendingUp, Award, Wifi, ShieldCheck, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/analytics-formatters"
import { StatTile, StatTileSkeleton, EmptyState } from "@/components/dashboard-kit"

// GoHub Product Catalogue — giới thiệu thế mạnh sản phẩm theo destination cho nội bộ (Hiếu yêu cầu
// 2026-09-14). "Dòng sản phẩm" = vendor × SIM/eSIM (dữ liệu thật dim_sku, không tự đặt taxonomy mới).
// Badge (Best Seller/Fastest Growing/Best Value) tính từ số liệu 90 ngày thật, xem
// api/analytics/product-catalogue/route.ts. v1: cố định 90 ngày, top 8 destination theo doanh thu.

interface CatalogueLine {
  vendor: string; typeOfSim: string; revenue: number; units: number
  revenueSharePct: number; growthPct: number | null
  networkType: string | null; hotspot: boolean; kycNeeded: boolean
  badges: string[]
}
interface CatalogueDestination {
  code: string; name: string; totalRevenue: number; totalUnits: number; lineCount: number
  lines: CatalogueLine[]
}

const BADGE_META: Record<string, { label: string; className: string }> = {
  best_seller:     { label: "⭐ Bán chạy nhất",    className: "bg-amber-50 text-amber-700 border-amber-200" },
  fastest_growing: { label: "📈 Tăng trưởng mạnh", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  best_value:      { label: "💰 Giá tốt nhất",     className: "bg-brand-50 text-brand-700 border-brand-200" },
}

const formatCurrency = (v: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v).replace("₫", "VND")

export default function ProductCataloguePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<CatalogueDestination[]>([])
  const [selected, setSelected] = useState<string>("")

  const fetchData = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/analytics/product-catalogue")
      if (!res.ok) throw new Error("Không tải được dữ liệu")
      const d = await res.json()
      const dests: CatalogueDestination[] = d.destinations || []
      setDestinations(dests)
      setSelected(prev => prev && dests.some(x => x.code === prev) ? prev : (dests[0]?.code || ""))
    } catch (e: any) {
      setError(e.message || "Lỗi tải dữ liệu")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const current = destinations.find(d => d.code === selected)

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Product Catalogue</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Thế mạnh sản phẩm GoHub theo từng điểm đến — 90 ngày gần nhất, dựa trên doanh thu/tăng trưởng thật.
            </p>
          </div>
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />Tải lại mới
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        {/* Destination picker */}
        <div className="flex items-center gap-2 flex-wrap">
          {loading && destinations.length === 0
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-9 w-28 rounded-xl bg-slate-200 animate-pulse" />)
            : destinations.map(d => (
              <button key={d.code} onClick={() => setSelected(d.code)}
                className={cn("px-4 py-2 rounded-xl text-sm font-bold border transition-all",
                  selected === d.code ? "bg-brand-600 text-white border-brand-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}>
                {d.name}
              </button>
            ))}
        </div>

        {!loading && destinations.length === 0 && !error && (
          <EmptyState message="Chưa có dữ liệu 90 ngày gần nhất." />
        )}

        {current && (
          <>
            {/* Hero stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {loading ? Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />) : (
                <>
                  <StatTile icon={<Globe className="w-4.5 h-4.5" />} label="Doanh thu 90 ngày" value={formatCurrency(current.totalRevenue)} accent="revenue" />
                  <StatTile icon={<Package className="w-4.5 h-4.5" />} label="Sản lượng" value={formatNumber(current.totalUnits)} unit="đơn" accent="neutral" />
                  <StatTile icon={<Award className="w-4.5 h-4.5" />} label="Số dòng sản phẩm" value={current.lineCount} accent="positive" />
                  <StatTile icon={<TrendingUp className="w-4.5 h-4.5" />} label="Vendor dẫn đầu" value={current.lines[0]?.vendor || "—"} accent="margin" />
                </>
              )}
            </div>

            {/* Product line cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {current.lines.map((l, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-slate-900">{l.vendor}</p>
                      <p className="text-xs text-slate-500">{l.typeOfSim}</p>
                    </div>
                    <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded-full whitespace-nowrap">{l.revenueSharePct}% doanh thu</span>
                  </div>
                  {l.badges.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {l.badges.map(b => (
                        <span key={b} className={cn("text-[10px] font-bold px-2 py-1 rounded-full border", BADGE_META[b]?.className)}>
                          {BADGE_META[b]?.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Sản lượng</p>
                      <p className="font-bold text-slate-800">{formatNumber(l.units)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Tăng trưởng</p>
                      <p className={cn("font-bold", l.growthPct == null ? "text-slate-400" : l.growthPct >= 0 ? "text-emerald-600" : "text-rose-500")}>
                        {l.growthPct != null ? `${l.growthPct >= 0 ? "+" : ""}${l.growthPct}%` : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                    {l.networkType && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full flex items-center gap-1">
                        <Wifi className="w-3 h-3" />{l.networkType}
                      </span>
                    )}
                    {l.hotspot && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Hỗ trợ Hotspot</span>}
                    {!l.kycNeeded && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />Không cần KYC
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
