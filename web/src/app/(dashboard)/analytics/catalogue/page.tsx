"use client"

import React, { useEffect, useState } from "react"
import { Layers, Package, Radio, Sparkles, PhoneCall, Wifi, ShieldCheck, ShieldAlert, RefreshCw, ChevronDown, Gift, Ban, Router, Signal } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatTile, StatTileSkeleton, EmptyState } from "@/components/dashboard-kit"

// GoHub Product Catalogue — 3 tầng Destination → Loại sản phẩm → Sản phẩm cụ thể (Hiếu yêu cầu
// 2026-09-14, đợt 2+3). Đợt 4: Hiếu chốt trang này CHỈ để xem THÔNG TIN sản phẩm (spec sheet), không
// cần số liệu doanh thu/sản lượng/tăng trưởng — bỏ hẳn hiển thị $ và % khỏi UI, giữ badge (Best Seller/
// Fastest Growing/Best Value) làm tín hiệu định tính vì vẫn tính từ số liệu bán hàng thật, chỉ không in
// số ra. API/route.ts không đổi (vẫn tính đủ, FE chỉ chọn không render phần đó).

interface OperatorInfo { code: string; qrValidity: string; reinstallLimit: string; deviceChangeLimit: string }
interface CatalogueProduct {
  sku: string; vendor: string; typeOfSim: string
  capLabel: string | null; days: number | null
  dataType: string | null; dailyResetTime: string | null
  apn: string | null; operatorCode: string | null
  telcoPerks: string | null; unsupportedApps: string | null; onsiteCarrier: string | null
  badges: string[]
}
interface CatalogueCategory {
  key: string; label: string; hasCall: boolean
  hotspot: boolean | null; kycNeeded: boolean | null; networkTypes: string[]; operatorInfo: OperatorInfo[]
  productCount: number; badges: string[]; products: CatalogueProduct[]
}
interface CatalogueDestination {
  code: string; name: string
  categoryCount: number; categories: CatalogueCategory[]
}

