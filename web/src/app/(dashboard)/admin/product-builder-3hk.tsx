"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Eye, Plus, Trash2, X } from "lucide-react"
import type { Skipped } from "@/lib/bc-datapool/dedupe"
import type { Assumptions, Fx, SimType } from "@/lib/bc-datapool/types"
import { POLICY_KIND, POLICY_LABEL, PRODUCT_HEADERS, SKU_HEADERS, type Frames, type Policy, type ThkBuildResult } from "@/lib/threehk-datapool/builder"
import type { NccRow } from "@/lib/threehk-datapool/resolve"

type Notify = (type: "success" | "error", text: string) => void
interface Options { ncc: NccRow[]; assumptions: Assumptions; frames: Frames; fx: (Fx & { month?: string }) | null; fxError: string | null }
interface PreviewResult extends ThkBuildResult { fx: Fx; skipped: Skipped; nothingNew: boolean; supports: { code: string; hint: string }[] }
interface PlanForm { policy: Policy; amount: string; unit: "MB" | "GB"; days: number[] }
interface ProductForm { simType: SimType; countries: string[]; codeOverride: string; plans: PlanForm[] }

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 20, 25, 30]
const COMMON_DAYS = [1, 2, 3, 5, 7, 10, 15, 20, 30]
const POLICIES: Policy[] = ["F", "P", "T", "X"]
const input = "w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900"
const label = "block text-[11px] text-gray-500 mb-0.5"
const btn = "px-2 py-0.5 text-[11px] border border-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800"

const newPlan = (policy: Policy = "F"): PlanForm => ({ policy, amount: policy === "X" ? "3" : policy === "F" ? "5" : "1", unit: "GB", days: policy === "X" ? [3, 5, 7, 10] : [3, 5, 7, 10, 15, 30] })
const newProduct = (): ProductForm => ({ simType: "eSIM", countries: [], codeOverride: "", plans: [newPlan()] })

