"use client"

import React, { useMemo, useState } from "react"
import { Download, Search, Users, Globe, MousePointerClick, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/analytics-formatters"
import { exportAOA } from "@/lib/export-excel"
import {
  GROUP_ORDER, sumRows, type DistFocus, type DistGroup, type DistRow, type DistView,
} from "@/lib/vendor-distribution"

// Bảng phân bổ doanh thu vendor theo Khách hàng / Kênh. Bấm 1 dòng → lọc bảng Product Performance về SKU của vendor
// bán cho đúng khách/kênh đó (state `focus` nằm ở page, truy vấn SKU chạy ở page).

const GROUP_LABEL: Record<DistGroup, string> = {
  "B2B-Strategic": "B2B · Strategic", "B2B-Non-Strategic": "B2B · Non-Strategic", B2B: "B2B", B2C: "B2C", Khác: "Khác",
}
const GROUP_DOT: Record<DistGroup, string> = {
  "B2B-Strategic": "bg-brand-600", "B2B-Non-Strategic": "bg-sky-500", B2B: "bg-brand-600", B2C: "bg-emerald-500", Khác: "bg-slate-400",
}
const TOP_N = 15

const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—")
const mom = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null)

function Mom({ cur, prev }: { cur: number; prev: number }) {
  const v = mom(cur, prev)
  if (v === null) return <span className="text-slate-300">—</span>
  return <span className={cn("font-bold tabular-nums", v >= 0 ? "text-emerald-600" : "text-rose-600")}>{v > 0 ? "+" : ""}{v.toFixed(1)}%</span>
}

