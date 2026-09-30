import type { DataUnit, PlanKind, Pool, ProductInput, SimType } from "./types"

/**
 * Phần THUẦN (không phụ thuộc thư viện đọc Excel) của danh mục gói Portal BC Datapool — dùng được cả ở server lẫn trình duyệt.
 * Portal là nguồn sự thật về "BC thực sự bán gói nào"; bảng báo giá chỉ cho biết giá.
 */

/** 1 gói (Plan ID = ProductID BC) trong file "Purchase information" xuất từ Portal BC Datapool. */
export interface CatalogPlan {
  id: string
  sim: SimType
  kind: Exclude<PlanKind, "Unlimited">
  countries: string[]
  amount: number
  unit: DataUnit
  pool: Pool
  operators: string[]
  /** "Natural Day" (reset 00:00 UTC+8) hoặc "24-Hour" */
  timing: string
  /** Tốc độ sau khi hết data tốc độ cao: 384 (thường), 1024 = "Throttle to 1Mbps" (dùng cho Unlimited), 128... */
  throttleKbps?: number
  name: string
  /** Các số ngày Portal thực sự bán cho gói này */
  days: number[]
}

export interface PlanCatalog {
  uploadedAt: string
  files: string[]
  lastDiff?: import("./diff").CatalogDiff
  plans: CatalogPlan[]
}

// Tên nước Portal ↔ tên trong bảng báo giá khác nhau chút ít
const ALIAS: Record<string, string> = {
  "brunei darussalam": "brunei", columbia: "colombia", "east timor": "timor leste", macau: "macao",
  russia: "russian federation", "u s a": "united states", usa: "united states",
}
export function canonCountry(s: string): string {
  const c = s.toLowerCase().replace(/\(china\)/g, "").replace(/[^a-z0-9]+/g, " ").trim()
  return ALIAS[c] ?? c
}

/** Unlimited: `amount`/`unit` = dung lượng gói BC thật (VD 6GB), KHÔNG phải dung lượng tốc độ cao khách thấy. */
export interface PlanQuery { sim: SimType; kind: PlanKind; pool: Pool; coverage: string; amount: number; unit: DataUnit }

const isThrottle1M = (p: CatalogPlan) => p.throttleKbps === 1024

/**
 * Gói Portal khớp (nước đơn, cùng pool/SIM/dung lượng).
 * Unlimited KHÔNG có gói riêng ở BC: nội bộ = N tốc độ cao + phần còn lại @5/10Mbps + không giới hạn @1Mbps (tổng thường 6GB), phía BC gộp
 * thành "Daily {tổng}GB — Throttle to 1Mbps" → tra gói Daily có tốc độ sau ngưỡng 1024kbps. Dung lượng tốc độ cao khách thấy (dataMB)
 * và tốc độ (speedMbps) là thông tin nội bộ, KHÔNG dùng để tra gói.
 */
export function findPlans(cat: PlanCatalog, q: PlanQuery): CatalogPlan[] {
  const want = canonCountry(q.coverage)
  const unl = q.kind === "Unlimited"
  const kind = unl ? "Daily" : q.kind
  const amount = q.amount
  return cat.plans.filter(p =>
    p.sim === q.sim && p.kind === kind && p.pool === q.pool && p.amount === amount && p.unit === q.unit &&
    (unl ? isThrottle1M(p) : !isThrottle1M(p)) &&
    p.countries.length === 1 && canonCountry(p.countries[0]) === want)
}

const newerId = (a: string, b: string) => (a.length !== b.length ? a.length - b.length : a.localeCompare(b))
const sameSpec = (a: CatalogPlan, b: CatalogPlan) =>
  a.timing === b.timing && a.throttleKbps === b.throttleKbps && a.operators.join() === b.operators.join() && a.days.join() === b.days.join()

/**
 * Chọn 1 gói từ các ứng viên: 1 gói → dùng luôn; nhiều gói GIỐNG HỆT nhau (chỉ khác ID/viết hoa tên, VD Indonesia) → lấy ID mới nhất;
 * nhiều gói khác nhau thật → null (mơ hồ, không đoán).
 */
export function choosePlan(cands: CatalogPlan[]): { plan: CatalogPlan; duplicates: CatalogPlan[] } | null {
  if (cands.length === 1) return { plan: cands[0], duplicates: [] }
  if (cands.length > 1 && cands.every(c => sameSpec(c, cands[0]))) return { plan: [...cands].sort((x, y) => newerId(y.id, x.id))[0], duplicates: cands }
  return null
}

