"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Globe2, RefreshCw, Download, ChevronDown, ChevronRight, Home, TrendingUp, Layers, PieChart } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatTile, Panel, DataTable, Skeleton, EmptyState, LogicNote, DeltaPill, autoDeltaKind } from "@/components/dashboard-kit"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { getRangeProjectionFactor } from "@/lib/analytics-engine/projection"
import { exportAOA } from "@/lib/export-excel"
import {
  groupBy, crossTab, monthlyBy, gmPct, DIMENSION_LABEL,
  type MarketData, type MarketSku, type Dimension, type Metric, type GroupRow,
} from "@/lib/market-breakdown"
import { makeColorFor, type ColorFor } from "./market-colors"
import { InsightBox, Glossary, vnd, pctTxt } from "./market-help"

const chartLoading = () => <Skeleton className="w-full h-full" />
const StackedBars = dynamic(() => import("./market-charts").then(m => m.StackedBars), { ssr: false, loading: chartLoading })
const RankBars = dynamic(() => import("./market-charts").then(m => m.RankBars), { ssr: false, loading: chartLoading })
const QuotesView = dynamic(() => import("./quotes-view"), { ssr: false, loading: chartLoading })

type Group = "ALL" | "B2B" | "B2C"
type Step = { dim: Dimension; key: string }

// Thứ tự drill trong 1 thị trường: vendor → dịch vụ → hình thức → loại gói → product → SKU.
const DRILL: Dimension[] = ["country", "vendor", "service", "form", "plan", "product_code", "sku"]
const SHARE_DIMS: Dimension[] = ["vendor", "service", "form", "plan"]
const STACK_DIMS: Dimension[] = ["vendor", "service", "form", "plan"]
const TOP_COLS = 6

function quarterList(): string[] {
  const d = new Date()
  let q = Math.floor(d.getMonth() / 3) + 1, y = d.getFullYear()
  const out: string[] = []
  for (let i = 0; i < 5; i++) { out.unshift(`Q${q}-${y}`); if (--q === 0) { q = 4; y-- } }
  return out
}