const BADGE_META: Record<string, { label: string; className: string }> = {
  best_seller:     { label: "⭐ Bán chạy nhất",    className: "bg-amber-50 text-amber-700 border-amber-200" },
  fastest_growing: { label: "📈 Đang tăng trưởng",  className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  best_value:      { label: "💰 Giá tốt nhất",     className: "bg-brand-50 text-brand-700 border-brand-200" },
}

// Phụ kiện màu theo Ý NGHĨA (gọi/nhắn tin được = nổi bật hơn data-only), không phải trang trí.
const CATEGORY_ACCENT: Record<string, { border: string; iconBg: string; iconColor: string }> = {
  esim_data:  { border: "border-t-sky-400",     iconBg: "bg-sky-50",     iconColor: "text-sky-600" },
  esim_local: { border: "border-t-emerald-400", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  sim_data:   { border: "border-t-indigo-400",  iconBg: "bg-indigo-50", iconColor: "text-indigo-600" },
  sim_local:  { border: "border-t-emerald-400", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  other:      { border: "border-t-slate-300",   iconBg: "bg-slate-100", iconColor: "text-slate-500" },
}

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

function SpecChip({ icon, children, tone = "neutral" }: { icon: React.ReactNode; children: React.ReactNode; tone?: "neutral" | "good" | "warn" }) {
  return (
    <span className={cn("text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1.5 whitespace-nowrap",
      tone === "good" ? "bg-emerald-50 text-emerald-700" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>
      {icon}{children}
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
  const totalProducts = current?.categories.reduce((s, c) => s + c.productCount, 0) || 0
  const operatorCount = current
    ? new Set(current.categories.flatMap(c => c.products.map(p => p.operatorCode).filter(Boolean))).size
    : 0

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Product Catalogue</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Danh mục sản phẩm GoHub theo từng điểm đến — loại SIM, gói data, nhà mạng, chính sách sử dụng.
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
          <EmptyState message="Chưa có dữ liệu." />
        )}

        {current && (
          <>
            {/* Hero — thông tin tổng quan, không có số $ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {loading ? Array.from({ length: 4 }).map((_, i) => <StatTileSkeleton key={i} />) : (
                <>
                  <StatTile icon={<Layers className="w-4.5 h-4.5" />} label="Loại sản phẩm" value={current.categoryCount} accent="neutral" />
                  <StatTile icon={<Package className="w-4.5 h-4.5" />} label="Tổng sản phẩm" value={totalProducts} accent="neutral" />
                  <StatTile icon={<Radio className="w-4.5 h-4.5" />} label="Nhà mạng hỗ trợ" value={operatorCount} accent="positive" />
                  <StatTile icon={<Sparkles className="w-4.5 h-4.5" />} label="Loại phổ biến nhất" value={topCategoryLabel} accent="margin" />
                </>
              )}
            </div>

            {/* Category sections */}
            <div className="space-y-5">
              {current.categories.map(cat => {
                const policyOpen = expandedPolicy.has(cat.key)
                const accent = CATEGORY_ACCENT[cat.key] || CATEGORY_ACCENT.other
                return (
                <div key={cat.key} className={cn("bg-white border border-slate-200 border-t-4 rounded-2xl overflow-hidden", accent.border)}>
                  {/* Category header */}
                  <div className="p-5 border-b border-slate-100 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", accent.iconBg, accent.iconColor)}>
                          {cat.hasCall ? <PhoneCall className="w-5 h-5" /> : <Signal className="w-5 h-5" />}
                        </span>
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">{cat.label}</h2>
                          <p className="text-xs text-slate-500 mt-0.5">{cat.productCount} sản phẩm</p>
                        </div>
                      </div>
                      <Badges badges={cat.badges} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <SpecChip icon={<PhoneCall className="w-3 h-3" />} tone={cat.hasCall ? "good" : "neutral"}>
                        {cat.hasCall ? "Gọi/Nhắn tin được" : "Chỉ Data"}
                      </SpecChip>
                      {cat.kycNeeded != null && (
                        <SpecChip icon={cat.kycNeeded ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />} tone={cat.kycNeeded ? "warn" : "good"}>
                          {cat.kycNeeded ? "Cần KYC" : "Không cần KYC"}
                        </SpecChip>
                      )}
                      {cat.hotspot === true && <SpecChip icon={<Router className="w-3 h-3" />}>Hỗ trợ Hotspot</SpecChip>}
                      {cat.networkTypes.map(nt => (
                        <SpecChip key={nt} icon={<Wifi className="w-3 h-3" />}>{nt}</SpecChip>
                      ))}
                      {cat.operatorInfo.length > 0 && (
                        <button onClick={() => togglePolicy(cat.key)}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1 ml-auto">
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

                  {/* Products — spec-sheet grid, không có số $ */}
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {cat.products.map(p => (
                      <div key={p.sku} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-2.5 hover:border-brand-300 hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{p.vendor}</p>
                            <p className="text-base font-bold text-brand-700">{p.capLabel || "—"}{p.days ? ` · ${p.days} ngày` : ""}</p>
                          </div>
                          {p.badges.length > 0 && (
                            <span className="text-base flex-shrink-0" title={p.badges.map(b => BADGE_META[b]?.label).join(", ")}>
                              {p.badges.includes("best_seller") ? "⭐" : p.badges.includes("fastest_growing") ? "📈" : "💰"}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <SpecChip icon={<Signal className="w-3 h-3" />}>{p.dataType || "—"}{p.dataType === "Daily Data" && p.dailyResetTime ? ` · reset ${p.dailyResetTime}` : ""}</SpecChip>
                          <SpecChip icon={<Radio className="w-3 h-3" />}>{p.typeOfSim}</SpecChip>
                        </div>
                        <div className="text-[11px] text-slate-400 space-y-0.5">
                          {p.operatorCode && <p><span className="text-slate-500 font-semibold">Nhà mạng:</span> {p.operatorCode}</p>}
                          {p.apn && <p><span className="text-slate-500 font-semibold">APN:</span> {p.apn}</p>}
                          {p.onsiteCarrier && <p><span className="text-slate-500 font-semibold">Local carrier:</span> {p.onsiteCarrier}</p>}
                          <p className="font-mono text-slate-300">{p.sku}</p>
                        </div>
                        {(p.telcoPerks || p.unsupportedApps) && (
                          <div className="flex flex-col gap-1 pt-2 border-t border-slate-50 text-[11px]">
                            {p.telcoPerks && <span className="flex items-start gap-1.5 text-emerald-600"><Gift className="w-3 h-3 mt-0.5 flex-shrink-0" />{p.telcoPerks}</span>}
                            {p.unsupportedApps && <span className="flex items-start gap-1.5 text-rose-500"><Ban className="w-3 h-3 mt-0.5 flex-shrink-0" />Không hỗ trợ: {p.unsupportedApps}</span>}
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
