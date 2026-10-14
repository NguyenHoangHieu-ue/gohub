import { ceil2, dataCostPool, dataCostUsd, frameFeeUsd, usdToVnd } from "@/lib/bc-datapool/pricing"
import { nameToIso2, type RefCountryLite, type SupportCountryLite } from "@/lib/bc-datapool/iso"
import { levelMb, levelsOf } from "@/lib/datapool-formula"
import type { Assumptions, Fx, PlanKind, PlanLine, Pool, PriceList, PriceRow } from "@/lib/bc-datapool/types"
import type { Frames } from "@/lib/threehk-datapool/builder"
import type { NccRow } from "@/lib/threehk-datapool/resolve"
import { compareCogs, type CogsVerdict } from "./compare"

// Soát giá vốn (COGS) các gói Datapool ĐANG CÓ trong hệ thống: tính lại từng SKU bằng đúng công thức của tab "Tạo sản phẩm"
// (tỷ giá nội bộ + giả định Công Thức Datapool + bảng giá pool hiện tại) rồi so với `skus.latest_cogs`. Thuần (không I/O).
export type AuditVendor = "3HK" | "BC_CMHK" | "BC_SINGTEL"
/** Vendor theo ký tự 6–7 của mã SKU/Product (vị trí vendor trong mã 13 ký tự). */
export const VENDOR_OF_CODE: Record<string, AuditVendor> = { "3D": "3HK", WD: "BC_CMHK", W1: "BC_SINGTEL" }
export const VENDOR_LABEL: Record<AuditVendor, string> = { "3HK": "3HK Datapool", BC_CMHK: "BC Datapool (CMHK)", BC_SINGTEL: "BC Datapool (Singtel)" }
export const POOL_OF_VENDOR: Record<Exclude<AuditVendor, "3HK">, Pool> = { BC_CMHK: "CMHK", BC_SINGTEL: "SINGTEL" }

export interface AuditSkuInput {
  sku_code: string; product_code: string; tenant: string; status: string
  data_amount: number | null; data_amount_unit: string | null; day_amount: number | null
  data: number | null; speed: number | null; throttle_speed: string | null
  latest_cogs: number | null; latest_cogs_currency: string | null; product_type: string | null
}
export interface AuditProductInput { product_code: string; supported_countries: string | null; onsite_carrier: string | null; type_of_sim: string | null }

export interface AuditCtx {
  fx: Fx; a: Assumptions; ncc: NccRow[]; refs: RefCountryLite[]; groups: SupportCountryLite[]
  priceList: PriceList | null; frames: Frames; whiteSimVnd: number | null
}

/** Số liệu trung gian của 1 dòng — để file xuất dựng lại công thức Excel. */
export interface AuditCalc {
  pricePerGb: number; poolCurrency: "HKD" | "USD"; amount: number; unit: "MB" | "GB"; days: number; kind: PlanKind
  unlIdx?: number; dataPool: number; dataUsd: number; feeUsd: number; feeKind: "none" | "esim" | "sim"; cogsUsd: number; cogsVnd: number
}

export type AuditVerdict = CogsVerdict | "nocogs" | "skip"
export interface AuditRow {
  sku: string; product: string; vendor: AuditVendor; tenant: "US" | "VN"; status: string; type: "A" | "C" | "E"; policy: string
  label: string; countries: string; currency: string
  current: number | null; expected: number | null; diff: number | null; diffPct: number | null
  verdict: AuditVerdict
  /** Lý do bỏ qua / ghi chú giả định (vd không khớp nhà mạng nên lấy nhà mạng đắt nhất) */
  note?: string
  /** Công thức đã thế số (để người soát đối chiếu) */
  explain?: string
  calc?: AuditCalc
}

const KIND_OF_POLICY: Record<string, PlanKind> = { F: "Fixed", P: "Daily", T: "Daily", X: "Unlimited" }
const TYPE_LABEL = { A: "Data rời (A)", C: "eSIM full", E: "SIM full" } as const
const parseIsoList = (s: string | null) => (s ?? "").split(/[,\s]+/).map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x))
const fmtAmount = (n: number) => String(Number(n.toFixed(2)))

