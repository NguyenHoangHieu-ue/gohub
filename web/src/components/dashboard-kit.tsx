"use client"

import React, { useState, useEffect, useMemo } from "react"
import { ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/analytics-formatters"

/**
 * Dashboard Kit — bộ component dùng chung cho MỌI trang analytics (đợt UI redesign s190+2).
 * Mục tiêu: GIẢM TẢI NHẬN THỨC (cognitive load) — 1 kiểu card/bảng/badge duy nhất thay vì mỗi trang tự
 * viết tay `<div className="rounded-xl border...">` riêng (trước đợt này: 29/32 trang tự viết tay).
 *
 * Pattern cốt lõi:
 *  - SourceBadge   : cho biết số liệu từ nguồn nào (GA4 / Admin GoHub / Data chat) → tăng độ tin.
 *  - LogicNote     : hộp ⓘ giải thích công thức/logic của 1 bảng → user không phải đoán.
 *  - DeltaPill     : pill màu up=xanh / down=đỏ / flat=xám / warn=hổ phách → tín hiệu 1 nhìn-là-hiểu.
 *  - ValueStack    : số chính lớn + delta nhỏ bên dưới → glanceable.
 *  - SnapshotMetric: thẻ KPI nhỏ trong dải snapshot.
 *  - StatTile      : thẻ KPI đầy đủ (icon + nhãn + số lớn + delta vs kỳ trước/năm trước + %target) —
 *                    thay khối card BOD/Dashboard viết tay, icon tô màu theo Ý NGHĨA số liệu (accent),
 *                    không chọn màu ngẫu nhiên như trước.
 *  - DataTable     : bảng dữ liệu tổng quát (sort không bắt buộc, phân trang sẵn) — port từ my-metrics,
 *                    tổng quát hoá cho mọi trang thay vì chỉ 1 trang dùng.
 *  - Panel         : card section chuẩn (tiêu đề + mô tả + source + logic-note) — dùng luôn để bọc chart,
 *                    không cần thêm 1 "ChartCard" riêng.
 *  - DataReadiness : chấm trạng thái nguồn dữ liệu (xanh = sẵn sàng, vàng = đang chờ).
 *  - CHART_PALETTE/CHART_GRID_COLOR/chartTooltipStyle: theme màu dùng chung cho Recharts (trước đây 17
 *    trang tự chọn màu chart riêng, không nhất quán).
 *
 * Tokens: xanh navy thương hiệu `brand-*` (tailwind.config.ts, #0f4c81) làm màu chủ đạo/accent chính;
 * amber/emerald/rose/sky (Tailwind mặc định) làm màu NGỮ NGHĨA cho revenue/cost/margin/warn — tách biệt
 * khỏi accent, chọn theo Ý NGHĨA số liệu (xem `MetricAccent`) thay vì màu ngẫu nhiên như trước đợt này.
 */

// ─── DeltaPill / MoM pill ─────────────────────────────────────────────────────
export type DeltaKind = "up" | "down" | "flat" | "warn"

const DELTA_CLS: Record<DeltaKind, string> = {
  up:   "text-[#2f9d55] bg-[#eaf6ee]",
  down: "text-[#d93025] bg-[#fdecea]",
  flat: "text-[#6e6e73] bg-[#eef1f5]",
  warn: "text-[#b7791f] bg-[#fff6df]",
}

export function DeltaPill({ kind = "flat", children, className }: {
  kind?: DeltaKind; children: React.ReactNode; className?: string
}) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center rounded-full px-2 py-[3px] text-[10px] font-semibold whitespace-nowrap",
      DELTA_CLS[kind], className,
    )}>
      {children}
    </span>
  )
}

// Tự suy ra kind từ số (dương = up, âm = down, 0/null = flat); đảo cực cho metric "chi phí thấp tốt"
export function autoDeltaKind(v: number | null | undefined, lowerIsBetter = false): DeltaKind {
  if (v == null || v === 0) return "flat"
  const good = lowerIsBetter ? v < 0 : v > 0
  return good ? "up" : "down"
}

// ─── SourceBadge ──────────────────────────────────────────────────────────────
export type SourceKind = "ga4" | "admin" | "chat" | "neutral"

