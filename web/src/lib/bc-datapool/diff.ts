import type { CatalogPlan, PlanCatalog } from "./plan-catalog"
import type { Pool, PriceList } from "./types"

const CAP = 300

export interface PriceChange { pool: Pool; coverage: string; operator: string; from?: number; to?: number; currency: string }
export interface FeeChange { pool: Pool; field: string; from: number; to: number }
/** Thay đổi giữa 2 lần upload bảng báo giá. */
export interface PriceDiff {
  at: string
  /** false = lần upload đầu tiên (không có bản cũ để so) */
  compared: boolean
  added: PriceChange[]
  removed: PriceChange[]
  changed: PriceChange[]
  fees: FeeChange[]
  /** Số dòng thật (danh sách bị cắt ở CAP) */
  counts: { added: number; removed: number; changed: number; fees: number }
}

export function diffPriceList(old: PriceList | null, next: PriceList, at = new Date().toISOString()): PriceDiff {
  const out: PriceDiff = { at, compared: !!old, added: [], removed: [], changed: [], fees: [], counts: { added: 0, removed: 0, changed: 0, fees: 0 } }
  if (!old) return out
  for (const pool of ["CMHK", "SINGTEL"] as Pool[]) {
    const o = old.pools[pool], n = next.pools[pool]
    const key = (r: { coverage: string; operator: string }) => `${r.coverage}|${r.operator}`
    const om = new Map(o.rows.map(r => [key(r), r])), nm = new Map(n.rows.map(r => [key(r), r]))
    for (const [k, r] of nm) {
      const was = om.get(k)
      if (!was) out.added.push({ pool, coverage: r.coverage, operator: r.operator, to: r.pricePerGb, currency: n.currency })
      else if (was.pricePerGb !== r.pricePerGb || o.currency !== n.currency)
        out.changed.push({ pool, coverage: r.coverage, operator: r.operator, from: was.pricePerGb, to: r.pricePerGb, currency: n.currency })
    }
    for (const [k, r] of om) if (!nm.has(k)) out.removed.push({ pool, coverage: r.coverage, operator: r.operator, from: r.pricePerGb, currency: o.currency })
    for (const [field, a, b] of [["IMSI", o.imsiFee, n.imsiFee], ["Phí eSIM (CNY)", o.esimFeeCny, n.esimFeeCny], ["Phí SIM (CNY)", o.simFeeCny, n.simFeeCny]] as const)
      if (a !== b) out.fees.push({ pool, field, from: a, to: b })
  }
  out.counts = { added: out.added.length, removed: out.removed.length, changed: out.changed.length, fees: out.fees.length }
  out.added = out.added.slice(0, CAP)
  out.removed = out.removed.slice(0, CAP)
  out.changed = out.changed.slice(0, CAP)
  return out
}

export interface PlanRef { id: string; label: string }
/** Thay đổi giữa 2 lần upload file Portal. */
export interface CatalogDiff {
  at: string
  compared: boolean
  added: PlanRef[]
  removed: PlanRef[]
  /** Cùng Plan ID nhưng đổi số ngày bán / tốc độ / nhà mạng / timing */
  changed: (PlanRef & { detail: string })[]
  counts: { added: number; removed: number; changed: number }
}

const label = (p: CatalogPlan) => `${p.sim} ${p.kind} ${p.countries.join("+")} ${p.amount}${p.unit} (${p.pool})`

/** So sánh riêng từng loại SIM có trong lần upload (loại không upload thì giữ nguyên, không tính là "bị bỏ"). */
export function diffCatalog(old: PlanCatalog | null, uploaded: CatalogPlan[], at = new Date().toISOString()): CatalogDiff {
  const out: CatalogDiff = { at, compared: !!old, added: [], removed: [], changed: [], counts: { added: 0, removed: 0, changed: 0 } }
  if (!old) return out
  const sims = new Set(uploaded.map(p => p.sim))
  const om = new Map(old.plans.filter(p => sims.has(p.sim)).map(p => [p.id, p]))
  const nm = new Map(uploaded.map(p => [p.id, p]))
  for (const [id, p] of nm) {
    const was = om.get(id)
    if (!was) { out.added.push({ id, label: label(p) }); continue }
    const bits: string[] = []
    const gone = was.days.filter(d => !p.days.includes(d)), plus = p.days.filter(d => !was.days.includes(d))
    if (gone.length) bits.push(`ngừng bán ${gone.join(",")} ngày`)
    if (plus.length) bits.push(`mở thêm ${plus.join(",")} ngày`)
    // Bản cũ chưa lưu tốc độ (throttleKbps undefined) thì không coi là "đổi"
    if (was.throttleKbps !== undefined && was.throttleKbps !== p.throttleKbps) bits.push(`tốc độ sau ngưỡng ${was.throttleKbps}→${p.throttleKbps}kbps`)
    if (was.operators.join("/") !== p.operators.join("/")) bits.push(`nhà mạng ${was.operators.join("/")}→${p.operators.join("/")}`)
    if (was.timing !== p.timing) bits.push(`timing ${was.timing}→${p.timing}`)
    if (bits.length) out.changed.push({ id, label: label(p), detail: bits.join("; ") })
  }
  for (const [id, p] of om) if (!nm.has(id)) out.removed.push({ id, label: label(p) })
  out.counts = { added: out.added.length, removed: out.removed.length, changed: out.changed.length }
  out.added = out.added.slice(0, CAP)
  out.removed = out.removed.slice(0, CAP)
  out.changed = out.changed.slice(0, CAP)
  return out
}

export const hasPriceChanges = (d: PriceDiff) => d.counts.added + d.counts.removed + d.counts.changed + d.counts.fees > 0
export const hasCatalogChanges = (d: CatalogDiff) => d.counts.added + d.counts.removed + d.counts.changed > 0