export interface AuditIndex {
  /** ISO2 → dòng giá 3HK (nước đó) */
  ncc: Map<string, NccRow>
  /** pool → ISO2 → các dòng giá của nước đó */
  bc: Record<Pool, Map<string, PriceRow[]>>
}

/** Dựng chỉ mục tra giá 1 lần (tránh tra tuyến tính từng SKU — hàng chục nghìn SKU). */
export function buildIndex(ctx: AuditCtx): AuditIndex {
  const ncc = new Map<string, NccRow>()
  for (const r of ctx.ncc) { const i = nameToIso2(r.country, ctx.refs, ctx.groups); if (i && !ncc.has(i)) ncc.set(i, r) }
  const bc: Record<Pool, Map<string, PriceRow[]>> = { CMHK: new Map(), SINGTEL: new Map() }
  for (const pool of ["CMHK", "SINGTEL"] as const) {
    for (const r of ctx.priceList?.pools[pool]?.rows ?? []) {
      const i = nameToIso2(r.coverage, ctx.refs, ctx.groups)
      if (!i) continue
      bc[pool].set(i, [...(bc[pool].get(i) ?? []), r])
    }
  }
  return { ncc, bc }
}

/** Nhà mạng ghi ở `onsite_carrier` ("KDDI/SoftBank" hoặc nhiều dòng "Nước: nhà mạng/nhà mạng") → danh sách tên viết thường. */
export function parseOperators(onsite: string | null): string[] {
  if (!onsite) return []
  return Array.from(new Set(onsite.split(/\r?\n/).flatMap(l => l.replace(/^[^:/]+:\s*/, "").split("/")).map(x => x.trim().toLowerCase()).filter(Boolean)))
}

const skipRow = (base: Omit<AuditRow, "verdict" | "current" | "expected" | "diff" | "diffPct" | "note" | "calc"> & { current: number | null }, note: string): AuditRow =>
  ({ ...base, expected: null, diff: null, diffPct: null, verdict: "skip", note })

