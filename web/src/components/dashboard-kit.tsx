"use client"

import React from "react"
import { cn } from "@/lib/utils"

/**
 * Dashboard Kit — codify design language từ gohub_dashboard_mockup.html (Apple-style B2C).
 * Mục tiêu: GIẢM TẢI NHẬN THỨC (cognitive load) — dùng chung cho mọi trang analytics.
 *
 * Pattern cốt lõi:
 *  - SourceBadge  : cho biết số liệu từ nguồn nào (GA4 / Admin GoHub / Data chat) → tăng độ tin.
 *  - LogicNote    : hộp ⓘ giải thích công thức/logic của 1 bảng → user không phải đoán.
 *  - DeltaPill    : pill màu up=xanh / down=đỏ / flat=xám / warn=hổ phách → tín hiệu 1 nhìn-là-hiểu.
 *  - ValueStack   : số chính lớn + delta nhỏ bên dưới → glanceable.
 *  - SnapshotMetric: thẻ KPI nhỏ trong dải snapshot.
 *  - Panel        : card section chuẩn (tiêu đề + mô tả + source + logic-note).
 *  - DataReadiness: chấm trạng thái nguồn dữ liệu (xanh = sẵn sàng, vàng = đang chờ).
 *
 * Tokens (khớp mockup): blue #0071e3 · teal #00a6a6 · green #2f9d55 · red #d93025 · amber #b7791f.
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
  ga4:     "text-[#0071e3] bg-[#eaf4ff]",
  admin:   "text-[#007a7a] bg-[#e8f7f6]",
  chat:    "text-[#2f9d55] bg-[#eaf6ee]",
  neutral: "text-[#6e6e73] bg-[#eef1f5]",
}

const SOURCE_LABEL: Record<SourceKind, string> = {
  ga4: "GA4", admin: "Admin GoHub", chat: "Data chat", neutral: "—",
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
export function LogicNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "grid grid-cols-[18px_1fr] gap-2 items-start mb-3 px-3 py-2.5 rounded-lg",
      "border border-[#0071e3]/15 bg-[#0071e3]/[0.055] text-[#6e6e73] text-xs leading-relaxed",
      className,
    )}>
      <span className="text-[#0071e3] font-semibold leading-none mt-0.5">ⓘ</span>
      <div className="[&_strong]:text-[#1d1d1f] [&_strong]:font-semibold">{children}</div>
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
