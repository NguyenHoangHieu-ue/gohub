"use client"

import React, { useEffect, useState } from "react"
import { Globe, Package, Layers, PhoneCall, Wifi, ShieldCheck, ShieldAlert, RefreshCw, ChevronDown, Gift, Ban, Router } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/analytics-formatters"
import { StatTile, StatTileSkeleton, EmptyState } from "@/components/dashboard-kit"

// GoHub Product Catalogue — 3 tầng Destination → Loại sản phẩm → Sản phẩm cụ thể (Hiếu yêu cầu
// 2026-09-14, đợt 2 + đợt 3 mở rộng field APN/operator/data policy/chính sách QR-đổi máy). Xem
// api/analytics/product-catalogue/route.ts để biết cách phân loại/decode + nguồn từng field.

interface OperatorInfo { code: string; qrValidity: string; reinstallLimit: string; deviceChangeLimit: string }
interface CatalogueProduct {
  sku: string; vendor: string; typeOfSim: string
  capLabel: string | null; days: number | null
  dataType: string | null; dailyResetTime: string | null
  apn: string | null; operatorCode: string | null
  telcoPerks: string | null; unsupportedApps: string | null; onsiteCarrier: string | null
  revenue: number; units: number; growthPct: number | null; badges: string[]
}
interface CatalogueCategory {
  key: string; label: string; hasCall: boolean
  hotspot: boolean | null; kycNeeded: boolean | null; networkTypes: string[]; operatorInfo: OperatorInfo[]
  revenue: number; units: number; revenueSharePct: number; growthPct: number | null
  productCount: number; badges: string[]; products: CatalogueProduct[]
}
interface CatalogueDestination {
  code: string; name: string; totalRevenue: number; totalUnits: number
  categoryCount: number; categories: CatalogueCategory[]
}

const BADGE_META: Record<string, { label: string; className: string }> = {
  best_seller:     { label: "⭐ Bán chạy nhất",    className: "bg-amber-50 text-amber-700 border-amber-200" },
  fastest_growing: { label: "📈 Tăng trưởng mạnh", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  best_value:      { label: "💰 Giá tốt nhất",     className: "bg-brand-50 text-brand-700 border-brand-200" },
}

const formatCurrency = (v: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v).replace("₫", "VND")

function Badges({ badges }: { badges: string[] }) {
  if (badges.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map(b => (
        <span key={b} className={cn("text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap", BADGE_META[b]?.className)}>
          {BADGE_META[b]?.label}
        </span>
      ))}
    </div>
  )
}

function GrowthLabel({ growthPct }: { growthPct: number | null }) {
  return (
    <span className={cn("font-bold", growthPct == null ? "text-slate-400" : growthPct >= 0 ? "text-emerald-600" : "text-rose-500")}>
      {growthPct != null ? `${growthPct >= 0 ? "+" : ""}${growthPct}%` : "—"}
    </span>
  )
}

