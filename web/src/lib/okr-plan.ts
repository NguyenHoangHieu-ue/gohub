// Kế hoạch quý tự đo (My Metrics › Kế hoạch quý, mốc M3 của plan my-metrics-plan-quy.md). Logic thuần, không I/O:
// đo số thực tế của từng việc từ doanh thu theo SKU (MarketData — cùng nguồn tab Thị trường & Báo giá) và đánh giá
// tiến độ so với mức "lẽ ra phải đạt hôm nay" (tuyến tính từ đầu quý tới hạn).
import { OTHER_MARKET, type MarketData } from "@/lib/market-breakdown"

export type PlanKind =
  | "vendor_share" | "market_gm" | "market_datapool" | "vendor_dependency"
  | "new_markets" | "new_skus" | "quotes_review" | "manual"

export interface PlanKindDef {
  label: string
  group: string
  unit: "%" | "nước" | "SKU" | "báo giá" | ""
  needs: ("country" | "vendor")[]
  hint: string
}

// Danh mục việc mẫu (plan §B2, Hiếu để Claude tự đề xuất). Thứ tự = thứ tự hiện trong ô chọn.
export const PLAN_KINDS: Record<PlanKind, PlanKindDef> = {
  vendor_share:      { group: "Giá vốn & vendor", label: "Chuyển doanh thu 1 thị trường sang vendor khác", unit: "%", needs: ["country", "vendor"],
                       hint: "% doanh thu của thị trường đi qua vendor đã chọn" },
  market_gm:         { group: "Giá vốn & vendor", label: "Tăng biên lãi (GM%) 1 thị trường", unit: "%", needs: ["country"],
                       hint: "Lãi gộp / doanh thu của thị trường" },
  market_datapool:   { group: "Giá vốn & vendor", label: "Tăng tỷ trọng Datapool (3HK + BC) ở 1 thị trường", unit: "%", needs: ["country"],
                       hint: "% doanh thu thị trường đi qua 3HK Datapool hoặc BC Datapool" },
  vendor_dependency: { group: "Giá vốn & vendor", label: "Giảm/tăng phụ thuộc 1 vendor", unit: "%", needs: ["vendor"],
                       hint: "% doanh thu toàn công ty đi qua vendor đã chọn" },
  new_markets:       { group: "Sản phẩm & destination", label: "Mở nước mới có doanh thu", unit: "nước", needs: [],
                       hint: "Số nước có doanh thu quý này mà quý trước không có" },
  new_skus:          { group: "Sản phẩm & destination", label: "Mở SKU mới có doanh thu", unit: "SKU", needs: [],
                       hint: "Số SKU có doanh thu quý này mà quý trước không có" },
  quotes_review:     { group: "Báo giá vendor", label: "Xử lý hết báo giá vendor đang chờ", unit: "báo giá", needs: [],
                       hint: "Số báo giá còn ở trạng thái đang xem (tab Thị trường & Báo giá)" },
  manual:            { group: "Không đo bằng số", label: "Việc khác (tick khi xong)", unit: "", needs: [],
                       hint: "Quy trình, đào tạo, tài liệu… — tự tick khi xong" },
}

export interface PlanItem {
  id: string; quarter: string; kind: PlanKind; title: string
  scope: { country?: string; vendor?: string }
  baseline: number | null; target: number | null; due_date: string | null
  done: boolean; dropped: boolean; note: string | null; sort: number
}

// dim_sku.vendor thật: "3HK DATAPOOL", "BC Datapool (CMHK)", "BC Datapool (Singtel)" — BC phải so tiền tố.
const isDatapool = (v: string) => { const n = v.replace(/\s+/g, "").toUpperCase(); return n === "3HKDATAPOOL" || n.startsWith("BCDATAPOOL") }