export default function ProductBuilder3hk({ onNotify }: { onNotify: Notify }) {
  const [opts, setOpts] = useState<Options | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [products, setProducts] = useState<ProductForm[]>([newProduct()])
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [stale, setStale] = useState(false)
  const [sheet, setSheet] = useState<"skuUS" | "skuVN" | "productUS" | "productVN" | "cost">("cost")
  const [busy, setBusy] = useState<"" | "preview" | "export">("")

  useEffect(() => {
    fetch("/api/admin/threehk-datapool").then(async r => {
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Lỗi tải dữ liệu")
      setOpts(j)
    }).catch(e => setLoadErr((e as Error).message))
  }, [])

  const touch = () => setStale(true)
  const patchProduct = (i: number, p: Partial<ProductForm>) => { setProducts(prev => prev.map((x, k) => (k === i ? { ...x, ...p } : x))); touch() }
  const patchPlan = (i: number, j: number, p: Partial<PlanForm>) => {
    setProducts(prev => prev.map((x, k) => (k === i ? { ...x, plans: x.plans.map((pl, m) => (m === j ? { ...pl, ...p } : pl)) } : x))); touch()
  }
  const countries = useMemo(() => (opts?.ncc ?? []).map(r => r.country).sort(), [opts])

  const body = (force = false) => JSON.stringify({
    force,
    products: products.map(p => ({
      simType: p.simType, countries: p.countries, codeOverride: p.codeOverride,
      plans: p.plans.map(pl => ({ policy: pl.policy, amount: pl.policy === "X" ? 3 : Number(pl.amount.replace(",", ".")) || 0, unit: pl.policy === "X" ? "GB" : pl.unit, days: [...pl.days].sort((a, b) => a - b) })),
    })),
  })

  const runPreview = async () => {
    setBusy("preview")
    const r = await fetch("/api/admin/threehk-datapool/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: body() })
    const j = await r.json(); setBusy("")
    if (!r.ok) return onNotify("error", j.error || "Không tạo được bản xem trước")
    setPreview(j); setStale(false)
  }

  const runExport = async (force = false) => {
    setBusy("export")
    const r = await fetch("/api/admin/threehk-datapool/build?format=xlsx", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(force) })
    setBusy("")
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      if (r.status === 422 && j.warnings && !force && window.confirm(`Còn ${j.warnings.length} cảnh báo/lỗi. Vẫn xuất file?`)) return runExport(true)
      return onNotify("error", j.error || "Không xuất được file")
    }
    const url = URL.createObjectURL(await r.blob())
    const a = document.createElement("a"); a.href = url; a.download = `3hk_datapool_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
    URL.revokeObjectURL(url)
    onNotify("success", "Đã xuất file")
  }

  const sheets = useMemo(() => (preview ? {
    skuUS: { head: SKU_HEADERS, rows: preview.sheets.skuUS }, skuVN: { head: SKU_HEADERS, rows: preview.sheets.skuVN },
    productUS: { head: PRODUCT_HEADERS, rows: preview.sheets.productUS }, productVN: { head: PRODUCT_HEADERS, rows: preview.sheets.productVN },
  } : null), [preview])

  if (loadErr) return <div className="text-sm text-red-600">{loadErr}</div>
  if (!opts) return <div className="text-sm text-gray-400">Đang tải...</div>
  const { frames, fx, assumptions: a } = opts
  const frameOk = frames.esimUsUsd != null && frames.simUsUsd != null && frames.simVnVnd != null
  const priceOf = (cs: string[]) => {
    const rows = cs.map(c => opts.ncc.find(r => r.country === c)).filter((r): r is NccRow => !!r)
    return rows.length ? rows.reduce((m, r) => (r.price_per_gb_hkd > m.price_per_gb_hkd ? r : m)) : null
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl text-xs space-y-1 text-gray-600 dark:text-slate-300">
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Bảng giá 3HK</div>
          <div>{opts.ncc.length} nước trong bảng <span className="font-mono">ncc_3hk</span> (HKD/GB) — giá gói = nước đắt nhất trong các nước đã chọn.</div>
          <div>Sửa giá ở Admin › NCC. Gói đa nước cần nhóm nước hỗ trợ khớp đúng tập nước (không tự đặt mã).</div>
        </div>
        <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl text-xs space-y-1 text-gray-600 dark:text-slate-300">
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Tỷ giá nội bộ{fx?.month ? ` (${fx.month})` : ""}</div>
          {fx ? <><div>HKD/USD (Inc): <b>{fx.hkdPerUsd}</b> · VND/USD (JSC): <b>{fx.vndPerUsd.toLocaleString("vi-VN")}</b></div></> : <div className="text-red-600">{opts.fxError || "Chưa có tỷ giá"}</div>}
          <div>Công thức Datapool: Fixed <b>{a.fixedPct * 100}%</b> · Daily <b>{a.dailyPct * 100}%</b> · Unlimited 3GB→10Mbps <b>{a.unl3gb10} GB/ngày</b></div>
        </div>
        <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl text-xs space-y-1 text-gray-600 dark:text-slate-300">
          <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Giá khung (từ hệ thống)</div>
          <div>eSIM <span className="font-mono">AB0003DK00000</span>: <b>{frames.esimUsUsd ?? "thiếu"}</b> USD</div>
          <div>SIM US <span className="font-mono">CD0003DK00000</span>: <b>{frames.simUsUsd ?? "thiếu"}</b> USD</div>
          <div>SIM VN <span className="font-mono">1D0003DK00000</span>: <b>{frames.simVnVnd?.toLocaleString("vi-VN") ?? "thiếu"}</b> VND</div>
          {!frameOk && <div className="text-amber-700">Thiếu giá khung → loại eSIM full/SIM full tương ứng bị bỏ qua.</div>}
        </div>
      </div>

      {products.map((p, i) => {
        const top = priceOf(p.countries)
        const sup = preview?.supports[i]
        return (
          <div key={i} className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Sản phẩm #{i + 1}</div>
              {products.length > 1 && <button onClick={() => { setProducts(prev => prev.filter((_, k) => k !== i)); touch() }} className="text-gray-400 hover:text-red-600" title="Xoá sản phẩm"><Trash2 size={14} /></button>}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className={label}>Loại SIM</label>
                <select className={input} value={p.simType} onChange={e => patchProduct(i, { simType: e.target.value as SimType })}><option>eSIM</option><option>SIM</option></select>
              </div>
              <div className="md:col-span-2">
                <label className={label}>Nước (thêm nhiều nước = gói đa vùng)</label>
                <select className={input} value="" onChange={e => { if (e.target.value && !p.countries.includes(e.target.value)) patchProduct(i, { countries: [...p.countries, e.target.value], codeOverride: "" }) }}>
                  <option value="">+ Thêm nước…</option>
                  {countries.filter(c => !p.countries.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {p.countries.map(c => (
                    <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-slate-800 rounded-md">{c}
                      <button onClick={() => patchProduct(i, { countries: p.countries.filter(x => x !== c), codeOverride: "" })} className="text-gray-400 hover:text-red-600"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <label className={label}>Mã nước/nhóm 3 ký tự (để trống = tự tìm)</label>
                <input className={`${input} font-mono uppercase`} maxLength={3} value={p.codeOverride} onChange={e => patchProduct(i, { codeOverride: e.target.value })} placeholder={sup?.code || "VD THA"} />
              </div>
            </div>
            {top && <div className="text-xs text-gray-600 dark:text-slate-300">Giá áp dụng: <b>{top.price_per_gb_hkd} HKD/GB</b> ({top.country}{top.is_kyc ? " · có KYC" : ""}) · nhà mạng: {p.countries.length > 1 ? "các nước đã chọn" : top.network}</div>}
            {!stale && sup?.hint && <div className="text-[11px] text-amber-700">{sup.hint}</div>}

            <div className="space-y-2">
              {p.plans.map((pl, j) => (
                <div key={j} className="border border-gray-200 dark:border-slate-700 rounded-lg p-2 space-y-2">
                  <div className="grid gap-2 md:grid-cols-[1.5fr_1fr_auto] items-end">
                    <div>
                      <label className={label}>Loại gói</label>
                      <select className={input} value={pl.policy} onChange={e => { const po = e.target.value as Policy; patchPlan(i, j, { policy: po, ...(po === "X" ? { amount: "3", unit: "GB" as const } : {}) }) }}>
                        {POLICIES.map(po => <option key={po} value={po}>{POLICY_LABEL[po]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={label}>{pl.policy === "X" ? "Tốc độ cao mỗi ngày (cố định)" : POLICY_KIND[pl.policy] === "Daily" ? "Dung lượng mỗi ngày" : "Tổng dung lượng"}</label>
                      <div className="flex gap-1">
                        <input className={input} value={pl.amount} disabled={pl.policy === "X"} inputMode="decimal" onChange={e => patchPlan(i, j, { amount: e.target.value })} />
                        <select className={`${input} w-20`} value={pl.unit} disabled={pl.policy === "X"} onChange={e => patchPlan(i, j, { unit: e.target.value as "MB" | "GB" })}><option>GB</option><option>MB</option></select>
                      </div>
                    </div>
                    <button onClick={() => patchProduct(i, { plans: p.plans.filter((_, m) => m !== j) })} className="pb-2 text-gray-400 hover:text-red-600" title="Xoá dòng"><Trash2 size={14} /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-gray-500 mr-1">Số ngày:</span>
                    {ALL_DAYS.map(d => {
                      const on = pl.days.includes(d)
                      return <button key={d} type="button" onClick={() => patchPlan(i, j, { days: on ? pl.days.filter(x => x !== d) : [...pl.days, d] })}
                        className={`min-w-[32px] px-1.5 py-0.5 text-xs border rounded-md ${on ? "bg-brand-600 border-brand-600 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>{d}</button>
                    })}
                    <button type="button" className={`ml-1 ${btn}`} onClick={() => patchPlan(i, j, { days: COMMON_DAYS })}>Bộ phổ biến</button>
                    <button type="button" className={btn} onClick={() => patchPlan(i, j, { days: [] })}>Bỏ hết</button>
                    <span className="text-[11px] text-gray-400">đã chọn {pl.days.length}</span>
                  </div>
                </div>
              ))}
              <button onClick={() => patchProduct(i, { plans: [...p.plans, newPlan()] })} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"><Plus size={12} /> Thêm dòng gói</button>
            </div>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { setProducts(prev => [...prev, newProduct()]); touch() }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800"><Plus size={14} /> Thêm sản phẩm</button>
        <button onClick={runPreview} disabled={!fx || busy === "preview" || products.some(p => !p.countries.length)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-xl disabled:opacity-50"><Eye size={14} /> {busy === "preview" ? "Đang tính..." : "Xem trước"}</button>
        <button onClick={() => runExport()} disabled={!preview || stale || busy === "export"} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50"><Download size={14} /> {busy === "export" ? "Đang xuất..." : "Xuất file Excel"}</button>
        {stale && preview && <span className="text-xs text-amber-700">Form đã đổi — bấm &quot;Xem trước&quot; lại trước khi xuất.</span>}
      </div>

      {preview && sheets && (
        <div className="space-y-3">
          {(preview.skipped.skus.length > 0 || preview.skipped.products.length > 0) && (
            <div className="p-3 border border-sky-300 bg-sky-50 dark:bg-sky-950/30 rounded-xl text-sm text-sky-900 dark:text-sky-200">
              <div className="font-semibold mb-1">
                Đã có trong hệ thống — sẽ KHÔNG tạo lại: {preview.skipped.skus.length} SKU{preview.skipped.products.length ? `, ${preview.skipped.products.length} Product` : ""}
                {preview.nothingNew ? " · không còn SKU nào để tạo mới" : ` · sẽ tạo mới ${preview.sheets.skuUS.length} SKU US + ${preview.sheets.skuVN.length} SKU VN`}
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-xs max-h-56 overflow-auto">
                {preview.skipped.skus.map(s => <li key={`${s.tenant}${s.sku}`}><span className="font-mono">{s.sku}</span> ({s.tenant}, {s.status}) — {s.label}</li>)}
                {preview.skipped.products.map(p => <li key={`${p.tenant}${p.code}`}>Product <span className="font-mono">{p.code}</span> ({p.tenant}, {p.status}) đã có — không tạo lại dòng Product</li>)}
              </ul>
            </div>
          )}
          <div className="text-xs text-gray-600 dark:text-slate-300">vendorSku US của gói data (mã <span className="font-mono">CDOF…/TDOF…</span> của 3HK) để TRỐNG — điền tay sau khi có; vendorSku VN đã trỏ về mã SKU US.</div>
          {preview.warnings.length > 0 && (
            <div className="p-3 border border-amber-300 bg-amber-50 rounded-xl text-sm text-amber-900">
              <div className="font-semibold mb-1">{preview.warnings.length} cảnh báo / lỗi cần xem</div>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">{preview.warnings.map((w, k) => <li key={k}>{w}</li>)}</ul>
            </div>
          )}
          <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
            {([["cost", `Tính giá (${preview.costRows.length})`], ["skuUS", `SKU US (${preview.sheets.skuUS.length})`], ["skuVN", `SKU VN (${preview.sheets.skuVN.length})`], ["productUS", `Product US (${preview.sheets.productUS.length})`], ["productVN", `Product VN (${preview.sheets.productVN.length})`]] as const).map(([id, l]) => (
              <button key={id} onClick={() => setSheet(id)} className={`px-3 py-1.5 text-xs font-medium rounded-lg ${sheet === id ? "bg-white dark:bg-slate-700 text-brand-700 shadow-sm" : "text-gray-500"}`}>{l}</button>
            ))}
          </div>
          <div className="overflow-auto max-h-[520px] border border-gray-200 dark:border-slate-700 rounded-xl">
            {sheet === "cost" ? (
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800"><tr>{["Loại", "SKU US", "SKU VN", "Giá/GB (HKD)", "Data (USD)", "Phí khung (USD)", "COGS US (USD)", "COGS VN (VND)"].map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>{preview.costRows.slice(0, 1000).map((r, k) => (
                  <tr key={k} className="border-t border-gray-100 dark:border-slate-800">
                    <td className="px-2 py-1 whitespace-nowrap">{r.type}</td><td className="px-2 py-1 font-mono">{r.skuUS}</td><td className="px-2 py-1 font-mono">{r.skuVN}</td>
                    <td className="px-2 py-1">{r.pricePerGbHkd}</td><td className="px-2 py-1">{r.dataUsd}</td><td className="px-2 py-1">{r.feeUsd}</td>
                    <td className="px-2 py-1 font-semibold cursor-help underline decoration-dotted" title={r.explain}>{r.cogsUsd}</td>
                    <td className="px-2 py-1 font-semibold cursor-help underline decoration-dotted" title={r.explain}>{r.cogsVnd.toLocaleString("vi-VN")}</td>
                  </tr>))}</tbody>
              </table>
            ) : (
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800"><tr>{sheets[sheet].head.map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>{sheets[sheet].rows.slice(0, 1000).map((row, k) => {
                  const ci = sheet === "skuUS" ? preview.usCost[k] : sheet === "skuVN" ? preview.vnCost[k] : undefined
                  const tip = ci != null ? preview.costRows[ci].explain : undefined
                  return (
                    <tr key={k} className="border-t border-gray-100 dark:border-slate-800">
                      {row.map((c, m) => <td key={m} title={m === 10 ? tip : undefined} className={`px-2 py-1 whitespace-nowrap ${m === 10 && tip ? "cursor-help underline decoration-dotted font-semibold" : ""}`}>{String(c)}</td>)}
                    </tr>
                  )
                })}</tbody>
              </table>
            )}
          </div>
          <div className="text-[11px] text-gray-400">Rê chuột vào giá (gạch chấm) để xem công thức đã thế số — mọi công thức dùng ROUNDUP. File xuất tính lại y hệt, ô giá là công thức trỏ sheet &quot;Tính giá&quot;.</div>
        </div>
      )}
    </div>
  )
}