export default function ProductCataloguePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<CatalogueDestination[]>([])
  const [selected, setSelected] = useState<string>("")
  const [expandedPolicy, setExpandedPolicy] = useState<Set<string>>(new Set())

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

  const togglePolicy = (key: string) => setExpandedPolicy(prev => {
    const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s
  })

  const current = destinations.find(d => d.code === selected)
  const topCategoryLabel = current?.categories[0]?.label || "—"

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
                  <StatTile icon={<Layers className="w-4.5 h-4.5" />} label="Số loại sản phẩm" value={current.categoryCount} accent="positive" />
                  <StatTile icon={<PhoneCall className="w-4.5 h-4.5" />} label="Loại dẫn đầu" value={topCategoryLabel} accent="margin" />
                </>
              )}
            </div>

            {/* Category sections */}
            <div className="space-y-5">
              {current.categories.map(cat => {
                const policyOpen = expandedPolicy.has(cat.key)
                return (
                <div key={cat.key} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  {/* Category header */}
                  <div className="p-5 border-b border-slate-100 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">{cat.label}</h2>
                        <p className="text-xs text-slate-500 mt-0.5">{cat.productCount} sản phẩm · {formatNumber(cat.units)} đơn đã bán</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-sm font-bold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full whitespace-nowrap">
                          {cat.revenueSharePct}% doanh thu destination
                        </span>
                        <span className="text-xs">Tăng trưởng <GrowthLabel growthPct={cat.growthPct} /></span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <Badges badges={cat.badges} />
                      <span className={cn("text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1",
                        cat.hasCall ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        <PhoneCall className="w-3 h-3" />{cat.hasCall ? "Gọi/Nhắn tin được" : "Chỉ Data"}
                      </span>
                      {cat.kycNeeded != null && (
                        <span className={cn("text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1",
                          cat.kycNeeded ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500")}>
                          {cat.kycNeeded ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                          {cat.kycNeeded ? "Cần KYC" : "Không cần KYC"}
                        </span>
                      )}
                      {cat.hotspot != null && cat.hotspot && (
                        <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-500 flex items-center gap-1">
                          <Router className="w-3 h-3" />Hỗ trợ Hotspot
                        </span>
                      )}
                      {cat.networkTypes.map(nt => (
                        <span key={nt} className="text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-500 flex items-center gap-1">
                          <Wifi className="w-3 h-3" />{nt}
                        </span>
                      ))}
                      {cat.operatorInfo.length > 0 && (
                        <button onClick={() => togglePolicy(cat.key)}
                          className="text-[10px] font-bold px-2 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 ml-auto">
                          Chính sách QR/đổi máy <ChevronDown className={cn("w-3 h-3 transition-transform", policyOpen && "rotate-180")} />
                        </button>
                      )}
                    </div>
                    {policyOpen && cat.operatorInfo.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                        {cat.operatorInfo.map(op => (
                          <div key={op.code} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[11px] space-y-1">
                            <p className="font-bold text-slate-700 mb-1">{op.code}</p>
                            <p><span className="text-slate-400">Hạn QR:</span> {op.qrValidity}</p>
                            <p><span className="text-slate-400">Cài lại:</span> {op.reinstallLimit}</p>
                            <p><span className="text-slate-400">Đổi máy:</span> {op.deviceChangeLimit}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Products in this category */}
                  <div className="divide-y divide-slate-50">
                    {cat.products.map(p => (
                      <div key={p.sku} className="p-4 flex flex-col gap-2 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">
                              {p.vendor} — {p.capLabel || "—"}{p.days ? ` / ${p.days} ngày` : ""}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {p.typeOfSim} · {p.dataType || "—"}{p.dataType === "Daily Data" && p.dailyResetTime ? ` (reset ${p.dailyResetTime})` : ""}
                              {p.operatorCode ? ` · ${p.operatorCode}` : ""}{p.apn ? ` · APN ${p.apn}` : ""}
                              {" · "}<span className="font-mono">{p.sku}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-5 flex-wrap">
                            <Badges badges={p.badges} />
                            <div className="text-right">
                              <p className="text-[10px] text-slate-400 uppercase font-semibold">Doanh thu</p>
                              <p className="text-sm font-bold text-slate-800">{formatCurrency(p.revenue)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-400 uppercase font-semibold">Sản lượng</p>
                              <p className="text-sm font-bold text-slate-800">{formatNumber(p.units)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-400 uppercase font-semibold">Tăng trưởng</p>
                              <p className="text-sm"><GrowthLabel growthPct={p.growthPct} /></p>
                            </div>
                          </div>
                        </div>
                        {(p.telcoPerks || p.unsupportedApps || p.onsiteCarrier) && (
                          <div className="flex flex-wrap gap-3 text-[10px] text-slate-400 pt-1 border-t border-slate-50">
                            {p.telcoPerks && (
                              <span className="flex items-center gap-1 text-emerald-600"><Gift className="w-3 h-3" />{p.telcoPerks}</span>
                            )}
                            {p.unsupportedApps && (
                              <span className="flex items-center gap-1 text-rose-500"><Ban className="w-3 h-3" />Không hỗ trợ: {p.unsupportedApps}</span>
                            )}
                            {p.onsiteCarrier && <span>Nhà mạng: {p.onsiteCarrier}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )})}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
