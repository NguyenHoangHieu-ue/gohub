// Lõi "Tính giá" của tab Tính giá & Tạo sản phẩm (server): gom BC Datapool (CMHK, Singtel) + 3HK theo CÙNG một điểm đến,
// tính giá vốn bằng đúng builder của "Tạo sản phẩm" (cùng công thức, tỷ giá, giả định) nhưng chỉ trả các cột giá.
// Người dùng chỉ có quyền "tính giá" KHÔNG nhận bảng giá gốc của vendor — chỉ nhận kết quả đã tính.
import { build as buildBc } from "@/lib/bc-datapool/builder"
import { build as buildThk } from "@/lib/threehk-datapool/builder"
import { canonCountry, multiRegions, regionKey, sellableCountries, resolvePlans, type PlanCatalog } from "@/lib/bc-datapool/plan-lookup"
import type { Assumptions, Fx, PlanKind, PlanLine, Pool, PoolPriceList, PriceList, ProductInput, SimType } from "@/lib/bc-datapool/types"
import { coveredGroups, priceOf, type NccRow } from "@/lib/threehk-datapool/resolve"
import type { Frames, Policy } from "@/lib/threehk-datapool/builder"
import { customUnlimitedLabel, levelsOf } from "@/lib/datapool-formula"
import { leanPriceRows, PRICE_ONLY_NOISE, type PriceRow } from "./price-only"

export const POOLS: Pool[] = ["CMHK", "SINGTEL"]
export const VENDOR_LABEL = { CMHK: "BC Datapool · CMHK", SINGTEL: "BC Datapool · Singtel", THK: "3HK Datapool" } as const
export type VendorKey = keyof typeof VENDOR_LABEL

export interface Destination {
  key: string
  label: string
  /** Tên ngắn để hiện trong tên gói / dòng "Đã chọn" (nhóm nước: "W22 · 42 nước") */
  short: string
  /** Gói gộp nhiều nước (đa vùng) */
  region: boolean
  /** Nhà cung cấp có giá cho điểm đến này, theo loại SIM */
  vendors: Record<SimType, VendorKey[]>
  /** Có nhà mạng cần KYC (3HK hoặc BC) */
  kyc: boolean
}

interface DestSource {
  bc: Partial<Record<Pool, { coverages: string[]; sims: Set<SimType> }>>
  thk?: string[]
}

export interface QuoteContext {
  list: PriceList | null
  catalog: PlanCatalog | null
  ncc: NccRow[]
  groups: { code: string; en: string; vn: string; iso: string }[]
  refs: { code: string; name: string }[]
  fx: Fx & { month?: string }
  a: Assumptions
  frames: Frames
  whiteSimVnd: number | null
}

const titleCase = (s: string) => s.replace(/\b([a-z])/g, c => c.toUpperCase())