/** Các nước (chuẩn hoá tên) mà Portal có bán ở pool + loại SIM này (bất kể Daily/Fixed) — dùng để ẩn khu vực BC không bán. */
export function sellableCountries(cat: PlanCatalog | null, sim: SimType, pool: Pool): Set<string> {
  const out = new Set<string>()
  if (!cat) return out
  for (const p of cat.plans) if (p.sim === sim && p.pool === pool && p.countries.length === 1) out.add(canonCountry(p.countries[0]))
  return out
}

export interface Offer {
  amount: number
  unit: DataUnit
  /** Gói Portal dùng cho dung lượng này (đã chọn giữa các gói giống hệt nhau) */
  plan: CatalogPlan
}

const mb = (amount: number, unit: DataUnit) => (unit === "GB" ? amount * 1024 : amount)

/**
 * Các dung lượng Portal bán cho (SIM, pool, nước, loại), sắp tăng dần. Unlimited: liệt kê các gói BC "Daily {tổng}GB Throttle to 1Mbps"
 * (amount = TỔNG của gói BC, VD 6GB).
 */
export function offers(cat: PlanCatalog | null, q: { sim: SimType; pool: Pool; coverage: string; kind: PlanKind }): Offer[] {
  if (!cat || !q.coverage) return []
  const want = canonCountry(q.coverage)
  const unl = q.kind === "Unlimited"
  const kind = unl ? "Daily" : q.kind
  const groups = new Map<string, CatalogPlan[]>()
  for (const p of cat.plans) {
    if (p.sim !== q.sim || p.pool !== q.pool || p.kind !== kind || p.countries.length !== 1 || canonCountry(p.countries[0]) !== want) continue
    if (unl ? !isThrottle1M(p) : isThrottle1M(p)) continue
    const k = `${p.amount}|${p.unit}`
    groups.set(k, [...(groups.get(k) ?? []), p])
  }
  const out: Offer[] = []
  for (const g of groups.values()) {
    const c = choosePlan(g)
    const plan = c?.plan ?? g[0]
    out.push({ amount: plan.amount, unit: plan.unit, plan })
  }
  return out.sort((a, b) => mb(a.amount, a.unit) - mb(b.amount, b.unit))
}

/** Loại gói (Daily/Fixed/Unlimited) mà Portal có bán cho khu vực này. */
export function availableKinds(cat: PlanCatalog | null, q: { sim: SimType; pool: Pool; coverage: string }): PlanKind[] {
  return (["Daily", "Fixed", "Unlimited"] as PlanKind[]).filter(kind => offers(cat, { ...q, kind }).length > 0)
}

export interface PlanInfo {
  product: number
  line: number
  /** manual = người dùng tự nhập (đã kiểm khớp Portal) · portal = tự lấy từ file Portal · missing/ambiguous = không tự lấy được · none = chưa có Portal */
  status: "manual" | "portal" | "missing" | "ambiguous" | "none"
  /** Ghi chú khi tự chọn giữa các Plan ID giống hệt nhau */
  note?: string
  productId: string
  planName?: string
  offeredDays?: number[]
  candidates?: string[]
}

/** Gói BC thật của 1 dòng: Unlimited dùng bcAmount/bcUnit (mặc định 2× dung lượng tốc độ cao); Daily/Fixed dùng chính dung lượng gói. */
export const bcAmountOf = (pl: ProductInput["plans"][number]) => (pl.kind === "Unlimited" ? pl.bcAmount ?? pl.dataAmount * 2 : pl.dataAmount)
export const bcUnitOf = (pl: ProductInput["plans"][number]) => (pl.kind === "Unlimited" ? pl.bcUnit ?? pl.unit : pl.unit)

/** Các điểm KHÔNG khớp giữa gói Portal (tra theo ProductID nhập tay) và cấu hình người dùng khai báo. */
export function manualMismatches(plan: CatalogPlan, p: ProductInput, pl: ProductInput["plans"][number]): string[] {
  const bits: string[] = []
  const unl = pl.kind === "Unlimited"
  if (plan.sim !== p.simType) bits.push(`là gói ${plan.sim}, khai báo ${p.simType}`)
  if (plan.pool !== p.pool) bits.push(`thuộc pool ${plan.pool}, khai báo ${p.pool}`)
  if (plan.countries.length !== 1 || canonCountry(plan.countries[0]) !== canonCountry(p.coverages[0] ?? "")) bits.push(`nước ${plan.countries.join("+")}, khai báo ${p.coverages[0] || "?"}`)
  const wantKind = unl ? "Daily" : pl.kind
  if (plan.kind !== wantKind) bits.push(`loại ${plan.kind}, khai báo ${pl.kind}`)
  if (unl !== isThrottle1M(plan)) bits.push(unl ? "không phải gói Throttle to 1Mbps (dùng cho Unlimited)" : "là gói Throttle to 1Mbps (chỉ dùng cho Unlimited)")
  const wantAmount = bcAmountOf(pl), wantUnit = bcUnitOf(pl)
  if (plan.amount !== wantAmount || plan.unit !== wantUnit) bits.push(`dung lượng ${plan.amount}${plan.unit}, cần ${wantAmount}${wantUnit}${unl ? ` (gói BC cho Unlimited ${pl.dataAmount}${pl.unit} tốc độ cao)` : ""}`)
  return bits
}

