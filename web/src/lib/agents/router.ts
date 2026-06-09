import type { AgentId, UserRole, Message, RouterResult } from "./types"

// ─── Text normalization ───────────────────────────────────────────────────────

// Chuẩn hóa text: bỏ dấu tiếng Việt, lowercase, chuẩn hóa space
// "Hồng Kông" → "hong kong", "nhật bản" → "nhat ban"
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// ─── Country / City lookup tables ────────────────────────────────────────────

const VN_TO_EN: Record<string, string> = {
  "nhật bản":"Japan","nhat ban":"Japan","nhật":"Japan","nhat":"Japan",
  "hàn quốc":"South Korea","han quoc":"South Korea","hàn":"South Korea",
  "hoa kỳ":"United States","hoa ky":"United States","mỹ":"United States",
  "thái lan":"Thailand","thai lan":"Thailand","thái":"Thailand","thai":"Thailand",
  "hồng kông":"Hong Kong","hong kong":"Hong Kong",
  "trung quốc":"China","trung quoc":"China","trung":"China",
  "đài loan":"Taiwan","dai loan":"Taiwan",
  "việt nam":"Vietnam","viet nam":"Vietnam",
  "ấn độ":"India","an do":"India",
  "úc":"Australia","uc":"Australia",
  "nga":"Russia",
  "anh":"United Kingdom",
  "đức":"Germany","duc":"Germany",
  "pháp":"France","phap":"France",
  "ý":"Italy",
  "ba lan":"Poland",
  "hà lan":"Netherlands","ha lan":"Netherlands",
  "thụy sĩ":"Switzerland","thuy si":"Switzerland",
  "thụy điển":"Sweden","thuy dien":"Sweden",
  "tây ban nha":"Spain","tay ban nha":"Spain",
  "bồ đào nha":"Portugal","bo dao nha":"Portugal",
  "thổ nhĩ kỳ":"Turkey","tho nhi ky":"Turkey",
  "phần lan":"Finland","phan lan":"Finland",
  "đan mạch":"Denmark","dan mach":"Denmark",
  "hy lạp":"Greece","hy lap":"Greece",
  "singapore":"Singapore","indonesia":"Indonesia",
  "malaysia":"Malaysia","philippines":"Philippines",
  "dubai":"United Arab Emirates","uae":"United Arab Emirates",
  "canada":"Canada","mexico":"Mexico","brazil":"Brazil",
  "châu âu":"Europe",
}

const CITY_TO_COUNTRY: Record<string, string> = {
  "tokyo":"Japan","osaka":"Japan","kyoto":"Japan","fukuoka":"Japan",
  "seoul":"South Korea","busan":"South Korea",
  "bangkok":"Thailand","phuket":"Thailand","pattaya":"Thailand",
  "paris":"France","london":"United Kingdom",
  "new york":"United States","los angeles":"United States",
  "sydney":"Australia","melbourne":"Australia",
  "taipei":"Taiwan","beijing":"China","shanghai":"China","bali":"Indonesia",
  "moscow":"Russia","rome":"Italy","berlin":"Germany","amsterdam":"Netherlands",
  "dubai":"United Arab Emirates","toronto":"Canada","mumbai":"India",
  "jakarta":"Indonesia","kuala lumpur":"Malaysia","manila":"Philippines",
  "istanbul":"Turkey","barcelona":"Spain","lisbon":"Portugal",
}

// Build normalized lookup: mỗi entry thêm cả dạng không dấu + dạng liền chữ
// "hồng kông" → "hong kong" (bỏ dấu) VÀ "hongkong" (liền chữ)
function buildNormalizedLookup(map: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(map)) {
    const norm = normalizeText(key)
    result[norm] = val                          // dạng chuẩn: "hong kong"
    result[norm.replace(/\s/g, "")] = val       // dạng liền:  "hongkong"
  }
  return result
}

const VN_TO_EN_NORM   = buildNormalizedLookup(VN_TO_EN)
const CITY_TO_COUNTRY_NORM = buildNormalizedLookup(CITY_TO_COUNTRY)

export interface ExtractedParams {
  country?:       string
  skuCodes?:      string[]   // hỗ trợ nhiều mã SKU (13 ký tự)
  productCodes?:  string[]   // hỗ trợ nhiều Product Code (8 ký tự)
  listingCodes?:  string[]   // hỗ trợ nhiều Listing Code
  // backward-compat aliases (first element of arrays)
  skuCode?:       string
  productCode?:   string
  listingCode?:   string
  days?:          number
  dataGB?:        number
  isUnlimited?:   boolean
  vendor?:        string
  nccVendor?:     "wm" | "3hk" | "all"
}

const MAX_CODES = 10  // tối đa bao nhiêu mã xử lý mỗi lần