/** Danh sách điểm đến gộp từ cả ba nguồn giá (nước đơn + gói đa vùng). */
export function buildDestinations(ctx: QuoteContext): { dests: Destination[]; sources: Map<string, DestSource> } {
  const dests = new Map<string, Destination>()
  const sources = new Map<string, DestSource>()
  const touch = (key: string, label: string, region: boolean, short = label): [Destination, DestSource] => {
    let d = dests.get(key)
    if (!d) { d = { key, label, short, region, vendors: { eSIM: [], SIM: [] }, kyc: false }; dests.set(key, d); sources.set(key, { bc: {} }) }
    return [d, sources.get(key)!]
  }
  const addVendor = (d: Destination, sim: SimType, v: VendorKey) => { if (!d.vendors[sim].includes(v)) d.vendors[sim].push(v) }

  // BC Datapool: chỉ điểm đến mà Portal đang bán ở đúng pool + loại SIM (Portal = nguồn sự thật về gói BC thực sự bán)
  if (ctx.list && ctx.catalog) {
    for (const pool of POOLS) {
      const rows = ctx.list.pools[pool].rows
      const names = Array.from(new Set(rows.map(r => r.coverage)))
      for (const sim of ["eSIM", "SIM"] as SimType[]) {
        const ok = sellableCountries(ctx.catalog, sim, pool)
        for (const c of names.filter(n => ok.has(canonCountry(n)))) {
          const [d, s] = touch(regionKey(c), c, false)
          const cur = s.bc[pool] ?? (s.bc[pool] = { coverages: [c], sims: new Set() })
          cur.sims.add(sim); addVendor(d, sim, pool)
          if (rows.some(r => r.coverage === c && r.kyc)) d.kyc = true
        }
        for (const m of multiRegions(ctx.catalog, sim, pool)) {
          const covs = m.countries.map(c => names.find(n => canonCountry(n) === canonCountry(c)))
          if (!covs.every(Boolean)) continue
          const [d, s] = touch(m.key, m.label, true, `${m.label.includes(" — ") ? m.label.split(" — ")[0] : "Nhóm"} · ${m.countries.length} nước`)
          const cur = s.bc[pool] ?? (s.bc[pool] = { coverages: covs as string[], sims: new Set() })
          cur.sims.add(sim); addVendor(d, sim, pool)
          if (rows.some(r => (covs as string[]).includes(r.coverage) && r.kyc)) d.kyc = true
        }
      }
    }
  }

  // 3HK: nước trong bảng giá ncc_3hk + các nhóm nước hỗ trợ mà mọi nước đều có giá
  for (const r of ctx.ncc) {
    if (!(r.price_per_gb_hkd > 0)) continue
    const [d, s] = touch(regionKey(r.country), r.country, false)
    s.thk = [r.country]; addVendor(d, "eSIM", "THK"); addVendor(d, "SIM", "THK")
    if (r.is_kyc) d.kyc = true
  }
  for (const g of coveredGroups(ctx.ncc, ctx.groups, ctx.refs)) {
    const [d, s] = touch(regionKey(g.countries), `${g.code} — ${g.countries.length} nước (${g.en.slice(0, 50)})`, true, `${g.code} · ${g.countries.length} nước`)
    s.thk = g.countries; addVendor(d, "eSIM", "THK"); addVendor(d, "SIM", "THK")
    if (g.countries.some(c => ctx.ncc.find(r => r.country === c)?.is_kyc)) d.kyc = true
  }

  // Nhãn nước đơn viết hoa đẹp (BC có khi để chữ thường)
  const out = Array.from(dests.values()).map(d => (d.region ? d : { ...d, label: titleCase(d.label), short: titleCase(d.short) }))
  return { dests: out.sort((a, b) => Number(a.region) - Number(b.region) || a.label.localeCompare(b.label)), sources }
}

export interface PlanReq { kind: PlanKind; amount: number; unit: "MB" | "GB"; speedMbps?: number; days: number[] }
export interface QuoteReq { destKey: string; sim: SimType; plans: PlanReq[]; includeDataOnly?: boolean }

export interface QuoteRow extends Omit<PriceRow, "pool"> {
  vendor: VendorKey
  vendorLabel: string
  /** Vị trí dòng gói trong yêu cầu */
  planIdx: number
  /** "full" = eSIM/SIM đủ bộ, "data" = chỉ gói data rời (A) */
  form: "full" | "data"
  usApplicable: boolean
  note?: string
}
export interface QuoteResult { rows: QuoteRow[]; notes: string[]; kyc: boolean; label: string; short: string }

const unlBcAmount = (p: PlanReq) => p.amount * 2   // gói BC thật thường = 2× dung lượng tốc độ cao (3GB → Daily 6GB Throttle 1Mbps)

