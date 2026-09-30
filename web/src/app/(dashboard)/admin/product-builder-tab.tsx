"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Eye, Plus, Trash2, Upload } from "lucide-react"
import { PRODUCT_HEADERS, SKU_HEADERS, pickOperatorPrice, type BuildResult } from "@/lib/bc-datapool/builder"
import type { Skipped } from "@/lib/bc-datapool/dedupe"
import type { CatalogDiff, PriceDiff } from "@/lib/bc-datapool/diff"
import type { PlanInfo } from "@/lib/bc-datapool/plan-catalog"
import { DEFAULT_ASSUMPTIONS, type Assumptions, type Fx, type PlanKind, type Pool, type PriceList, type ProductInput } from "@/lib/bc-datapool/types"

type Notify = (type: "success" | "error", text: string) => void
interface SupportCountry { code: string; en: string; vn: string; iso: string }
interface CatalogSummary { uploadedAt: string; files: string[]; esim: number; sim: number; lastDiff: CatalogDiff | null }
interface Options { priceList: PriceList | null; planCatalog: CatalogSummary | null; supportCountries: SupportCountry[]; fx: Fx | null; fxError: string | null; assumptions: Assumptions }
interface PreviewResult extends BuildResult { fx: Fx; skipped: Skipped; nothingNew: boolean; planInfo: PlanInfo[]; whiteSimVnd: number | null }

// Dòng gói trên form: `daysText` là chuỗi người dùng gõ ("1,2,3,7"), chuyển thành số khi gửi lên server.
interface PlanForm { kind: PlanKind; dataAmount: string; unit: "MB" | "GB"; daysText: string; productId: string }
interface ProductForm { pool: Pool; simType: "eSIM" | "SIM"; coverage: string; operators: string[]; code: string; iso: string; en: string; vn: string; plans: PlanForm[] }

const DAYS_JAPAN = "1,2,3,4,5,6,7,10,15,20,25,30"
const DAYS_TAIWAN = "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,20,25,30"
const KIND_LABEL: Record<PlanKind, string> = { Daily: "Daily (theo ngày)", Fixed: "Fixed (cố định)", Unlimited: "Unlimited (mã X)" }
const POOL_LABEL: Record<Pool, string> = { CMHK: "CMHK (WD · HKD)", SINGTEL: "Singtel (W1 · USD)" }

const input = "px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:border-slate-600"
const label = "block text-[11px] font-semibold text-gray-500 mb-1"

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
const parseDays = (t: string) => Array.from(new Set(t.split(/[,\s;]+/).map(x => parseInt(x, 10)).filter(n => Number.isFinite(n) && n > 0))).sort((a, b) => a - b)

const newPlan = (kind: PlanKind = "Daily"): PlanForm => ({ kind, dataAmount: kind === "Fixed" ? "5" : kind === "Unlimited" ? "3" : "500", unit: kind === "Daily" ? "MB" : "GB", daysText: DAYS_JAPAN, productId: "" })
const newProduct = (): ProductForm => ({ pool: "CMHK", simType: "eSIM", coverage: "", operators: [], code: "", iso: "", en: "", vn: "", plans: [newPlan()] })

interface DiffGroup { label: string; tone: "red" | "green" | "amber"; total: number; items: string[] }
const TONE = { red: "text-red-700", green: "text-emerald-700", amber: "text-amber-700" }

/** Báo cáo thay đổi sau khi upload: nhóm có số lượng, bấm mở xem chi tiết. */
function DiffBox({ diff, groups }: { diff: { at: string; compared: boolean } | null | undefined; groups: DiffGroup[] }) {
  if (!diff) return null
  const when = new Date(diff.at).toLocaleString("vi-VN")
  if (!diff.compared) return <div className="text-[11px] text-gray-400">Lần upload đầu tiên ({when}) — chưa có bản cũ để so sánh.</div>
  const active = groups.filter(g => g.total > 0)
  if (!active.length) return <div className="text-[11px] text-emerald-700">✓ Không có thay đổi so với bản trước ({when}).</div>
  return (
    <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 space-y-1">
      <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">Thay đổi so với bản trước ({when}) — sản phẩm/giá đã tạo trước đó có thể cần cập nhật</div>
      {active.map(g => (
        <details key={g.label} className="text-[11px]">
          <summary className={`cursor-pointer font-semibold ${TONE[g.tone]}`}>{g.label}: {g.total}</summary>
          <ul className="mt-1 ml-4 list-disc max-h-48 overflow-auto space-y-0.5 text-gray-700 dark:text-slate-300">
            {g.items.map((t, k) => <li key={k}>{t}</li>)}
            {g.total > g.items.length && <li className="text-gray-400">… và {g.total - g.items.length} dòng nữa</li>}
          </ul>
        </details>
      ))}
    </div>
  )
}