export function extractParams(message: string): ExtractedParams {
  const msg     = message.toLowerCase()
  const msgNorm = normalizeText(message)   // bỏ dấu + lowercase + chuẩn space
  const params: ExtractedParams = {}

  // Tất cả SKU codes (13 ký tự)
  const skuMatches = [...message.matchAll(/\b([A-Z0-9]{13})\b/gi)]
  const skuCodes = [...new Set(skuMatches.map(m => m[1].toUpperCase()))].slice(0, MAX_CODES)
  if (skuCodes.length) {
    params.skuCodes = skuCodes
    params.skuCode  = skuCodes[0]
  }

  // Tất cả Product codes VN (8 ký tự, bắt đầu bằng 1-6)
  if (!skuCodes.length) {
    const prodMatches = [...message.matchAll(/\b([1-6][A-Z0-9]{7})\b/gi)]
    const productCodes = [...new Set(prodMatches.map(m => m[1].toUpperCase()))].slice(0, MAX_CODES)
    if (productCodes.length) {
      params.productCodes = productCodes
      params.productCode  = productCodes[0]
    }
  }

  // Tất cả Listing/Item codes (nếu chưa match SKU/Product)
  if (!skuCodes.length && !params.productCodes?.length) {
    const listingMatches = [...message.matchAll(/\b([A-Z]{1,3}[A-Z0-9]{5,9})\b/gi)]
    const listingCodes = [...new Set(listingMatches.map(m => m[1].toUpperCase()))].slice(0, MAX_CODES)
    if (listingCodes.length) {
      params.listingCodes = listingCodes
      params.listingCode  = listingCodes[0]
    }
  }

  // Country — dùng normalized lookup để match cả có dấu, không dấu, liền chữ
  // Ví dụ: "hongkong", "hong kong", "Hồng Kông" đều → "Hong Kong"
  const sortedNorm = Object.entries(VN_TO_EN_NORM).sort((a, b) => b[0].length - a[0].length)
  for (const [key, en] of sortedNorm) {
    if (msgNorm.includes(key)) { params.country = en; break }
  }
  if (!params.country) {
    const sortedCity = Object.entries(CITY_TO_COUNTRY_NORM).sort((a, b) => b[0].length - a[0].length)
    for (const [key, country] of sortedCity) {
      if (msgNorm.includes(key)) { params.country = country; break }
    }
  }

  // Days
  const dayMatch   = msg.match(/(\d+)\s*(ngày|ngay)/)
  const weekMatch  = msg.match(/(\d+)\s*(tuần|tuan)/)
  const monthMatch = msg.match(/(\d+)\s*(tháng|thang)/)
  if      (dayMatch)   params.days = parseInt(dayMatch[1])
  else if (weekMatch)  params.days = parseInt(weekMatch[1]) * 7
  else if (monthMatch) params.days = parseInt(monthMatch[1]) * 30

  // Data
  if (/unlimited|không giới hạn|khong gioi han|vô hạn|vo han/.test(msg)) {
    params.isUnlimited = true
  }
  const gbMatch = msg.match(/(\d+(?:\.\d+)?)\s*gb/)
  const mbMatch = msg.match(/(\d+(?:\.\d+)?)\s*mb/)
  if (gbMatch) params.dataGB = parseFloat(gbMatch[1])
  else if (mbMatch) params.dataGB = Math.round(parseFloat(mbMatch[1]) / 1000 * 100) / 100

  // Vendor
  if (/worldmove/.test(msg) || /\bwm\b/.test(msg)) { params.vendor = "WM"; params.nccVendor = "wm" }
  else if (/3hk|3 hk/.test(msg)) { params.vendor = "3H"; params.nccVendor = "3hk" }

  return params
}

// ─── Rule-based router ────────────────────────────────────────────────────────

const AGENT_NAMES: Record<AgentId, string> = {
  "tu-van":       "Tư Vấn",
  "tra-cuu":      "Tra Cứu",
  "giai-dap":     "Giải Đáp",
  "gia-cogs":     "Giá & COGS",
  "gap-analysis": "Gap Analysis",
}

function classifyAgent(msg: string, params: ExtractedParams, role: UserRole): AgentId {
  const m = msg.toLowerCase()

  // Direct code lookup (single hoặc multiple)
  if (params.skuCodes?.length || params.productCodes?.length) return "tra-cuu"
  if (/listing|item|gi[aá] b[aá]n|gi[aá] th[iị] tr[uư][oờ]ng|sales.channel|unitprice|h[uư][oớ]ng d[aã]n|k[íi]ch ho[aạ]t|apn|activation/.test(m)) return "tra-cuu"

  // Gap analysis
  if (/gap|ncc c[oó]|ch[uư]a c[oó]|ch[uư]a import|ch[uư]a nh[aậ]p|worldmove c[oó]|3hk c[oó]|so s[aá]nh ncc|ph[aâ]n t[ií]ch/.test(m))
    return "gap-analysis"

  // Pricing / COGS
  if (/cogs|gi[aá] v[oố]n|gi[aá] nh[aậ]p|l[oợ]i nhu[aậ]n|t[yỷ] gi[aá]|chi ph[ií]/.test(m))
    return "gia-cogs"

  // System knowledge
  if (/ngh[iĩ]a l[aà]|gi[aả]i th[ií]ch|c[aấ]u tr[uú]c|data policy|source type|kyc l[aà]|throttle l[aà]|vendor l[aà]|m[aã] sku|m[aã] n[uư][oớ]c|ký t[uự]/.test(m))
    return "giai-dap"

  // Product search (has country or explicit search keywords)
  if (params.country || /[đd]i |t[iì]m g[oó]i|c[oó] g[oó]i|[eE]sim|gói/.test(m))
    return "tu-van"

  return "giai-dap"
}

export function route(message: string, history: Message[], role: UserRole): RouterResult & { params: ExtractedParams } {
  const params  = extractParams(message)
  const agentId = classifyAgent(message, params, role)
  return { agentId, agentName: AGENT_NAMES[agentId], params }
}
