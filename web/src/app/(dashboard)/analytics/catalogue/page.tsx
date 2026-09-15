"use client"

import React, { useEffect, useMemo, useState } from "react"
import {
  Layers, Package, Radio, Sparkles, PhoneCall, Wifi, ShieldCheck, ShieldAlert, RefreshCw, ChevronDown,
  Gift, Ban, Router, Signal, Search, Zap, Gauge, X, Smartphone,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { StatTile, StatTileSkeleton, EmptyState, DataTable } from "@/components/dashboard-kit"

// GoHub Product Catalogue — 4 tầng Destination → Loại SP → Nhà mạng → Sản phẩm cụ thể (Hiếu yêu cầu
// 2026-09-14, đợt 2+3+4; redesign kiến trúc đợt 5-6, 2026-09-15). Giữ nguyên ngôn ngữ visual GoHub Intel
// (brand-600 navy, StatTile/SpecChip dùng chung 32 tab khác — đổi hẳn màu/font ở riêng trang này sẽ phá
// tính nhất quán mà Hiếu tự khoá UI cho tab BI). Đợt 6 (2026-09-15), theo phản hồi Hiếu:
//   - "Chưa rõ nhà mạng" xuất hiện dù thông tin có sẵn → route.ts fallback về vendor GoHub (LUÔN có) khi
//     Supabase thiếu onsite_carrier/operator_code, thay vì rơi thẳng vào nhãn "chưa rõ".
//   - CHỈ 2 category thật: eSIM / SIM vật lý (mã C/E) — bỏ tách data-only vs có SDT nội địa thành 2
//     category riêng (đợt 2 làm vậy). "Có SDT nội địa" giờ là 1 toggle nổi bật lên đầu category (lọc
//     nhanh + hiện chi tiết nước áp dụng) thay vì 1 nhánh phân loại.
//   - Gói ngày/data drill 2 tầng: bấm NGÀY trước → mới hiện các DUNG LƯỢNG có ở ngày đó → bấm dung lượng
//     mới xổ chi tiết đầy đủ. Trước đây gộp chung "dung lượng · ngày" thành 1 chip phẳng.
// Fix đợt 7 (2026-09-15, sau khi verify TRỰC TIẾP Supabase products bằng key Hiếu cung cấp — không đoán):
//   - `onsite_carrier` với gói pool đa quốc gia là ĐOẠN VĂN "Nước: Carrier" nhiều dòng (VD Europe/Asia
//     pool), dùng thẳng làm tên tab nhà mạng ra cả đoạn văn → route.ts đổi fallback (chỉ dùng làm tên tab
//     khi ngắn/sạch, còn lại group theo operator_code, đoạn văn giữ lại làm `coverageNotes` hiển thị phụ).
//   - Thêm bảng tổng hợp TOÀN HỆ THỐNG "Gói có SDT nội địa" (nút đầu trang, `DataTable` dùng chung) — build
//     hoàn toàn ở FE từ dữ liệu đã fetch (không gọi API riêng, chỉ ~50 product_code toàn hệ thống có field
//     này = Yes, verify qua Supabase trực tiếp) — trước đó info này chỉ xem được rời rạc theo từng
//     destination, không có view liệt kê "nước - vendor - nhà mạng" gộp lại như Hiếu yêu cầu.
// Đợt 8 (2026-09-15), theo phản hồi tiếp:
//   - Destination hiện mã thô (VD "EU1"/"APA") → route.ts nhờ AI đặt tên khu vực tiếng Việt từ
//     supported_countries THẬT (Supabase), 1 batch call, cache cùng payload — KHÔNG tự bịa, chỉ format.
//   - Loại bỏ hẳn destination "000" (SIM frame/eSIM profile, không phải sản phẩm bán ra) ngay ở SQL.
//   - Panel nhà mạng giờ ưu tiên ĐÚNG THỨ TỰ Hiếu yêu cầu: onsite_carrier (tab, luôn đầu) → đặc điểm
//     (network/KYC/Hotspot/Top-up) → ưu đãi/hạn chế → ghi chú/kích hoạt (field `note`/`activation_time`
//     CÓ SẴN nhưng trước giờ CHƯA từng hiển thị) → phủ sóng/QR policy (gấp gọn, ít quan trọng hơn).
//   - "Gói có SDT nội địa" nâng từ nút nhỏ cạnh header thành banner nổi bật riêng — nhu cầu khách hay hỏi
//     cái này TRƯỚC, đặt sẵn không cần tìm.
// API/route.ts response shape đổi (v4→v7): category.localNumberProductCount, operator.localNumberCountries/
// coverageNotes/notesList/activationList/kycLinks/hotspot/kycNeeded/topUpAvailable mới; category.hasCall bỏ.

interface OperatorInfo { code: string; qrValidity: string; reinstallLimit: string; deviceChangeLimit: string }
interface CatalogueProduct {
  sku: string; vendor: string; typeOfSim: string
  capLabel: string | null; days: number | null
  dataType: string | null; dailyResetTime: string | null; throttleLabel: string | null
  apn: string | null; operatorCode: string | null
  telcoPerks: string | null; unsupportedApps: string | null
  hasLocalNumber: boolean; localNumberCountry: string | null
  badges: string[]
}
interface CatalogueOperator {
  key: string; displayName: string
  networkTypes: string[]; productCount: number
  hotspot: boolean | null; kycNeeded: boolean | null; topUpAvailable: boolean | null
  throttleSummary: string[]; perksList: string[]; restrictionsList: string[]
  notesList: string[]; activationList: string[]; kycLinks: string[]
  qrPolicies: OperatorInfo[]; localNumberCountries: string[]; coverageNotes: string[]
  tags: string[]
  products: CatalogueProduct[]
}
interface CatalogueCategory {
  key: string; label: string
  hotspot: boolean | null; kycNeeded: boolean | null; networkTypes: string[]
  productCount: number; localNumberProductCount: number; badges: string[]; operators: CatalogueOperator[]
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

// Chỉ 2 category thật — phụ kiện màu/icon theo Ý NGHĨA, không phải trang trí.
const CATEGORY_META: Record<string, { border: string; iconBg: string; iconColor: string; icon: React.ReactNode }> = {
  esim:  { border: "border-t-sky-400",    iconBg: "bg-sky-50",    iconColor: "text-sky-600",    icon: <Signal className="w-5 h-5" /> },
  sim:   { border: "border-t-indigo-400", iconBg: "bg-indigo-50", iconColor: "text-indigo-600", icon: <Radio className="w-5 h-5" /> },
  other: { border: "border-t-slate-300",  iconBg: "bg-slate-100", iconColor: "text-slate-500",  icon: <Layers className="w-5 h-5" /> },
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
  const [localOnly, setLocalOnly] = useState<Record<string, boolean>>({})
  const [selectedDay, setSelectedDay] = useState<Record<string, string>>({})
  const [expandedCombo, setExpandedCombo] = useState<Record<string, string>>({})
  const [expandedCoverage, setExpandedCoverage] = useState<Set<string>>(new Set())
  const [showLocalPanel, setShowLocalPanel] = useState(false)

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
  const toggleCoverage = (key: string) => setExpandedCoverage(prev => {
    const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s
  })

  // Bảng tổng hợp TOÀN HỆ THỐNG "Gói có SDT nội địa" — build từ dữ liệu ĐÃ fetch (mọi destination, không
  // riêng destination đang xem), theo yêu cầu Hiếu "hiển thị các gói có SDT local của các nước - vendor -
  // nhà mạng" (số nhiều "các nước" = xuyên destination, không phải trong 1 nước).
  interface LocalNumberRow {
    sku: string; destCode: string; destName: string; category: string; operator: string
    vendor: string; combo: string; country: string
  }
  const localNumberRows: LocalNumberRow[] = useMemo(() => {
    const rows: LocalNumberRow[] = []
    destinations.forEach(d => d.categories.forEach(c => c.operators.forEach(o => o.products.forEach(p => {
      if (!p.hasLocalNumber) return
      rows.push({
        sku: p.sku, destCode: d.code, destName: d.name, category: c.label, operator: o.displayName,
        vendor: p.vendor, combo: `${p.capLabel || "—"}${p.days ? ` · ${p.days} ngày` : ""}`,
        country: p.localNumberCountry || "—",
      })
    }))))
    return rows
  }, [destinations])

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

        {/* Banner nổi bật — khách thường hỏi gói có SDT nội địa TRƯỚC, đặt sẵn không cần tìm */}
        {localNumberRows.length > 0 && (
          <button onClick={() => setShowLocalPanel(v => !v)}
            className={cn("w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all",
              showLocalPanel ? "bg-brand-600 border-brand-600" : "bg-brand-50 border-brand-200 hover:border-brand-400")}>
            <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", showLocalPanel ? "bg-white/15" : "bg-white")}>
              <PhoneCall className={cn("w-6 h-6", showLocalPanel ? "text-white" : "text-brand-600")} />
            </span>
            <div className="flex-1 min-w-0">
              <p className={cn("font-bold", showLocalPanel ? "text-white" : "text-slate-900")}>Gói có số điện thoại nội địa</p>
              <p className={cn("text-sm mt-0.5", showLocalPanel ? "text-white/80" : "text-slate-500")}>
                {localNumberRows.length} gói, gọi/nhắn tin được như SIM nội địa — xem nhanh theo nước, vendor, nhà mạng
              </p>
            </div>
            <ChevronDown className={cn("w-5 h-5 shrink-0 transition-transform", showLocalPanel ? "text-white rotate-180" : "text-brand-400")} />
          </button>
        )}

        {/* Bảng tổng hợp toàn hệ thống — nước/vendor/nhà mạng nào có gói SDT nội địa, bấm Xem để nhảy tới */}
        {showLocalPanel && (
          <div className="bg-white border border-brand-200 rounded-2xl p-4">
            <div className="flex justify-end mb-2">
              <button onClick={() => setShowLocalPanel(false)} className="text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <X className="w-3.5 h-3.5" />Đóng
              </button>
            </div>
            <DataTable
              rows={localNumberRows}
              rowKey={r => r.sku}
              pageSize={10}
              searchBy={r => `${r.destName} ${r.vendor} ${r.operator} ${r.country}`}
              searchPlaceholder="Tìm theo nước/vendor/nhà mạng..."
              columns={[
                { key: "dest", label: "Điểm đến", render: r => <span className="font-semibold">{r.destName}</span>, sortValue: r => r.destName },
                { key: "cat", label: "Loại SP", render: r => r.category, sortValue: r => r.category },
                { key: "vendor", label: "Vendor GoHub", render: r => r.vendor, sortValue: r => r.vendor },
                { key: "operator", label: "Nhà mạng", render: r => r.operator, sortValue: r => r.operator },
                { key: "combo", label: "Gói", render: r => r.combo },
                { key: "country", label: "SDT thuộc nước", render: r => r.country, sortValue: r => r.country },
                {
                  key: "action", label: "", align: "right", render: r => (
                    <button onClick={() => { setSelected(r.destCode); setShowLocalPanel(false) }}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100">
                      Xem →
                    </button>
                  ),
                },
              ]}
            />
          </div>
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
                    const meta = CATEGORY_META[cat.key] || CATEGORY_META.other
                    const opSelKey = selectedOperator[cat.key] && cat.operators.some(o => o.key === selectedOperator[cat.key])
                      ? selectedOperator[cat.key] : cat.operators[0]?.key
                    const op = cat.operators.find(o => o.key === opSelKey)
                    const policyKey = `${cat.key}:${opSelKey}`
                    const policyOpen = expandedPolicy.has(policyKey)
                    const comboKey = op ? `${cat.key}:${op.key}` : ""
                    const filterLocal = !!localOnly[cat.key]

                    // Ngày → Dung lượng drill: chỉ hiện dung lượng SAU KHI chọn ngày.
                    const visibleProducts = op ? (filterLocal ? op.products.filter(p => p.hasLocalNumber) : op.products) : []
                    const dayMap = new Map<string, number | null>()
                    visibleProducts.forEach(p => dayMap.set(p.days == null ? "khac" : String(p.days), p.days))
                    const dayList = [...dayMap.entries()].sort((a, b) => (a[1] ?? 999) - (b[1] ?? 999))
                    const selDay = selectedDay[comboKey]
                    const dataChips = selDay != null ? visibleProducts.filter(p => (p.days == null ? "khac" : String(p.days)) === selDay) : []
                    const expandedSku = expandedCombo[comboKey]
                    const expandedProduct = dataChips.find(p => p.sku === expandedSku)

                    return (
                    <div key={cat.key} className={cn("bg-white border border-slate-200 border-t-4 rounded-2xl overflow-hidden", meta.border)}>
                      {/* Category header */}
                      <div className="p-5 border-b border-slate-100 flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3">
                            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", meta.iconBg, meta.iconColor)}>
                              {meta.icon}
                            </span>
                            <div>
                              <h2 className="text-lg font-bold text-slate-900">{cat.label}</h2>
                              <p className="text-xs text-slate-500 mt-0.5">{cat.productCount} sản phẩm · {cat.operators.length} nhà mạng</p>
                            </div>
                          </div>
                          <Badges badges={cat.badges} />
                        </div>
                        {cat.localNumberProductCount > 0 && (
                          <button onClick={() => setLocalOnly(prev => ({ ...prev, [cat.key]: !prev[cat.key] }))}
                            className={cn("text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 border transition-all w-fit",
                              filterLocal ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-brand-200 text-brand-700 hover:bg-brand-50")}>
                            <PhoneCall className="w-3 h-3" />Có SDT nội địa ({cat.localNumberProductCount} gói)
                          </button>
                        )}
                      </div>

                      {/* Nhà mạng — onsite_carrier lên đầu, rồi tới đặc điểm/ưu đãi/ghi chú của carrier đó */}
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
                          <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
                            {/* Đặc điểm — network/KYC/Hotspot/Top-up/SDT nội địa */}
                            <div className="flex flex-wrap gap-1.5">
                              {op.networkTypes.map(nt => <SpecChip key={nt} icon={<Wifi className="w-3 h-3" />}>{nt}</SpecChip>)}
                              {op.throttleSummary.map(t => <SpecChip key={t} icon={<Gauge className="w-3 h-3" />}>{t}</SpecChip>)}
                              {op.kycNeeded != null && (
                                <SpecChip icon={op.kycNeeded ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />} tone={op.kycNeeded ? "warn" : "good"}>
                                  {op.kycNeeded ? "Cần KYC" : "Không cần KYC"}
                                </SpecChip>
                              )}
                              {op.hotspot === true && <SpecChip icon={<Router className="w-3 h-3" />} tone="good">Hỗ trợ Hotspot</SpecChip>}
                              {op.topUpAvailable === true && <SpecChip icon={<Radio className="w-3 h-3" />} tone="good">Nạp thêm data được</SpecChip>}
                              {op.localNumberCountries.length > 0 && (
                                <SpecChip icon={<PhoneCall className="w-3 h-3" />} tone="good">SDT nội địa: {op.localNumberCountries.join(", ")}</SpecChip>
                              )}
                            </div>

                            {/* Ưu đãi / hạn chế */}
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

                            {/* Ghi chú / hướng dẫn kích hoạt — field có sẵn Supabase, trước chưa từng hiện */}
                            {op.activationList.length > 0 && (
                              <div className="flex flex-col gap-1 text-[11px] text-slate-500">
                                {op.activationList.map(a => <span key={a} className="flex items-start gap-1.5"><Signal className="w-3 h-3 mt-0.5 shrink-0" />{a}</span>)}
                              </div>
                            )}
                            {op.notesList.length > 0 && (
                              <div className="flex flex-col gap-1 text-[11px] text-slate-500">
                                {op.notesList.map(n => <span key={n} className="flex items-start gap-1.5"><ShieldAlert className="w-3 h-3 mt-0.5 shrink-0" />{n}</span>)}
                              </div>
                            )}
                            {op.kycLinks.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {op.kycLinks.map(l => (
                                  <a key={l} href={l} target="_blank" rel="noreferrer"
                                    className="text-[11px] font-bold text-brand-600 underline hover:text-brand-700">Hướng dẫn KYC →</a>
                                ))}
                              </div>
                            )}

                            {/* Phủ sóng / chính sách QR — ít quan trọng hơn, gấp gọn */}
                            <div className="flex flex-wrap gap-1.5">
                              {op.coverageNotes.length > 0 && (
                                <button onClick={() => toggleCoverage(`${cat.key}:${op.key}`)}
                                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                                  Phạm vi phủ sóng theo nước <ChevronDown className={cn("w-3 h-3 transition-transform", expandedCoverage.has(`${cat.key}:${op.key}`) && "rotate-180")} />
                                </button>
                              )}
                              {op.qrPolicies.length > 0 && (
                                <button onClick={() => togglePolicy(policyKey)}
                                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                                  Chính sách QR/đổi máy <ChevronDown className={cn("w-3 h-3 transition-transform", policyOpen && "rotate-180")} />
                                </button>
                              )}
                            </div>
                            {expandedCoverage.has(`${cat.key}:${op.key}`) && op.coverageNotes.length > 0 && (
                              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-[11px] text-slate-600 whitespace-pre-line">
                                {op.coverageNotes.join("\n\n")}
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

                      {/* Gói theo NGÀY → DUNG LƯỢNG: chọn ngày trước, dung lượng chỉ hiện sau khi chọn */}
                      {op && (
                        <div className="p-5 space-y-3">
                          {visibleProducts.length === 0 ? (
                            <p className="text-xs text-slate-400">Nhà mạng này không có gói khớp bộ lọc đang chọn.</p>
                          ) : (
                            <>
                              <div className="space-y-1.5">
                                <p className="text-xs font-bold text-slate-500">Chọn số ngày</p>
                                <div className="flex flex-wrap gap-2">
                                  {dayList.map(([dKey, dVal]) => {
                                    const isSel = selDay === dKey
                                    return (
                                      <button key={dKey}
                                        onClick={() => setSelectedDay(prev => ({ ...prev, [comboKey]: isSel ? "" : dKey }))}
                                        className={cn("px-3 py-1.5 rounded-lg border text-xs font-bold transition-all",
                                          isSel ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:border-brand-300")}>
                                        {dVal != null ? `${dVal} ngày` : "Khác"}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>

                              {selDay && (
                                <div className="space-y-1.5">
                                  <p className="text-xs font-bold text-slate-500">Chọn dung lượng</p>
                                  <div className="flex flex-wrap gap-2">
                                    {dataChips.map(p => {
                                      const isOpen = p.sku === expandedSku
                                      return (
                                        <button key={p.sku}
                                          onClick={() => setExpandedCombo(prev => ({ ...prev, [comboKey]: isOpen ? "" : p.sku }))}
                                          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all",
                                            isOpen ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:border-brand-300")}>
                                          {p.capLabel || "—"}
                                          {p.hasLocalNumber && <Smartphone className="w-3 h-3" />}
                                          {p.badges.length > 0 && (
                                            <span title={p.badges.map(b => BADGE_META[b]?.label).join(", ")}>
                                              {p.badges.includes("best_seller") ? "⭐" : p.badges.includes("fastest_growing") ? "📈" : "💰"}
                                            </span>
                                          )}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          )}

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
                                {expandedProduct.hasLocalNumber && (
                                  <SpecChip icon={<PhoneCall className="w-3 h-3" />} tone="good">
                                    SDT nội địa{expandedProduct.localNumberCountry ? ` (${expandedProduct.localNumberCountry})` : ""}
                                  </SpecChip>
                                )}
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
