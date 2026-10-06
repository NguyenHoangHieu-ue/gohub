"use client"

import React, { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { BadgeDollarSign, ListChecks, MapPinned, ChevronDown, ChevronRight, Download, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatTile, Panel, DataTable, Skeleton, EmptyState, LogicNote } from "@/components/dashboard-kit"
import { exportAOA } from "@/lib/export-excel"
import type { QuoteCompareData, GapRow } from "@/lib/quote-sources"
import type { CompareRow } from "@/lib/quote-compare"
import { makeColorFor } from "./market-colors"
import VendorQuotesPanel, { quoteWins } from "./vendor-quotes-panel"
import { InsightBox, vnd, pctTxt } from "./market-help"

const chartLoading = () => <Skeleton className="w-full h-full" />
const StackedBars = dynamic(() => import("./market-charts").then(m => m.StackedBars), { ssr: false, loading: chartLoading })
const RankBars = dynamic(() => import("./market-charts").then(m => m.RankBars), { ssr: false, loading: chartLoading })

// Nhãn lời thường cho người không rành mã (Hiếu yêu cầu s225: "user khó tính, không hiểu nhiều vẫn xem là hiểu").
const PLAN_VI: Record<string, string> = { Daily: "theo ngày", Fixed: "trọn gói", Unlimited: "không giới hạn" }
const FORM_VI: Record<string, string> = { eSIM: "eSIM", SIM: "SIM vật lý", "Data pack": "nạp thêm data" }
const describe = (r: CompareRow) => `${r.market} · ${FORM_VI[r.form] ?? r.form} · ${r.size || PLAN_VI[r.plan]}`
const short = (label: string) => label.replace("BC Datapool ", "BC ").replace(" (đang chào)", " ★")

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

interface Action { key: string; market: string; from: string; to: string; n: number; save: number; baseCost: number; examples: CompareRow[] }

export default function QuotesView({ quarter, group, market, onMarket }: {
  quarter: string; group: string; market: string | null; onMarket: (m: string | null) => void
}) {
  const [data, setData] = useState<QuoteCompareData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [onlyCheaper, setOnlyCheaper] = useState(true)
  const [ver, setVer] = useState(0)
  const [quoteSrc, setQuoteSrc] = useState<string | null>(null)
  const [action, setAction] = useState<string | null>(null)
  const [gapSpec, setGapSpec] = useState(0)
  const [onlyNoRegional, setOnlyNoRegional] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    fetch(`/api/analytics/market/quotes?quarter=${quarter}&group=${group}${ver ? `&nocache=1&v=${ver}` : ""}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d })
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) { setError(e.message); setData(null) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [quarter, group, ver])

  const fx = data?.vndPerUsd ?? 0
  const toVnd = (usd: number | null | undefined) => usd === null || usd === undefined ? null : usd * fx
  const sourceColor = useMemo(() => makeColorFor((data?.sources ?? []).map(s => s.label)), [data])

  // Chọn 1 báo giá đang chào → chỉ xét sản phẩm báo giá đó rẻ hơn, coi báo giá đó là phương án đề xuất.
  const base = useMemo(() => {
    const rows = data?.rows ?? []
    if (!quoteSrc || !data) return rows
    return rows.flatMap(r => {
      const o = r.offers.find(x => x.source === quoteSrc)
      if (!o || r.baseUsd === null || o.usd >= r.baseUsd) return []
      const save = Math.round((r.baseUsd - o.usd) * 1000) / 1000
      return [{ ...r, best: o, savePerUnitUsd: save, savePct: +(save / r.baseUsd * 100).toFixed(1), saveQuarterVnd: Math.round(save * r.units * data.vndPerUsd) }]
    })
  }, [data, quoteSrc])
  const allCheaper = useMemo(() => base.filter(r => (r.savePerUnitUsd ?? 0) > 0 && r.best), [base])

  // "Việc nên làm": gộp theo thị trường × (nhà cung cấp hiện tại → nhà cung cấp rẻ hơn), xếp theo tiền tiết kiệm.
  const actions = useMemo(() => {
    const m = new Map<string, Action>()
    for (const r of allCheaper) {
      const key = `${r.market}|${r.vendor}|${r.best!.label}`
      const a = m.get(key) ?? { key, market: r.market, from: r.vendor, to: r.best!.label, n: 0, save: 0, baseCost: 0, examples: [] }
      a.n++; a.save += r.saveQuarterVnd ?? 0; a.baseCost += (r.baseUsd ?? 0) * r.units * fx
      a.examples.push(r)
      m.set(key, a)
    }
    return Array.from(m.values()).map(a => ({ ...a, examples: a.examples.sort((x, y) => (y.saveQuarterVnd ?? 0) - (x.saveQuarterVnd ?? 0)) }))
      .sort((x, y) => y.save - x.save)
  }, [allCheaper, fx])
  const act = actions.find(a => a.key === action) ?? null

  const scoped = useMemo(() => base.filter(r => (!market || r.market === market)
    && (!act || (r.market === act.market && r.vendor === act.from && r.best?.label === act.to))), [base, market, act])
  const cheaper = scoped.filter(r => (r.savePerUnitUsd ?? 0) > 0)
  const totalSave = cheaper.reduce((a, r) => a + (r.saveQuarterVnd ?? 0), 0)
  const totalBase = cheaper.reduce((a, r) => a + (r.baseUsd ?? 0) * r.units * fx, 0)

  const byMarket = useMemo(() => {
    const m = new Map<string, Record<string, number | string>>()
    for (const r of allCheaper) {
      const row = m.get(r.market) ?? { key: r.market }
      row[r.best!.label] = (Number(row[r.best!.label]) || 0) + (r.saveQuarterVnd ?? 0)
      m.set(r.market, row)
    }
    const total = (x: Record<string, number | string>) => Object.values(x).reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0)
    return Array.from(m.values()).sort((x, y) => total(y) - total(x)).slice(0, 15)
  }, [allCheaper])

  const check = useMemo(() => {
    const diffs = (data?.rows ?? []).filter(r => r.ownUsd !== null && r.currentUsd).map(r => Math.abs(r.ownUsd! - r.currentUsd!) / r.currentUsd! * 100).sort((x, y) => x - y)
    return diffs.length ? { n: diffs.length, median: diffs[Math.floor(diffs.length / 2)] } : null
  }, [data])

  const insights = useMemo(() => {
    if (!data) return []
    const out: React.ReactNode[] = []
    const s = allCheaper.reduce((a, r) => a + (r.saveQuarterVnd ?? 0), 0)
    const b = allCheaper.reduce((a, r) => a + (r.baseUsd ?? 0) * r.units * fx, 0)
    if (!allCheaper.length) out.push(<>Chưa thấy nhà cung cấp nào rẻ hơn giá đang nhập cho các sản phẩm bán trong quý {data.quarter.replace("-", "/")}.</>)
    else {
      out.push(<>Nếu đổi sang nhà cung cấp rẻ hơn cho <b>{allCheaper.length} sản phẩm</b>, mỗi quý tiết kiệm khoảng <b>{vnd(s)}</b> ({b ? pctTxt(s / b * 100, 0) : "—"} tiền đang nhập của chính các sản phẩm đó), tính theo số lượng đã bán quý {data.quarter.replace("-", "/")}.</>)
      const top = actions.slice(0, 3)
      out.push(<>Đáng làm trước: {top.map((a, i) => <span key={a.key}>{i > 0 && "; "}<b>{a.market}</b> — đổi {a.n} sản phẩm từ {a.from} sang {short(a.to)} (~{vnd(a.save)}/quý)</span>)}.</>)
    }
    const quotes = data.sources.filter(x => x.quoteId)
    if (quotes.length) out.push(<>Báo giá nhà cung cấp gửi: {quotes.map((q, i) => { const w = quoteWins(data.rows, q.id); return <span key={q.id}>{i > 0 && "; "}<b>{q.label.replace(" (đang chào)", "")}</b> rẻ hơn ở {w.skus} sản phẩm (~{vnd(w.saveUsd * fx)}/quý)</span> })}.</>)
    if (data.gaps.length) out.push(<>Có <b>{data.gaps.length} nước</b> đã có nơi báo giá nhưng GoHub chưa bán gói riêng — xem cuối trang.</>)
    out.push(<span className="text-slate-500">Đây mới là so <b>giá nhập</b>. Trước khi đổi cần kiểm thêm chất lượng mạng, yêu cầu định danh (KYC), số lượng đặt tối thiểu (MOQ).</span>)
    return out
  }, [data, allCheaper, actions, fx])

  if (error) return <EmptyState message={`Hiếu đang fix, vui lòng đợi (${error})`} />
  if (loading || !data) return <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>

  const rows = onlyCheaper ? cheaper : scoped
  const priceChips = (r: CompareRow) => (
    <span className="flex flex-wrap gap-1">
      {r.offers.map(o => (
        <span key={o.source} title={`${o.detail} (USD)`} className={cn("rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap border",
          o === r.best ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold" : "border-slate-200 text-slate-600")}>
          {short(o.label)}: {vnd(toVnd(o.usd))}{o.kyc ? " · cần KYC" : ""}
        </span>
      ))}
    </span>
  )
  const columns = [
    { key: "sku", label: "Sản phẩm", sortValue: (r: CompareRow) => r.sku, render: (r: CompareRow) => (
      <span><span className="font-mono text-xs">{r.sku}</span><span className="block text-[11px] text-slate-400">{describe(r)}</span></span>) },
    { key: "vendor", label: "Đang nhập từ", render: (r: CompareRow) => r.vendor, sortValue: (r: CompareRow) => r.vendor },
    { key: "cur", label: "Giá đang nhập", align: "right" as const, render: (r: CompareRow) => vnd(toVnd(r.baseUsd)), sortValue: (r: CompareRow) => r.baseUsd ?? 0 },
    { key: "best", label: "Rẻ nhất tìm được", render: (r: CompareRow) => r.best ? <span title={r.best.detail}><b>{vnd(toVnd(r.best.usd))}</b> <span className="text-slate-500 text-xs">{short(r.best.label)}</span></span> : "—", sortValue: (r: CompareRow) => r.best?.usd ?? 1e9 },
    { key: "pct", label: "Rẻ hơn", align: "right" as const, render: (r: CompareRow) => r.savePct !== null && r.savePct > 0 ? pctTxt(r.savePct, 0) : "—", sortValue: (r: CompareRow) => r.savePct ?? -1e9 },
    { key: "units", label: "Bán trong quý", align: "right" as const, render: (r: CompareRow) => r.units.toLocaleString("vi-VN"), sortValue: (r: CompareRow) => r.units },
    { key: "save", label: "Tiết kiệm/quý", align: "right" as const, render: (r: CompareRow) => (r.saveQuarterVnd ?? 0) > 0 ? <b className="text-emerald-700">{vnd(r.saveQuarterVnd)}</b> : "—", sortValue: (r: CompareRow) => r.saveQuarterVnd ?? -1e15 },
    { key: "offers", label: "Giá các nơi (rê chuột xem cách tính)", render: priceChips },
  ]
  const exportRows = () => void exportAOA(
    ["Sản phẩm (SKU)", "Mô tả", "Đang nhập từ", "Giá đang nhập (đ)", "Rẻ nhất tìm được", "Giá rẻ nhất (đ)", "Rẻ hơn (%)", "Bán trong quý", "Tiết kiệm/quý (đ)",
      ...data.sources.map(s => `Giá ${s.label} (đ)`)],
    rows.map(r => [r.sku, describe(r), r.vendor, Math.round(toVnd(r.baseUsd) ?? 0), r.best?.label ?? "", Math.round(toVnd(r.best?.usd) ?? 0), r.savePct ?? "", r.units, r.saveQuarterVnd ?? "",
      ...data.sources.map(s => { const o = r.offers.find(x => x.source === s.id); return o ? Math.round(o.usd * fx) : "" })]),
    `so-gia-nha-cung-cap_${quarter}_${group}${market ? `_${market}` : ""}`,
  )

  return (
    <div className="space-y-4">
      <InsightBox lines={insights} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile icon={<BadgeDollarSign className="w-4 h-4" />} accent="margin" label={`Có thể tiết kiệm mỗi quý${market ? ` · ${market}` : ""}`}
          value={vnd(totalSave)} deltas={[{ label: "so với tiền đang nhập các sản phẩm này", value: totalBase ? `−${pctTxt(totalSave / totalBase * 100, 0)}` : "—", kind: "up" }]} />
        <StatTile icon={<ListChecks className="w-4 h-4" />} accent="positive" label="Sản phẩm nên xem lại giá nhập" value={cheaper.length}
          deltas={[{ label: "có nhà cung cấp khác rẻ hơn", value: `${cheaper.length} / ${scoped.filter(r => r.offers.length).length}`, kind: "flat" }]} />
        <StatTile icon={<MapPinned className="w-4 h-4" />} accent="neutral" label="Nước chưa có gói riêng" value={data.gaps.length}
          deltas={[{ label: "đã có nơi báo giá — xem cuối trang", value: "", kind: "flat" }]} />
      </div>

      <Panel title="Việc nên làm — đổi nhà cung cấp ở đâu thì lợi nhất" desc="Mỗi dòng = 1 thị trường có nhiều sản phẩm nhập rẻ hơn được ở nơi khác. Bấm “Xem” để lọc biểu đồ và bảng bên dưới đúng nhóm đó.">
        {!actions.length ? <EmptyState message="Chưa có việc nào — không thấy giá rẻ hơn." /> : (
          <ol className="divide-y divide-slate-100">
            {actions.slice(0, 8).map((a, i) => (
              <li key={a.key} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2 px-1 rounded-md", action === a.key && "bg-brand-50")}>
                <span className="w-5 text-xs font-bold text-slate-400">{i + 1}.</span>
                <span className="flex-1 min-w-[260px] text-sm text-slate-700">
                  <b>{a.market}</b>: {a.n} sản phẩm đang nhập từ <b>{a.from}</b> <ArrowRight className="inline w-3.5 h-3.5 text-slate-400" /> nhập từ <b>{short(a.to)}</b> rẻ hơn
                  khoảng {a.baseCost ? pctTxt(a.save / a.baseCost * 100, 0) : "—"}
                  <span className="block text-[11px] text-slate-400">Ví dụ: {a.examples.slice(0, 2).map(e => `${describe(e)} (${vnd(toVnd(e.baseUsd))} → ${vnd(toVnd(e.best?.usd))})`).join("; ")}</span>
                </span>
                <span className="text-sm font-semibold text-emerald-700 whitespace-nowrap">~{vnd(a.save)}/quý</span>
                <button onClick={() => setAction(action === a.key ? null : a.key)} className="text-xs font-semibold text-brand-700 hover:underline">{action === a.key ? "Bỏ lọc" : "Xem"}</button>
              </li>
            ))}
          </ol>
        )}
        {actions.length > 8 && <p className="mt-1 text-[11px] text-slate-400">Còn {actions.length - 8} nhóm nhỏ hơn — xem trong bảng chi tiết.</p>}
      </Panel>

      <VendorQuotesPanel rows={data.rows} vndPerUsd={data.vndPerUsd} active={quoteSrc} onSelect={id => { setQuoteSrc(id); setAction(null) }} onChanged={() => setVer(v => v + 1)} />
      {(quoteSrc || act) && (
        <p className="text-xs rounded-lg bg-brand-50 border border-brand-100 px-3 py-2 text-brand-800">
          Đang lọc: {quoteSrc && <>chỉ báo giá <b>{data.sources.find(s => s.id === quoteSrc)?.label ?? "đã xoá"}</b> </>}{act && <>nhóm <b>{act.market}: {act.from} → {short(act.to)}</b></>}.{" "}
          <button onClick={() => { setQuoteSrc(null); setAction(null) }} className="underline font-semibold">Bỏ lọc</button>
        </p>
      )}

      <Panel title="Thị trường nào tiết kiệm được nhiều nhất?" desc="Thanh càng dài = tiết kiệm mỗi quý càng nhiều. Màu = nhà cung cấp rẻ hơn. Bấm 1 thị trường để lọc phần dưới.">
        <div className="h-[420px]">
          {byMarket.length ? <StackedBars rows={byMarket} cols={data.sources.map(s => s.label).filter(l => byMarket.some(r => r[l]))} colorFor={sourceColor}
            horizontal onSelect={k => onMarket(k === market ? null : k)} selected={market} labelWidth={150} /> : <EmptyState message="Không có sản phẩm nào có giá rẻ hơn." />}
        </div>
        <LogicNote collapsible label="Cách tính (cho người cần kiểm)">
          Với mỗi sản phẩm bán trong quý, tính &quot;giá nhập đầy đủ&quot; ở từng nơi cho đúng gói đó (đã cộng phí khung SIM/eSIM, đổi ra tiền Việt theo tỷ giá nội bộ tháng {data.fxMonth}).
          Nhà cung cấp tính theo GB (3HK, BC Datapool): GB tính tiền = dung lượng × tỷ lệ khách dùng thực tế (trọn gói {data.assumptions.fixedPct}, theo ngày {data.assumptions.dailyPct}) × giá/GB của nhà mạng rẻ nhất trong nước.
          Nhà cung cấp bán theo gói (WorldMove, báo giá gửi về): lấy gói rẻ nhất đủ dùng — dung lượng bằng hoặc hơn, số ngày bằng hoặc hơn tối đa 2 ngày, dùng được ở nước đó.
          Giá đang nhập = mức thấp hơn giữa giá vốn trong hệ thống và giá tính lại cùng cách ở nhà cung cấp hiện tại (để không thổi phồng tiết kiệm)
          {check && <> — tính lại lệch trung bình {pctTxt(check.median)} so với giá vốn thật ({check.n} sản phẩm)</>}.
          {data.skipped.length > 0 && <> Không so được: {data.skipped.map(s => `${s.reason} (${s.count})`).join("; ")}.</>}
          {" "}Nguồn giá: {data.sources.map(s => `${s.label} — ${s.note}`).join(" · ")}.
        </LogicNote>
      </Panel>

      <Panel title={`15 sản phẩm tiết kiệm nhiều nhất${market ? ` — ${market}` : ""}`} desc="Thanh = tiền tiết kiệm mỗi quý nếu đổi. Màu = nhà cung cấp rẻ hơn. Rê chuột xem là gói gì."
        action={market ? <button onClick={() => onMarket(null)} className="text-xs font-semibold text-brand-700 hover:underline">Bỏ lọc {market}</button> : undefined}>
        <div className="h-[380px]">
          <RankBars rows={cheaper.slice(0, 15).map(r => ({ key: r.sku, value: r.saveQuarterVnd ?? 0, gm: r.savePct ?? 0, group: r.best?.label ?? "", desc: describe(r) }))}
            colorFor={sourceColor} colorKey="Nhập rẻ hơn ở:" labelWidth={120} gmLabel="rẻ hơn" fmt={v => vnd(v)} />
        </div>
        <Collapsible label={`Xem bảng chi tiết (${rows.length} sản phẩm)`} action={
          <span className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={onlyCheaper} onChange={e => setOnlyCheaper(e.target.checked)} />Chỉ sản phẩm có nơi rẻ hơn</label>
            <button onClick={exportRows} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700"><Download className="w-3.5 h-3.5" />Excel</button>
          </span>}>
          <DataTable columns={columns} rows={rows} rowKey={r => r.sku} pageSize={20} searchBy={r => `${r.sku} ${describe(r)} ${r.vendor}`} searchPlaceholder="Tìm sản phẩm / nước / nhà cung cấp…" />
        </Collapsible>
      </Panel>

      <Panel title="Nước chưa có gói riêng nhưng đã có nơi báo giá"
        desc="Cơ hội mở sản phẩm mới. Thanh = giá nhập rẻ nhất (eSIM) cho gói mẫu chọn bên phải. Một số nước đã bán trong gói chung nhiều nước (xem bảng)."
        action={<span className="flex flex-wrap items-center gap-2">
          <select value={gapSpec} onChange={e => setGapSpec(Number(e.target.value))} className="text-xs border border-slate-200 rounded-lg px-2 py-1">
            {(data.gaps[0]?.ref ?? []).map((r, i) => <option key={r.spec} value={i}>{r.spec}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={onlyNoRegional} onChange={e => setOnlyNoRegional(e.target.checked)} />Chỉ nước chưa bán dưới mọi hình thức</label>
        </span>}>
        {(() => {
          const gaps = data.gaps.filter(g => !onlyNoRegional || !g.regional.length)
          const priced = gaps.filter(g => g.ref[gapSpec]?.best).sort((x, y) => x.ref[gapSpec].best!.usd - y.ref[gapSpec].best!.usd).slice(0, 40)
          const gapCols = [
            { key: "name", label: "Nước", render: (g: GapRow) => <span className="font-medium">{g.name}</span>, sortValue: (g: GapRow) => g.name },
            { key: "regional", label: "Đang bán trong gói chung", render: (g: GapRow) => g.regional.join(", ") || <span className="text-amber-600">Chưa bán dưới hình thức nào</span>, sortValue: (g: GapRow) => g.regional.length },
            { key: "sources", label: "Nơi có báo giá", render: (g: GapRow) => g.sources.map(short).join(", "), sortValue: (g: GapRow) => g.sources.length },
            ...(data.gaps[0]?.ref ?? []).map((r, i) => ({
              key: `ref${i}`, label: r.spec, align: "right" as const, sortValue: (g: GapRow) => g.ref[i]?.best?.usd ?? 1e9,
              render: (g: GapRow) => g.ref[i]?.best ? <span title={g.ref[i].best!.detail}>{vnd(toVnd(g.ref[i].best!.usd))} <span className="text-[10px] text-slate-400">{short(g.ref[i].best!.label)}</span></span> : "—",
            })),
          ]
          return <>
            <div style={{ height: Math.max(160, 40 + priced.length * 22) }}>
              {priced.length ? <RankBars rows={priced.map(g => ({ key: g.name, value: (g.ref[gapSpec].best!.usd) * fx, gm: 0, group: g.ref[gapSpec].best!.label, desc: g.regional.length ? `đang bán trong: ${g.regional.join(", ")}` : "chưa bán dưới hình thức nào" }))}
                colorFor={sourceColor} colorKey="Rẻ nhất ở:" labelWidth={150} gmLabel="" fmt={v => vnd(v)} /> : <EmptyState message="Không có nước nào." />}
            </div>
            <Collapsible label={`Xem bảng (${gaps.length} nước)`} action={
              <button onClick={() => void exportAOA(["Nước", "Đang bán trong gói chung", "Nơi có báo giá", ...(data.gaps[0]?.ref ?? []).flatMap(r => [`${r.spec} (đ)`, `${r.spec} — nơi`])],
                gaps.map(g => [g.name, g.regional.join(", "), g.sources.join(", "), ...g.ref.flatMap(r => [r.best ? Math.round(r.best.usd * fx) : "", r.best?.label ?? ""])]), `nuoc-chua-ban_${quarter}`)}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700"><Download className="w-3.5 h-3.5" />Excel</button>}>
              <DataTable columns={gapCols} rows={gaps} rowKey={g => g.iso} pageSize={20} searchBy={g => g.name} searchPlaceholder="Tìm nước…" />
            </Collapsible>
          </>
        })()}
      </Panel>
    </div>
  )
}