const SOURCE_CLS: Record<SourceKind, string> = {
  ga4:     "text-brand-600 bg-brand-50",
  admin:   "text-[#007a7a] bg-[#e8f7f6]",
  chat:    "text-[#2f9d55] bg-[#eaf6ee]",
  neutral: "text-[#6e6e73] bg-[#eef1f5]",
}

const SOURCE_LABEL: Record<SourceKind, string> = {
  ga4: "GA4", admin: "GoHub", chat: "Data chat", neutral: "—",
}

export function SourceBadge({ source, label, className }: {
  source: SourceKind; label?: string; className?: string
}) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-1.5 py-1 text-[10px] font-semibold whitespace-nowrap",
      SOURCE_CLS[source], className,
    )}>
      {label ?? SOURCE_LABEL[source]}
    </span>
  )
}

// ─── LogicNote (ⓘ giải thích công thức) ───────────────────────────────────────
// collapsible: true → thu gọn thành nút bấm (dùng cho khu vực cần gọn thẩm mỹ, vd Inventory) thay vì
// luôn hiện sẵn trên trang.
export function LogicNote({ children, className, collapsible, label = "Công thức" }: {
  children: React.ReactNode; className?: string; collapsible?: boolean; label?: string
}) {
  const [open, setOpen] = useState(!collapsible)

  if (collapsible && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 mb-3 px-3 py-1.5 rounded-lg text-xs font-medium",
          "border border-brand-600/15 bg-brand-600/[0.055] text-brand-600 hover:bg-brand-600/10 transition-colors",
          className,
        )}
      >
        <span className="font-semibold leading-none">ⓘ</span> {label}
      </button>
    )
  }

  return (
    <div className={cn(
      "grid grid-cols-[18px_1fr] gap-2 items-start mb-3 px-3 py-2.5 rounded-lg",
      "border border-brand-600/15 bg-brand-600/[0.055] text-[#6e6e73] text-xs leading-relaxed",
      className,
    )}>
      <span className="text-brand-600 font-semibold leading-none mt-0.5">ⓘ</span>
      <div className="[&_strong]:text-[#1d1d1f] [&_strong]:font-semibold flex-1">{children}</div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="col-start-2 justify-self-start text-brand-600 text-[11px] font-medium hover:underline mt-1"
        >
          Ẩn công thức
        </button>
      )}
    </div>
  )
}

// ─── ValueStack (số chính + delta nhỏ) ────────────────────────────────────────
export function ValueStack({ value, delta, deltaKind = "flat", align = "end" }: {
  value: React.ReactNode; delta?: React.ReactNode; deltaKind?: DeltaKind; align?: "end" | "start"
}) {
  return (
    <span className={cn("inline-grid gap-1.5 leading-none", align === "end" ? "justify-items-end" : "justify-items-start")}>
      <strong className="text-[13px] font-semibold text-[#1d1d1f]">{value}</strong>
      {delta != null && <DeltaPill kind={deltaKind}>{delta}</DeltaPill>}
    </span>
  )
}

// ─── SnapshotMetric (KPI nhỏ trong dải snapshot) ──────────────────────────────
export function SnapshotMetric({ label, value, caption, source }: {
  label: string; value: React.ReactNode; caption?: React.ReactNode; source?: SourceKind
}) {
  return (
    <div className="rounded-lg border border-black/[0.09] bg-white/80 backdrop-blur p-4 flex flex-col justify-between min-h-[120px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[#6e6e73]">{label}</span>
        {source && <SourceBadge source={source} />}
      </div>
      <div className="mt-3.5 text-[26px] leading-none font-semibold text-[#1d1d1f]">{value}</div>
      {caption && <div className="mt-2 text-xs leading-snug text-[#6e6e73]">{caption}</div>}
    </div>
  )
}