/** Tính lại 1 SKU. Trả null nếu không phải SKU Datapool cần soát (khung SIM/eSIM profile, mã lạ). */
export function auditSku(sku: AuditSkuInput, product: AuditProductInput | undefined, ctx: AuditCtx, idx: AuditIndex): AuditRow | null {
  const code = sku.sku_code
  const vendor = VENDOR_OF_CODE[code.slice(5, 7)]
  const type = code[1] as "A" | "C" | "E"
  const policy = code[7]
  if (code.length !== 13 || !vendor || !["A", "C", "E"].includes(type) || !KIND_OF_POLICY[policy]) return null
  if (/frame|profile/i.test(sku.product_type ?? "")) return null
  const kind = KIND_OF_POLICY[policy]
  const tenant: "US" | "VN" = sku.tenant === "US" ? "US" : "VN"
  const unit: "MB" | "GB" = sku.data_amount_unit === "MB" ? "MB" : "GB"
  const amount = Number(sku.data_amount) || 0, days = Number(sku.day_amount) || 0
  const speed = sku.speed ?? (Number(sku.throttle_speed?.match(/(\d+(?:\.\d+)?)\s*mbps/i)?.[1]) || 0)
  const hsMb = kind === "Unlimited" ? (Number(sku.data) > 0 ? Number(sku.data) : levelMb(amount, unit)) : 0
  const currency = tenant === "US" ? "USD" : "VND"
  const label = kind === "Unlimited" ? `${TYPE_LABEL[type]} · Unlimited ${hsMb % 1024 === 0 ? `${hsMb / 1024}GB` : `${hsMb}MB`} + ${speed || "?"}Mbps × ${days} ngày`
    : `${TYPE_LABEL[type]} · ${kind} ${fmtAmount(amount)}${unit} × ${days} ngày`
  const base = { sku: code, product: sku.product_code, vendor, tenant, status: sku.status, type, policy, label, countries: product?.supported_countries ?? "", currency, current: sku.latest_cogs == null ? null : Number(sku.latest_cogs) }
  if (!(amount > 0) || !(days > 0)) return skipRow(base, "thiếu dung lượng/số ngày trong hệ thống")
  if (sku.latest_cogs != null && sku.latest_cogs_currency && sku.latest_cogs_currency !== currency) return skipRow(base, `hệ thống ghi giá vốn bằng ${sku.latest_cogs_currency}, kỳ vọng ${currency}`)
  if (!product) return skipRow(base, "không tìm thấy Product của SKU")
  const isos = parseIsoList(product.supported_countries)
  if (!isos.length) return skipRow(base, "Product chưa có supportedCountries")

  // ── giá/GB của pool ──
  let pricePerGb = 0, poolCurrency: "HKD" | "USD" = "HKD", note: string | undefined
  let pool: Pool | null = null
  if (vendor === "3HK") {
    const rows = isos.map(i => idx.ncc.get(i))
    const miss = isos.filter((_, k) => !rows[k] || !(rows[k]!.price_per_gb_hkd > 0))
    if (miss.length) return skipRow(base, `bảng giá 3HK (ncc_3hk) không có giá cho: ${miss.join(", ")}`)
    pricePerGb = Math.max(...rows.map(r => r!.price_per_gb_hkd))
  } else {
    pool = POOL_OF_VENDOR[vendor]
    const list = ctx.priceList?.pools[pool]
    if (!list) return skipRow(base, "chưa có bảng báo giá BC Datapool")
    poolCurrency = list.currency
    const perIso = isos.map(i => idx.bc[pool!].get(i))
    const miss = isos.filter((_, k) => !perIso[k]?.length)
    if (miss.length) return skipRow(base, `bảng báo giá BC (${pool}) không có nước: ${miss.join(", ")}`)
    const all = perIso.flat() as PriceRow[]
    const ops = parseOperators(product.onsite_carrier)
    const chosen = ops.length ? all.filter(r => ops.includes(r.operator.trim().toLowerCase())) : []
    if (ops.length && !chosen.length) note = "nhà mạng ghi ở Product không khớp bảng giá — dùng nhà mạng đắt nhất của nước"
    pricePerGb = Math.max(...(chosen.length ? chosen : all).map(r => r.pricePerGb))
  }

  // ── data ──
  const line: PlanLine = kind === "Unlimited"
    ? { kind, dataAmount: hsMb, unit: "MB", days: [days], productId: "", speedMbps: speed }
    : { kind, dataAmount: amount, unit, days: [days], productId: "" }
  const dataPool = dataCostPool(line, days, pricePerGb, ctx.a)
  let unlIdx: number | undefined
  if (kind === "Unlimited") {
    unlIdx = levelsOf(ctx.a).findIndex(l => l.dataMb === hsMb && l.speedMbps === speed)
    if (unlIdx < 0) return skipRow(base, `mức Unlimited ${hsMb}MB + ${speed || "?"}Mbps không có trong bảng mức (Công Thức Datapool)`)
  }
  const dataUsd = dataCostUsd(line, days, pricePerGb, poolCurrency, ctx.fx, ctx.a)

  // ── phí khung theo loại ──
  let feeUsd = 0, feeKind: AuditCalc["feeKind"] = "none", cogsUsd = dataUsd, cogsVnd = usdToVnd(dataUsd, ctx.fx)
  if (type !== "A") {
    if (vendor === "3HK") {
      const f = type === "C" ? ctx.frames.esimUsUsd : ctx.frames.simUsUsd
      if (f == null || (type === "E" && ctx.frames.simVnVnd == null)) return skipRow(base, "thiếu giá khung trong hệ thống")
      feeUsd = f; feeKind = type === "C" ? "esim" : "sim"; cogsUsd = ceil2(dataUsd + feeUsd)
      cogsVnd = type === "C" ? usdToVnd(cogsUsd, ctx.fx) : usdToVnd(dataUsd, ctx.fx) + ctx.frames.simVnVnd!
    } else {
      const sim = type === "C" ? "eSIM" : "SIM"
      if (sim === "SIM" && !(ctx.whiteSimVnd && ctx.whiteSimVnd > 0)) return skipRow(base, "thiếu giá SIM trắng trong hệ thống")
      feeUsd = frameFeeUsd(sim, ctx.priceList!.pools[pool!], ctx.fx, ctx.whiteSimVnd ?? 0); feeKind = sim === "eSIM" ? "esim" : "sim"
      cogsUsd = ceil2(dataUsd + feeUsd); cogsVnd = usdToVnd(cogsUsd, ctx.fx)
    }
  }
  const expected = tenant === "US" ? cogsUsd : cogsVnd
  const pct = (x: number) => `${Number((x * 100).toFixed(2))}%`
  const how = kind === "Daily" ? `${fmtAmount(amount)}${unit}/ngày × ${days} ngày × ${pct(ctx.a.dailyPct)}`
    : kind === "Fixed" ? `${fmtAmount(amount)}${unit} × ${pct(ctx.a.fixedPct)}`
    : `${levelsOf(ctx.a)[unlIdx!].gbPerDay} GB/ngày × ${days} ngày`
  const explain = `${pricePerGb} ${poolCurrency}/GB × (${how}) = ${Math.round(dataPool * 1e4) / 1e4} ${poolCurrency} → ${poolCurrency === "HKD" ? `÷ ${ctx.fx.hkdPerUsd} ` : ""}= ${dataUsd} USD`
    + (feeKind !== "none" ? ` + khung ${feeUsd} = ${cogsUsd} USD` : "")
    + (tenant === "VN" ? ` → × ${ctx.fx.vndPerUsd.toLocaleString("en-US")}${vendor === "3HK" && type === "E" ? ` (data) + khung SIM VN ${ctx.frames.simVnVnd}` : ""} = ${cogsVnd.toLocaleString("en-US")} VND` : "")
  const calc: AuditCalc = { pricePerGb, poolCurrency, amount: kind === "Unlimited" ? hsMb : amount, unit: kind === "Unlimited" ? "MB" : unit, days, kind, unlIdx, dataPool, dataUsd, feeUsd, feeKind, cogsUsd, cogsVnd }
  if (base.current == null) return { ...base, expected, diff: null, diffPct: null, verdict: "nocogs", note: "hệ thống chưa có giá vốn", explain, calc }
  const cmp = compareCogs(base.current, expected, currency)
  return { ...base, expected, diff: cmp.diff, diffPct: cmp.diffPct, verdict: cmp.verdict, note, explain, calc }
}