const priceGroups = (d?: PriceDiff | null): DiffGroup[] => !d ? [] : [
  { label: "Đổi giá", tone: "amber", total: d.counts.changed, items: d.changed.map(c => `${c.pool} · ${c.coverage} · ${c.operator}: ${c.from} → ${c.to} ${c.currency}/GB`) },
  { label: "Nhà mạng/khu vực mới", tone: "green", total: d.counts.added, items: d.added.map(c => `${c.pool} · ${c.coverage} · ${c.operator}: ${c.to} ${c.currency}/GB`) },
  { label: "Nhà mạng/khu vực bị bỏ", tone: "red", total: d.counts.removed, items: d.removed.map(c => `${c.pool} · ${c.coverage} · ${c.operator} (trước: ${c.from} ${c.currency}/GB)`) },
  { label: "Đổi phí (IMSI/eSIM/SIM)", tone: "amber", total: d.counts.fees, items: d.fees.map(f => `${f.pool} · ${f.field}: ${f.from} → ${f.to}`) },
]
const catalogGroups = (d?: CatalogDiff | null): DiffGroup[] => !d ? [] : [
  { label: "Gói mới", tone: "green", total: d.counts.added, items: d.added.map(p => `${p.label} — ${p.id}`) },
  { label: "Gói bị bỏ", tone: "red", total: d.counts.removed, items: d.removed.map(p => `${p.label} — ${p.id}`) },
  { label: "Gói đổi số ngày/tốc độ/nhà mạng", tone: "amber", total: d.counts.changed, items: d.changed.map(p => `${p.label} — ${p.id}: ${p.detail}`) },
]