interface Totals { rev: number; gp: number }
interface PeriodSums {
  byCountry: Map<string, Totals>
  byCountryVendor: Map<string, number>     // `${country}|${vendor}` → rev
  byCountryDatapool: Map<string, number>
  byVendor: Map<string, number>
  total: number
  countries: Set<string>
  skus: Set<string>
}

function sums(data: MarketData, cur: boolean): PeriodSums {
  const curSet = new Set(data.curMonths)
  const s: PeriodSums = { byCountry: new Map(), byCountryVendor: new Map(), byCountryDatapool: new Map(), byVendor: new Map(), total: 0, countries: new Set(), skus: new Set() }
  for (const [si, mi, rev, gp] of data.cells) {
    if (curSet.has(data.months[mi]) !== cur) continue
    const k = data.skus[si]
    const c = s.byCountry.get(k.country) ?? { rev: 0, gp: 0 }
    c.rev += rev; c.gp += gp
    s.byCountry.set(k.country, c)
    s.byCountryVendor.set(`${k.country}|${k.vendor}`, (s.byCountryVendor.get(`${k.country}|${k.vendor}`) ?? 0) + rev)
    if (isDatapool(k.vendor)) s.byCountryDatapool.set(k.country, (s.byCountryDatapool.get(k.country) ?? 0) + rev)
    s.byVendor.set(k.vendor, (s.byVendor.get(k.vendor) ?? 0) + rev)
    s.total += rev
    if (rev > 0) {
      if (k.country !== OTHER_MARKET) s.countries.add(k.country)
      s.skus.add(k.sku)
    }
  }
  return s
}

const ratio = (a: number, b: number) => b > 0 ? +(a / b * 100).toFixed(2) : null

export interface MeasureContext { cur: PeriodSums; prev: PeriodSums }

export function buildMeasureContext(data: MarketData | null): MeasureContext | null {
  return data ? { cur: sums(data, true), prev: sums(data, false) } : null
}

/** Số thực tế (quý này tới hôm qua) và mốc quý trước của 1 việc. null = không đo được (thiếu dữ liệu/phạm vi). */
export function measure(item: Pick<PlanItem, "kind" | "scope">, ctx: MeasureContext | null, pendingQuotes: number | null = null): { value: number | null; prev: number | null } {
  const { country = "", vendor = "" } = item.scope ?? {}
  if (item.kind === "manual") return { value: null, prev: null }
  if (item.kind === "quotes_review") return { value: pendingQuotes, prev: null }
  if (!ctx) return { value: null, prev: null }
  const pick = (s: PeriodSums): number | null => {
    switch (item.kind) {
      case "vendor_share":      return ratio(s.byCountryVendor.get(`${country}|${vendor}`) ?? 0, s.byCountry.get(country)?.rev ?? 0)
      case "market_gm":         { const c = s.byCountry.get(country); return c ? ratio(c.gp, c.rev) : null }
      case "market_datapool":   return ratio(s.byCountryDatapool.get(country) ?? 0, s.byCountry.get(country)?.rev ?? 0)
      case "vendor_dependency": return ratio(s.byVendor.get(vendor) ?? 0, s.total)
      default:                  return null
    }
  }
  if (item.kind === "new_markets") return { value: [...ctx.cur.countries].filter(c => !ctx.prev.countries.has(c)).length, prev: 0 }
  if (item.kind === "new_skus")    return { value: [...ctx.cur.skus].filter(c => !ctx.prev.skus.has(c)).length, prev: 0 }
  return { value: pick(ctx.cur), prev: pick(ctx.prev) }
}

export type PlanStatus = "done" | "on_track" | "behind" | "overdue" | "no_data" | "dropped"

export interface PlanEvaluation {
  value: number | null; baseline: number | null; target: number | null
  progress: number | null      // 0–1+ phần đường đã đi từ mốc tới mục tiêu
  expected: number             // 0–1 phần đường lẽ ra phải đi tới hôm nay
  due: string
  status: PlanStatus
  message: string
}

const DAY = 86_400_000
const fmtNum = (n: number, unit: string) => `${Number.isInteger(n) ? n : n.toFixed(1)}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`

