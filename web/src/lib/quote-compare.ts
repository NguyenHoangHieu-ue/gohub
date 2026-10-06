// Tab "Thị trường & Báo giá" — mốc 2a: so giá FULL (đã cộng phí khung) của các vendor cho từng SKU đang bán.
// Logic thuần (không I/O). Quy tắc chốt với Hiếu (2026-10-06):
//  - Vendor datapool (3HK, BC Datapool CMHK/Singtel): data = GB tính giá (công thức Datapool dùng chung) × giá/GB rẻ nhất trong nước;
//    gói nhiều nước lấy giá của nước ĐẮT nhất (mỗi nước chọn nhà mạng rẻ nhất). Cộng phí khung eSIM/SIM của vendor.
//  - Vendor gói (WorldMove): giá gói eSIM khớp đúng nước + loại + dung lượng + số ngày; SIM = giá eSIM + giá SKU khung SIM của vendor.
//  - Data pack (top-up, ký tự 2 = A): không cộng khung.
import { ceil2 } from "@/lib/bc-datapool/pricing"

export type PlanKind = "Daily" | "Fixed" | "Unlimited"
export type Form = "eSIM" | "SIM" | "Data pack"

export interface Spec {
  iso: string[]           // tập nước (ISO2) của thị trường, đã sắp xếp
  plan: PlanKind
  dataGb: number          // Daily: GB/ngày · Fixed: tổng GB · Unlimited: GB tốc độ cao (không dùng tính giá)
  days: number
  speedMbps: number | null  // Unlimited: tốc độ sau ngưỡng
  form: Form
}

export interface PoolPrice { price: number; operator: string; kyc: boolean }
export interface PoolSource {
  id: string; label: string
  currency: "HKD" | "USD"
  toUsd: number                         // 1 đơn vị tiền pool = ? USD
  byIso: Map<string, PoolPrice>         // nhà mạng rẻ nhất mỗi nước
  frameUsd: Record<"eSIM" | "SIM", number | null>
  /** GB/ngày cho Unlimited theo tốc độ; null = vendor không có mức này */
  unlimitedGbPerDay: (speedMbps: number | null) => number | null
  unlimitedNote?: string                // gói Unlimited của vendor khác cấu trúc gói đang so
}

export interface PackageOffer { iso: string[]; plan: PlanKind; dataGb: number; days: number; priceUsd: number; name: string; kyc: boolean }
export interface PackageSource {
  id: string; label: string
  offers: Map<string, PackageOffer>     // khoá specKey → gói rẻ nhất
  simFrameUsd: number | null
}

export interface Assumptions { fixedPct: number; dailyPct: number }

export interface Offer { source: string; label: string; usd: number; detail: string; kyc: boolean }

const round3 = (x: number) => Math.round(x * 1000) / 1000
const fmtGb = (x: number) => `${+x.toFixed(2)}GB`

/** Khoá so khớp gói: tập nước + loại + dung lượng + số ngày (Unlimited bỏ qua dung lượng). */
export function specKey(iso: string[], plan: PlanKind, dataGb: number, days: number): string {
  return `${[...iso].sort().join("+")}|${plan}|${plan === "Unlimited" ? 0 : +dataGb.toFixed(3)}|${days}`
}

/** GB tính giá theo công thức Datapool dùng chung. null khi Unlimited không có mức GB/ngày tương ứng. */
export function billableGb(spec: Spec, a: Assumptions, unlimitedGbPerDay: number | null): number | null {
  if (spec.plan === "Fixed") return spec.dataGb * a.fixedPct
  if (spec.plan === "Daily") return spec.dataGb * spec.days * a.dailyPct
  return unlimitedGbPerDay === null ? null : unlimitedGbPerDay * spec.days
}

export function poolOffer(src: PoolSource, spec: Spec, a: Assumptions): Offer | null {
  if (!spec.iso.length) return null
  let worst: (PoolPrice & { iso: string }) | null = null
  for (const iso of spec.iso) {
    const p = src.byIso.get(iso)
    if (!p) return null                       // vendor không phủ đủ mọi nước của thị trường
    if (!worst || p.price > worst.price) worst = { ...p, iso }
  }
  const gb = billableGb(spec, a, spec.plan === "Unlimited" ? src.unlimitedGbPerDay(spec.speedMbps) : null)
  if (gb === null || !worst) return null
  const frame = spec.form === "Data pack" ? 0 : src.frameUsd[spec.form]
  if (frame === null) return null
  const dataUsd = ceil2(ceil2(gb * worst.price) * src.toUsd)
  const usd = ceil2(dataUsd + frame)
  const note = spec.plan === "Unlimited" && src.unlimitedNote ? ` (${src.unlimitedNote})` : ""
  const where = spec.iso.length > 1 ? `${worst.iso} (đắt nhất trong ${spec.iso.length} nước) ` : ""
  return {
    source: src.id, label: src.label, usd, kyc: spec.iso.some(i => src.byIso.get(i)?.kyc),
    detail: `${where}${worst.operator} ${worst.price} ${src.currency}/GB × ${fmtGb(gb)} = ${dataUsd} USD${frame ? ` + khung ${spec.form} ${round3(frame)} USD` : ""}${note}`,
  }
}