function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string }[] }) {
  return (
    <div className="inline-flex bg-slate-100 p-1 rounded-xl">
      {items.map(it => (
        <button key={it.key} onClick={() => onChange(it.key)}
          className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
            value === it.key ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

/** Bảng gập mặc định — chỉ hiện biểu đồ, bấm mới mở bảng (yêu cầu Hiếu s225). */
function Collapsible({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{label}
        </button>
        {open && action}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

export default function MarketPage() {
  const quarters = useMemo(quarterList, [])
  // Quý mới chạy < 30 ngày: dự phóng còn nhiễu (vd ×15 ở ngày 5) → mặc định mở quý vừa đóng.
  const [quarter, setQuarter] = useState(() => {
    const d = new Date(), qStart = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
    return quarters[quarters.length - ((d.getTime() - qStart.getTime()) / 86_400_000 < 30 ? 2 : 1)]
  })
  const [group, setGroup] = useState<Group>("ALL")
  const [metric, setMetric] = useState<Metric>("rev")
  const [view, setView] = useState<"market" | "quotes">("market")
  const [stackDim, setStackDim] = useState<Dimension>("vendor")
  const [path, setPath] = useState<Step[]>([])
  const [data, setData] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (fresh = false) => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/analytics/market?quarter=${quarter}&group=${group}${fresh ? "&nocache=1" : ""}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setData(d)
    } catch (e: any) { setError(e.message); setData(null) }
    finally { setLoading(false) }
  }, [quarter, group])
  useEffect(() => { load() }, [load])
  useEffect(() => { setPath([]) }, [quarter, group])

  const factor = data ? getRangeProjectionFactor(data.curStart, data.curEnd) : 1
  const running = factor > 1
  const val = (r: GroupRow) => metric === "rev" ? r.rev : r.gp
  const valPrev = (r: GroupRow) => metric === "rev" ? r.revPrev : r.gpPrev
  const metricLabel = metric === "rev" ? "Doanh thu" : "Lãi gộp"

  const colorFor = useMemo(() => {
    const m = {} as Record<Dimension, ColorFor>
    for (const d of DRILL) m[d] = makeColorFor(data ? groupBy(data, d).map(r => r.key) : [])
    return m
  }, [data])

  const filter = useMemo(() => {
    if (!path.length) return undefined
    return (s: MarketSku) => path.every(p => (p.dim === "country" ? s.country : s[p.dim]) === p.key)
  }, [path])

  const total = useMemo(() => data ? groupBy(data, "country", undefined, metric).reduce((a, r) => ({
    rev: a.rev + r.rev, gp: a.gp + r.gp, revPrev: a.revPrev + r.revPrev, gpPrev: a.gpPrev + r.gpPrev,
  }), { rev: 0, gp: 0, revPrev: 0, gpPrev: 0 }) : null, [data, metric])

  const markets = useMemo(() => data ? groupBy(data, "country", undefined, metric) : [], [data, metric])
  const topMarkets = markets.slice(0, 15).map(m => m.key)
  const marketStack = useMemo(() => data && topMarkets.length ? crossTab(data, "country", stackDim, topMarkets, TOP_COLS, metric) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, stackDim, metric, topMarkets.join("|")])

  const level = path.length < DRILL.length ? DRILL[path.length] : "sku"
  const scoped = useMemo(() => data ? groupBy(data, level, filter, metric) : [], [data, level, filter, metric])
  const scopeTotal = scoped.reduce((a, r) => a + val(r), 0)
  const remainingShare = SHARE_DIMS.filter(d => !path.some(p => p.dim === d))
  const trendDim = remainingShare[0] ?? "product_code"
  const trend = useMemo(() => data && path.length ? monthlyBy(data, trendDim, TOP_COLS, metric, filter) : null, [data, trendDim, metric, filter, path.length])
  const topSkus = useMemo(() => data && path.length ? groupBy(data, "sku", filter, metric).slice(0, 12) : [], [data, filter, metric, path.length])
  const skuVendor = useMemo(() => new Map((data?.skus ?? []).map(s => [s.sku, s.vendor])), [data])
  const skuDesc = useMemo(() => new Map((data?.skus ?? []).map(s => [s.sku, [s.country, s.form, s.size].filter(Boolean).join(" · ")])), [data])

  const shares = useMemo(() => {
    if (!data || !path.length) return []
    return remainingShare.map(dim => {
      const rows = groupBy(data, dim, filter, metric)
      const cols = rows.slice(0, TOP_COLS).map(r => r.key)
      const other = rows.slice(TOP_COLS)
      const pick = (f: (r: GroupRow) => number, label: string) => {
        const o: Record<string, number | string> = { key: label }
        rows.slice(0, TOP_COLS).forEach(r => { o[r.key] = f(r) })
        if (other.length) o["Khác"] = other.reduce((a, r) => a + f(r), 0)
        return o
      }
      return {
        dim, cols: other.length ? [...cols, "Khác"] : cols,
        rows: [pick(valPrev, data.prevQuarter), pick(val, data.quarter)],
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, metric, remainingShare.join("|"), path.length])

  const drillTo = (key: string) => { if (path.length < DRILL.length) setPath([...path, { dim: level, key }]) }
  const selectMarket = (key: string) => setPath([{ dim: "country", key }])

  const qoq = (cur: number, prev: number) => prev ? ((cur * factor) / prev - 1) * 100 : null
  const deltaPill = (cur: number, prev: number) => {
    const d = qoq(cur, prev)
    return d === null ? <span className="text-slate-300">—</span> : <DeltaPill kind={autoDeltaKind(d)}>{d >= 0 ? "+" : ""}{d.toFixed(1)}%</DeltaPill>
  }

  const tableColumns = (dim: Dimension, base: number) => [
    { key: "key", label: DIMENSION_LABEL[dim], sortValue: (r: GroupRow) => r.key, render: (r: GroupRow) => {
      const cls = cn("font-medium text-left", dim === "sku" && "font-mono text-xs")
      if (dim === "sku") return <span className="text-left"><span className={cls}>{r.key}</span><span className="block text-[11px] text-slate-400">{skuDesc.get(r.key)}</span></span>
      const go = dim === "country" ? () => selectMarket(r.key) : () => drillTo(r.key)
      return <button onClick={go} className={cn(cls, "hover:text-brand-700 hover:underline")}>{r.key}</button>
    } },
    { key: "rev", label: "Doanh thu", align: "right" as const, render: (r: GroupRow) => formatCompactNumber(r.rev), sortValue: (r: GroupRow) => r.rev },
    ...(running ? [{ key: "proj", label: "Ước cả quý", align: "right" as const, render: (r: GroupRow) => formatCompactNumber(r.rev * factor), sortValue: (r: GroupRow) => r.rev }] : []),
    { key: "revPrev", label: `Quý ${data?.prevQuarter.replace("-", "/") ?? "trước"}`, align: "right" as const, render: (r: GroupRow) => formatCompactNumber(r.revPrev), sortValue: (r: GroupRow) => r.revPrev },
    { key: "qoq", label: "So quý trước", align: "right" as const, render: (r: GroupRow) => deltaPill(r.rev, r.revPrev), sortValue: (r: GroupRow) => qoq(r.rev, r.revPrev) ?? -1e9 },
    { key: "share", label: "Tỷ trọng", align: "right" as const, render: (r: GroupRow) => base ? `${(val(r) / base * 100).toFixed(1)}%` : "—", sortValue: (r: GroupRow) => val(r) },
    { key: "gp", label: "Lãi gộp", align: "right" as const, render: (r: GroupRow) => formatCompactNumber(r.gp), sortValue: (r: GroupRow) => r.gp },
    { key: "gm", label: "Biên lãi", align: "right" as const, render: (r: GroupRow) => `${gmPct(r.gp, r.rev).toFixed(1)}%`, sortValue: (r: GroupRow) => gmPct(r.gp, r.rev) },
    { key: "gmPrev", label: "Biên lãi quý trước", align: "right" as const, render: (r: GroupRow) => `${gmPct(r.gpPrev, r.revPrev).toFixed(1)}%`, sortValue: (r: GroupRow) => gmPct(r.gpPrev, r.revPrev) },
    { key: "units", label: "Số lượng bán", align: "right" as const, render: (r: GroupRow) => r.units.toLocaleString("vi-VN"), sortValue: (r: GroupRow) => r.units },
    ...(dim !== "sku" ? [{ key: "skus", label: "Số sản phẩm", align: "right" as const, render: (r: GroupRow) => r.skuCount, sortValue: (r: GroupRow) => r.skuCount }] : []),
  ]

  const exportRows = (dim: Dimension, rows: GroupRow[]) => {
    const name = [quarter, group, ...path.map(p => p.key), DIMENSION_LABEL[dim]].join("_").replace(/[^\w-]+/g, "-")
    void exportAOA(
      [DIMENSION_LABEL[dim], "Doanh thu", "Ước cả quý", `Quý ${data?.prevQuarter ?? "trước"}`, "So quý trước (%)", "Lãi gộp", "Biên lãi (%)", "Biên lãi quý trước (%)", "Số lượng bán", "Số sản phẩm"],
      rows.map(r => [r.key, r.rev, Math.round(r.rev * factor), r.revPrev, qoq(r.rev, r.revPrev)?.toFixed(1) ?? "",
        r.gp, +gmPct(r.gp, r.rev).toFixed(2), +gmPct(r.gpPrev, r.revPrev).toFixed(2), r.units, r.skuCount]),
      `thi-truong_${name}`,
    )
  }
  const exportBtn = (dim: Dimension, rows: GroupRow[]) => (
    <button onClick={() => exportRows(dim, rows)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700">
      <Download className="w-3.5 h-3.5" />Excel
    </button>
  )

  const top5Share = total && total[metric] ? markets.slice(0, 5).reduce((a, r) => a + val(r), 0) / total[metric] * 100 : 0
  const market = path[0]?.key

  // Tóm tắt bằng lời cho người không rành số: tình hình chung, thị trường chính, biến động lớn, nhà cung cấp chính.
  const insights = useMemo(() => {
    if (!data || !total || !total.rev) return []
    const out: React.ReactNode[] = []
    const d = qoq(total.rev, total.revPrev)
    out.push(<>Quý {data.quarter.replace("-", "/")} bán được <b>{vnd(total.rev)}</b>{running && <> (ước cả quý <b>{vnd(total.rev * factor)}</b>)</>}, lãi gộp <b>{vnd(total.gp)}</b> (biên {pctTxt(gmPct(total.gp, total.rev))}).
      {d !== null && <> {d >= 0 ? "Tăng" : "Giảm"} <b>{pctTxt(Math.abs(d))}</b> so với quý {data.prevQuarter.replace("-", "/")}{running ? " (so theo ước cả quý)" : ""}.</>}</>)
    const top3 = markets.slice(0, 3)
    out.push(<>Bán chủ yếu ở <b>{top3.map(m => `${m.key} (${pctTxt(m.rev / total.rev * 100, 0)})`).join(", ")}</b> — 3 thị trường này chiếm {pctTxt(top3.reduce((a, m) => a + m.rev, 0) / total.rev * 100, 0)} doanh thu; có {markets.filter(m => m.rev > 0).length} thị trường có bán.</>)
    const big = markets.filter(m => Math.max(m.rev * factor, m.revPrev) >= total.rev * 0.02 && m.revPrev > 0)
      .map(m => ({ m, d: qoq(m.rev, m.revPrev)! })).sort((a, b) => b.d - a.d)
    if (big.length >= 2) out.push(<>Thay đổi đáng chú ý (thị trường chiếm từ 2% trở lên): tăng mạnh nhất <b>{big[0].m.key} ({big[0].d >= 0 ? "+" : ""}{pctTxt(big[0].d, 0)})</b>, giảm mạnh nhất <b>{big[big.length - 1].m.key} ({pctTxt(big[big.length - 1].d, 0)})</b>.</>)
    const vendors = groupBy(data, "vendor")
    if (vendors.length) out.push(<>Nhà cung cấp chính: <b>{vendors.slice(0, 2).map(v => `${v.key} (${pctTxt(v.rev / total.rev * 100, 0)})`).join(", ")}</b>.</>)
    if (market) {
      const m = markets.find(x => x.key === market)
      const mv = groupBy(data, "vendor", s => s.country === market)
      const ms = groupBy(data, "sku", s => s.country === market)[0]
      if (m) out.push(<>Đang xem <b>{market}</b>: bán {vnd(m.rev)} ({pctTxt(m.rev / total.rev * 100)} tổng), biên lãi {pctTxt(gmPct(m.gp, m.rev))}; nhập chủ yếu từ <b>{mv.slice(0, 2).map(v => `${v.key} (${pctTxt(v.rev / (m.rev || 1) * 100, 0)})`).join(", ")}</b>{ms && <>; bán chạy nhất <b>{skuDesc.get(ms.key)}</b> ({ms.key})</>}.</>)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, total, markets, market, factor])

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Globe2 className="w-6 h-6 text-brand-600" />Thị trường & Báo giá</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Bán ở đâu nhiều nhất, nhập từ nhà cung cấp nào, loại gói nào — và nhà cung cấp nào đang chào giá rẻ hơn.
            {data && <> Dữ liệu tới {data.cutoff}.</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={setView} items={[{ key: "market", label: "Bán ở đâu" }, { key: "quotes", label: "So giá nhà cung cấp" }]} />
          <Segmented value={quarter} onChange={setQuarter} items={quarters.map(q => ({ key: q, label: q.replace("-", " ") }))} />
          <Segmented value={group} onChange={setGroup} items={[{ key: "ALL", label: "Tất cả" }, { key: "B2B", label: "B2B" }, { key: "B2C", label: "B2C" }]} />
          {view === "market" && <Segmented value={metric} onChange={setMetric} items={[{ key: "rev", label: "Doanh thu" }, { key: "gp", label: "Lãi gộp" }]} />}
          <Glossary />
          <button onClick={() => load(true)} aria-label="Tải lại mới" className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200">
            <RefreshCw className={cn("w-4 h-4 text-slate-500", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {view === "quotes" ? (
        <QuotesView quarter={quarter} group={group} market={market ?? null} onMarket={m => setPath(m ? [{ dim: "country", key: m }] : [])} />
      ) : <>
      {error && <EmptyState message={`Hiếu đang fix, vui lòng đợi (${error})`} />}
      {!loading && <InsightBox lines={insights} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading || !total || !data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />) : (
          <>
            <StatTile icon={<TrendingUp className="w-4 h-4" />} accent="revenue" label={`Doanh thu ${data.quarter}`} value={formatCompactNumber(total.rev)}
              deltas={[
                ...(running ? [{ label: "Ước cả quý", value: formatCompactNumber(total.rev * factor), kind: "flat" as const }] : []),
                { label: `So quý ${data.prevQuarter.replace("-", "/")}${running ? " (theo ước cả quý)" : ""}`, value: `${(qoq(total.rev, total.revPrev) ?? 0).toFixed(1)}%`, kind: autoDeltaKind(qoq(total.rev, total.revPrev)) },
              ]} />
            <StatTile icon={<PieChart className="w-4 h-4" />} accent="margin" label="Lãi gộp" value={formatCompactNumber(total.gp)} unit={`biên ${gmPct(total.gp, total.rev).toFixed(1)}%`}
              deltas={[{ label: `Biên lãi quý ${data.prevQuarter.replace("-", "/")}`, value: `${gmPct(total.gpPrev, total.revPrev).toFixed(1)}%`, kind: autoDeltaKind(gmPct(total.gp, total.rev) - gmPct(total.gpPrev, total.revPrev)) }]} />
            <StatTile icon={<Globe2 className="w-4 h-4" />} accent="positive" label="Số thị trường có doanh thu" value={markets.filter(m => m.rev > 0).length}
              deltas={[{ label: `Quý ${data.prevQuarter.replace("-", "/")}`, value: markets.filter(m => m.revPrev > 0).length, kind: "flat" }]} />
            <StatTile icon={<Layers className="w-4 h-4" />} accent="neutral" label={`5 thị trường lớn nhất chiếm (${metricLabel.toLowerCase()})`} value={`${top5Share.toFixed(1)}%`}
              deltas={markets.slice(0, 3).map(m => ({ label: m.key, value: `${(val(m) / total[metric] * 100).toFixed(1)}%`, kind: "flat" as const }))} />
          </>
        )}
      </div>

      <Panel title={`15 thị trường bán nhiều nhất — mỗi thanh chia màu theo ${DIMENSION_LABEL[stackDim].toLowerCase()}`}
        desc={`Thanh càng dài = ${metricLabel.toLowerCase()} quý ${data?.quarter.replace("-", "/") ?? ""} càng lớn. Đổi cách chia màu ở nút bên phải. Bấm vào 1 thị trường để xem chi tiết bên dưới.`}
        action={<Segmented value={stackDim} onChange={setStackDim} items={STACK_DIMS.map(d => ({ key: d, label: DIMENSION_LABEL[d] }))} />}>
        <div className="h-[460px]">
          {loading || !marketStack ? <Skeleton className="w-full h-full" /> :
            <StackedBars rows={marketStack.rows} cols={marketStack.cols} colorFor={colorFor[stackDim]} horizontal onSelect={selectMarket} selected={market} />}
        </div>
        <LogicNote collapsible label="Cách tính">
          Doanh thu đã giao hàng, B2B + B2C (bỏ phí ship, bỏ đơn nội bộ), tính tới hôm qua. Thị trường = mã nước trong SKU (ký tự 3–5; nhóm nước như EU1/Global là 1 thị trường riêng).
          Dịch vụ: &quot;Data + SĐT local&quot; khi product có số local, &quot;Data + Call/SMS&quot; khi SKU có gọi (catalog Supabase), &quot;Chưa rõ&quot; khi SKU không có trong catalog.
          Hình thức = ký tự 2 SKU (eSIM/SIM/Data pack…), Loại gói = ký tự 8 (Daily/Fixed/Unlimited). {running && <>Quý đang chạy: &quot;so quý trước&quot; dùng ước cả quý (thực tế × {factor.toFixed(2)}) để so công bằng với quý trước đủ ngày.</>}
        </LogicNote>
        <Collapsible label="Xem bảng tất cả thị trường" action={exportBtn("country", markets)}>
          <DataTable columns={tableColumns("country", total?.[metric] ?? 0)} rows={markets} rowKey={r => r.key} pageSize={20}
            searchBy={r => r.key} searchPlaceholder="Tìm thị trường…" />
        </Collapsible>
      </Panel>

      {path.length > 0 && data && (
        <Panel title={<span className="flex flex-wrap items-center gap-1">
          <button onClick={() => setPath([])} className="text-slate-400 hover:text-brand-700"><Home className="w-4 h-4" /></button>
          {path.map((p, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <button onClick={() => setPath(path.slice(0, i + 1))} className={cn(i === path.length - 1 ? "text-slate-900" : "text-slate-500 hover:text-brand-700")}>
                <span className="text-[11px] text-slate-400 mr-1">{DIMENSION_LABEL[p.dim]}</span>{p.key}
              </button>
            </React.Fragment>
          ))}
        </span>} desc={`Mỗi thanh ngang = 100% ${metricLabel.toLowerCase()} chia theo phần: dòng trên là quý ${data.prevQuarter.replace("-", "/")}, dòng dưới là quý ${data.quarter.replace("-", "/")} — so 2 dòng để thấy phần nào tăng/giảm. Bấm biểu tượng ngôi nhà hoặc tên phía trên để quay lại.`}>
          {shares.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              {shares.map(s => (
                <div key={s.dim}>
                  <p className="text-xs font-semibold text-slate-500 mb-1">{DIMENSION_LABEL[s.dim]}</p>
                  <div className="h-[140px]"><StackedBars rows={s.rows} cols={s.cols} colorFor={colorFor[s.dim]} horizontal percent labelWidth={70} /></div>
                </div>
              ))}
            </div>
          )}
          <div className="grid lg:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">{metricLabel} từng tháng (6 tháng gần nhất) · màu = {DIMENSION_LABEL[trendDim].toLowerCase()}</p>
              <div className="h-[280px]">{trend && <StackedBars rows={trend.rows} cols={trend.cols} colorFor={colorFor[trendDim]} />}</div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">12 sản phẩm bán nhiều nhất · màu = nhà cung cấp · rê chuột xem là gói gì</p>
              <div className="h-[280px]">
                <RankBars rows={topSkus.map(r => ({ key: r.key, value: val(r), gm: gmPct(r.gp, r.rev), group: skuVendor.get(r.key) ?? "", desc: skuDesc.get(r.key) }))}
                  colorFor={colorFor.vendor} colorKey="Nhà cung cấp:" gmLabel="biên lãi" />
              </div>
            </div>
          </div>
          {level !== "country" && (
            <>
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-500 mb-1">Theo {DIMENSION_LABEL[level].toLowerCase()}: thanh xám = quý {data.prevQuarter.replace("-", "/")}, thanh xanh = quý {data.quarter.replace("-", "/")}{path.length < DRILL.length - 1 && " · bấm vào 1 dòng để xem sâu hơn"}</p>
                <div style={{ height: Math.min(420, 60 + scoped.slice(0, 15).length * 26) }}>
                  <StackedBars rows={scoped.slice(0, 15).map(r => ({ key: r.key, [data.prevQuarter]: valPrev(r), [data.quarter]: val(r) }))}
                    cols={[data.prevQuarter, data.quarter]} horizontal grouped labelWidth={level === "sku" ? 120 : 140}
                    onSelect={level !== "sku" ? drillTo : undefined} />
                </div>
              </div>
              <Collapsible label={`Xem bảng theo ${DIMENSION_LABEL[level].toLowerCase()} (${scoped.length})`} action={exportBtn(level, scoped)}>
                <DataTable columns={tableColumns(level, scopeTotal)} rows={scoped} rowKey={r => r.key} pageSize={20} searchBy={r => r.key} />
              </Collapsible>
            </>
          )}
        </Panel>
      )}
      </>}
    </div>
  )
}
