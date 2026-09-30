"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Eye, Plus, Trash2, Upload } from "lucide-react"
import { PRODUCT_HEADERS, SKU_HEADERS, pickOperatorPrice, type BuildResult } from "@/lib/bc-datapool/builder"
import { pickSupportCountry } from "@/lib/bc-datapool/iso"
import type { Skipped } from "@/lib/bc-datapool/dedupe"
import type { CatalogDiff, PriceDiff } from "@/lib/bc-datapool/diff"
import { availableKinds, canonCountry, choosePlan, findPlans, manualMismatches, offers, sellableCountries, type CatalogPlan, type PlanCatalog, type PlanInfo } from "@/lib/bc-datapool/plan-lookup"
import { DEFAULT_ASSUMPTIONS, type Assumptions, type Fx, type PlanKind, type Pool, type PriceList, type ProductInput } from "@/lib/bc-datapool/types"

type Notify = (type: "success" | "error", text: string) => void
interface SupportCountry { code: string; en: string; vn: string; iso: string }
interface CatalogSummary { uploadedAt: string; files: string[]; esim: number; sim: number; lastDiff: CatalogDiff | null }
interface Options { priceList: PriceList | null; planCatalog: CatalogSummary | null; portalPlans: CatalogPlan[] | null; supportCountries: SupportCountry[]; fx: (Fx & { month?: string }) | null; fxError: string | null; assumptions: Assumptions }
interface PreviewResult extends BuildResult { fx: Fx; skipped: Skipped; nothingNew: boolean; planInfo: PlanInfo[]; whiteSimVnd: number | null }

// Dòng gói trên form: dung lượng chọn từ các gói Portal thật (amountKey = "500|MB"), số ngày chỉ bật được ngày Portal bán.
/**
 * Daily/Fixed: `amountKey` = dung lượng gói Portal. Unlimited: `amountKey` = gói BC thật ("Daily {tổng} Throttle to 1Mbps"),
 * còn `hs` + `hsUnit` = dung lượng TỐC ĐỘ CAO khách thấy (cột dataMB) và `speed` = tốc độ Unlimited (cột speedMbps) — mặc định 3GB + 10Mbps.
 */
interface PlanForm { kind: PlanKind; amountKey: string; days: number[]; productId: string; hs: string; hsUnit: "MB" | "GB"; speed: 5 | 10 }
interface ProductForm { pool: Pool; simType: "eSIM" | "SIM"; coverage: string; operators: string[]; code: string; codeHint?: string; iso: string; en: string; vn: string; plans: PlanForm[] }

/** Bộ ngày phổ biến — mặc định bật sẵn phần giao với số ngày Portal bán */
const COMMON_DAYS = [1, 2, 3, 4, 5, 6, 7, 10, 15, 20, 25, 30]
const KIND_LABEL: Record<PlanKind, string> = { Daily: "Daily (theo ngày)", Fixed: "Fixed (cố định)", Unlimited: "Unlimited (mã X)" }
const POOL_LABEL: Record<Pool, string> = { CMHK: "CMHK (WD · HKD)", SINGTEL: "Singtel (W1 · USD)" }

const input = "px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-slate-800 dark:border-slate-600"
const label = "block text-[11px] font-semibold text-gray-500 mb-1"

