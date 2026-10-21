"use client"

import React, { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatCompactNumber } from "@/lib/analytics-formatters"
import type { TierRow } from "@/lib/bod-b2b-tiers"

// Các hàng B2B của bảng "Channel Performance Breakdown": Tier (Strategic, VIP, Gold, Silver) → Organization. Bấm hàng Tier để mở/gập.
// Cột khớp bảng cha (Kênh · Units · Doanh thu · [Dự phóng] · COGS · GP · %GP · CM1 · [Dự phóng] · %CM1 · [Dự phóng]).
export function BodB2BTierRows({ tiers, projectionFactor, colSpan }: { tiers: TierRow[]; projectionFactor: number | null; colSpan: number }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ Strategic: true })
  const proj = projectionFactor != null
  const cells = (r: { units: number; revenue: number; cogs: number; margin: number; marginPct: number; cm1: number; cm1Pct: number }, bold: boolean) => (
    <>
      <td className="px-4 py-2.5 text-right text-slate-600 font-mono">{formatCompactNumber(r.units)}</td>
      <td className="px-4 py-2.5 text-right text-slate-700">{formatCurrency(r.revenue)}</td>
      {proj && <td className="px-4 py-2.5 text-right text-indigo-600 font-bold">{formatCurrency(r.revenue * projectionFactor!)}</td>}
      <td className="px-4 py-2.5 text-right text-slate-500">{formatCurrency(r.cogs)}</td>
      <td className={cn("px-4 py-2.5 text-right text-emerald-600", bold && "font-bold")}>{formatCurrency(r.margin)}</td>
      <td className="px-4 py-2.5 text-right text-slate-600">{r.marginPct.toFixed(1)}%</td>
      <td className={cn("px-4 py-2.5 text-right text-indigo-600", bold && "font-bold")}>{formatCurrency(r.cm1)}</td>
      {proj && <td className="px-4 py-2.5 text-right text-slate-400">—</td>}
      <td className="px-4 py-2.5 text-right"><span className={cn("px-2 py-0.5 rounded-full text-[11.5px] font-bold", r.cm1Pct >= 15 ? "bg-indigo-50 text-indigo-600" : "bg-pink-50 text-pink-600")}>{r.cm1Pct.toFixed(1)}%</span></td>
      {proj && <td className="px-4 py-2.5 text-right text-slate-400">—</td>}
    </>
  )
  if (tiers.length === 0) return <tr><td colSpan={colSpan} className="px-4 py-4 text-sm text-slate-400">Không có dữ liệu B2B trong kỳ này.</td></tr>
  return (
    <>
      <tr className="bg-slate-50/80"><td colSpan={colSpan} className="px-4 py-2 font-bold text-slate-700 text-xs uppercase tracking-wider">B2B theo tier và tổ chức khách</td></tr>
      {tiers.map(t => (
        <React.Fragment key={t.tier}>
          <tr className="cursor-pointer hover:bg-slate-50 bg-white" onClick={() => setOpen(o => ({ ...o, [t.tier]: !o[t.tier] }))}>
            <td className="px-4 py-2.5 font-bold text-slate-800">
              <span className="inline-flex items-center gap-1.5">
                {open[t.tier] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                {t.tier} <span className="text-[12px] font-semibold text-slate-400">({t.orgs.length} tổ chức)</span>
              </span>
            </td>
            {cells(t, true)}
          </tr>
          {open[t.tier] && t.orgs.map(o => (
            <tr key={o.orgKey} className="bg-slate-50/50 hover:bg-slate-50">
              <td className="px-4 py-2 pl-11 text-slate-600 text-[13px]" title={o.orgName}>
                <span className="inline-block max-w-[280px] truncate align-bottom">{o.orgName}</span>{o.customers > 1 && <span className="ml-1.5 text-[11.5px] text-slate-400">{o.customers} mã</span>}
              </td>
              {cells(o, false)}
            </tr>
          ))}
        </React.Fragment>
      ))}
    </>
  )
}