/**
 * Điền ProductID còn trống từ file Portal và KIỂM TRA cứng mọi dòng theo Portal (Portal là nguồn sự thật về gói BC bán):
 *  · ProductID trống → tự tra theo (SIM, pool, nước, loại, dung lượng); không có → báo lỗi.
 *  · ProductID nhập tay → phải có trong Portal VÀ khớp SIM/pool/nước/loại/dung lượng.
 *  · Số ngày phải thuộc số ngày Portal bán cho gói đó.
 */
export function resolvePlans(products: ProductInput[], cat: PlanCatalog | null): { products: ProductInput[]; info: PlanInfo[]; warnings: string[] } {
  const info: PlanInfo[] = []
  const warnings: string[] = []
  const out = products.map((p, pi) => {
    const label = `Sản phẩm #${pi + 1} (${p.countryNameEn || p.supportCountryCode || "?"})`
    const plans = p.plans.map((pl, li) => {
      const where = `${label} · dòng ${li + 1}`
      const manual = pl.productId.trim()
      const cands = cat && p.coverages[0] ? findPlans(cat, { sim: p.simType, kind: pl.kind, pool: p.pool, coverage: p.coverages[0], amount: bcAmountOf(pl), unit: bcUnitOf(pl) }) : []
      let chosen: CatalogPlan | undefined
      let status: PlanInfo["status"] = "none"
      let note: string | undefined
      let productId = manual
      if (manual) {
        status = "manual"
        chosen = cat?.plans.find(x => x.id === manual)
        if (cat && !chosen) warnings.push(`${where}: ProductID ${manual} không có trong file Portal — chỉ được dùng ProductID của gói BC đang bán`)
        else if (chosen) {
          const bad = manualMismatches(chosen, p, pl)
          if (bad.length) warnings.push(`${where}: ProductID ${manual} là "${chosen.name.trim()}" — không khớp cấu hình (${bad.join("; ")})`)
        }
      } else if (cat) {
        const c = choosePlan(cands)
        if (c) {
          chosen = c.plan; status = "portal"; productId = chosen.id
          if (c.duplicates.length > 1) note = `Portal có ${c.duplicates.length} Plan ID giống hệt nhau (${c.duplicates.map(x => x.id).join(", ")}) — đã chọn ID mới nhất; muốn dùng ID khác thì nhập tay`
        } else if (cands.length > 1) {
          status = "ambiguous"
          warnings.push(`${where}: Portal có ${cands.length} Plan ID cho gói này (${cands.map(x => x.id).join(", ")}) — chọn 1 và nhập ProductID`)
        } else {
          status = "missing"
          const want = pl.kind === "Unlimited" ? `Daily ${bcAmountOf(pl)}${bcUnitOf(pl)} Throttle to 1Mbps (cho Unlimited ${pl.dataAmount}${pl.unit} tốc độ cao)` : `${pl.kind} ${pl.dataAmount}${pl.unit}`
          warnings.push(`${where}: không tìm thấy gói ${want} ${p.simType} của ${p.coverages[0] || "?"} (${p.pool}) trong file Portal — BC không bán gói này (hoặc file Portal cũ, hãy upload lại)`)
        }
      }
      if (chosen) {
        const bad = pl.days.filter(d => !chosen!.days.includes(d))
        if (bad.length) warnings.push(`${where}: Portal không bán ${bad.join(", ")} ngày cho gói này (Portal có: ${chosen.days.join(", ")})`)
      }
      info.push({ product: pi, line: li, status, note, productId, planName: chosen?.name.trim(), offeredDays: chosen?.days, candidates: cands.length > 1 ? cands.map(c => c.id) : undefined })
      return { ...pl, productId }
    })
    return { ...p, plans }
  })
  return { products: out, info, warnings }
}