const HS_DEFAULT = { hs: "3", hsUnit: "GB" as const, speed: 10 as const }
const newProduct = (): ProductForm => ({ pool: "CMHK", simType: "eSIM", coverage: "", operators: [], code: "", iso: "", en: "", vn: "", plans: [] })
const keyOf = (amount: number, unit: string) => `${amount}|${unit}`
const labelOf = (key: string) => key.replace("|", " ")
const commonOf = (offered: number[]) => COMMON_DAYS.filter(d => offered.includes(d))

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

  const load = async (first: boolean) => {
    try {
      const r = await fetch("/api/admin/bc-datapool")
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Lỗi tải dữ liệu")
      setOpts(j); if (first) setAssumptions(j.assumptions)
    } catch (e) { setLoadErr((e as Error).message) }
  }
  useEffect(() => { load(true) }, [])

  const list = opts?.priceList ?? null
  // Danh mục gói Portal = nguồn sự thật về gói BC thực sự bán (chưa có thì chặn tạo)
  const catalog: PlanCatalog | null = useMemo(() => (opts?.portalPlans ? { uploadedAt: "", files: [], plans: opts.portalPlans.map(p => ({ ...p, name: "", operators: [], timing: "" })) } : null), [opts?.portalPlans])
  const touch = () => setPreviewStale(true)
  const patchProduct = (i: number, p: Partial<ProductForm>) => { setProducts(prev => prev.map((x, k) => (k === i ? { ...x, ...p } : x))); touch() }
  const patchPlan = (i: number, j: number, p: Partial<PlanForm>) => {
    setProducts(prev => prev.map((x, k) => (k === i ? { ...x, plans: x.plans.map((pl, m) => (m === j ? { ...pl, ...p } : pl)) } : x))); touch()
  }

  // Khu vực: chỉ hiện khu vực CÓ trong bảng giá VÀ Portal có bán ở đúng pool + loại SIM (khu vực BC không bán bị ẩn hẳn)
  const coveragesOf = (pool: Pool, sim: "eSIM" | "SIM") => {
    if (!list || !catalog) return []
    const ok = sellableCountries(catalog, sim, pool)
    return Array.from(new Set(list.pools[pool].rows.map(r => r.coverage))).filter(c => ok.has(canonCountry(c))).sort()
  }

  const offersOf = (p: ProductForm, kind: PlanKind) => offers(catalog, { sim: p.simType, pool: p.pool, coverage: p.coverage, kind })
  const kindsOf = (p: ProductForm) => availableKinds(catalog, { sim: p.simType, pool: p.pool, coverage: p.coverage })

  /** Dòng gói mặc định: dung lượng đầu tiên Portal bán, bật sẵn bộ ngày phổ biến giao với số ngày Portal bán */
  const defaultPlan = (p: ProductForm, kind?: PlanKind): PlanForm | null => {
    const k = kind ?? kindsOf(p)[0]
    const o = k ? offersOf(p, k)[0] : undefined
    if (!k || !o) return null
    const c = commonOf(o.plan.days)
    return { kind: k, amountKey: keyOf(o.amount, o.unit), days: c.length ? c : o.plan.days.slice(0, 1), productId: "", ...HS_DEFAULT }
  }
  const offerDays = (p: ProductForm, pl: PlanForm) => offersOf(p, pl.kind).find(o => keyOf(o.amount, o.unit) === pl.amountKey)?.plan.days ?? []

  const pickCoverage = (i: number, pool: Pool, sim: "eSIM" | "SIM", coverage: string) => {
    const rows = list?.pools[pool].rows.filter(r => r.coverage === coverage) ?? []
    // Mặc định chọn hết nhà mạng của khu vực; giá áp dụng luôn là nhà mạng đắt nhất trong số được chọn.
    // Có nhiều mã cùng tên nước (Japan: JPN + JKD...) → lấy mã ISO alpha-3, không chắc thì để trống và gợi ý
    const { match: sc, code, candidates } = pickSupportCountry(opts?.supportCountries ?? [], coverage)
    const base: ProductForm = { ...products[i], pool, simType: sim, coverage }
    const first = coverage ? defaultPlan(base) : null
    patchProduct(i, {
      pool, simType: sim, coverage, operators: rows.map(r => `${r.coverage}|${r.operator}`),
      code, iso: sc?.iso ?? "", en: sc?.en ?? coverage, vn: sc?.vn ?? "",
      codeHint: candidates.length ? `Có nhiều mã cho ${coverage}: ${candidates.join(", ")} — chọn mã đúng` : "",
      plans: first ? [first] : [],
    })
  }

  const toInputs = (): ProductInput[] => products.map(p => ({
    pool: p.pool, simType: p.simType, coverages: p.coverage ? [p.coverage] : [], operators: p.operators,
    supportCountryCode: p.code.trim().toUpperCase(), isoCodes: p.iso.trim().toUpperCase(),
    countryNameEn: p.en.trim(), countryNameVn: p.vn.trim(),
    plans: p.plans.map(pl => {
      const [amount, unit] = pl.amountKey.split("|")
      const base = { kind: pl.kind, days: [...pl.days].sort((a, b) => a - b), productId: pl.productId.trim() }
      // Unlimited: dataAmount = dung lượng tốc độ cao (dataMB), bcAmount = gói BC thật, speedMbps = tốc độ Unlimited
      if (pl.kind === "Unlimited")
        return { ...base, dataAmount: parseFloat(pl.hs.replace(",", ".")) || 0, unit: pl.hsUnit, speedMbps: pl.speed, bcAmount: Number(amount) || 0, bcUnit: (unit as "MB" | "GB") || "GB" }
      return { ...base, dataAmount: Number(amount) || 0, unit: (unit as "MB" | "GB") || "GB" }
    }),
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
    await load(false); touch()
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
              <div className="text-xs text-gray-600 dark:text-slate-300 space-y-0.5">
                <div>USD → VND (JSC): 1 USD = <b>{opts.fx.vndPerUsd.toLocaleString("vi-VN")}</b> VND</div>
                <div>VND → USD (Inc): 1 USD = <b>{opts.fx.vndPerUsdInc.toLocaleString("vi-VN")}</b> VND</div>
                <div>1 USD = <b>{opts.fx.hkdPerUsd}</b> HKD · <b>{opts.fx.cnyPerUsd}</b> CNY (Inc)</div>
              </div>
              <div className="text-[11px] text-gray-400">Tháng {opts.fx.month ? opts.fx.month.slice(5) + "/" + opts.fx.month.slice(0, 4) : "hiện tại"} · muốn đổi: Cài đặt › Tỷ Giá Nội Bộ.</div>
            </>
          ) : <div className="text-xs text-red-600">{opts.fxError}</div>}
        </div>
        <div className="p-4 border border-gray-200 dark:border-slate-700 rounded-xl space-y-2">
          <div className="text-sm font-semibold">Giả định COGS</div>
          <div className="grid grid-cols-2 gap-2">
            {([["fixedPct", "Fixed %", 100], ["dailyPct", "Daily %", 100], ["unl3gb10", "Unl 3GB+10Mbps (GB/ngày)", 1], ["unl500mb10", "Unl 500MB+10Mbps", 1], ["unl500mb5", "Unl 500MB+5Mbps", 1]] as const).map(([k, l, mul]) => (
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
                <select className={`${input} w-full`} value={p.pool} onChange={e => { const pool = e.target.value as Pool; patchProduct(i, { pool, coverage: "", operators: [], plans: [] }) }}>
                  {(Object.keys(POOL_LABEL) as Pool[]).map(k => <option key={k} value={k}>{POOL_LABEL[k]}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Loại SIM</label>
                <select className={`${input} w-full`} value={p.simType} onChange={e => { const simType = e.target.value as "eSIM" | "SIM"; if (coveragesOf(p.pool, simType).includes(p.coverage)) pickCoverage(i, p.pool, simType, p.coverage); else patchProduct(i, { simType, coverage: "", operators: [], plans: [] }) }}>
                  <option value="eSIM">eSIM</option><option value="SIM">SIM</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Khu vực (chỉ hiện nơi BC Portal có bán ở pool + loại SIM này · mỗi sản phẩm 1 nước, 1 pool)</label>
                <select className={`${input} w-full`} value={p.coverage} disabled={!catalog} onChange={e => pickCoverage(i, p.pool, p.simType, e.target.value)}>
                  <option value="">{catalog ? `— chọn (${coveragesOf(p.pool, p.simType).length} khu vực) —` : "— chưa có file Portal —"}</option>
                  {coveragesOf(p.pool, p.simType).map(c => <option key={c} value={c}>{c}</option>)}
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
              <div><label className={label}>Mã nước/nhóm nước (3 ký tự)</label><input className={`${input} w-full uppercase`} maxLength={3} value={p.code} onChange={e => patchProduct(i, { code: e.target.value, codeHint: "" })} placeholder="JPN" />{p.codeHint && <div className="mt-1 text-[11px] text-amber-700">{p.codeHint}</div>}</div>
              <div><label className={label}>supportedCountries (ISO 2)</label><input className={`${input} w-full uppercase`} value={p.iso} onChange={e => patchProduct(i, { iso: e.target.value })} placeholder="JP" /></div>
              <div><label className={label}>Tên nước (EN)</label><input className={`${input} w-full`} value={p.en} onChange={e => patchProduct(i, { en: e.target.value })} placeholder="Japan" /></div>
              <div><label className={label}>Tên nước (VN)</label><input className={`${input} w-full`} value={p.vn} onChange={e => patchProduct(i, { vn: e.target.value })} placeholder="Nhật Bản" /></div>
            </div>

            <div className="space-y-2">
              <label className={label}>Gói (chỉ chọn được gói BC Portal đang bán · mỗi dòng = 1 loại × 1 dung lượng · ProductID tự điền từ Portal)</label>
              {!p.coverage && <div className="text-xs text-gray-400">Chọn khu vực để hiện các gói Portal có bán.</div>}
              {p.plans.map((pl, j) => {
                const offs = offersOf(p, pl.kind)
                const offered = offerDays(p, pl)
                const inputs = toInputs()[i]
                const auto = (() => {
                  const [amount, unit] = pl.amountKey.split("|")
                  const c = catalog && p.coverage ? choosePlan(findPlans(catalog, { sim: p.simType, kind: pl.kind, pool: p.pool, coverage: p.coverage, amount: Number(amount), unit: unit as "MB" | "GB" })) : null
                  return c
                })()
                const manual = pl.productId.trim()
                const manualPlan = manual ? catalog?.plans.find(x => x.id === manual) : undefined
                const manualBad = manual ? (manualPlan ? manualMismatches(manualPlan, inputs, inputs.plans[j]) : ["không có trong file Portal"]) : []
                return (
                  <div key={j} className="border border-gray-100 dark:border-slate-800 rounded-lg p-2 space-y-2">
                    <div className="grid gap-2 items-end sm:grid-cols-[170px_180px_1fr_28px]">
                      <select className={input} value={pl.kind} onChange={e => {
                        const kind = e.target.value as PlanKind
                        const np = defaultPlan(p, kind)
                        if (np) patchPlan(i, j, np)
                      }}>
                        {kindsOf(p).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                      <select className={input} value={pl.amountKey} onChange={e => {
                        const key = e.target.value
                        const o = offs.find(x => keyOf(x.amount, x.unit) === key)
                        const od = o?.plan.days ?? []
                        const keep = pl.days.filter(d => od.includes(d))
                        patchPlan(i, j, { amountKey: key, days: keep.length ? keep : commonOf(od), productId: "" })
                      }} title={pl.kind === "Unlimited" ? "Gói BC thật: Daily {tổng} Throttle to 1Mbps (tốc độ cao + tốc độ 5/10Mbps + Unlimited 1Mbps)" : "Dung lượng gói Portal đang bán"}>
                        {offs.map(o => <option key={keyOf(o.amount, o.unit)} value={keyOf(o.amount, o.unit)}>{pl.kind === "Unlimited" ? `Gói BC: Daily ${labelOf(keyOf(o.amount, o.unit))} Throttle 1Mbps` : `${labelOf(keyOf(o.amount, o.unit))}${pl.kind === "Daily" ? "/ngày" : ""}`}</option>)}
                      </select>
                      <input className={input} value={pl.productId} onChange={e => patchPlan(i, j, { productId: e.target.value })}
                        placeholder={auto ? `ProductID tự động: ${auto.plan.id} (chỉ nhập nếu muốn chọn ID khác)` : "ProductID (không có gói khớp trong Portal)"} />
                      <button onClick={() => patchProduct(i, { plans: p.plans.filter((_, m) => m !== j) })} className="pb-2 text-gray-400 hover:text-red-600" title="Xoá dòng"><Trash2 size={14} /></button>
                    </div>
                    {pl.kind === "Unlimited" && (
                      <div className="flex flex-wrap items-end gap-3 bg-gray-50 dark:bg-slate-900/40 rounded-lg p-2">
                        <div>
                          <label className={label}>Dung lượng TỐC ĐỘ CAO khách thấy (→ cột dataMB)</label>
                          <div className="flex gap-1">
                            <input className={`${input} w-24`} value={pl.hs} inputMode="decimal" onChange={e => patchPlan(i, j, { hs: e.target.value })} />
                            <select className={input} value={pl.hsUnit} onChange={e => patchPlan(i, j, { hsUnit: e.target.value as "MB" | "GB" })}><option>MB</option><option>GB</option></select>
                          </div>
                        </div>
                        <div>
                          <label className={label}>Tốc độ Unlimited (→ cột speedMbps)</label>
                          <select className={input} value={pl.speed} onChange={e => patchPlan(i, j, { speed: Number(e.target.value) as 5 | 10 })}>
                            <option value={10}>10 Mbps</option><option value={5}>5 Mbps</option>
                          </select>
                        </div>
                        <div className="text-[11px] text-gray-500 pb-1.5">
                          Hiển thị cho khách: <b>{pl.hs || "?"} {pl.hsUnit} tốc độ cao, Unlimited {pl.speed}Mbps</b> · dataMB = <b>{Math.round((parseFloat(pl.hs.replace(",", ".")) || 0) * (pl.hsUnit === "GB" ? 1024 : 1))}</b> · speedMbps = <b>{pl.speed}</b><br />
                          Bản chất: {pl.hs || "?"} {pl.hsUnit} tốc độ cao + phần còn lại của gói BC ở {pl.speed}Mbps + Unlimited 1Mbps (tổng = gói BC đã chọn).
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-gray-500 mr-1">Số ngày (chỉ ngày Portal bán):</span>
                      {offered.map(d => {
                        const on = pl.days.includes(d)
                        return <button key={d} type="button" onClick={() => patchPlan(i, j, { days: on ? pl.days.filter(x => x !== d) : [...pl.days, d] })}
                          className={`min-w-[32px] px-1.5 py-0.5 text-xs border rounded-md ${on ? "bg-brand-600 border-brand-600 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:hover:bg-slate-800"}`}>{d}</button>
                      })}
                      <button type="button" className="ml-1 px-2 py-0.5 text-[11px] border border-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800" onClick={() => patchPlan(i, j, { days: commonOf(offered) })} title="1–7, 10, 15, 20, 25, 30 (giao với ngày Portal bán)">Bộ phổ biến</button>
                      <button type="button" className="px-2 py-0.5 text-[11px] border border-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800" onClick={() => patchPlan(i, j, { days: [...offered] })}>Chọn hết</button>
                      <button type="button" className="px-2 py-0.5 text-[11px] border border-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800" onClick={() => patchPlan(i, j, { days: [] })}>Bỏ hết</button>
                      <span className="text-[11px] text-gray-400">đã chọn {pl.days.length}/{offered.length}</span>
                    </div>
                    {manual && manualBad.length > 0 && <div className="text-[11px] text-red-600">ProductID nhập tay {manual} {manualPlan ? `không khớp: ${manualBad.join("; ")}` : "không có trong file Portal"} — xoá ô này để dùng ProductID tự động.</div>}
                    {!manual && auto && auto.duplicates.length > 1 && <div className="text-[11px] text-amber-700">⚠ Portal có {auto.duplicates.length} Plan ID giống hệt nhau ({auto.duplicates.map(x => x.id).join(", ")}) — đã chọn ID mới nhất ({auto.plan.id}).</div>}
                    {!manual && auto && auto.duplicates.length <= 1 && <div className="text-[11px] text-emerald-700">ProductID từ Portal: {auto.plan.id}</div>}
                    {!previewStale && (() => {
                      const pi = preview?.planInfo.find(x => x.product === i && x.line === j)
                      return pi?.planName ? <div className="text-[11px] text-gray-500">{pi.planName}</div> : null
                    })()}
                  </div>
                )
              })}
              <div className="flex gap-2">
                {kindsOf(p).map(k => (
                  <button key={k} onClick={() => { const np = defaultPlan(p, k); if (np) patchProduct(i, { plans: [...p.plans, np] }) }} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800">
                    <Plus size={12} /> {k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-3">
        {!catalog && <span className="text-xs text-red-600 font-semibold">Chưa upload file Portal — chưa thể tạo sản phẩm (Portal cho biết BC đang bán gói nào).</span>}
        <button onClick={() => { setProducts(prev => [...prev, newProduct()]); touch() }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800"><Plus size={14} /> Thêm sản phẩm</button>
        <button onClick={runPreview} disabled={!list || !catalog || !opts.fx || busy === "preview"} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-xl disabled:opacity-50"><Eye size={14} /> {busy === "preview" ? "Đang tính..." : "Xem trước"}</button>
        <button onClick={() => runExport()} disabled={!preview || previewStale || !catalog || busy === "export"} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50"><Download size={14} /> {busy === "export" ? "Đang xuất..." : "Xuất file Excel"}</button>
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
