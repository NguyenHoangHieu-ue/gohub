import { canonCountry } from "./plan-lookup"

/**
 * ISO 3166 alpha-2 → alpha-3 cho các nước có trong bảng giá BC Datapool.
 * Bảng ref_support_countries có nhiều mã CÙNG tên nước (Japan: JPN + JKD, China: CHN + CMT, Malaysia: MAL + MYS,
 * Thailand: THA + THD + THT...) — mã chuẩn của sản phẩm BC là ISO alpha-3 (JPN, CHN, MYS, THA).
 */
export const ISO3: Record<string, string> = {
  AE: "ARE", AR: "ARG", AU: "AUS", BD: "BGD", BH: "BHR", BN: "BRN", BR: "BRA", BT: "BTN", CA: "CAN", CH: "CHE", CL: "CHL", CN: "CHN", CO: "COL",
  CR: "CRI", EG: "EGY", GE: "GEO", GU: "GUM", HK: "HKG", ID: "IDN", IL: "ISR", IN: "IND", JO: "JOR", JP: "JPN", KH: "KHM", KR: "KOR", KW: "KWT",
  KZ: "KAZ", LA: "LAO", LK: "LKA", MN: "MNG", MO: "MAC", MV: "MDV", MX: "MEX", MY: "MYS", ME: "MNE", NP: "NPL", NZ: "NZL", OM: "OMN", PH: "PHL",
  PK: "PAK", QA: "QAT", RU: "RUS", SA: "SAU", SG: "SGP", TH: "THA", TL: "TLS", TR: "TUR", TW: "TWN", US: "USA", UZ: "UZB", VN: "VNM",
}

export interface SupportCountryLite { code: string; en: string; iso: string }

/**
 * Chọn mã nước 3 ký tự cho 1 khu vực: khớp tên (không phân biệt hoa thường); nhiều mã cùng tên thì lấy mã ISO alpha-3.
 * Không chắc thì KHÔNG đoán: trả code rỗng + danh sách ứng viên để người dùng chọn.
 */
export function pickSupportCountry<T extends SupportCountryLite>(list: T[], coverageName: string): { match: T | null; code: string; candidates: string[] } {
  const want = coverageName.trim().toLowerCase()
  const cands = list.filter(c => c.en.trim().toLowerCase() === want)
  if (!cands.length) return { match: null, code: "", candidates: [] }
  if (cands.length === 1) return { match: cands[0], code: cands[0].code, candidates: [] }
  const iso3 = ISO3[cands[0].iso.trim().toUpperCase()]
  const exact = cands.find(c => c.code === iso3)
  return { match: exact ?? cands[0], code: exact?.code ?? "", candidates: exact ? [] : cands.map(c => c.code) }
}

export interface RefCountryLite { code: string; name: string }

// Tên nước Portal/bảng giá viết khác ref_countries (Macau/Macao, UAE, East Timor...) → ISO2
const NAME_ALIAS: Record<string, string> = {
  uae: "AE", macau: "MO", macao: "MO", "east timor": "TL", "timor leste": "TL", columbia: "CO", "u s a": "US", usa: "US",
  russia: "RU", "brunei darussalam": "BN", brunei: "BN", "mainland china": "CN", "south korea": "KR", korea: "KR", turkiye: "TR", laos: "LA", vietnam: "VN",
}
const parseIso = (s: string) => s.split(/[,\s]+/).map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]{2}$/.test(x))

/** ISO2 của 1 tên nước: alias → ref_countries → nhóm hỗ trợ chỉ có 1 nước (tên khác với ref_countries). null nếu không nhận ra. */
export function nameToIso2(name: string, refs: RefCountryLite[], groups: SupportCountryLite[]): string | null {
  const k = canonCountry(name)
  if (NAME_ALIAS[k]) return NAME_ALIAS[k]
  const ref = refs.find(r => canonCountry(r.name) === k)
  if (ref) return ref.code.toUpperCase()
  for (const g of groups) {
    const iso = parseIso(g.iso)
    if (iso.length === 1 && canonCountry(g.en) === k) return iso[0]
  }
  return null
}

/**
 * Gói đa vùng: tìm nhóm nước hỗ trợ (ref_support_countries) có tập mã nước (country_codes) KHỚP ĐÚNG các nước của gói — không thừa, không thiếu.
 * `matches` > 1 = nhiều mã nhóm cùng tập nước (VD AS4/AS5/SEA) → người dùng chọn; 0 = chưa có nhóm (cần tạo trước, không tự đặt mã).
 */
export function pickSupportGroup<T extends SupportCountryLite>(groups: T[], countryNames: string[], refs: RefCountryLite[]): { matches: T[]; iso: string[]; unresolved: string[] } {
  const iso: string[] = [], unresolved: string[] = []
  for (const n of countryNames) {
    const c = nameToIso2(n, refs, groups)
    if (c) iso.push(c)
    else unresolved.push(n)
  }
  const want = new Set(iso)
  if (unresolved.length) return { matches: [], iso: Array.from(want), unresolved }
  const matches = groups.filter(g => {
    const have = new Set(parseIso(g.iso))
    return have.size === want.size && Array.from(want).every(c => have.has(c))
  })
  return { matches, iso: Array.from(want), unresolved }
}
