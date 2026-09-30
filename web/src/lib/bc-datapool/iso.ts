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
