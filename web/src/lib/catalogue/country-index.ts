// Chỉ mục nước cho Product Catalogue: đếm gói/nhà cung cấp theo nước, tìm không dấu, lọc, gom theo vendor.
// Nước lấy từ products.supported_countries (ISO2) — KHÔNG suy từ mã SKU — nên gói khu vực (vd châu Âu) tự
// xuất hiện ở mọi nước nó phủ.
import type { CatalogueCountryRef, CatalogueProductLite } from "./types"
import { SELLABLE_STATUSES } from "./plain-language"

export interface CountryStat {
  code: string
  name: string            // tên tiếng Việt (nếu có) nếu không thì tiếng Anh
  nameEn: string
  continent: string | null
  productCount: number
  vendorCodes: string[]
  esimCount: number
  simCount: number
}

/** Bỏ dấu + hạ chữ thường để tìm "nhat" ra "Nhật Bản". */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().trim()
}

export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "🌐"
  const A = 0x1f1e6
  const up = code.toUpperCase()
  return String.fromCodePoint(A + up.charCodeAt(0) - 65, A + up.charCodeAt(1) - 65)
}

let _vn: Intl.DisplayNames | null | undefined
let _en: Intl.DisplayNames | null | undefined
function dn(lang: "vi" | "en"): Intl.DisplayNames | null {
  try {
    if (lang === "vi") return (_vn ??= new Intl.DisplayNames(["vi"], { type: "region" }))
    return (_en ??= new Intl.DisplayNames(["en"], { type: "region" }))
  } catch { return null }
}

/** Tên gọi thông dụng ngắn gọn thay cho tên chính thức quá dài của Intl. */
const NAME_VN_OVERRIDE: Record<string, string> = {
  US: "Mỹ (Hoa Kỳ)", GB: "Anh (Vương quốc Anh)", HK: "Hồng Kông", MO: "Ma Cao",
}

/** Tên tiếng Việt của nước: bảng tên thông dụng → Intl (chuẩn, không cần dữ liệu) → cột name_vn → tên tiếng Anh → mã. */
export function countryNameVn(code: string, ref?: CatalogueCountryRef | null): string {
  const o = NAME_VN_OVERRIDE[code.toUpperCase()]
  if (o) return o
  try {
    const v = dn("vi")?.of(code.toUpperCase())
    if (v && v.toUpperCase() !== code.toUpperCase()) return v
  } catch { /* mã ngoài chuẩn */ }
  return ref?.nameVn || ref?.name || code
}

const ALIASES: Record<string, string[]> = {
  US: ["USA", "United States", "America", "My", "Hoa Ky"],
  GB: ["UK", "United Kingdom", "Britain", "England", "Anh"],
  KR: ["Korea", "South Korea", "Han Quoc"],
  CN: ["China", "Trung Quoc"],
  HK: ["Hong Kong", "HongKong"], MO: ["Macau", "Macao"], TW: ["Taiwan", "Dai Loan"],
  VN: ["Vietnam", "Viet Nam"], AE: ["UAE", "Dubai"], CZ: ["Czech Republic", "Czechia"],
  RU: ["Russia"], TR: ["Turkey", "Turkiye"], CI: ["Ivory Coast"], VA: ["Vatican City"],
}

/** Mọi cách gọi của 1 nước (EN, VN, mã, tên gọi khác) — dùng để so khớp nhà mạng theo nước và để tìm kiếm. */
export function countryAliases(code: string, ref?: CatalogueCountryRef | null): string[] {
  const set = new Set<string>([code.toUpperCase()])
  if (ref?.name) set.add(ref.name)
  if (ref?.nameVn) set.add(ref.nameVn)
  const en = dn("en")?.of(code.toUpperCase()); if (en && en !== code) set.add(en)
  const vn = dn("vi")?.of(code.toUpperCase()); if (vn && vn !== code) set.add(vn)
  for (const a of ALIASES[code.toUpperCase()] ?? []) set.add(a)
  return Array.from(set)
}

export function isSellable(p: CatalogueProductLite): boolean {
  return SELLABLE_STATUSES.has(p.status)
}