export default function ProductBuilderTab({ onNotify }: { onNotify: Notify }) {
  const [opts, setOpts] = useState<Options | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS)
  const [products, setProducts] = useState<ProductForm[]>([newProduct()])
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewStale, setPreviewStale] = useState(false)
  const [sheet, setSheet] = useState<"skuUS" | "skuVN" | "productUS" | "productVN" | "cost">("cost")
  const [busy, setBusy] = useState<"" | "upload" | "catalog" | "preview" | "export">("")
  const fileRef = useRef<HTMLInputElement>(null)
  const catRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/admin/bc-datapool").then(async r => {
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Lỗi tải dữ liệu")
      setOpts(j); setAssumptions(j.assumptions)
    }).catch(e => setLoadErr((e as Error).message))
  }, [])

  const list = opts?.priceList ?? null
  const touch = () => setPreviewStale(true)
  const patchProduct = (i: number, p: Partial<ProductForm>) => { setProducts(prev => prev.map((x, k) => (k === i ? { ...x, ...p } : x))); touch() }
  const patchPlan = (i: number, j: number, p: Partial<PlanForm>) => {
    setProducts(prev => prev.map((x, k) => (k === i ? { ...x, plans: x.plans.map((pl, m) => (m === j ? { ...pl, ...p } : pl)) } : x))); touch()
  }

  const coveragesOf = (pool: Pool) => (list ? Array.from(new Set(list.pools[pool].rows.map(r => r.coverage))).sort() : [])

  const pickCoverage = (i: number, pool: Pool, coverage: string) => {
    const rows = list?.pools[pool].rows.filter(r => r.coverage === coverage) ?? []
    // Mặc định chọn hết nhà mạng của khu vực; giá áp dụng luôn là nhà mạng đắt nhất trong số được chọn.
    const sc = opts?.supportCountries.find(c => norm(c.en) === norm(coverage))
    patchProduct(i, {
      pool, coverage, operators: rows.map(r => `${r.coverage}|${r.operator}`),
      code: sc?.code ?? "", iso: sc?.iso ?? "", en: sc?.en ?? coverage, vn: sc?.vn ?? "",
    })
  }

  const toInputs = (): ProductInput[] => products.map(p => ({
    pool: p.pool, simType: p.simType, coverages: p.coverage ? [p.coverage] : [], operators: p.operators,
    supportCountryCode: p.code.trim().toUpperCase(), isoCodes: p.iso.trim().toUpperCase(),
    countryNameEn: p.en.trim(), countryNameVn: p.vn.trim(),
    plans: p.plans.map(pl => ({ kind: pl.kind, dataAmount: parseFloat(pl.dataAmount.replace(",", ".")) || 0, unit: pl.unit, days: parseDays(pl.daysText), productId: pl.productId.trim() })),
  }))

  const upload = async (file: File) => {
    setBusy("upload")
    const fd = new FormData(); fd.append("file", file)
    const r = await fetch("/api/admin/bc-datapool/price-list", { method: "POST", body: fd })
    const j = await r.json(); setBusy("")
    if (!r.ok) return onNotify("error", j.error || "Không đọc được file báo giá")
    setOpts(o => (o ? { ...o, priceList: j.priceList } : o)); touch()
    const c = j.priceList.lastDiff?.counts
    const changed = c ? c.changed + c.added + c.removed + c.fees : 0
    onNotify("success", `Đã lưu bảng báo giá: ${j.priceList.fileName}` + (j.priceList.lastDiff?.compared ? (changed ? ` — có ${c.changed} nhà mạng đổi giá, ${c.added} mới, ${c.removed} bị bỏ, ${c.fees} phí đổi (xem bên dưới)` : " — không có thay đổi so với bản trước") : ""))
  }

  const uploadCatalog = async (files: FileList) => {
    setBusy("catalog")
    const fd = new FormData(); Array.from(files).forEach(f => fd.append("files", f))
    const r = await fetch("/api/admin/bc-datapool/plan-catalog", { method: "POST", body: fd })
    const j = await r.json(); setBusy("")
    if (!r.ok) return onNotify("error", j.error || "Không đọc được file Portal")
    setOpts(o => (o ? { ...o, planCatalog: j.planCatalog } : o)); touch()
    const c = j.planCatalog.lastDiff?.counts
    onNotify("success", `Đã lưu danh mục gói Portal: ${j.planCatalog.esim} gói eSIM, ${j.planCatalog.sim} gói SIM` + (j.planCatalog.lastDiff?.compared ? (c && c.added + c.removed + c.changed ? ` — ${c.added} gói mới, ${c.removed} bị bỏ, ${c.changed} đổi ngày/tốc độ (xem bên dưới)` : " — không có thay đổi so với bản trước") : ""))
  }

  const runPreview = async () => {
    setBusy("preview")
    const r = await fetch("/api/admin/bc-datapool/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products: toInputs(), assumptions }) })
    const j = await r.json(); setBusy("")
    if (!r.ok) return onNotify("error", j.error || "Không tạo được bản xem trước")
    setPreview(j); setPreviewStale(false)
  }

  const runExport = async (force = false) => {
    setBusy("export")
    const r = await fetch("/api/admin/bc-datapool/build?format=xlsx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products: toInputs(), assumptions, force }) })
    setBusy("")
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      if (r.status === 422 && j.warnings && !force && window.confirm(`Còn ${j.warnings?.length ?? 0} cảnh báo/lỗi. Vẫn xuất file?`)) return runExport(true)
      return onNotify("error", j.error || "Không xuất được file")
    }
    const url = URL.createObjectURL(await r.blob())
    const a = document.createElement("a"); a.href = url; a.download = `bc_datapool_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
    URL.revokeObjectURL(url)
    onNotify("success", "Đã xuất file")
  }

  const sheets = useMemo(() => (preview ? {
    skuUS: { head: SKU_HEADERS, rows: preview.sheets.skuUS },
    skuVN: { head: SKU_HEADERS, rows: preview.sheets.skuVN },
    productUS: { head: PRODUCT_HEADERS, rows: preview.sheets.productUS },
    productVN: { head: PRODUCT_HEADERS, rows: preview.sheets.productVN },
  } : null), [preview])

  if (loadErr) return <div className="text-sm text-red-600">{loadErr}</div>
  if (!opts) return <div className="text-sm text-gray-400">Đang tải...</div>

  return (
    <div className="space-y-5">
      {/* Nền: bảng báo giá + tỷ giá + giả định */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl space-y-2">
          <div className="text-sm font-semibold">Bảng báo giá BC Datapool</div>
          {list ? (
            <div className="text-xs text-gray-600 dark:text-slate-300 space-y-0.5">
              <div>{list.fileName}</div>
              <div>Cập nhật {new Date(list.uploadedAt).toLocaleString("vi-VN")}</div>
              <div>CMHK {list.pools.CMHK.rows.length} dòng (HKD/GB) · Singtel {list.pools.SINGTEL.rows.length} dòng (USD/GB)</div>
            </div>
          ) : <div className="text-xs text-amber-700">Chưa có bảng báo giá — upload file có sheet &quot;cmhk&quot; và &quot;Singtel&quot;.</div>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = "" }} />
          <button onClick={() => fileRef.current?.click()} disabled={busy === "upload"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">
            <Upload size={14} /> {list ? "Upload bảng giá mới" : "Upload bảng giá"}
          </button>
          <DiffBox diff={list?.lastDiff} groups={priceGroups(list?.lastDiff)} />
        </div>
        <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl space-y-2">
          <div className="text-sm font-semibold">Danh mục gói Portal (lấy ProductID)</div>
          {opts.planCatalog ? (
            <div className="text-xs text-gray-600 dark:text-slate-300 space-y-0.5">
              <div>{opts.planCatalog.esim} gói eSIM · {opts.planCatalog.sim} gói SIM</div>
              <div>Cập nhật {new Date(opts.planCatalog.uploadedAt).toLocaleString("vi-VN")}</div>
            </div>
          ) : <div className="text-xs text-amber-700">Chưa có — upload 2 file &quot;Purchase information&quot; (eSIM và SIM) để tự điền ProductID.</div>}
          <input ref={catRef} type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={e => { if (e.target.files?.length) uploadCatalog(e.target.files); e.target.value = "" }} />
          <button onClick={() => catRef.current?.click()} disabled={busy === "catalog"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50">
            <Upload size={14} /> {busy === "catalog" ? "Đang đọc file..." : opts.planCatalog ? "Upload file Portal mới" : "Upload file Portal"}
          </button>
          <DiffBox diff={opts.planCatalog?.lastDiff} groups={catalogGroups(opts.planCatalog?.lastDiff)} />
        </div>
        <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl space-y-1 text-sm">
          <div className="font-semibold">Tỷ giá nội bộ (đọc từ Cài đặt)</div>
          {opts.fx ? (
            <>
              <div className="text-xs text-gray-600 dark:text-slate-300">1 USD = <b>{opts.fx.hkdPerUsd}</b> HKD · <b>{opts.fx.cnyPerUsd}</b> CNY · <b>{opts.fx.vndPerUsd.toLocaleString("vi-VN")}</b> VND</div>
              <div className="text-[11px] text-gray-400">Muốn đổi tỷ giá: Cài đặt › Tỷ Giá Nội Bộ.</div>
            </>
          ) : <div className="text-xs text-red-600">{opts.fxError}</div>}
        </div>
        <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl space-y-2">
          <div className="text-sm font-semibold">Giả định COGS</div>
          <div className="grid grid-cols-3 gap-2">
            {([["fixedPct", "Fixed %", 100], ["dailyPct", "Daily %", 100], ["unlimitedGbPerDay", "Unlimited GB/ngày", 1]] as const).map(([k, l, mul]) => (
              <div key={k}>
                <label className={label}>{l}</label>
                <input className={`${input} w-full`} type="number" step="any" value={Number((assumptions[k] * mul).toFixed(4))}
                  onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { setAssumptions(a => ({ ...a, [k]: v / mul })); touch() } }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sản phẩm */}
      {products.map((p, i) => {
        const rows = list?.pools[p.pool].rows.filter(r => r.coverage === p.coverage) ?? []
        const top = list && p.coverage ? pickOperatorPrice({ ...toInputs()[i] }, list) : null
        const cur = list?.pools[p.pool].currency
        return (
          <div key={i} className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Sản phẩm #{i + 1}{p.coverage && ` — ${p.coverage}`}</div>
              {products.length > 1 && (
                <button onClick={() => { setProducts(prev => prev.filter((_, k) => k !== i)); touch() }} className="text-gray-400 hover:text-red-600" title="Xoá sản phẩm"><Trash2 size={15} /></button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={label}>Pool</label>
                <select className={`${input} w-full`} value={p.pool} onChange={e => { const pool = e.target.value as Pool; patchProduct(i, { pool, coverage: "", operators: [] }) }}>
                  {(Object.keys(POOL_LABEL) as Pool[]).map(k => <option key={k} value={k}>{POOL_LABEL[k]}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Loại SIM</label>
                <select className={`${input} w-full`} value={p.simType} onChange={e => patchProduct(i, { simType: e.target.value as "eSIM" | "SIM" })}>
                  <option value="eSIM">eSIM</option><option value="SIM">SIM</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Khu vực trong bảng giá (mỗi sản phẩm 1 nước, 1 pool)</label>
                <select className={`${input} w-full`} value={p.coverage} onChange={e => pickCoverage(i, p.pool, e.target.value)}>
                  <option value="">— chọn —</option>
                  {coveragesOf(p.pool).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {rows.length > 0 && (
              <div>
                <label className={label}>Nhà mạng (giá áp dụng = nhà mạng ĐẮT NHẤT trong số đã chọn)</label>
                <div className="flex flex-wrap gap-2">
                  {rows.map(r => {
                    const key = `${r.coverage}|${r.operator}`, on = p.operators.includes(key)
                    return (
                      <label key={key} className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-lg cursor-pointer ${on ? "border-brand-400 bg-brand-50 text-brand-700" : "border-gray-300 text-gray-500"}`}>
                        <input type="checkbox" checked={on} onChange={() => patchProduct(i, { operators: on ? p.operators.filter(k => k !== key) : [...p.operators, key] })} />
                        {r.operator} · {r.pricePerGb} {cur}/GB{r.kyc && <b className="text-red-600">KYC</b>}
                      </label>
                    )
                  })}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">{top ? `Giá áp dụng: ${top.pricePerGb} ${cur}/GB (${top.operator})` : "Chọn ít nhất 1 nhà mạng"}</div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><label className={label}>Mã nước/nhóm nước (3 ký tự)</label><input className={`${input} w-full uppercase`} maxLength={3} value={p.code} onChange={e => patchProduct(i, { code: e.target.value })} placeholder="JPN" /></div>
              <div><label className={label}>supportedCountries (ISO 2)</label><input className={`${input} w-full uppercase`} value={p.iso} onChange={e => patchProduct(i, { iso: e.target.value })} placeholder="JP" /></div>
              <div><label className={label}>Tên nước (EN)</label><input className={`${input} w-full`} value={p.en} onChange={e => patchProduct(i, { en: e.target.value })} placeholder="Japan" /></div>
              <div><label className={label}>Tên nước (VN)</label><input className={`${input} w-full`} value={p.vn} onChange={e => patchProduct(i, { vn: e.target.value })} placeholder="Nhật Bản" /></div>
            </div>

            <div className="space-y-2">
              <label className={label}>Gói (mỗi dòng = 1 loại × 1 dung lượng, kèm danh sách số ngày; ProductID dùng chung cho mọi ngày)</label>
              {p.plans.map((pl, j) => (
                <div key={j} className="grid gap-2 items-end sm:grid-cols-[150px_90px_70px_1fr_180px_28px]">
                  <select className={input} value={pl.kind} onChange={e => { const kind = e.target.value as PlanKind; patchPlan(i, j, { kind, unit: kind === "Daily" ? pl.unit : "GB" }) }}>
                    {(Object.keys(KIND_LABEL) as PlanKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                  <input className={input} value={pl.dataAmount} onChange={e => patchPlan(i, j, { dataAmount: e.target.value })} placeholder={pl.kind === "Unlimited" ? "GB tốc độ cao/ngày" : "Dung lượng"} title={pl.kind === "Unlimited" ? "Dung lượng tốc độ cao mỗi ngày (chỉ dùng đặt tên/mã, giá tính theo 1.7GB/ngày)" : "Dung lượng"} />
                  <select className={input} value={pl.unit} onChange={e => patchPlan(i, j, { unit: e.target.value as "MB" | "GB" })}><option>MB</option><option>GB</option></select>
                  <div className="flex gap-1">
                    <input className={`${input} flex-1 min-w-0`} value={pl.daysText} onChange={e => patchPlan(i, j, { daysText: e.target.value })} placeholder="Số ngày: 1,2,3,7,30" />
                    <button type="button" className="px-2 text-[11px] border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800" onClick={() => patchPlan(i, j, { daysText: DAYS_JAPAN })} title="1–7, 10, 15, 20, 25, 30">12 mức</button>
                    <button type="button" className="px-2 text-[11px] border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800" onClick={() => patchPlan(i, j, { daysText: DAYS_TAIWAN })} title="1–15, 20, 25, 30">18 mức</button>
                  </div>
                  <input className={input} value={pl.productId} onChange={e => patchPlan(i, j, { productId: e.target.value })} placeholder="ProductID (trống = tự lấy từ Portal)" />
                  <button onClick={() => patchProduct(i, { plans: p.plans.filter((_, m) => m !== j) })} className="pb-2 text-gray-400 hover:text-red-600" title="Xoá dòng"><Trash2 size={14} /></button>
                  {!previewStale && (() => {
                    const pi = preview?.planInfo.find(x => x.product === i && x.line === j)
                    if (!pi || pi.status === "none") return null
                    const txt = pi.status === "portal" ? `ProductID từ Portal: ${pi.productId} — ${pi.planName ?? ""}${pi.note ? ` ⚠ ${pi.note}` : ""}`
                      : pi.status === "manual" ? `ProductID nhập tay: ${pi.productId}${pi.planName ? ` (Portal: ${pi.planName})` : " (không có trong file Portal)"}`
                      : pi.status === "ambiguous" ? `Portal có nhiều Plan ID: ${pi.candidates?.join(", ")} — nhập ProductID để chọn`
                      : "Không tìm thấy gói này trong file Portal"
                    return <div className={`sm:col-span-6 text-[11px] ${pi.status === "portal" || pi.status === "manual" ? "text-emerald-700" : "text-red-600"}`}>{txt}{pi.offeredDays ? ` · Portal bán ${pi.offeredDays.length} mức ngày (${pi.offeredDays[0]}–${pi.offeredDays[pi.offeredDays.length - 1]})` : ""}</div>
                  })()}
                </div>
              ))}
              <div className="flex gap-2">
                {(["Daily", "Fixed", "Unlimited"] as PlanKind[]).map(k => (
                  <button key={k} onClick={() => patchProduct(i, { plans: [...p.plans, newPlan(k)] })} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800">
                    <Plus size={12} /> {k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { setProducts(prev => [...prev, newProduct()]); touch() }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800"><Plus size={14} /> Thêm sản phẩm</button>
        <button onClick={runPreview} disabled={!list || !opts.fx || busy === "preview"} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-xl disabled:opacity-50"><Eye size={14} /> {busy === "preview" ? "Đang tính..." : "Xem trước"}</button>
        <button onClick={() => runExport()} disabled={!preview || previewStale || busy === "export"} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50"><Download size={14} /> {busy === "export" ? "Đang xuất..." : "Xuất file Excel"}</button>
        {previewStale && preview && <span className="text-xs text-amber-700">Form đã đổi — bấm &quot;Xem trước&quot; lại trước khi xuất.</span>}
      </div>

      {/* Xem trước */}
      {preview && sheets && (
        <div className="space-y-3">
          {(preview.skipped.skus.length > 0 || preview.skipped.products.length > 0) && (
            <div className="p-3 border border-sky-300 bg-sky-50 dark:bg-sky-950/30 rounded-xl text-sm text-sky-900 dark:text-sky-200">
              <div className="font-semibold mb-1">
                Đã có trong hệ thống — sẽ KHÔNG tạo lại: {preview.skipped.skus.length} SKU{preview.skipped.products.length ? `, ${preview.skipped.products.length} Product` : ""}
                {preview.nothingNew ? " · không còn SKU nào để tạo mới" : ` · sẽ tạo mới ${preview.sheets.skuUS.length} SKU US + ${preview.sheets.skuVN.length} SKU VN`}
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-xs max-h-56 overflow-auto">
                {preview.skipped.skus.map(s => <li key={`${s.tenant}${s.sku}`}><span className="font-mono">{s.sku}</span> ({s.tenant}, trạng thái {s.status}) — {s.label}</li>)}
                {preview.skipped.products.map(p => <li key={`${p.tenant}${p.code}`}>Product <span className="font-mono">{p.code}</span> ({p.tenant}, {p.status}) đã có — không tạo lại dòng Product, chỉ thêm SKU mới nếu có</li>)}
              </ul>
            </div>
          )}
          {preview.whiteSimVnd && (
            <div className="text-xs text-gray-600 dark:text-slate-300">Giá SIM trắng lấy từ hệ thống (SKU 1D000WDK00000): <b>{preview.whiteSimVnd.toLocaleString("vi-VN")} VND</b> — phí SIM = giá SIM trắng + phí IMSI.</div>
          )}
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
                <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800"><tr>{["Loại", "SKU US", "SKU VN", "ProductID", "Pool", "Nhà mạng áp dụng", "Giá/GB", "Data (USD)", "Phí khung (USD)", "COGS US (USD)", "COGS VN (VND)"].map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>{preview.costRows.slice(0, 1000).map((r, k) => (
                  <tr key={k} className="border-t border-gray-100 dark:border-slate-800">
                    <td className="px-2 py-1 whitespace-nowrap">{r.type}</td><td className="px-2 py-1 font-mono">{r.skuUS}</td><td className="px-2 py-1 font-mono">{r.skuVN}</td><td className="px-2 py-1 font-mono">{r.productId}</td><td className="px-2 py-1">{r.pool}</td><td className="px-2 py-1">{r.operator}</td>
                    <td className="px-2 py-1" title={r.explain.dataPool}>{r.pricePerGb} {r.currency}</td>
                    <td className="px-2 py-1 cursor-help underline decoration-dotted" title={`${r.explain.dataPool}\n${r.explain.dataUsd}`}>{r.dataUsd}</td>
                    <td className="px-2 py-1 cursor-help underline decoration-dotted" title={r.explain.fee}>{r.feeUsd}</td>
                    <td className="px-2 py-1 font-semibold cursor-help underline decoration-dotted" title={r.explain.cogsUsd}>{r.cogsUsd}</td>
                    <td className="px-2 py-1 font-semibold cursor-help underline decoration-dotted" title={`${r.explain.cogsUsd}\n${r.explain.cogsVnd}`}>{r.cogsVnd.toLocaleString("vi-VN")}</td>
                  </tr>))}</tbody>
              </table>
            ) : (
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 dark:bg-slate-800"><tr>{sheets[sheet].head.map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>{sheets[sheet].rows.slice(0, 1000).map((row, k) => {
                  // Ô latestCogs (cột K) của sheet SKU: rê chuột hiện công thức tính giá của dòng đó
                  const ci = sheet === "skuUS" ? preview.usCost[k] : sheet === "skuVN" ? preview.vnCost[k] : undefined
                  const ex = ci != null ? preview.costRows[ci].explain : null
                  const tip = ex ? (sheet === "skuUS" ? `${ex.dataPool}\n${ex.dataUsd}\n${ex.fee}\n${ex.cogsUsd}` : `${ex.cogsUsd}\n${ex.cogsVnd}`) : undefined
                  return (
                    <tr key={k} className="border-t border-gray-100 dark:border-slate-800">
                      {row.map((c, m) => <td key={m} title={m === 10 ? tip : undefined} className={`px-2 py-1 whitespace-nowrap ${m === 10 && tip ? "cursor-help underline decoration-dotted font-semibold" : ""}`}>{String(c)}</td>)}
                    </tr>
                  )
                })}</tbody>
              </table>
            )}
          </div>
          <div className="text-[11px] text-gray-400">Rê chuột vào giá (gạch chấm) để xem công thức đã thế số — mọi công thức dùng ROUNDUP. Bản xem trước tính bằng tỷ giá nội bộ hiện tại; file xuất sẽ tính lại y hệt. Hiển thị tối đa 1000 dòng/sheet, file xuất đủ tất cả.</div>
        </div>
      )}
    </div>
  )
}