// ─── Panel (card section chuẩn) ───────────────────────────────────────────────
export function Panel({ title, desc, source, action, note, children, className }: {
  title: React.ReactNode; desc?: React.ReactNode; source?: SourceKind;
  action?: React.ReactNode; note?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <section className={cn(
      "rounded-lg border border-black/[0.09] bg-white/80 backdrop-blur shadow-[0_18px_48px_rgba(0,0,0,0.07)] p-4",
      className,
    )}>
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#1d1d1f] leading-tight">{title}</h2>
          {desc && <p className="mt-1 text-xs leading-snug text-[#6e6e73]">{desc}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {action}
          {source && <SourceBadge source={source} />}
        </div>
      </div>
      {note && <LogicNote>{note}</LogicNote>}
      {children}
    </section>
  )
}

// ─── DataReadiness (chấm trạng thái nguồn) ────────────────────────────────────
export type ReadinessStatus = "ready" | "pending" | "off"

const DOT_CLS: Record<ReadinessStatus, string> = {
  ready:   "bg-[#2f9d55]",
  pending: "bg-[#b7791f]",
  off:     "bg-[#d93025]",
}

export function DataReadiness({ items, className }: {
  items: { label: string; status: ReadinessStatus }[]; className?: string
}) {
  return (
    <div className={cn("grid gap-2.5", className)}>
      {items.map(it => (
        <div key={it.label} className="flex items-center justify-between text-[13px] text-[#1d1d1f]">
          <span>{it.label}</span>
          <span className={cn("w-2.5 h-2.5 rounded-full", DOT_CLS[it.status])} />
        </div>
      ))}
    </div>
  )
}

// ─── StatTile (thẻ KPI đầy đủ — thay card BOD/Dashboard viết tay) ─────────────
// Màu icon chọn theo Ý NGHĨA số liệu (accent), không phải màu ngẫu nhiên như trước đợt UI này.
export type MetricAccent = "revenue" | "cost" | "margin" | "positive" | "warn" | "neutral"

const ACCENT_ICON_CLS: Record<MetricAccent, string> = {
  revenue:  "bg-brand-50 text-brand-600",
  cost:     "bg-amber-50 text-amber-600",
  margin:   "bg-emerald-50 text-emerald-600",
  positive: "bg-sky-50 text-sky-600",
  warn:     "bg-rose-50 text-rose-600",
  neutral:  "bg-slate-100 text-slate-500",
}

export function StatTile({ icon, label, value, unit, accent = "neutral", goalLabel, deltas, className }: {
  icon?: React.ReactNode
  label: string
  value: React.ReactNode
  unit?: React.ReactNode
  accent?: MetricAccent
  goalLabel?: React.ReactNode                                            // vd "334.0% of Target" góc trên phải
  deltas?: { label: string; value: React.ReactNode; kind: DeltaKind }[]  // vd "vs Prev Period" / "vs Prev Year"
  className?: string
}) {
  return (
    <div className={cn(
      "flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white p-4",
      "shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
      className,
    )}>
      <div className="flex items-start justify-between gap-2">
        {icon && (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", ACCENT_ICON_CLS[accent])}>
            {icon}
          </span>
        )}
        {goalLabel && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 whitespace-nowrap">
            {goalLabel}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 truncate">
          {value}
          {unit != null && <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>}
        </p>
      </div>
      {deltas && deltas.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2.5">
          {deltas.map((d, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-400 truncate">{d.label}</span>
              <DeltaPill kind={d.kind}>{d.value}</DeltaPill>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── DataTable (bảng dữ liệu tổng quát, phân trang sẵn) ───────────────────────
// Port từ `components/my-metrics/shared-ui.tsx` (chỉ 1 trang dùng trước đây) — tổng quát hoá cho mọi
// trang. `my-metrics/shared-ui.tsx` re-export lại từ đây, KHÔNG còn 2 bản trùng logic.
export function DataTable<T>({ columns, rows, rowKey, pageSize = 20, emptyLabel = "Chưa có dữ liệu.", searchBy, searchPlaceholder = "Tìm kiếm…" }: {
  columns: { key: string; label: string; align?: "left" | "right" | "center"; render: (row: T) => React.ReactNode; sortValue?: (row: T) => string | number }[]
  rows: T[]
  rowKey: (row: T) => string
  pageSize?: number
  emptyLabel?: string
  // (s196+21, đề xuất F roadmap UI/UX audit s196+20) tuỳ chọn — trước DataTable chỉ có phân trang, không
  // sort/tìm nhanh 1 dòng. Opt-in qua 2 prop mới, KHÔNG đổi hành vi chỗ dùng cũ (không truyền = y hệt trước).
  searchBy?: (row: T) => string   // text để lọc theo, vd `r => r.name + r.code`
  searchPlaceholder?: string
}) {
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  useEffect(() => { setPage(0) }, [rows.length, query])

  const filtered = useMemo(() => {
    if (!searchBy || !query.trim()) return rows
    const q = query.trim().toLowerCase()
    return rows.filter(r => searchBy(r).toLowerCase().includes(q))
  }, [rows, searchBy, query])

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sortKey)
    if (!col?.sortValue) return filtered
    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a), bv = col.sortValue!(b)
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [filtered, columns, sortKey, sortDir])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  if (rows.length === 0) return <p className="text-[11px] text-slate-400 text-center py-4">{emptyLabel}</p>
  return (
    <div>
      {searchBy && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder}
            className="w-full pl-8 pr-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600" />
        </div>
      )}
      {sorted.length === 0 ? (
        <p className="text-[11px] text-slate-400 text-center py-4">Không tìm thấy kết quả khớp &ldquo;{query}&rdquo;.</p>
      ) : (
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50">
            <tr>
              {columns.map(c => (
                <th key={c.key} className={cn("px-2.5 py-2 font-black text-slate-500 uppercase tracking-wider text-[9px] whitespace-nowrap",
                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                  c.sortValue && "cursor-pointer select-none hover:text-slate-700")}
                  onClick={c.sortValue ? () => toggleSort(c.key) : undefined}>
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {c.sortValue && (
                      sortKey === c.key
                        ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
                        : <ChevronsUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={rowKey(row)} className={cn("border-t border-slate-50", i % 2 === 1 && "bg-slate-50/40")}>
                {columns.map(c => (
                  <td key={c.key} className={cn("px-2.5 py-1.5 text-slate-700 align-top",
                    c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : "text-left")}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {sorted.length > 0 && pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-bold text-slate-500">{page + 1}/{pages} · {sorted.length} dòng</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
            className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── EmptyState (s196+21, đề xuất E roadmap UI/UX audit s196+20) ──────────────
// Trước đây 43+ chỗ tự viết tay empty-state, câu chữ không đồng nhất ("Chưa có dữ liệu tháng nào."/
// "Chưa có entry nào"/"Chưa có nhóm nào"...). Component này KHÔNG bắt buộc dùng lại chỗ cũ (tránh rủi ro
// đổi UI hàng loạt không cần thiết) — dùng cho chỗ MỚI hoặc khi tiện tay sửa tab đang chạm tới.
export function EmptyState({ icon, message, action, className }: {
  icon?: React.ReactNode
  message: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-10 text-center", className)}>
      {icon && <span className="text-slate-300">{icon}</span>}
      <p className="text-sm font-medium text-slate-400">{message}</p>
      {action}
    </div>
  )
}

// ─── SubChannelTable (s196+21, đề xuất G roadmap UI/UX audit s196+20) ─────────
// Pattern "click dòng cha → xổ bảng con Sub-channel" — trước viết tay riêng ≥2 chỗ trong `b2b/page.tsx`
// (Strategic/Non-Strategic), lệch style nhau (indigo vs slate, có/không backdrop-blur — finding #11) dù
// cùng 7 cột y hệt. Gộp 1 chỗ, `theme` giữ đúng 2 bảng màu cũ (không đổi UI — đúng UI Strict Lock), chỉ
// hết trùng code. Overflow đã đúng `overflow-x-auto` (fix P0 s196+20).
export interface SubChannelRow {
  name: string
  revenue: number
  units: number
  margin: number
  margin_percent: number
  gpm2: number
  gpm2_percent: number
}

const SUB_CHANNEL_THEME = {
  indigo: {
    wrap: "bg-white/40 border border-indigo-50 rounded-xl overflow-x-auto backdrop-blur-sm",
    headRow: "bg-indigo-50/50",
    headText: "text-indigo-400",
    divide: "divide-indigo-50/30",
    cm1: "text-indigo-600",
    cm1Pct: "text-indigo-500",
  },
  slate: {
    wrap: "bg-white/60 border border-slate-200 rounded-xl overflow-x-auto shadow-sm",
    headRow: "bg-slate-100",
    headText: "text-slate-500",
    divide: "divide-slate-100",
    cm1: "text-brand-600",
    cm1Pct: "text-brand-500",
  },
} as const

export function SubChannelTable({ rows, theme = "indigo" }: { rows: SubChannelRow[]; theme?: keyof typeof SUB_CHANNEL_THEME }) {
  const t = SUB_CHANNEL_THEME[theme]
  return (
    <div className={t.wrap}>
      <table className="w-full text-[10px]">
        <thead>
          <tr className={t.headRow}>
            <th className={cn("px-3 py-1.5 font-bold uppercase tracking-wider text-left", t.headText)}>Sub-channel</th>
            <th className={cn("px-3 py-1.5 font-bold uppercase tracking-wider text-right", t.headText)}>Revenue</th>
            <th className={cn("px-3 py-1.5 font-bold uppercase tracking-wider text-right", t.headText)}>Units</th>
            <th className={cn("px-3 py-1.5 font-bold uppercase tracking-wider text-right", t.headText)}>GP</th>
            <th className={cn("px-3 py-1.5 font-bold uppercase tracking-wider text-right", t.headText)}>Margin%</th>
            <th className={cn("px-3 py-1.5 font-bold uppercase tracking-wider text-right", t.headText)}>CM1</th>
            <th className={cn("px-3 py-1.5 font-bold uppercase tracking-wider text-right", t.headText)}>CM1%</th>
          </tr>
        </thead>
        <tbody className={cn("divide-y", t.divide)}>
          {rows.map((sc, i) => (
            <tr key={i}>
              <td className="px-3 py-1.5 font-bold text-slate-700">{sc.name}</td>
              <td className="px-3 py-1.5 text-right font-medium text-slate-600">{formatNumber(Math.round(sc.revenue))}</td>
              <td className="px-3 py-1.5 text-right font-medium text-slate-600">{formatNumber(sc.units)}</td>
              <td className="px-3 py-1.5 text-right font-bold text-emerald-600">{formatNumber(Math.round(sc.margin))}</td>
              <td className="px-3 py-1.5 text-right font-medium text-slate-600">{sc.margin_percent.toFixed(1)}%</td>
              <td className={cn("px-3 py-1.5 text-right font-bold", t.cm1)}>{formatNumber(Math.round(sc.gpm2))}</td>
              <td className={cn("px-3 py-1.5 text-right font-bold", t.cm1Pct)}>{sc.gpm2_percent.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Theme chart dùng chung (Recharts) ─────────────────────────────────────────
// Trước đây 17 trang tự chọn màu chart riêng, không nhất quán. Dùng CHART_PALETTE cho series màu (thứ tự
// ưu tiên: brand navy trước, rồi các màu ngữ nghĩa), CHART_GRID_COLOR cho <CartesianGrid>, spread
// chartTooltipStyle vào <Tooltip contentStyle={...}>.
export const CHART_PALETTE = ["#0f4c81", "#2f9d55", "#b7791f", "#7c5cbf", "#0891b2", "#d93025"]
export const CHART_GRID_COLOR = "#eef1f5"
export const chartTooltipStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
}

// ─── Skeleton loading dùng chung (s196+21, roadmap performance/UI-UX s196+20) ─────────────────────
// Trước đây mỗi trang tự định nghĩa lại y hệt `const Skeleton = ({className}) => <div className="animate-
// pulse bg-slate-200 rounded" .../>` (bod/channels/vendors/products/targets) hoặc không có skeleton nào —
// chỉ icon Refresh nhỏ xoay trong header, nội dung chính render data rỗng/0 rồi "nhảy" số khi fetch xong.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-slate-200 rounded", className)} />
}

// Khớp đúng bố cục StatTile (icon vuông + nhãn + số lớn) — dùng thay chỗ StatTile thật khi `loading`.
export function StatTileSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white p-4",
      "shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
      className,
    )}>
      <Skeleton className="h-9 w-9 rounded-xl" />
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-6 w-24" />
      </div>
    </div>
  )
}

// Vài dòng bảng giả (chiều rộng cột lệch nhẹ cho giống dữ liệu thật) — đặt trong <tbody> khi `loading`.
export function TableRowsSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={cn("h-4", c === 0 ? "w-32" : "w-16")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