/** Tính giá 1 điểm đến cho mọi nhà cung cấp có bán. */
export function quote(ctx: QuoteContext, req: QuoteReq): QuoteResult {
  const { dests, sources } = buildDestinations(ctx)
  const dest = dests.find(d => d.key === req.destKey)
  const src = sources.get(req.destKey)
  if (!dest || !src) throw new Error("Không tìm thấy điểm đến này")
  const rows: QuoteRow[] = []
  const notes: string[] = []
  const plans = req.plans.filter(p => p.days.length && p.amount > 0)

  const pushRows = (vendor: VendorKey, pr: PriceRow[], plansIn: PlanReq[], info?: { line: number; status: string; offeredDays?: number[] }[] | null) => {
    for (const r of pr) {
      const planIdx = plansIn.findIndex(p => p.kind === r.kind && Math.round(p.unit === "GB" ? p.amount * 1024 : p.amount) === Math.round(r.unit === "GB" ? r.dataAmount * 1024 : r.dataAmount) && p.days.includes(r.days) && (p.kind !== "Unlimited" || (p.speedMbps ?? 10) === (r.speedMbps ?? 10)))
      const form: "full" | "data" = /full/i.test(r.type) ? "full" : "data"
      let note: string | undefined
      const li = info?.find(i => i.line === planIdx)
      if (li && (li.status === "missing" || li.status === "ambiguous")) note = "Portal BC không có gói này"
      else if (li?.offeredDays && !li.offeredDays.includes(r.days)) note = `Portal BC không bán ${r.days} ngày cho gói này`
      rows.push({
        vendor, vendorLabel: VENDOR_LABEL[vendor], planIdx, form, note, usApplicable: r.usApplicable !== false,
        type: r.type, kind: r.kind, dataAmount: r.dataAmount, unit: r.unit, speedMbps: r.speedMbps, days: r.days,
        operator: r.operator, pricePerGb: r.pricePerGb, currency: r.currency,
        dataUsd: r.dataUsd, feeUsd: r.feeUsd, feeVnd: r.feeVnd, cogsUsd: r.cogsUsd, cogsVnd: r.cogsVnd, explain: r.explain,
      })
    }
  }

  // BC Datapool (mỗi pool có bán điểm đến này cho loại SIM)
  for (const pool of POOLS) {
    const s = src.bc[pool]
    if (!ctx.list || !s || !s.sims.has(req.sim)) continue
    const rowsOps = ctx.list.pools[pool].rows.filter(r => s.coverages.includes(r.coverage))
    const lines: PlanLine[] = plans.map(p => ({
      kind: p.kind, dataAmount: p.amount, unit: p.unit, days: [...p.days].sort((x, y) => x - y), productId: "",
      ...(p.kind === "Unlimited" ? { speedMbps: p.speedMbps ?? 10, bcAmount: unlBcAmount(p), bcUnit: p.unit } : {}),
    }))
    const input: ProductInput = {
      pool, simType: req.sim, coverages: s.coverages, operators: rowsOps.map(r => `${r.coverage}|${r.operator}`),
      supportCountryCode: "XXX", isoCodes: "XX", countryNameEn: "x", countryNameVn: "x", plans: lines,
      esimDataUs: req.sim === "eSIM" && !!req.includeDataOnly, esimDataVn: false,
    }
    const resolved = resolvePlans([input], ctx.catalog)
    const built = buildBc(resolved.products, ctx.list, ctx.fx, ctx.a, { whiteSimVnd: ctx.whiteSimVnd ?? undefined })
    pushRows(pool, leanPriceRows(built.costRows), plans, resolved.info.map(i => ({ line: i.line, status: i.status, offeredDays: i.offeredDays })))
    for (const w of built.warnings.filter(w => !PRICE_ONLY_NOISE.test(w))) notes.push(`${VENDOR_LABEL[pool]}: ${w.replace(/^Sản phẩm #1[^:]*:\s*/, "")}`)
  }

  // 3HK
  if (src.thk) {
    const price = priceOf(ctx.ncc, src.thk)
    const policyOf = (k: PlanKind): Policy => (k === "Fixed" ? "F" : k === "Unlimited" ? "X" : "P")
    const built = buildThk([{
      input: {
        simType: req.sim, supportCountryCode: "XXX", isoCodes: "XX", countryNameEn: "x", countryNameVn: "x",
        plans: plans.map(p => ({ policy: policyOf(p.kind), amount: p.amount, unit: p.unit, days: [...p.days].sort((x, y) => x - y), speedMbps: p.kind === "Unlimited" ? p.speedMbps ?? 10 : undefined })),
        usSimFull: false, vnEsimData: false,
      },
      price, tpls: [],
    }], { fx: ctx.fx, a: ctx.a, frames: ctx.frames })
    pushRows("THK", leanPriceRows(built.costRows.map(c => ({ ...c, skuUS: c.skuUS }))), plans, null)
    for (const w of built.warnings.filter(w => !PRICE_ONLY_NOISE.test(w))) notes.push(`3HK: ${w.replace(/^Sản phẩm #1[^:]*:\s*/, "")}`)
  }

  const keep = rows.filter(r => req.includeDataOnly || r.form === "full")
  if (!keep.length && !notes.length) notes.push("Chưa có nhà cung cấp nào tính được gói này")
  return { rows: keep, notes: Array.from(new Set(notes)), kyc: dest.kyc, label: dest.label, short: dest.short }
}

/** Mức Unlimited chọn được (từ Công Thức Datapool). */
export function unlimitedOptions(a: Assumptions) {
  return levelsOf(a).map(l => ({ amount: l.dataMb % 1024 === 0 ? l.dataMb / 1024 : l.dataMb, unit: (l.dataMb % 1024 === 0 ? "GB" : "MB") as "GB" | "MB", speedMbps: l.speedMbps, label: customUnlimitedLabel(l).replace(" tốc độ cao + Unlimited ", " + ") }))
}

export type { PoolPriceList }