export function auditAll(skus: AuditSkuInput[], products: AuditProductInput[], ctx: AuditCtx): AuditRow[] {
  const idx = buildIndex(ctx)
  const byCode = new Map(products.map(p => [p.product_code, p]))
  const out: AuditRow[] = []
  for (const s of skus) { const r = auditSku(s, byCode.get(s.product_code), ctx, idx); if (r) out.push(r) }
  return out
}

export interface AuditSummary {
  total: number
  byVendor: Record<AuditVendor, { total: number; match: number; rounding: number; diff: number; nocogs: number; skip: number }>
  diff: number; skip: number
}
export function summarize(rows: AuditRow[]): AuditSummary {
  const empty = () => ({ total: 0, match: 0, rounding: 0, diff: 0, nocogs: 0, skip: 0 })
  const byVendor = { "3HK": empty(), BC_CMHK: empty(), BC_SINGTEL: empty() }
  for (const r of rows) { const v = byVendor[r.vendor]; v.total++; v[r.verdict]++ }
  return { total: rows.length, byVendor, diff: rows.filter(r => r.verdict === "diff").length, skip: rows.filter(r => r.verdict === "skip").length }
}

/** Chữ ký tập SKU lệch (mã + giá tính lại) — dùng để chỉ báo lại khi tình trạng lệch THAY ĐỔI, tránh nhắn mỗi ngày. */
export function mismatchSignature(rows: AuditRow[]): string {
  const parts = rows.filter(r => r.verdict === "diff" || r.verdict === "nocogs").map(r => `${r.sku}:${r.tenant}:${r.expected}`).sort()
  let h = 5381
  for (const ch of parts.join("|")) h = ((h << 5) + h + ch.charCodeAt(0)) | 0
  return `${parts.length}:${(h >>> 0).toString(36)}`
}