export function packageOffer(src: PackageSource, spec: Spec): Offer | null {
  if (spec.form === "Data pack") return null
  const o = src.offers.get(specKey(spec.iso, spec.plan, spec.dataGb, spec.days))
  if (!o) return null
  const frame = spec.form === "SIM" ? src.simFrameUsd : 0
  if (frame === null) return null
  return {
    source: src.id, label: src.label, usd: ceil2(o.priceUsd + frame), kyc: o.kyc,
    detail: `${o.name}: ${round3(o.priceUsd)} USD${frame ? ` + khung SIM ${round3(frame)} USD` : ""}`,
  }
}

/** Thêm gói vào nguồn, giữ gói rẻ nhất cho mỗi khoá. */
export function addPackage(src: PackageSource, o: PackageOffer) {
  const k = specKey(o.iso, o.plan, o.dataGb, o.days)
  const cur = src.offers.get(k)
  if (!cur || o.priceUsd < cur.priceUsd) src.offers.set(k, o)
}

/** Nhà mạng rẻ nhất mỗi nước. */
export function addPoolPrice(byIso: Map<string, PoolPrice>, iso: string, p: PoolPrice) {
  const cur = byIso.get(iso)
  if (!cur || p.price < cur.price) byIso.set(iso, p)
}

// ── Đọc SKU GoHub thành Spec ─────────────────────────────────────────────────
const UNL_SPEED: Record<string, number> = { A: 5, E: 5, H: 5, B: 10, G: 10, X: 10, C: 20, L: 50, D: 100 }
const PLAN: Record<string, PlanKind> = {
  A: "Unlimited", B: "Unlimited", C: "Unlimited", D: "Unlimited", E: "Unlimited", G: "Unlimited", H: "Unlimited", L: "Unlimited", X: "Unlimited",
  F: "Fixed", Y: "Fixed", P: "Daily", Z: "Daily", T: "Daily",
}
const FORM: Record<string, Form> = { C: "eSIM", E: "SIM", A: "Data pack" }

/** Spec từ mã SKU 13 ký tự + dung lượng/ngày trong catalog. null khi không so được (khung, mã cũ, thiếu dung lượng). */
export function specFromSku(sku: string, iso: string[], dataAmount: number | null, dataUnit: string | null, days: number | null): Spec | null {
  if (sku.length !== 13 || !iso.length) return null
  const plan = PLAN[sku[7]], form = FORM[sku[1]]
  if (!plan || !form || !days) return null
  const unit = String(dataUnit ?? "").toUpperCase()
  const gb = unit === "MB" ? Number(dataAmount) / 1024 : Number(dataAmount)
  if (plan !== "Unlimited" && !(gb > 0)) return null
  return { iso: [...iso].sort(), plan, dataGb: plan === "Unlimited" ? (gb || 0) : gb, days, speedMbps: plan === "Unlimited" ? (UNL_SPEED[sku[7]] ?? null) : null, form }
}

export interface CompareRow {
  sku: string; market: string; vendor: string; form: Form; plan: PlanKind; size: string
  units: number; rev: number
  currentUsd: number | null
  offers: Offer[]
  best: Offer | null
  ownUsd: number | null              // giá tính lại của CHÍNH vendor hiện tại — đối chiếu công thức với COGS thật
  savePerUnitUsd: number | null      // > 0 = phương án rẻ hơn hiện tại
  savePct: number | null
  saveQuarterVnd: number | null      // tiết kiệm/quý theo sản lượng quý đang xem
}

/** Phương án rẻ nhất KHÁC vendor hiện tại để tính tiết kiệm; offers giữ đủ (kể cả vendor hiện tại — đối chiếu công thức). */
export function compareRow(base: Omit<CompareRow, "offers" | "best" | "ownUsd" | "savePerUnitUsd" | "savePct" | "saveQuarterVnd">,
  offers: Offer[], currentSource: string | null, vndPerUsd: number): CompareRow {
  const sorted = [...offers].sort((x, y) => x.usd - y.usd)
  const best = sorted.find(o => o.source !== currentSource) ?? null
  const ownUsd = sorted.find(o => o.source === currentSource)?.usd ?? null
  // Mốc so = mức THẤP hơn giữa COGS thật và giá tính lại cùng công thức của vendor hiện tại: công thức hơi thấp hơn COGS thật
  // (đo Q3-2026: 3HK trung vị −3,4%) nên so thẳng với COGS thật sẽ phóng đại tiết kiệm.
  const baseUsd = base.currentUsd !== null && ownUsd !== null ? Math.min(base.currentUsd, ownUsd) : base.currentUsd
  const save = best && baseUsd !== null ? round3(baseUsd - best.usd) : null
  return {
    ...base, offers: sorted, best, ownUsd,
    savePerUnitUsd: save,
    savePct: save !== null && baseUsd ? +(save / baseUsd * 100).toFixed(1) : null,
    saveQuarterVnd: save !== null ? Math.round(save * base.units * vndPerUsd) : null,
  }
}