/** Đánh giá 1 việc. `today` = ngày dữ liệu (YYYY-MM-DD), `quarterStart/End` của quý kế hoạch. */
export function evaluate(item: PlanItem, m: { value: number | null; prev: number | null }, quarterStart: string, quarterEnd: string, today: string): PlanEvaluation {
  const due = item.due_date || quarterEnd
  const span = Math.max(1, (Date.parse(due) - Date.parse(quarterStart)) / DAY + 1)
  const expected = Math.min(1, Math.max(0, ((Date.parse(today) - Date.parse(quarterStart)) / DAY + 1) / span))
  const unit = PLAN_KINDS[item.kind]?.unit ?? ""
  const baseline = item.baseline ?? m.prev ?? (item.kind === "quotes_review" ? null : 0)
  const base: PlanEvaluation = { value: m.value, baseline, target: item.target, progress: null, expected, due, status: "no_data", message: "" }
  const overdue = today > due

  if (item.dropped) return { ...base, status: "dropped", message: "Đã bỏ" }
  if (item.kind === "manual") {
    if (item.done) return { ...base, progress: 1, status: "done", message: "Đã xong" }
    return { ...base, progress: 0, status: overdue ? "overdue" : "on_track", message: overdue ? `Quá hạn ${due}` : `Hạn ${due}` }
  }
  if (m.value === null || item.target === null) return { ...base, message: m.value === null ? "Chưa có dữ liệu để đo" : "Chưa đặt mục tiêu" }

  // quotes_review: mục tiêu là còn ≤ target báo giá chờ; mốc = số lúc tạo việc (nếu chưa lưu thì không có tiến độ phần trăm).
  const b = baseline ?? m.value
  const higher = item.target >= b
  const reached = higher ? m.value >= item.target : m.value <= item.target
  const progress = item.target === b ? (reached ? 1 : 0) : (m.value - b) / (item.target - b)
  if (item.done || reached) return { ...base, baseline: b, progress: Math.max(progress, 1), status: "done", message: `Đã đạt ${fmtNum(m.value, unit)} (mục tiêu ${fmtNum(item.target, unit)})` }
  const gap = Math.abs(item.target - m.value)
  const need = `còn ${fmtNum(+gap.toFixed(2), unit)} nữa`
  if (overdue) return { ...base, baseline: b, progress, status: "overdue", message: `Quá hạn ${due}, ${need}` }
  const shouldBe = b + (item.target - b) * expected
  if (progress >= expected - 0.1) return { ...base, baseline: b, progress, status: "on_track", message: `Đúng tiến độ — ${need}` }
  return { ...base, baseline: b, progress, status: "behind", message: `Chậm: lẽ ra hôm nay ~${fmtNum(+shouldBe.toFixed(2), unit)}, đang ${fmtNum(m.value, unit)} — ${need}` }
}

/** Danh sách lựa chọn cho form: thị trường + vendor xếp theo doanh thu quý này (fallback quý trước). */
export function planOptions(ctx: MeasureContext | null, limit = 120): { countries: string[]; vendors: string[] } {
  if (!ctx) return { countries: [], vendors: [] }
  const rank = (cur: Map<string, number>, prev: Map<string, number>) =>
    [...new Set([...cur.keys(), ...prev.keys()])].sort((a, b) => (cur.get(b) ?? prev.get(b) ?? 0) - (cur.get(a) ?? prev.get(a) ?? 0))
  const revOf = (m: Map<string, Totals>) => new Map([...m].map(([k, v]) => [k, v.rev]))
  return {
    countries: rank(revOf(ctx.cur.byCountry), revOf(ctx.prev.byCountry)).filter(c => c !== OTHER_MARKET).slice(0, limit),
    vendors: rank(ctx.cur.byVendor, ctx.prev.byVendor).filter(v => v !== "(không rõ)").slice(0, limit),
  }
}
