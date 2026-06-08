import type { AgentId, UserRole, Message, RouterResult } from "./types"

// ─── Parameter extraction ─────────────────────────────────────────────────────

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

export interface ExtractedParams {
  country?:      string
  skuCode?:      string
  productCode?:  string
  listingCode?:  string
  days?:         number
  dataGB?:       number
  isUnlimited?:  boolean
  vendor?:       string   // "WM", "3H"
  nccVendor?:    "wm" | "3hk" | "all"
}

export function extractParams(message: string): ExtractedParams {
  const msg = message.toLowerCase()
  const params: ExtractedParams = {}

  // SKU code (13 chars)
  const skuMatch = message.match(/\b([A-Z0-9]{13})\b/i)
  if (skuMatch) params.skuCode = skuMatch[1].toUpperCase()

  // Product code VN: bắt đầu bằng chữ số (ví dụ: 1CVNMWMD)
  const prodCodeMatch = !params.skuCode ? message.match(/\b([1-6][A-Z0-9]{7})\b/i) : null
  if (prodCodeMatch) params.productCode = prodCodeMatch[1].toUpperCase()

  // Listing code (thường bắt đầu bằng chữ + số, ví dụ: EJPN3DP001)
  const listingMatch = message.match(/\b([A-Z]{1,3}[A-Z0-9]{5,9})\b/i)
  if (listingMatch && !params.skuCode && !params.productCode) params.listingCode = listingMatch[1].toUpperCase()

  // Country
  const sorted = Object.entries(VN_TO_EN).sort((a, b) => b[0].length - a[0].length)
  for (const [vn, en] of sorted) {
    if (msg.includes(vn)) { params.country = en; break }
  }
  if (!params.country) {
    const sortedCity = Object.entries(CITY_TO_COUNTRY).sort((a, b) => b[0].length - a[0].length)
    for (const [city, country] of sortedCity) {
      if (msg.includes(city)) { params.country = country; break }
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

  // Direct code lookup
  if (params.skuCode || params.productCode) return "tra-cuu"
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
