"use client"

import React, { useEffect, useMemo, useState } from "react"
import {
  Layers, Package, Radio, Sparkles, PhoneCall, Wifi, ShieldCheck, ShieldAlert, RefreshCw, ChevronDown,
  Gift, Ban, Router, Signal, Search, Zap, Gauge, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { StatTile, StatTileSkeleton, EmptyState } from "@/components/dashboard-kit"

// GoHub Product Catalogue — 3 tầng Destination → Loại sản phẩm → Nhà mạng → Sản phẩm cụ thể (Hiếu yêu
// cầu 2026-09-14, đợt 2+3+4; redesign kiến trúc thông tin 2026-09-15). Giữ nguyên ngôn ngữ visual GoHub
// Intel (brand-600 navy, StatTile/SpecChip dùng chung 32 tab khác — đổi hẳn màu/font ở riêng trang này
// sẽ phá tính nhất quán mà Hiếu tự khoá UI cho tab BI). Đổi ở đây là KIẾN TRÚC THÔNG TIN:
//   - Destination: bỏ giới hạn top-8, chuyển pill-row (không scale nổi full list) sang sidebar tìm-kiếm.
//   - Nhà mạng: gom theo onsite_carrier (nhà mạng THẬT tại điểm đến) thay vì vendor GoHub — vendor có thể
//     route qua nhiều carrier khác nhau tuỳ nước. Tag ưu điểm (nhanh nhất/nhiều lựa chọn nhất/có ưu đãi)
//     tính từ so sánh SỐ THẬT giữa các carrier cùng category — không tự bịa nhận định.
//   - Sản phẩm: gom theo carrier, mặc định CHỈ hiện dạng chip (dung lượng · ngày) — bấm 1 chip mới xổ chi
//     tiết đầy đủ (throttle/APN/reset/perks). Giảm tải nhìn khi 1 carrier có nhiều combo.
// API/route.ts response shape đổi (v3→v4): category.operators[] thay category.products[] phẳng.

interface OperatorInfo { code: string; qrValidity: string; reinstallLimit: string; deviceChangeLimit: string }
interface CatalogueProduct {
  sku: string; vendor: string; typeOfSim: string
  capLabel: string | null; days: number | null
  dataType: string | null; dailyResetTime: string | null; throttleLabel: string | null
  apn: string | null; operatorCode: string | null
  telcoPerks: string | null; unsupportedApps: string | null
  badges: string[]
}
interface CatalogueOperator {
  key: string; displayName: string
  networkTypes: string[]; productCount: number
  throttleSummary: string[]; perksList: string[]; restrictionsList: string[]
  qrPolicies: OperatorInfo[]
  tags: string[]
  products: CatalogueProduct[]
}
interface CatalogueCategory {
  key: string; label: string; hasCall: boolean
  hotspot: boolean | null; kycNeeded: boolean | null; networkTypes: string[]
  productCount: number; badges: string[]; operators: CatalogueOperator[]
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

// Tag so sánh nhà mạng — chỉ tính khi ≥2 carrier cùng category (thật sự có gì để so sánh).
const TAG_META: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  fastest_network: { label: "Tốc độ cao nhất nhóm",  icon: <Zap className="w-3 h-3" />,   className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  most_options:    { label: "Nhiều lựa chọn nhất",   icon: <Layers className="w-3 h-3" />, className: "bg-sky-50 text-sky-700 border-sky-200" },
  has_perks:       { label: "Có ưu đãi riêng",       icon: <Gift className="w-3 h-3" />,   className: "bg-brand-50 text-brand-700 border-brand-200" },
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

// Operator tab — nhà mạng thật tại điểm đến, tag ưu điểm tính từ so sánh số thật giữa các carrier.
function OperatorTab({ op, active, onClick }: { op: CatalogueOperator; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn("flex flex-col items-start gap-1 px-3.5 py-2 rounded-xl border text-left transition-all min-w-[150px]",
        active ? "bg-brand-600 border-brand-600 text-white shadow-sm" : "bg-white border-slate-200 text-slate-700 hover:border-brand-300")}>
      <div className="flex items-center gap-1.5 w-full">
        <span className="text-sm font-bold truncate">{op.displayName}</span>
        <span className={cn("ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
          active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>{op.productCount}</span>
      </div>
      {op.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {op.tags.map(t => (
            <span key={t} className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1",
              active ? "bg-white/15 text-white" : TAG_META[t]?.className)}>
              {TAG_META[t]?.icon}{TAG_META[t]?.label}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

export default function ProductCataloguePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<CatalogueDestination[]>([])
  const [selected, setSelected] = useState<string>("")
  const [destSearch, setDestSearch] = useState("")
  const [expandedPolicy, setExpandedPolicy] = useState<Set<string>>(new Set())
  const [selectedOperator, setSelectedOperator] = useState<Record<string, string>>({})
  const [expandedCombo, setExpandedCombo] = useState<Record<string, string>>({})

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
    ? new Set(current.categories.flatMap(c => c.operators.map(o => o.key))).size
    : 0

  const filteredDestinations = useMemo(() => {
    const q = destSearch.trim().toLowerCase()
    if (!q) return destinations
    return destinations.filter(d => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q))
  }, [destinations, destSearch])

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-4 lg:p-8">
      <div className="max-w-[110rem] mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Product Catalogue</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Danh mục sản phẩm GoHub theo từng điểm đến — nhà mạng, gói data, chính sách sử dụng.
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

        {/* Mobile: native select thay sidebar (gọn, có sẵn type-to-search của trình duyệt) */}
        <select
          className="md:hidden w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-700"
          value={selected} onChange={e => setSelected(e.target.value)} disabled={loading || destinations.length === 0}>
          {destinations.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
        </select>

        {!loading && destinations.length === 0 && !error && (
          <EmptyState message="Chưa có dữ liệu." />
        )}

        <div className="flex gap-6 items-start">
          {/* Destination sidebar — desktop, tìm-kiếm + full list (bỏ giới hạn top-8) */}
          <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border border-slate-200 rounded-2xl overflow-hidden sticky top-4 max-h-[calc(100vh-2rem)]">
            <div className="p-3 border-b border-slate-100 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-6 top-1/2 -translate-y-1/2" />
              <input value={destSearch} onChange={e => setDestSearch(e.target.value)} placeholder="Tìm điểm đến..."
                className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-brand-200" />
              {destSearch && (
                <button onClick={() => setDestSearch("")} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="overflow-y-auto py-1.5 px-1.5">
              {loading && destinations.length === 0
                ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 mx-1.5 my-1 rounded-lg bg-slate-100 animate-pulse" />)
                : filteredDestinations.length === 0
                ? <p className="text-xs text-slate-400 text-center py-4">Không tìm thấy.</p>
                : filteredDestinations.map(d => (
                  <button key={d.code} onClick={() => setSelected(d.code)}
                    className={cn("w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-between gap-2",
                      selected === d.code ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50")}>
                    <span className="truncate">{d.name}</span>
                    <span className={cn("text-[10px] font-bold shrink-0", selected === d.code ? "text-white/70" : "text-slate-400")}>{d.categoryCount}</span>
                  </button>
                ))}
            </div>
          </aside>

          <div className="flex-1 min-w-0 space-y-6">
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
                    const accent = CATEGORY_ACCENT[cat.key] || CATEGORY_ACCENT.other
                    const opSelKey = selectedOperator[cat.key] && cat.operators.some(o => o.key === selectedOperator[cat.key])
                      ? selectedOperator[cat.key] : cat.operators[0]?.key
                    const op = cat.operators.find(o => o.key === opSelKey)
                    const policyKey = `${cat.key}:${opSelKey}`
                    const policyOpen = expandedPolicy.has(policyKey)
                    const comboKey = op ? `${cat.key}:${op.key}` : ""
                    const expandedSku = expandedCombo[comboKey]
                    const expandedProduct = op?.products.find(p => p.sku === expandedSku)

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
                              <p className="text-xs text-slate-500 mt-0.5">{cat.productCount} sản phẩm · {cat.operators.length} nhà mạng</p>
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
                        </div>
                      </div>

                      {/* Nhà mạng — so sánh trước khi vào chi tiết sản phẩm */}
                      <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                        {cat.operators.length > 1 && (
                          <p className="text-xs text-slate-500 mb-2.5">
                            {cat.operators.length} nhà mạng khả dụng ở điểm đến này — chọn để xem chi tiết & so sánh:
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {cat.operators.map(o => (
                            <OperatorTab key={o.key} op={o} active={o.key === opSelKey}
                              onClick={() => setSelectedOperator(prev => ({ ...prev, [cat.key]: o.key }))} />
                          ))}
                        </div>

                        {op && (
                          <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              {op.networkTypes.map(nt => <SpecChip key={nt} icon={<Wifi className="w-3 h-3" />}>{nt}</SpecChip>)}
                              {op.throttleSummary.map(t => <SpecChip key={t} icon={<Gauge className="w-3 h-3" />}>{t}</SpecChip>)}
                              {op.qrPolicies.length > 0 && (
                                <button onClick={() => togglePolicy(policyKey)}
                                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                                  Chính sách QR/đổi máy <ChevronDown className={cn("w-3 h-3 transition-transform", policyOpen && "rotate-180")} />
                                </button>
                              )}
                            </div>
                            {op.perksList.length > 0 && (
                              <div className="flex flex-col gap-1 text-[11px] text-emerald-600">
                                {op.perksList.map(p => <span key={p} className="flex items-start gap-1.5"><Gift className="w-3 h-3 mt-0.5 shrink-0" />{p}</span>)}
                              </div>
                            )}
                            {op.restrictionsList.length > 0 && (
                              <div className="flex flex-col gap-1 text-[11px] text-amber-600">
                                {op.restrictionsList.map(r => <span key={r} className="flex items-start gap-1.5"><Ban className="w-3 h-3 mt-0.5 shrink-0" />Hạn chế: {r}</span>)}
                              </div>
                            )}
                            {policyOpen && op.qrPolicies.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                                {op.qrPolicies.map(qp => (
                                  <div key={qp.code} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[11px] space-y-1">
                                    <p className="font-bold text-slate-700 mb-1">{qp.code}</p>
                                    <p><span className="text-slate-400">Hạn QR:</span> {qp.qrValidity}</p>
                                    <p><span className="text-slate-400">Cài lại:</span> {qp.reinstallLimit}</p>
                                    <p><span className="text-slate-400">Đổi máy:</span> {qp.deviceChangeLimit}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Gói theo dung lượng/ngày — gom nhóm dạng chip, bấm mới xổ chi tiết */}
                      {op && (
                        <div className="p-5 space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {op.products.map(p => {
                              const isOpen = p.sku === expandedSku
                              return (
                                <button key={p.sku}
                                  onClick={() => setExpandedCombo(prev => ({ ...prev, [comboKey]: isOpen ? "" : p.sku }))}
                                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all",
                                    isOpen ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:border-brand-300")}>
                                  {p.capLabel || "—"}{p.days ? ` · ${p.days} ngày` : ""}
                                  {p.badges.length > 0 && (
                                    <span title={p.badges.map(b => BADGE_META[b]?.label).join(", ")}>
                                      {p.badges.includes("best_seller") ? "⭐" : p.badges.includes("fastest_growing") ? "📈" : "💰"}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>

                          {expandedProduct && (
                            <div className="border border-brand-200 bg-brand-50/30 rounded-xl p-4 flex flex-col gap-2.5">
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <p className="text-base font-bold text-brand-800">{expandedProduct.capLabel || "—"}{expandedProduct.days ? ` · ${expandedProduct.days} ngày` : ""}</p>
                                <Badges badges={expandedProduct.badges} />
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <SpecChip icon={<Signal className="w-3 h-3" />}>{expandedProduct.dataType || "—"}{expandedProduct.dataType === "Daily Data" && expandedProduct.dailyResetTime ? ` · reset ${expandedProduct.dailyResetTime}` : ""}</SpecChip>
                                {expandedProduct.throttleLabel && <SpecChip icon={<Gauge className="w-3 h-3" />}>{expandedProduct.throttleLabel}</SpecChip>}
                                <SpecChip icon={<Radio className="w-3 h-3" />}>{expandedProduct.typeOfSim}</SpecChip>
                              </div>
                              <div className="text-[11px] text-slate-500 space-y-0.5">
                                <p><span className="font-semibold text-slate-600">Vendor GoHub:</span> {expandedProduct.vendor}</p>
                                {expandedProduct.apn && <p><span className="font-semibold text-slate-600">APN:</span> {expandedProduct.apn}</p>}
                                <p className="font-mono text-slate-300">{expandedProduct.sku}</p>
                              </div>
                              {(expandedProduct.telcoPerks || expandedProduct.unsupportedApps) && (
                                <div className="flex flex-col gap-1 pt-2 border-t border-brand-100 text-[11px]">
                                  {expandedProduct.telcoPerks && <span className="flex items-start gap-1.5 text-emerald-600"><Gift className="w-3 h-3 mt-0.5 shrink-0" />{expandedProduct.telcoPerks}</span>}
                                  {expandedProduct.unsupportedApps && <span className="flex items-start gap-1.5 text-rose-500"><Ban className="w-3 h-3 mt-0.5 shrink-0" />Không hỗ trợ: {expandedProduct.unsupportedApps}</span>}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
