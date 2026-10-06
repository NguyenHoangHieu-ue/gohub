"use client"

import React, { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { BadgeDollarSign, CheckCircle2, ListChecks, Scale, ChevronDown, ChevronRight, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatTile, Panel, DataTable, Skeleton, EmptyState, LogicNote } from "@/components/dashboard-kit"
import { formatCompactNumber } from "@/lib/analytics-formatters"
import { exportAOA } from "@/lib/export-excel"
import type { QuoteCompareData, GapRow } from "@/lib/quote-sources"
import type { CompareRow } from "@/lib/quote-compare"
import { makeColorFor } from "./market-colors"
import VendorQuotesPanel from "./vendor-quotes-panel"

const chartLoading = () => <Skeleton className="w-full h-full" />
const StackedBars = dynamic(() => import("./market-charts").then(m => m.StackedBars), { ssr: false, loading: chartLoading })
const RankBars = dynamic(() => import("./market-charts").then(m => m.RankBars), { ssr: false, loading: chartLoading })

const usd = (v: number | null | undefined) => v === null || v === undefined ? "—" : `$${v.toFixed(2)}`

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

export default function QuotesView({ quarter, group, market, onMarket }: {
  quarter: string; group: string; market: string | null; onMarket: (m: string | null) => void
}) {
  const [data, setData] = useState<QuoteCompareData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [onlyCheaper, setOnlyCheaper] = useState(true)
  const [ver, setVer] = useState(0)
  const [quoteSrc, setQuoteSrc] = useState<string | null>(null)
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

  const sourceColor = useMemo(() => makeColorFor((data?.sources ?? []).map(s => s.label)), [data])
  // Chọn 1 báo giá đang chào → chỉ xét SKU báo giá đó rẻ hơn mốc hiện tại, coi báo giá đó là phương án đề xuất.
  const scoped = useMemo(() => {
    const base = (data?.rows ?? []).filter(r => !market || r.market === market)
    if (!quoteSrc || !data) return base
    return base.flatMap(r => {
      const o = r.offers.find(x => x.source === quoteSrc)
      if (!o || r.baseUsd === null || o.usd >= r.baseUsd) return []
      const save = Math.round((r.baseUsd - o.usd) * 1000) / 1000
      return [{ ...r, best: o, savePerUnitUsd: save, savePct: +(save / r.baseUsd * 100).toFixed(1), saveQuarterVnd: Math.round(save * r.units * data.vndPerUsd) }]
    })
  }, [data, market, quoteSrc])
  const cheaper = scoped.filter(r => (r.savePerUnitUsd ?? 0) > 0)
  const totalSave = cheaper.reduce((a, r) => a + (r.saveQuarterVnd ?? 0), 0)

  // Kiểm chứng công thức: giá tính lại của CHÍNH vendor hiện tại so với COGS thật trong hệ thống.
  const check = useMemo(() => {
    const diffs: number[] = []
    for (const r of scoped) if (r.ownUsd !== null && r.currentUsd) diffs.push(Math.abs(r.ownUsd - r.currentUsd) / r.currentUsd * 100)
    diffs.sort((x, y) => x - y)
    return { n: diffs.length, median: diffs.length ? diffs[Math.floor(diffs.length / 2)] : null }
  }, [scoped])

  const byMarket = useMemo(() => {
    const m = new Map<string, Record<string, number | string>>()
    for (const r of quoteSrc ? scoped : data?.rows ?? []) {
      if ((r.savePerUnitUsd ?? 0) <= 0 || !r.best) continue
      const row = m.get(r.market) ?? { key: r.market }
      row[r.best.label] = (Number(row[r.best.label]) || 0) + (r.saveQuarterVnd ?? 0)
      m.set(r.market, row)
    }
    const total = (x: Record<string, number | string>) => Object.values(x).reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0)
    return Array.from(m.values()).sort((x, y) => total(y) - total(x)).slice(0, 15)
  }, [data, quoteSrc, scoped])

  if (error) return <EmptyState message={`Hiếu đang fix, vui lòng đợi (${error})`} />
  if (loading || !data) return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>

  const rows = onlyCheaper ? cheaper : scoped
  const offerCell = (r: CompareRow) => (
    <span className="flex flex-wrap gap-1">
      {r.offers.map(o => (
        <span key={o.source} title={o.detail} className={cn("rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap border",
          o === r.best ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold" : "border-slate-200 text-slate-600")}>
          {o.label.replace("BC Datapool ", "BC ")} {usd(o.usd)}{o.kyc ? " · KYC" : ""}
        </span>
      ))}
    </span>
  )
  const columns = [
    { key: "sku", label: "SKU", render: (r: CompareRow) => <span className="font-mono text-xs">{r.sku}</span>, sortValue: (r: CompareRow) => r.sku },
    { key: "market", label: "Thị trường", render: (r: CompareRow) => r.market, sortValue: (r: CompareRow) => r.market },
    { key: "vendor", label: "Vendor hiện tại", render: (r: CompareRow) => r.vendor, sortValue: (r: CompareRow) => r.vendor },
    { key: "spec", label: "Gói", render: (r: CompareRow) => <span className="text-xs">{r.form} · {r.plan} · {r.size}</span>, sortValue: (r: CompareRow) => r.size },
    { key: "units", label: "Units quý", align: "right" as const, render: (r: CompareRow) => r.units.toLocaleString("vi-VN"), sortValue: (r: CompareRow) => r.units },
    { key: "cur", label: "COGS hiện tại", align: "right" as const, render: (r: CompareRow) => usd(r.currentUsd), sortValue: (r: CompareRow) => r.currentUsd ?? 0 },
    { key: "offers", label: "Giá full các vendor (rê chuột xem công thức)", render: offerCell },
    { key: "pct", label: "Rẻ hơn", align: "right" as const, render: (r: CompareRow) => r.savePct === null ? "—" : `${r.savePct > 0 ? "" : "+"}${(-r.savePct).toFixed(1)}%`, sortValue: (r: CompareRow) => r.savePct ?? -1e9 },
    { key: "save", label: "Tiết kiệm/quý", align: "right" as const, render: (r: CompareRow) => (r.saveQuarterVnd ?? 0) > 0 ? formatCompactNumber(r.saveQuarterVnd) : "—", sortValue: (r: CompareRow) => r.saveQuarterVnd ?? -1e15 },
  ]
  const exportRows = () => void exportAOA(
    ["SKU", "Thị trường", "Vendor hiện tại", "Hình thức", "Loại gói", "Gói", "Units quý", "COGS hiện tại (USD)", "Rẻ nhất", "Giá rẻ nhất (USD)", "Rẻ hơn %", "Tiết kiệm/quý (VND)",
      ...data.sources.map(s => `${s.label} (USD)`)],
    rows.map(r => [r.sku, r.market, r.vendor, r.form, r.plan, r.size, r.units, r.currentUsd ?? "", r.best?.label ?? "", r.best?.usd ?? "", r.savePct ?? "", r.saveQuarterVnd ?? "",
      ...data.sources.map(s => r.offers.find(o => o.source === s.id)?.usd ?? "")]),
    `so-gia-vendor_${quarter}_${group}${market ? `_${market}` : ""}`,
  )

  return (
    <div className="space-y-4">
      <VendorQuotesPanel rows={data.rows} vndPerUsd={data.vndPerUsd} active={quoteSrc} onSelect={setQuoteSrc} onChanged={() => setVer(v => v + 1)} />
      {quoteSrc && (
        <p className="text-xs rounded-lg bg-brand-50 border border-brand-100 px-3 py-2 text-brand-800">
          Đang xem riêng báo giá <b>{data.sources.find(s => s.id === quoteSrc)?.label ?? "đã xoá"}</b>: các số dưới = SKU báo giá này rẻ hơn mốc hiện tại.{" "}
          <button onClick={() => setQuoteSrc(null)} className="underline font-semibold">Xem tất cả nguồn</button>
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={<BadgeDollarSign className="w-4 h-4" />} accent="margin" label={`Tiết kiệm tiềm năng / quý${market ? ` · ${market}` : ""}`}
          value={formatCompactNumber(totalSave)} unit="VND"
          deltas={[{ label: `Theo sản lượng ${data.quarter}`, value: `${cheaper.length} SKU`, kind: "up" }]} />
        <StatTile icon={<ListChecks className="w-4 h-4" />} accent="neutral" label="SKU so được" value={scoped.filter(r => r.offers.length).length}
          deltas={[{ label: "Bỏ qua (xem ghi chú)", value: data.skipped.reduce((a, s) => a + s.count, 0), kind: "flat" }]} />
        <StatTile icon={<Scale className="w-4 h-4" />} accent="positive" label="SKU có vendor rẻ hơn" value={cheaper.length}
          deltas={[{ label: "trên số SKU so được", value: `${scoped.filter(r => r.offers.length).length ? (cheaper.length / scoped.filter(r => r.offers.length).length * 100).toFixed(0) : 0}%`, kind: "flat" }]} />
        <StatTile icon={<CheckCircle2 className="w-4 h-4" />} accent="neutral" label="Kiểm chứng công thức" value={check.median === null ? "—" : `±${check.median.toFixed(1)}%`}
          deltas={[{ label: `Lệch trung vị giá tính lại vs COGS thật (${check.n} SKU)`, value: "", kind: "flat" }]} />
      </div>

      <Panel title="Tiết kiệm tiềm năng theo thị trường — màu = vendor rẻ nhất" desc="Bấm 1 thị trường để lọc phần dưới. Chỉ tính SKU có phương án rẻ hơn COGS hiện tại.">
        <div className="h-[420px]">
          {byMarket.length ? <StackedBars rows={byMarket} cols={data.sources.map(s => s.label).filter(l => byMarket.some(r => r[l]))} colorFor={sourceColor}
            horizontal onSelect={k => onMarket(k === market ? null : k)} selected={market} labelWidth={140} /> : <EmptyState message="Không có SKU nào có phương án rẻ hơn." />}
        </div>
        <LogicNote collapsible label="Cách tính">
          Giá full (USD) mỗi vendor cho đúng gói của SKU. Datapool (3HK, BC CMHK/Singtel): GB tính giá theo Công thức Datapool (Fixed × {data.assumptions.fixedPct}, Daily × {data.assumptions.dailyPct},
          Unlimited theo GB/ngày) × giá/GB của nhà mạng rẻ nhất trong nước (gói nhiều nước: lấy nước đắt nhất) + phí khung eSIM/SIM của vendor
          (3HK: SKU khung 3D trong hệ thống; BC: phí eSIM CNY + IMSI, SIM trắng + IMSI). WorldMove: gói eSIM khớp đúng nước/loại/dung lượng/ngày; SIM = eSIM + SKU khung WM.
          Data pack không cộng khung. Tỷ giá nội bộ tháng {data.fxMonth}. Tiết kiệm = (COGS hiện tại − giá rẻ nhất của vendor KHÁC vendor hiện tại) × units quý.
          {data.skipped.length > 0 && <> Bỏ qua: {data.skipped.map(s => `${s.reason} (${s.count})`).join("; ")}.</>}
          {data.unresolvedNames.length > 0 && <> Tên nước trong báo giá chưa nhận ra: {data.unresolvedNames.join(", ")}.</>}
          {" "}Nguồn: {data.sources.map(s => `${s.label} — ${s.note}`).join(" · ")}.
        </LogicNote>
      </Panel>

      <Panel title={`Top 15 SKU tiết kiệm nhiều nhất${market ? ` — ${market}` : ""}`} desc="Màu = vendor rẻ nhất. Rê chuột xem số tiền/quý."
        action={market ? <button onClick={() => onMarket(null)} className="text-xs font-semibold text-brand-700 hover:underline">Bỏ lọc {market}</button> : undefined}>
        <div className="h-[380px]">
          <RankBars rows={cheaper.slice(0, 15).map(r => ({ key: r.sku, value: r.saveQuarterVnd ?? 0, gm: r.savePct ?? 0, group: r.best?.label ?? "" }))}
            colorFor={sourceColor} colorKey="Rẻ nhất:" labelWidth={120} gmLabel="rẻ hơn" />
        </div>
        <Collapsible label={`Xem bảng so giá (${rows.length} SKU)`} action={
          <span className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={onlyCheaper} onChange={e => setOnlyCheaper(e.target.checked)} />Chỉ SKU có vendor rẻ hơn</label>
            <button onClick={exportRows} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700"><Download className="w-3.5 h-3.5" />Excel</button>
          </span>}>
          <DataTable columns={columns} rows={rows} rowKey={r => r.sku} pageSize={20} searchBy={r => `${r.sku} ${r.market} ${r.vendor}`} searchPlaceholder="Tìm SKU / thị trường / vendor…" />
        </Collapsible>
      </Panel>

      <Panel title="Destination chưa bán — có báo giá nhưng GoHub chưa có sản phẩm riêng cho nước đó"
        desc={`Giá full rẻ nhất (eSIM) cho gói tham chiếu, màu = vendor. ${data.gaps.filter(g => !g.regional.length).length}/${data.gaps.length} nước chưa nằm trong cả gói nhiều nước nào.`}
        action={<span className="flex flex-wrap items-center gap-2">
          <select value={gapSpec} onChange={e => setGapSpec(Number(e.target.value))} className="text-xs border border-slate-200 rounded-lg px-2 py-1">
            {(data.gaps[0]?.ref ?? []).map((r, i) => <option key={r.spec} value={i}>{r.spec}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={onlyNoRegional} onChange={e => setOnlyNoRegional(e.target.checked)} />Chưa có cả trong gói nhiều nước</label>
        </span>}>
        {(() => {
          const gaps = data.gaps.filter(g => !onlyNoRegional || !g.regional.length)
          const priced = gaps.filter(g => g.ref[gapSpec]?.best).sort((x, y) => x.ref[gapSpec].best!.usd - y.ref[gapSpec].best!.usd).slice(0, 40)
          const gapCols = [
            { key: "name", label: "Nước", render: (g: GapRow) => <span className="font-medium">{g.name} <span className="text-slate-400 text-xs">{g.iso}</span></span>, sortValue: (g: GapRow) => g.name },
            { key: "regional", label: "Đang có trong gói nhiều nước", render: (g: GapRow) => g.regional.join(", ") || <span className="text-amber-600">Chưa có</span>, sortValue: (g: GapRow) => g.regional.length },
            { key: "sources", label: "Vendor có báo giá", render: (g: GapRow) => g.sources.join(", "), sortValue: (g: GapRow) => g.sources.length },
            ...(data.gaps[0]?.ref ?? []).map((r, i) => ({
              key: `ref${i}`, label: r.spec, align: "right" as const, sortValue: (g: GapRow) => g.ref[i]?.best?.usd ?? 1e9,
              render: (g: GapRow) => g.ref[i]?.best ? <span title={g.ref[i].best!.detail}>{usd(g.ref[i].best!.usd)} <span className="text-[10px] text-slate-400">{g.ref[i].best!.label.replace("BC Datapool ", "BC ")}</span></span> : "—",
            })),
          ]
          return <>
            <div style={{ height: Math.max(160, 40 + priced.length * 22) }}>
              {priced.length ? <RankBars rows={priced.map(g => ({ key: g.name, value: g.ref[gapSpec].best!.usd, gm: 0, group: g.ref[gapSpec].best!.label }))}
                colorFor={sourceColor} colorKey="Rẻ nhất:" labelWidth={150} gmLabel="" fmt={v => `$${v.toFixed(2)}`} /> : <EmptyState message="Không có nước nào." />}
            </div>
            <Collapsible label={`Xem bảng destination chưa bán (${gaps.length})`} action={
              <button onClick={() => void exportAOA(["Nước", "ISO", "Gói nhiều nước đang có", "Vendor có báo giá", ...(data.gaps[0]?.ref ?? []).flatMap(r => [`${r.spec} (USD)`, `${r.spec} vendor`])],
                gaps.map(g => [g.name, g.iso, g.regional.join(", "), g.sources.join(", "), ...g.ref.flatMap(r => [r.best?.usd ?? "", r.best?.label ?? ""])]), `destination-chua-ban_${quarter}`)}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700"><Download className="w-3.5 h-3.5" />Excel</button>}>
              <DataTable columns={gapCols} rows={gaps} rowKey={g => g.iso} pageSize={20} searchBy={g => `${g.name} ${g.iso}`} searchPlaceholder="Tìm nước…" />
            </Collapsible>
          </>
        })()}
      </Panel>
    </div>
  )
}