export function buildCountryStats(
  products: CatalogueProductLite[],
  refs: CatalogueCountryRef[],
  opts: { sellableOnly?: boolean } = { sellableOnly: true },
): CountryStat[] {
  const refMap = new Map(refs.map(r => [r.code.toUpperCase(), r]))
  const acc = new Map<string, { n: number; vendors: Set<string>; esim: number; sim: number }>()
  for (const p of products) {
    if (opts.sellableOnly !== false && !isSellable(p)) continue
    for (const raw of p.countries) {
      const c = raw.toUpperCase()
      const a = acc.get(c) ?? { n: 0, vendors: new Set<string>(), esim: 0, sim: 0 }
      a.n++; a.vendors.add(p.vendorCode)
      if (p.sim === "eSIM") a.esim++; else a.sim++
      acc.set(c, a)
    }
  }
  const out: CountryStat[] = []
  for (const [code, a] of acc) {
    const ref = refMap.get(code)
    out.push({
      code, name: countryNameVn(code, ref), nameEn: ref?.name ?? dn("en")?.of(code) ?? code,
      continent: ref?.continent ?? null, productCount: a.n, vendorCodes: Array.from(a.vendors),
      esimCount: a.esim, simCount: a.sim,
    })
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, "vi"))
}

export function searchCountries(stats: CountryStat[], refs: CatalogueCountryRef[], query: string): CountryStat[] {
  const q = normalizeText(query)
  if (!q) return stats
  const refMap = new Map(refs.map(r => [r.code.toUpperCase(), r]))
  const scored: { s: CountryStat; rank: number }[] = []
  for (const s of stats) {
    const names = countryAliases(s.code, refMap.get(s.code)).concat([s.name, s.nameEn]).map(normalizeText)
    let rank = -1
    if (names.some(n => n === q)) rank = 0
    else if (names.some(n => n.startsWith(q))) rank = 1
    else if (names.some(n => n.split(/\s+/).some(w => w.startsWith(q)))) rank = 2
    else if (names.some(n => n.includes(q))) rank = 3
    if (rank >= 0) scored.push({ s, rank })
  }
  return scored.sort((a, b) => a.rank - b.rank || b.s.productCount - a.s.productCount).map(x => x.s)
}

export interface ProductFilters {
  sim?: "eSIM" | "SIM" | null
  localNumber?: boolean
  noKyc?: boolean
  dataKind?: "fixed" | "daily" | null
  sellableOnly?: boolean
  vendor?: string | null
  /** own = gói chỉ dành cho 1 nước; shared = gói dùng chung nhiều nước (khu vực/toàn cầu) */
  scope?: "own" | "shared" | null
}

export function filterProducts(list: CatalogueProductLite[], f: ProductFilters): CatalogueProductLite[] {
  return list.filter(p => {
    if (f.sellableOnly !== false && !isSellable(p)) return false
    if (f.sim && p.sim !== f.sim) return false
    if (f.localNumber && !p.localNumber) return false
    if (f.noKyc && p.kycNeeded !== false) return false
    if (f.dataKind && p.dataKind !== f.dataKind) return false
    if (f.vendor && p.vendorCode !== f.vendor) return false
    if (f.scope === "own" && p.countries.length !== 1) return false
    if (f.scope === "shared" && p.countries.length <= 1) return false
    return true
  })
}

export function productsOfCountry(products: CatalogueProductLite[], code: string): CatalogueProductLite[] {
  const c = code.toUpperCase()
  return products.filter(p => p.countries.some(x => x.toUpperCase() === c))
}

export interface VendorGroup { vendorCode: string; products: CatalogueProductLite[] }

/** Gom theo nhà cung cấp, nhóm đông gói nhất lên trước; trong nhóm: gói riêng cho 1 nước lên trước (càng ít nước càng trên), rồi eSIM trước SIM, rồi theo mã. */
export function groupByVendor(list: CatalogueProductLite[]): VendorGroup[] {
  const m = new Map<string, CatalogueProductLite[]>()
  for (const p of list) {
    const a = m.get(p.vendorCode) ?? []
    a.push(p); m.set(p.vendorCode, a)
  }
  const rank = (p: CatalogueProductLite) => (p.sim === "eSIM" ? 0 : 1)
  return Array.from(m, ([vendorCode, products]) => ({
    vendorCode,
    products: products.slice().sort((a, b) => a.countries.length - b.countries.length || rank(a) - rank(b) || a.code.localeCompare(b.code)),
  })).sort((a, b) => b.products.length - a.products.length || a.vendorCode.localeCompare(b.vendorCode))
}
