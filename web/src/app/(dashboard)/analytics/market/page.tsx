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

const chartLoading = () => <Skeleton className="w-full h-full" />
const StackedBars = dynamic(() => import("./market-charts").then(m => m.StackedBars), { ssr: false, loading: chartLoading })
const RankBars = dynamic(() => import("./market-charts").then(m => m.RankBars), { ssr: false, loading: chartLoading })

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
  const [quarter, setQuarter] = useState(quarters[quarters.length - 1])
  const [group, setGroup] = useState<Group>("ALL")
  const [metric, setMetric] = useState<Metric>("rev")
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
  const metricLabel = metric === "rev" ? "Doanh thu" : "GP"

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
  const vendorCols = useMemo(() => data && path.length ? groupBy(data, "vendor", filter, metric).slice(0, TOP_COLS).map(r => r.key) : [], [data, filter, metric, path.length])

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
      if (dim === "sku") return <span className={cls}>{r.key}</span>
      const go = dim === "country" ? () => selectMarket(r.key) : () => drillTo(r.key)
      return <button onClick={go} className={cn(cls, "hover:text-brand-700 hover:underline")}>{r.key}</button>
    } },
    { key: "rev", label: "Doanh thu", align: "right" as const, render: (r: GroupRow) => formatCompactNumber(r.rev), sortValue: (r: GroupRow) => r.rev },
    ...(running ? [{ key: "proj", label: "Dự phóng quý", align: "right" as const, render: (r: GroupRow) => formatCompactNumber(r.rev * factor), sortValue: (r: GroupRow) => r.rev }] : []),
    { key: "revPrev", label: data?.prevQuarter ?? "Quý trước", align: "right" as const, render: (r: GroupRow) => formatCompactNumber(r.revPrev), sortValue: (r: GroupRow) => r.revPrev },
    { key: "qoq", label: "%QoQ", align: "right" as const, render: (r: GroupRow) => deltaPill(r.rev, r.revPrev), sortValue: (r: GroupRow) => qoq(r.rev, r.revPrev) ?? -1e9 },
    { key: "share", label: "Tỷ trọng", align: "right" as const, render: (r: GroupRow) => base ? `${(val(r) / base * 100).toFixed(1)}%` : "—", sortValue: (r: GroupRow) => val(r) },
    { key: "gp", label: "GP", align: "right" as const, render: (r: GroupRow) => formatCompactNumber(r.gp), sortValue: (r: GroupRow) => r.gp },
    { key: "gm", label: "GM%", align: "right" as const, render: (r: GroupRow) => `${gmPct(r.gp, r.rev).toFixed(1)}%`, sortValue: (r: GroupRow) => gmPct(r.gp, r.rev) },
    { key: "gmPrev", label: "GM% trước", align: "right" as const, render: (r: GroupRow) => `${gmPct(r.gpPrev, r.revPrev).toFixed(1)}%`, sortValue: (r: GroupRow) => gmPct(r.gpPrev, r.revPrev) },
    { key: "units", label: "Units", align: "right" as const, render: (r: GroupRow) => r.units.toLocaleString("vi-VN"), sortValue: (r: GroupRow) => r.units },
    ...(dim !== "sku" ? [{ key: "skus", label: "Số SKU", align: "right" as const, render: (r: GroupRow) => r.skuCount, sortValue: (r: GroupRow) => r.skuCount }] : []),
  ]

  const exportRows = (dim: Dimension, rows: GroupRow[]) => {
    const name = [quarter, group, ...path.map(p => p.key), DIMENSION_LABEL[dim]].join("_").replace(/[^\w-]+/g, "-")
    void exportAOA(
      [DIMENSION_LABEL[dim], "Doanh thu", "Dự phóng quý", data?.prevQuarter ?? "Quý trước", "%QoQ", "GP", "GM%", "GM% trước", "Units", "Số SKU"],
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

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Globe2 className="w-6 h-6 text-brand-600" />Thị trường & Báo giá</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Thị trường nào đang chiếm chủ yếu, vendor/loại sản phẩm/SKU phân bố ra sao — so quý trước.
            {data && <> Dữ liệu tới {data.cutoff}.</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={quarter} onChange={setQuarter} items={quarters.map(q => ({ key: q, label: q.replace("-", " ") }))} />
          <Segmented value={group} onChange={setGroup} items={[{ key: "ALL", label: "Tất cả" }, { key: "B2B", label: "B2B" }, { key: "B2C", label: "B2C" }]} />
          <Segmented value={metric} onChange={setMetric} items={[{ key: "rev", label: "Doanh thu" }, { key: "gp", label: "GP" }]} />
          <button onClick={() => load(true)} aria-label="Tải lại mới" className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200">
            <RefreshCw className={cn("w-4 h-4 text-slate-500", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && <EmptyState message={`Hiếu đang fix, vui lòng đợi (${error})`} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading || !total || !data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />) : (
          <>
            <StatTile icon={<TrendingUp className="w-4 h-4" />} accent="revenue" label={`Doanh thu ${data.quarter}`} value={formatCompactNumber(total.rev)}
              deltas={[
                ...(running ? [{ label: `Dự phóng quý (×${factor.toFixed(2)})`, value: formatCompactNumber(total.rev * factor), kind: "flat" as const }] : []),
                { label: `vs ${data.prevQuarter}${running ? " (dự phóng)" : ""}`, value: `${(qoq(total.rev, total.revPrev) ?? 0).toFixed(1)}%`, kind: autoDeltaKind(qoq(total.rev, total.revPrev)) },
              ]} />
            <StatTile icon={<PieChart className="w-4 h-4" />} accent="margin" label="GP · GM%" value={formatCompactNumber(total.gp)} unit={`${gmPct(total.gp, total.rev).toFixed(1)}%`}
              deltas={[{ label: `GM% ${data.prevQuarter}`, value: `${gmPct(total.gpPrev, total.revPrev).toFixed(1)}%`, kind: autoDeltaKind(gmPct(total.gp, total.rev) - gmPct(total.gpPrev, total.revPrev)) }]} />
            <StatTile icon={<Globe2 className="w-4 h-4" />} accent="positive" label="Số thị trường có doanh thu" value={markets.filter(m => m.rev > 0).length}
              deltas={[{ label: data.prevQuarter, value: markets.filter(m => m.revPrev > 0).length, kind: "flat" }]} />
            <StatTile icon={<Layers className="w-4 h-4" />} accent="neutral" label={`Top 5 thị trường chiếm (${metricLabel})`} value={`${top5Share.toFixed(1)}%`}
              deltas={markets.slice(0, 3).map(m => ({ label: m.key, value: `${(val(m) / total[metric] * 100).toFixed(1)}%`, kind: "flat" as const }))} />
          </>
        )}
      </div>

      <Panel title={`Top 15 thị trường — ${metricLabel} ${data?.quarter ?? ""} chia theo ${DIMENSION_LABEL[stackDim].toLowerCase()}`}
        desc="Bấm vào 1 thị trường để xem chi tiết bên dưới."
        action={<Segmented value={stackDim} onChange={setStackDim} items={STACK_DIMS.map(d => ({ key: d, label: DIMENSION_LABEL[d] }))} />}>
        <div className="h-[460px]">
          {loading || !marketStack ? <Skeleton className="w-full h-full" /> :
            <StackedBars rows={marketStack.rows} cols={marketStack.cols} horizontal onSelect={selectMarket} selected={market} />}
        </div>
        <LogicNote collapsible label="Cách tính">
          Doanh thu fulfilled B2B + B2C (bỏ phí ship, bỏ đơn nội bộ), tới hôm qua. Thị trường = mã nước trong SKU (ký tự 3–5; nhóm nước như EU1/Global là 1 thị trường riêng).
          Dịch vụ: &quot;Data + SĐT local&quot; khi product có số local, &quot;Data + Call/SMS&quot; khi SKU có gọi (catalog Supabase), &quot;Chưa rõ&quot; khi SKU không có trong catalog.
          Hình thức = ký tự 2 SKU (eSIM/SIM/Data pack…), Loại gói = ký tự 8 (Daily/Fixed/Unlimited). {running && <>Quý đang chạy: %QoQ so dự phóng (thực tế × {factor.toFixed(2)}) với quý trước đủ.</>}
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
        </span>} desc={`Tỷ trọng ${metricLabel.toLowerCase()} ${data.prevQuarter} so ${data.quarter} · bấm thanh ở bảng/biểu đồ để đi sâu.`}>
          {shares.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              {shares.map(s => (
                <div key={s.dim}>
                  <p className="text-xs font-semibold text-slate-500 mb-1">{DIMENSION_LABEL[s.dim]}</p>
                  <div className="h-[140px]"><StackedBars rows={s.rows} cols={s.cols} horizontal percent labelWidth={70} /></div>
                </div>
              ))}
            </div>
          )}
          <div className="grid lg:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">{metricLabel} theo tháng · chia theo {DIMENSION_LABEL[trendDim].toLowerCase()}</p>
              <div className="h-[280px]">{trend && <StackedBars rows={trend.rows} cols={trend.cols} />}</div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">Top 12 SKU {data.quarter} · màu theo vendor</p>
              <div className="h-[280px]">
                <RankBars rows={topSkus.map(r => ({ key: r.key, value: val(r), gm: gmPct(r.gp, r.rev), group: skuVendor.get(r.key) ?? "" }))}
                  colors={vendorCols} colorKey="Vendor" />
              </div>
            </div>
          </div>
          {level !== "country" && (
            <>
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-500 mb-1">Theo {DIMENSION_LABEL[level].toLowerCase()} — {data.quarter} vs {data.prevQuarter}{path.length < DRILL.length - 1 && " · bấm để đi sâu"}</p>
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
    </div>
  )
}
