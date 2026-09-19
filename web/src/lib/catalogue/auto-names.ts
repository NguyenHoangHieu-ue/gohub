// Tự đặt tên / phát hiện giá trị MỚI trong dữ liệu để Catalogue không cần sửa code mỗi khi có nhà cung cấp,
// loại SIM, kiểu data, trạng thái, nước mới.
import type { CatalogueIndex } from "./types"
import { KNOWN_DATA_KINDS, KNOWN_SIMS, hasVendorTableName, titleCaseIfShouting, vendorDisplayName } from "./plain-language"
import { countryNameVn } from "./country-index"

export type NameSource = "table" | "ref" | "operator" | "code"

export interface VendorNamer {
  name: (code: string) => string
  source: (code: string) => NameSource
}

/**
 * Tên hiển thị nhà cung cấp, thứ tự ưu tiên:
 *  1. bảng chuẩn trong code (plain-language.ts)
 *  2. bảng Supabase ref_vendors
 *  3. **operator_code phổ biến nhất của các gói thuộc vendor đó** (VD 3D→"3HK", BC→"Billionconnect") — tự có tên
 *     cho vendor mới mà không cần ai nạp ref_vendors
 *  4. mã vendor thô
 */
export function makeVendorNamer(index: Pick<CatalogueIndex, "products" | "vendors">): VendorNamer {
  const ref = new Map(index.vendors.map(v => [v.code, v.name]))
  const votes = new Map<string, Map<string, number>>()
  for (const p of index.products) {
    if (!p.operatorCode) continue
    const m = votes.get(p.vendorCode) ?? new Map<string, number>()
    m.set(p.operatorCode, (m.get(p.operatorCode) ?? 0) + 1)
    votes.set(p.vendorCode, m)
  }
  const dominantOperator = (code: string): string | null => {
    const m = votes.get(code)
    if (!m) return null
    return Array.from(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
  }
  const source = (code: string): NameSource => {
    if (hasVendorTableName(code)) return "table"
    if (ref.get(code)) return "ref"
    if (dominantOperator(code)) return "operator"
    return "code"
  }
  return {
    source,
    name: (code: string) => {
      const src = source(code)
      if (src === "table" || src === "ref") return vendorDisplayName(code, ref.get(code))
      if (src === "operator") return titleCaseIfShouting(dominantOperator(code)!)
      return code || "Không rõ"
    },
  }
}

export interface Unrecognized {
  vendors: { code: string; tempName: string; products: number }[]
  sims: string[]
  dataKinds: string[]
  statuses: string[]
  countries: string[]
  total: number
}

const KNOWN_STATUSES = new Set(["Active", "Preparing", "Temporary", "Inactive", "Deleted"])

/** Liệt kê giá trị MỚI chưa có tên chuẩn để admin biết bổ sung (hiện ở banner cho admin/creator). */
export function findUnrecognized(index: CatalogueIndex): Unrecognized {
  const namer = makeVendorNamer(index)
  const vendorCount = new Map<string, number>()
  const sims = new Set<string>(), kinds = new Set<string>(), statuses = new Set<string>(), unknownCountries = new Set<string>()
  const refCodes = new Set(index.countries.map(c => c.code.toUpperCase()))
  for (const p of index.products) {
    vendorCount.set(p.vendorCode, (vendorCount.get(p.vendorCode) ?? 0) + 1)
    if (!KNOWN_SIMS.includes(p.sim)) sims.add(p.sim)
    if (p.dataKind && !KNOWN_DATA_KINDS.includes(p.dataKind)) kinds.add(p.dataKind)
    if (p.status && !KNOWN_STATUSES.has(p.status)) statuses.add(p.status)
    for (const c of p.countries) {
      const code = c.toUpperCase()
      if (!refCodes.has(code) && countryNameVn(code, null) === code) unknownCountries.add(code)
    }
  }
  const vendors = Array.from(vendorCount)
    .filter(([code]) => { const s = namer.source(code); return s === "operator" || s === "code" })
    .map(([code, products]) => ({ code, tempName: namer.name(code), products }))
    .sort((a, b) => b.products - a.products)
  const out = {
    vendors, sims: Array.from(sims).sort(), dataKinds: Array.from(kinds).sort(),
    statuses: Array.from(statuses).sort(), countries: Array.from(unknownCountries).sort(),
  }
  return { ...out, total: out.vendors.length + out.sims.length + out.dataKinds.length + out.statuses.length + out.countries.length }
}