export function VendorDistribution({ rows, loading, view, onViewChange, focus, onFocus, projectionFactor, comparison, startDate, endDate }: {
  rows: DistRow[]; loading: boolean; view: DistView; onViewChange: (v: DistView) => void
  focus: DistFocus | null; onFocus: (f: DistFocus | null) => void
  projectionFactor: number | null; comparison: boolean; startDate: string; endDate: string
}) {
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<Set<DistGroup>>(new Set())

  const q = search.trim().toLowerCase()
  const visible = useMemo(() => (q ? rows.filter(r => r.name.toLowerCase().includes(q) || r.channels.some(c => c.toLowerCase().includes(q))) : rows), [rows, q])
  const byGroup = useMemo(() => GROUP_ORDER.map(g => ({ group: g, rows: visible.filter(r => r.group === g) })).filter(x => x.rows.length > 0), [visible])
  const grand = useMemo(() => sumRows(visible), [visible])
  const showCust = view === "customer"
  const colCount = 7 + (showCust ? 2 : 0) + (projectionFactor ? 1 : 0) + (comparison ? 1 : 0)
  const vendorRevenue = grand.revenue

  const isFocused = (r: DistRow) => !!focus && focus.kind === r.kind && focus.key === r.key && focus.group === r.group
  const toggleFocus = (r: DistRow) => onFocus(isFocused(r) ? null : { kind: r.kind, key: r.key, group: r.group, label: r.name })

  const doExport = () => {
    const heads = ["Nhóm", showCust ? "Khách hàng / Kênh" : "Kênh", "Kênh bán", "Số mã KH", "Orders", "Units", "Revenue", "Revenue dự phóng", "Tổng doanh thu (mọi vendor)", "%Contrib", "Revenue kỳ trước", "%MoM"]
    const body = visible.map(r => [
      GROUP_LABEL[r.group], r.name, r.channels.join(", "), r.codes, r.orders, r.units, Math.round(r.revenue),
      projectionFactor ? Math.round(r.revenue * projectionFactor) : "", Math.round(r.totalRevenue),
      r.totalRevenue > 0 ? Number(((r.revenue / r.totalRevenue) * 100).toFixed(2)) : "",
      Math.round(r.prevRevenue), mom(r.revenue, r.prevRevenue) === null ? "" : Number(mom(r.revenue, r.prevRevenue)!.toFixed(2)),
    ])
    body.push(["TỔNG", "", "", "", grand.orders, grand.units, Math.round(grand.revenue), projectionFactor ? Math.round(grand.revenue * projectionFactor) : "",
      Math.round(grand.totalRevenue), grand.totalRevenue > 0 ? Number(((grand.revenue / grand.totalRevenue) * 100).toFixed(2)) : "", Math.round(grand.prevRevenue), ""])
    exportAOA(heads, body, `Vendor_${view === "customer" ? "Customers" : "Channels"}_${startDate}_to_${endDate}`, view === "customer" ? "Customers" : "Channels")
  }

  const th = "px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500"
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Phân bổ theo {showCust ? "Khách hàng" : "Kênh"}</h2>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
            <MousePointerClick className="w-3.5 h-3.5" />Bấm vào 1 dòng để xem SKU của vendor bán cho {showCust ? "khách / kênh" : "kênh"} đó
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex bg-slate-100 p-1 rounded-xl">
            {([["customer", "Khách hàng", <Users key="u" className="w-3.5 h-3.5" />], ["channel", "Kênh", <Globe key="g" className="w-3.5 h-3.5" />]] as [DistView, string, React.ReactNode][]).map(([k, label, icon]) => (
              <button key={k} onClick={() => onViewChange(k)}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all", view === k ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {icon}{label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={showCust ? "Tìm khách hàng / kênh…" : "Tìm kênh…"}
              className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-56" />
          </div>
          <button onClick={doExport} disabled={loading || rows.length === 0}
            className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 h-[34px] px-3 bg-brand-50/50 hover:bg-brand-50 rounded-lg transition-all disabled:opacity-50">
            <Download className="w-4 h-4" />Export
          </button>
        </div>
      </div>

      {focus && (
        <div className="px-6 py-2.5 bg-brand-50/60 border-b border-brand-100 flex items-center justify-between text-xs">
          <span className="text-brand-800 font-medium">Đang lọc SKU theo: <b>{focus.label}</b> <span className="text-brand-500">({focus.kind === "customer" ? "khách hàng" : "kênh"})</span></span>
          <button onClick={() => onFocus(null)} className="flex items-center gap-1 font-bold text-brand-700 hover:underline"><X className="w-3.5 h-3.5" />Bỏ lọc</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>{showCust ? "Khách hàng / Kênh" : "Kênh"}</th>
              {showCust && <th className={th}>Kênh bán</th>}
              {showCust && <th className={cn(th, "text-right")}>Mã KH</th>}
              <th className={cn(th, "text-right")}>Orders</th>
              <th className={cn(th, "text-right")}>Units</th>
              <th className={cn(th, "text-right")}>Revenue (VND)</th>
              {projectionFactor && <th className={cn(th, "text-right")}>Dự phóng</th>}
              <th className={cn(th, "text-right")}>Tổng DT (mọi vendor)</th>
              <th className={cn(th, "text-right")}>%Contrib</th>
              {comparison && <th className={cn(th, "text-right")}>%MoM</th>}
              <th className={cn(th, "text-right")}>% vendor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}><td colSpan={colCount} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" /></td></tr>
            )) : byGroup.length === 0 ? (
              <tr><td colSpan={colCount} className="px-4 py-12 text-center text-slate-400 italic">{q ? `Không có kết quả cho "${search}"` : "Không có dữ liệu trong kỳ này"}</td></tr>
            ) : byGroup.map(({ group, rows: list }) => {
              const sub = sumRows(list)
              const open = q !== "" || expanded.has(group)
              const shown = open ? list : list.slice(0, TOP_N)
              return (
                <React.Fragment key={group}>
                  <tr className="bg-slate-50/80 border-y border-slate-100">
                    <td colSpan={colCount} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      <span className="inline-flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", GROUP_DOT[group])} />{GROUP_LABEL[group]}
                        <span className="font-medium normal-case tracking-normal text-slate-400">· {list.length} {list[0].kind === "customer" ? "khách hàng" : "kênh"}</span></span>
                    </td>
                  </tr>
                  {shown.map(r => {
                    const sel = isFocused(r)
                    const share = vendorRevenue > 0 ? (r.revenue / vendorRevenue) * 100 : 0
                    return (
                      <tr key={`${r.group}:${r.key}`} onClick={() => toggleFocus(r)}
                        className={cn("cursor-pointer text-xs transition-colors border-l-4", sel ? "bg-brand-50 border-l-brand-500" : "border-l-transparent hover:bg-slate-50")}>
                        <td className="px-4 py-2.5 font-semibold text-slate-800 max-w-[280px] truncate" title={r.name}>{r.name}</td>
                        {showCust && (
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {r.channels.slice(0, 2).map(c => <span key={c} className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-600">{c}</span>)}
                              {r.channels.length > 2 && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-400" title={r.channels.join(", ")}>+{r.channels.length - 2}</span>}
                            </div>
                          </td>
                        )}
                        {showCust && <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{r.kind === "customer" ? r.codes : "—"}</td>}
                        <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{formatNumber(r.orders)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{formatNumber(r.units)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900 tabular-nums">{formatNumber(Math.round(r.revenue))}</td>
                        {projectionFactor && <td className="px-4 py-2.5 text-right text-brand-600 font-medium tabular-nums">{formatNumber(Math.round(r.revenue * projectionFactor))}</td>}
                        <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">{formatNumber(Math.round(r.totalRevenue))}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums"><span className={cn("font-bold", r.totalRevenue > 0 && r.revenue / r.totalRevenue > 0.5 ? "text-emerald-600" : "text-slate-600")}>{pct(r.revenue, r.totalRevenue)}</span></td>
                        {comparison && <td className="px-4 py-2.5 text-right"><Mom cur={r.revenue} prev={r.prevRevenue} /></td>}
                        <td className="px-4 py-2.5 w-28">
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-[10px] text-slate-400 tabular-nums w-9 text-right">{share.toFixed(1)}%</span>
                            <div className="w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${Math.min(100, share)}%` }} /></div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {list.length > TOP_N && q === "" && (
                    <tr>
                      <td colSpan={colCount} className="px-4 py-2 text-center">
                        <button onClick={() => setExpanded(prev => { const s = new Set(prev); s.has(group) ? s.delete(group) : s.add(group); return s })}
                          className="text-[11px] font-bold text-brand-600 hover:underline">
                          {open ? "Thu gọn" : `Xem thêm ${list.length - TOP_N} dòng`}
                        </button>
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 font-bold text-xs border-y border-slate-200">
                    <td className="px-4 py-2 text-slate-900" colSpan={showCust ? 3 : 1}>Tổng {GROUP_LABEL[group]}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(sub.orders)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(sub.units)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(Math.round(sub.revenue))}</td>
                    {projectionFactor && <td className="px-4 py-2 text-right text-brand-600 tabular-nums">{formatNumber(Math.round(sub.revenue * projectionFactor))}</td>}
                    <td className="px-4 py-2 text-right text-slate-400 tabular-nums">{formatNumber(Math.round(sub.totalRevenue))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{pct(sub.revenue, sub.totalRevenue)}</td>
                    {comparison && <td className="px-4 py-2 text-right"><Mom cur={sub.revenue} prev={sub.prevRevenue} /></td>}
                    <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{pct(sub.revenue, vendorRevenue)}</td>
                  </tr>
                </React.Fragment>
              )
            })}
            {!loading && byGroup.length > 0 && (
              <tr className="bg-slate-900 text-white font-bold text-sm">
                <td className="px-4 py-3" colSpan={showCust ? 3 : 1}>TỔNG</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(grand.orders)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(grand.units)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(Math.round(grand.revenue))}</td>
                {projectionFactor && <td className="px-4 py-3 text-right text-cyan-300 tabular-nums">{formatNumber(Math.round(grand.revenue * projectionFactor))}</td>}
                <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{formatNumber(Math.round(grand.totalRevenue))}</td>
                <td className="px-4 py-3 text-right tabular-nums">{pct(grand.revenue, grand.totalRevenue)}</td>
                {comparison && <td className="px-4 py-3 text-right"><Mom cur={grand.revenue} prev={grand.prevRevenue} /></td>}
                <td className="px-4 py-3 text-right tabular-nums">100%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
