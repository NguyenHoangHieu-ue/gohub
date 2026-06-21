import type { AgentId, UserRole, Message, RouterResult } from "./types"
import { classify, intentToAgentId } from "./classifier"
import type { DataSource } from "./classifier"

// ─── Text normalization ───────────────────────────────────────────────────────

// Chuẩn hóa text: bỏ dấu tiếng Việt, lowercase, chuẩn hóa space
// "Hồng Kông" → "hong kong", "nhật bản" → "nhat ban"
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// ─── Country / City lookup tables ────────────────────────────────────────────

const VN_TO_EN: Record<string, string> = {
  // ── Tiếng Việt đầy đủ ──
  "nhật bản":"Japan","nhat ban":"Japan","nhật":"Japan","nhat":"Japan",
  "hàn quốc":"South Korea","han quoc":"South Korea","hàn":"South Korea",
  "hoa kỳ":"United States","hoa ky":"United States","mỹ":"United States","my":"United States",
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
  "na uy":"Norway","na-uy":"Norway",
  "bỉ":"Belgium","bi":"Belgium",
  "áo":"Austria",
  "séc":"Czech Republic","cong hoa sec":"Czech Republic",
  "hungary":"Hungary","hung ga ri":"Hungary",
  "romania":"Romania",
  "croatia":"Croatia",
  "serbia":"Serbia",
  "singapore":"Singapore","indonesia":"Indonesia",
  "malaysia":"Malaysia","philippines":"Philippines",
  "myanmar":"Myanmar","campuchia":"Cambodia","lao":"Laos",
  "dubai":"United Arab Emirates","uae":"United Arab Emirates",
  "canada":"Canada","mexico":"Mexico","brazil":"Brazil",
  "argentina":"Argentina","chile":"Chile","colombia":"Colombia",
  "nigeria":"Nigeria","kenya":"Kenya","ghana":"Ghana","ethiopia":"Ethiopia",
  "ai cap":"Egypt","ai cập":"Egypt",
  "chau au":"Europe","châu âu":"Europe",
  "chau a":"Asia","châu á":"Asia",

  // ── "nước X" (normalized: "nuoc X") ──
  "nuoc anh":"United Kingdom",
  "nuoc nhat":"Japan","nuoc nhat ban":"Japan",
  "nuoc my":"United States","nuoc hoa ky":"United States",
  "nuoc han":"South Korea","nuoc han quoc":"South Korea",
  "nuoc duc":"Germany",
  "nuoc phap":"France",
  "nuoc y":"Italy",
  "nuoc uc":"Australia",
  "nuoc nga":"Russia",
  "nuoc trung":"China","nuoc trung quoc":"China",
  "nuoc thai":"Thailand","nuoc thai lan":"Thailand",
  "nuoc dai loan":"Taiwan",
  "nuoc singapore":"Singapore",
  "nuoc an do":"India",
  "nuoc ba lan":"Poland",
  "nuoc ha lan":"Netherlands",
  "nuoc thuy si":"Switzerland",
  "nuoc tay ban nha":"Spain",
  "nuoc bo dao nha":"Portugal",
  "nuoc phan lan":"Finland",
  "nuoc dan mach":"Denmark",
  "nuoc na uy":"Norway",

  // ── Tên tiếng Anh đầy đủ (không có trong VN forms) ──
  "taiwan":"Taiwan",
  "japan":"Japan",
  "china":"China",
  "vietnam":"Vietnam",
  "thailand":"Thailand",
  "india":"India",
  "russia":"Russia",
  "australia":"Australia",
  "germany":"Germany",
  "france":"France",
  "italy":"Italy",
  "spain":"Spain",
  "portugal":"Portugal",
  "netherlands":"Netherlands",
  "switzerland":"Switzerland",
  "sweden":"Sweden",
  "norway":"Norway",
  "denmark":"Denmark",
  "finland":"Finland",
  "poland":"Poland",
  "greece":"Greece",
  "turkey":"Turkey",
  "czechia":"Czech Republic","czech republic":"Czech Republic",
  "united states":"United States","united kingdom":"United Kingdom",
  "south korea":"South Korea","korea":"South Korea",
  "new zealand":"New Zealand","new-zealand":"New Zealand",
  "saudi arabia":"Saudi Arabia","arab saudi":"Saudi Arabia",
  "egypt":"Egypt",
  "england":"United Kingdom","britain":"United Kingdom","great britain":"United Kingdom",
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

const VN_TO_EN_NORM        = buildNormalizedLookup(VN_TO_EN)
const CITY_TO_COUNTRY_NORM = buildNormalizedLookup(CITY_TO_COUNTRY)

// ISO 2-letter codes + common abbreviations — word-exact match only
// (tránh false positive: "us" quá phổ biến, "in" trùng tiếng Anh → bỏ qua)
const ISO_TO_EN: Record<string, string> = {
  "uk":"United Kingdom",  "gb":"United Kingdom",
  "tw":"Taiwan",
  "jp":"Japan",
  "kr":"South Korea",
  "hk":"Hong Kong",
  "sg":"Singapore",
  "de":"Germany",
  "fr":"France",
  "ae":"United Arab Emirates",  "uae":"United Arab Emirates",
  "usa":"United States",        "us":"United States",
  "au":"Australia",
  "nz":"New Zealand",
  "ru":"Russia",
  "cn":"China",
  "ca":"Canada",
  "br":"Brazil",
  "mx":"Mexico",
  "pl":"Poland",
  "tr":"Turkey",
  "gr":"Greece",
  "no":"Norway",
  "se":"Sweden",
  "dk":"Denmark",
  "fi":"Finland",
  "pt":"Portugal",
  "es":"Spain",
  "it":"Italy",
  "nl":"Netherlands",
  "ch":"Switzerland",
  "be":"Belgium",
  "at":"Austria",
  "my":"Malaysia",
  "th":"Thailand",
  "id":"Indonesia",
  "ph":"Philippines",
  "vn":"Vietnam",
  "in":"India",
}

export interface ExtractedParams {
  country?:        string
  region?:         string     // "asia" | "southeast_asia" | "europe" | etc.
  groupCode?:      string     // GoHub 3-char code trực tiếp: JPN, CHM, EU1, APA, GLO...
  skuCodes?:       string[]
  productCodes?:   string[]
  listingCodes?:   string[]
  skuCode?:        string
  productCode?:    string
  listingCode?:    string
  days?:           number
  dataGB?:         number
  isUnlimited?:    boolean
  vendor?:         string
  nccVendor?:      "wm" | "3hk" | "all"
  simType?:        "esim" | "sim"
  dataSource?:     DataSource   // gohub_system | ncc_catalog | both — phân biệt nguồn user muốn
}

const MAX_CODES = 50  // tối đa bao nhiêu mã xử lý mỗi lần

// ─── Region lookup ────────────────────────────────────────────────────────────
// Key: normalized (bỏ dấu, lowercase, no extra space) | Value: region id
const REGION_KEYWORDS_NORM: Record<string, string> = {
  // Châu Á (tổng quát + Đông Bắc Á)
  "chau a":           "asia",
  "chaua":            "asia",
  "chau a thai binh duong": "asia",
  "dong bac a":       "asia",
  // Đông Nam Á
  "dong nam a":       "southeast_asia",
  "dongnama":         "southeast_asia",
  "southeast asia":   "southeast_asia",
  "southeastasia":    "southeast_asia",
  // Châu Âu
  "chau au":          "europe",
  "chauu":            "europe",
  "europe":           "europe",
  // Bắc Mỹ
  "bac my":           "north_america",
  "bacmy":            "north_america",
  "north america":    "north_america",
  "northamerica":     "north_america",
  // Châu Mỹ (tổng quát)
  "chau my":          "americas",
  "chaumy":           "americas",
  "my latin":         "americas",
  // Trung Đông
  "trung dong":       "middle_east",
  "trungdong":        "middle_east",
  "middle east":      "middle_east",
  "middleeast":       "middle_east",
  // Châu Phi
  "chau phi":         "africa",
  "chauphi":          "africa",
  "africa":           "africa",
  // Châu Đại Dương
  "chau dai duong":   "oceania",
  "chaudaiduong":     "oceania",
  "oceania":          "oceania",
  "uc new zealand":   "oceania",
}
// Sorted longest-first to avoid partial matches
const REGION_SORTED = Object.entries(REGION_KEYWORDS_NORM).sort((a, b) => b[0].length - a[0].length)

// So khớp key theo RANH GIỚI TỪ (không phải chuỗi con) — tránh "nga" (Russia) match trong
// "ngay", "y" (Ý) match trong "tokyo", "bi" match trong "biet". Ranh giới = đầu/cuối chuỗi
// hoặc ký tự không phải [a-z0-9]. Hỗ trợ key nhiều từ ("nhat ban", "hong kong").
function wordMatch(haystack: string, key: string): boolean {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(haystack)
}

// "nhất" (siêu cấp: tốt nhất, bán chạy nhất) bị trùng "Nhật" (Japan) sau khi bỏ dấu.
// Phân biệt qua dấu thanh ở NFD: nhất = a+◌̂(U+0302)+◌́(U+0301)+t · Nhật = a+◌̂+◌̣(U+0323)+t.
// Bỏ "nhất" TRƯỚC khi dò nước để tránh false-positive Japan.
function stripSuperlativeNhat(s: string): string {
  return s.normalize("NFD").replace(/nhất/gi, " ").normalize("NFC")
}

export function extractParams(message: string): ExtractedParams {
  const msg     = message.toLowerCase()
  const msgNorm = normalizeText(message)   // bỏ dấu + lowercase + chuẩn space
  const params: ExtractedParams = {}

  // Region detection — TRƯỚC country lookup để tránh "châu á" → country="Asia"
  for (const [key, region] of REGION_SORTED) {
    if (wordMatch(msgNorm, key)) { params.region = region; break }
  }

  // GoHub 3-char group/category code detection (word-exact, uppercase 2-4 chars)
  // Ví dụ: JPN, CHM, EU1, APA, GLO, STA, MDE, JAK, TWN, KOR, HKM, SGP...
  // Chỉ detect khi user gõ rõ mã, không extract từ giữa từ khác
  if (!params.region) {
    const originalWords = message.split(/[\s,.\-\/()]+/).filter(Boolean)
    const words = originalWords.map(w => w.toUpperCase())
    const GROUP_CODE_RE = /^[A-Z0-9]{3,4}$/
    // Known multi-country category codes (from ref_categories multi)
    const MULTI_CAT_CODES = new Set(["CHM","ASI","EUR","STA","SAM","APA","AFA","MDE","ATA","OCN","NAM","SMI","SMT","JKR","GLO"])
    // Từ khóa domain viết hoa KHÔNG phải mã nhóm nước (tránh "SKU","B2B"... thành groupCode)
    const NON_GROUP_CODES = new Set(["SKU","SIM","ESIM","APN","KYC","COGS","VND","USD","B2B","B2C","KPI","ROAS","CAC","FAQ","OTP","API","URL","GA4","GSC","CS","BI","GP","GPM","ARPU","AOV","NCC"])
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const orig = originalWords[i] ?? ""
      if (GROUP_CODE_RE.test(w) && w.length >= 3 && w.length <= 4) {
        // Tránh nhầm với số ngày (3, 5, 7...) hoặc GB
        if (/^\d+$/.test(w)) continue
        // Bỏ qua cỡ dữ liệu (3GB, 500MB, 1TB) — không phải mã nhóm nước
        if (/^\d+(GB|MB|TB)$/i.test(w)) continue
        // Mã nhóm GoHub luôn VIẾT HOA (AP2, EU1, CHM). Bỏ qua từ có chữ thường
        // (tên riêng "Loan", "Hong", "Anh" hay mixed "eSIM") → tránh false-positive groupCode
        if (orig !== orig.toUpperCase()) continue
        // Bỏ qua từ khóa domain (SKU, B2B, KYC...) — không phải mã nhóm nước
        if (NON_GROUP_CODES.has(w)) continue
        params.groupCode = w
        // Map multi-country category codes → region
        if (MULTI_CAT_CODES.has(w)) {
          const CAT_TO_REGION: Record<string, string> = {
            "ASI":"asia","ATA":"asia","APA":"asia","STA":"southeast_asia",
            "EUR":"europe","MDE":"middle_east","AFA":"africa",
            "OCN":"oceania","NAM":"north_america","SAM":"americas","GLO":"global",
            "JKR":"asia","CHM":"asia","SMI":"asia","SMT":"asia",
          }
          if (CAT_TO_REGION[w]) params.region = CAT_TO_REGION[w]
        }
        break
      }
    }
  }

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

  // Country — chỉ chạy khi không phải regional query
  if (!params.region) {
    // Bỏ "nhất" (siêu cấp) trước khi dò nước để tránh trùng "Nhật" (Japan)
    const msgNormC = normalizeText(stripSuperlativeNhat(message))
    // Bước 1: VN/EN name lookup (dài → ngắn để tránh "nhat" match trước "nhat ban")
    const sortedNorm = Object.entries(VN_TO_EN_NORM).sort((a, b) => b[0].length - a[0].length)
    for (const [key, en] of sortedNorm) {
      if (wordMatch(msgNormC, key)) { params.country = en; break }
    }
    // Bước 2: City lookup
    if (!params.country) {
      const sortedCity = Object.entries(CITY_TO_COUNTRY_NORM).sort((a, b) => b[0].length - a[0].length)
      for (const [key, country] of sortedCity) {
        if (wordMatch(msgNormC, key)) { params.country = country; break }
      }
    }
    // Bước 3: ISO code / abbreviation — word-exact match
    if (!params.country) {
      const words = msgNormC.split(/[\s,.\-\/]+/).filter(Boolean)
      for (const w of words) {
        if (ISO_TO_EN[w]) { params.country = ISO_TO_EN[w]; break }
      }
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

  // Vendor — nhắc tên vendor (WM/3HK) là tín hiệu mạnh user đang hỏi catalog NCC
  if (/worldmove/.test(msg) || /\bwm\b/.test(msg)) { params.vendor = "WM"; params.nccVendor = "wm"; params.dataSource = "ncc_catalog" }
  else if (/3hk|3 hk/.test(msg)) { params.vendor = "3H"; params.nccVendor = "3hk"; params.dataSource = "ncc_catalog" }

  // Nhắc "ncc / nha cung cap / nhà cung cấp / catalog / vendor" → catalog NCC
  if (!params.dataSource && /\bncc\b|nha cung cap|nhà cung cấp|catalog vendor|catalog ncc/.test(msgNorm))
    params.dataSource = "ncc_catalog"

  return params
}

// ─── Rule-based router ────────────────────────────────────────────────────────

const AGENT_NAMES: Record<AgentId, string> = {
  "tu-van":        "Tư Vấn",
  "tra-cuu":       "Tra Cứu",
  "giai-dap":      "Giải Đáp",
  "gap-analysis":  "NCC & Gap",
  "tao-template":  "Tạo Template",
  "bi-analyst":    "BI Analyst",
}

// BI keywords: doanh thu, đơn hàng, kênh bán, nhân viên sales, fulfillment, báo cáo BI
const BI_RE = /doanh thu|doanh so|don hang|đơn hàng|kenh ban|kênh bán|nhan vien sales|nhân viên sales|fulfillment|target thang|target tháng|gpm2|bi analyst|bao cao bi|báo cáo bi|revenue|margin loi nhuan|gross profit|b2b b2c|b2b va b2c|hieu suat kenh|hiệu suất kênh|top sku|top san pham ban chay|san pham ban chay|sản phẩm bán chạy|du phong doanh thu|dự phóng doanh thu|strategic partner|klook|traveloka|thang nay bao nhieu|tháng này bao nhiêu|tuan nay|tuần này|hom nay bao nhieu|hôm nay bao nhiêu|so sanh thang|so sánh tháng/

// Tín hiệu BI CHẮC CHẮN — luôn ép bi-analyst (kể cả khi có nước): nhân viên/doanh thu/đơn hàng...
const DEFINITE_BI_RE = /\bnhan vien\b|\bdoanh thu\b|\bdoanh so\b|\bfulfillment\b|\bgpm\b|\bdon hang\b/
// Tín hiệu BI dạng XẾP HẠNG — chỉ ép bi-analyst khi KHÔNG có mục tiêu sản phẩm (nước/khu vực/mã nhóm),
// tránh nhầm "gói bán chạy nhất ở Nhật" (product) thành BI.
const RANK_BI_RE = /ban chay nhat|ban nhieu nhat|top \d* ?(sku|san pham|kenh|nhan vien|khach)/

// Tạo/xuất template — action mạnh, ép tao-template (hay bị nhắc WM/3HK → route nhầm gap-analysis).
const TEMPLATE_RE = /\b(tao|xuat|tai|lam|generate)\b[^.!?]*template|template[^.!?]*\b(wm|3hk|wordmove|worldmove)\b|tao file excel|xuat file excel/
// Giải thích mã nhóm: "AP2 gồm nước nào / AP2 là gì" → giai-dap (không phải product_search).
const EXPLAIN_GROUP_RE = /\bla gi\b|nghia la|giai thich|(gom|bao gom)[^.!?]{0,14}(nuoc|quoc gia)/

function classifyAgent(msg: string, params: ExtractedParams, role: UserRole): AgentId {
  const m    = msg.toLowerCase()
  const norm = normalizeText(msg)

  // BI questions — TRƯỚC tất cả rule khác (nhưng sau code lookup)
  if (params.skuCodes?.length || params.productCodes?.length) return "tra-cuu"

  if (BI_RE.test(norm) || BI_RE.test(m)) return "bi-analyst"

  // NCC catalog (nhắc vendor WM/3HK/NCC) → gap-analysis là chủ sở hữu NCC (browse + gap)
  if (params.dataSource === "ncc_catalog") return "gap-analysis"

  if (/listing|item|gi[aá] b[aá]n|gi[aá] th[iị] tr[uư][oờ]ng|sales.channel|unitprice|h[uư][oớ]ng d[aã]n|k[íi]ch ho[aạ]t|apn|activation/.test(m)) return "tra-cuu"

  // Template creation
  if (/t[aạ]o template|t[aạ]o file|xu[aấ]t template|template wm|template 3hk|t[aạ]i template|generate template/.test(m))
    return "tao-template"

  // Gap analysis
  if (/gap|ncc c[oó]|ch[uư]a c[oó]|ch[uư]a import|ch[uư]a nh[aậ]p|worldmove c[oó]|3hk c[oó]|so s[aá]nh ncc|ph[aâ]n t[ií]ch/.test(m))
    return "gap-analysis"

  // Pricing / COGS — gộp vào tra-cuu
  if (/cogs|gi[aá] v[oố]n|gi[aá] nh[aậ]p|l[oợ]i nhu[aậ]n|t[yỷ] gi[aá]|chi ph[ií]/.test(m))
    return "tra-cuu"

  // System knowledge
  if (/ngh[iĩ]a l[aà]|gi[aả]i th[ií]ch|c[aấ]u tr[uú]c|data policy|source type|kyc l[aà]|throttle l[aà]|vendor l[aà]|m[aã] sku|m[aã] n[uư][oớ]c|ký t[uự]/.test(m))
    return "giai-dap"

  // Product search — có criteria tìm kiếm (nước / khu vực / group code / vendor / unlimited)
  if (params.country || params.region || params.groupCode || params.vendor || params.isUnlimited ||
      /[đd]i |t[iì]m g[oó]i|c[oó] g[oó]i|[eE]sim|gói|list|li[eê]t k[eê]/.test(m))
    return "tu-van"

  return "giai-dap"
}

// Sync route — fallback / used internally
function routeSync(message: string, role: UserRole): RouterResult & { params: ExtractedParams } {
  const params  = extractParams(message)
  const agentId = classifyAgent(message, params, role)
  return { agentId, agentName: AGENT_NAMES[agentId], params }
}

export interface RouteResult extends RouterResult {
  params:               ExtractedParams
  needsClarification?:  boolean
  clarificationQuestion?: string
}

// Async route — dùng Gemini classifier cho intent + nguồn dữ liệu + làm rõ
// Chạy song song với getRefCache() trong chat route → zero extra latency
export async function route(message: string, history: Message[], role: UserRole): Promise<RouteResult> {
  const params = extractParams(message)

  const classified = await classify(message)

  // Dùng AI intent nếu confidence đủ cao, ngược lại fallback regex
  let agentId: AgentId = classified.confidence >= 0.6
    ? intentToAgentId(classified.intent)
    : classifyAgent(message, params, role)

  // ── Override xác định (thắng classifier khi nó hay nhầm) ──
  const nrm = normalizeText(message)
  if (TEMPLATE_RE.test(nrm)) {
    // Tạo/xuất template (kể cả khi nhắc WM/3HK → trước đây bị route nhầm gap-analysis)
    agentId = "tao-template"
  } else if (params.groupCode && EXPLAIN_GROUP_RE.test(nrm)) {
    // "AP2 gồm nước nào / AP2 là gì" → giải thích, không phải tìm sản phẩm
    agentId = "giai-dap"
  } else if (agentId !== "bi-analyst" && !params.skuCodes?.length && !params.productCodes?.length) {
    // Override BI: câu doanh số/nhân viên/top bán chạy hay bị nhầm sang product_search
    const hasProductTarget = !!(params.country || params.region || params.groupCode)
    if (DEFINITE_BI_RE.test(nrm) || (RANK_BI_RE.test(nrm) && !hasProductTarget)) {
      agentId = "bi-analyst"
    }
  }

  // AI country ghi đè regex nếu confidence cao VÀ regex không tìm được
  if (classified.confidence >= 0.7 && classified.country && !params.country) {
    params.country = classified.country
  }

  // AI sim_type
  if (classified.sim_type) {
    params.simType = classified.sim_type
  }

  // Nguồn dữ liệu: regex (nhắc vendor) thắng vì chắc chắn; nếu không có thì lấy từ AI
  if (!params.dataSource && classified.data_source) {
    params.dataSource = classified.data_source
  }

  // ── Bước hỏi lại (data-driven) ──────────────────────────────────────────────
  // Chỉ hỏi lại khi KHÔNG có bất kỳ tín hiệu tìm kiếm nào (nước/khu vực/mã/vendor...)
  // và intent thực sự cần thông tin đó để trả lời.
  const hasSearchSignal = !!(
    params.country || params.region || params.groupCode ||
    params.skuCodes?.length || params.productCodes?.length || params.listingCodes?.length ||
    params.vendor || params.isUnlimited
  )
  const intentNeedsTarget =
    agentId === "tu-van" || agentId === "gap-analysis" || agentId === "tao-template"

  const needsClarification =
    classified.confidence >= 0.6 &&
    classified.needs_clarification &&
    !hasSearchSignal &&
    (classified.intent === "unclear" || intentNeedsTarget)

  const clarificationQuestion = needsClarification
    ? (classified.clarification_question ||
       "Mình chưa rõ bạn cần gì 😊 Bạn cho mình biết: đi **nước/khu vực nào**, hoặc **mã sản phẩm** cụ thể nhé?")
    : undefined

  return { agentId, agentName: AGENT_NAMES[agentId], params, needsClarification, clarificationQuestion }
}
