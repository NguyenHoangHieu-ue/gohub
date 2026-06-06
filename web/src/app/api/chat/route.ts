import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "@/lib/supabase"

const CACHE_TTL = 30 * 60 * 1000

let cache: { data: CacheData; at: number } | null = null

interface CacheData {
  skus:             any[]
  wmProducts:       any[]
  wmInSystem:       Set<string>
  zones3hk:         any[]
  supportCountries: any[]
  countries:        any[]
  vendors:          any[]
  settings:         any[]
}

// ─── Data fetching ────────────────────────────────────────────────────────────

// Supabase giới hạn 1000 rows mặc định — cần pagination để lấy hết
async function fetchAllRows(
  table: string,
  select: string,
  filters: Array<{ col: string; val: string }> = []
): Promise<any[]> {
  const PAGE = 1000
  const all: any[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabaseAdmin.from(table).select(select).range(from, from + PAGE - 1)
    for (const f of filters) q = (q as any).eq(f.col, f.val)
    const { data } = await q
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE) break
  }
  return all
}

async function getRawData(): Promise<CacheData> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL) return cache.data

  // skus và ncc_worldmove có >1000 rows — phải dùng fetchAllRows
  // Chạy song song: skus+products+wm cùng lúc, reference tables cùng lúc
  const [
    skusRaw, productsRaw,
    wmProductsRaw, wmSkusRaw, zones3hkRaw,
    supportCountries, countries, vendors, settings,
  ] = await Promise.all([
    fetchAllRows("skus",
      "sku_code,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,day_amount,day_amount_unit,throttle_speed,expirations,vendor_sku,latest_cogs,latest_cogs_currency,final_cogs_included_vat_vnd,final_cogs_usd",
      [{ col: "status", val: "Active" }]
    ),
    fetchAllRows("products",
      "product_code,product_type,operator_code,network_type,kyc_needed,supported_countries,note"
    ),
    fetchAllRows("ncc_worldmove",
      "vendor_product_id,product_name,region,sim_type,days,data_gb,is_daily,is_unlimited,throttle_kbps,cogs,cogs_currency,is_kyc",
      [{ col: "status", val: "active" }]
    ),
    supabaseAdmin.from("skus").select("vendor_sku").ilike("vendor_sku", "WM-%")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ncc_3hk").select("zone,country,network,price_per_gb_hkd,is_kyc")
      .order("zone").then(r => r.data ?? []),
    supabaseAdmin.from("ref_support_countries").select("code,support_country,country_codes").order("code").then(r => r.data ?? []),
    supabaseAdmin.from("ref_countries").select("code,name").order("name").then(r => r.data ?? []),
    supabaseAdmin.from("ref_vendors").select("vendor_code,name").order("vendor_code").then(r => r.data ?? []),
    supabaseAdmin.from("app_settings").select("key,value").then(r => r.data ?? []),
  ])

  const prodMap = Object.fromEntries((productsRaw as any[]).map((p: any) => [p.product_code, p]))
  const skus = (skusRaw as any[]).map((s: any) => {
    const p = prodMap[s.product_code] ?? {}
    return {
      ...s,
      product_type:        p.product_type ?? null,
      operator_code:       p.operator_code ?? null,
      network_type:        p.network_type ?? null,
      kyc_needed:          p.kyc_needed ?? null,
      supported_countries: p.supported_countries ?? null,
      note:                p.note ?? null,
    }
  })

  const wmInSystem = new Set<string>((wmSkusRaw as any[]).map((s: any) => s.vendor_sku as string))

  const data: CacheData = {
    skus, wmProducts: wmProductsRaw as any[], wmInSystem,
    zones3hk: zones3hkRaw as any[], supportCountries, countries, vendors, settings,
  }
  cache = { data, at: now }
  return data
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtData(amount: number | null, unit: string | null): string {
  if (!amount || amount >= 9999) return "Unlimited"
  return amount < 1 ? `${Math.round(amount * 1000)}MB` : `${amount}${unit ?? "GB"}`
}

function fmtWmData(p: any): string {
  if (p.is_unlimited || (p.data_gb ?? 0) >= 9999)
    return p.is_daily ? `${p.data_gb ?? "?"}GB/d+Unlim` : "Unlimited"
  if (!p.data_gb) return "?"
  const gb = p.data_gb < 1 ? `${Math.round(p.data_gb * 1000)}MB` : `${p.data_gb}GB`
  return p.is_daily ? `${gb}/ngay` : gb
}

function fmtThrottle(kbps: number | null): string {
  if (!kbps) return "NoLimit"
  return kbps >= 1000 ? `${kbps / 1000}Mbps` : `${kbps}kbps`
}

// ─── Intent detection ─────────────────────────────────────────────────────────

// Tên VN → EN. Từ dài đặt trước từ ngắn để sort đúng
const VN_TO_EN: Record<string, string> = {
  "nhật bản": "Japan",       "nhat ban": "Japan",
  "nhật": "Japan",            "nhat": "Japan",
  "hàn quốc": "South Korea", "han quoc": "South Korea",
  "hàn": "South Korea",       "han": "South Korea",
  "hoa kỳ": "United States", "hoa ky": "United States",
  "mỹ": "United States",
  "bồ đào nha": "Portugal",  "bo dao nha": "Portugal",
  "hà lan": "Netherlands",   "ha lan": "Netherlands",
  "thụy sĩ": "Switzerland",  "thuy si": "Switzerland",
  "thụy điển": "Sweden",     "thuy dien": "Sweden",
  "thổ nhĩ kỳ": "Turkey",   "tho nhi ky": "Turkey",
  "tây ban nha": "Spain",    "tay ban nha": "Spain",
  "hồng kông": "Hong Kong",  "hong kong": "Hong Kong",
  "trung quốc": "China",     "trung quoc": "China",
  "đài loan": "Taiwan",      "dai loan": "Taiwan",
  "việt nam": "Vietnam",     "viet nam": "Vietnam",
  "phần lan": "Finland",     "phan lan": "Finland",
  "đan mạch": "Denmark",     "dan mach": "Denmark",
  "hy lạp": "Greece",        "hy lap": "Greece",
  "ba lan": "Poland",
  "séc": "Czech Republic",
  "ấn độ": "India",          "an do": "India",
  "thái lan": "Thailand",    "thai lan": "Thailand",
  "thái": "Thailand",         "thai": "Thailand",
  "trung": "China",
  "nga": "Russia",
  "úc": "Australia",          "uc": "Australia",
  "anh": "United Kingdom",
  "đức": "Germany",           "duc": "Germany",
  "pháp": "France",           "phap": "France",
  "ý": "Italy",
  "áo": "Austria",
  "bỉ": "Belgium",
  "singapore": "Singapore",
  "indonesia": "Indonesia",
  "malaysia": "Malaysia",
  "philippines": "Philippines",
  "dubai": "United Arab Emirates",
  "uae": "United Arab Emirates",
  "canada": "Canada",
  "mexico": "Mexico",
  "brazil": "Brazil",
  "rumani": "Romania",
  "hungary": "Hungary",
  "châu âu": "Europe",
}

// Tên thành phố → nước
const CITY_TO_COUNTRY: Record<string, string> = {
  "tokyo": "Japan",        "osaka": "Japan",      "kyoto": "Japan",
  "fukuoka": "Japan",      "hokkaido": "Japan",   "sapporo": "Japan",
  "seoul": "South Korea",  "busan": "South Korea", "jeju": "South Korea",
  "incheon": "South Korea",
  "bangkok": "Thailand",   "phuket": "Thailand",  "pattaya": "Thailand",
  "chiang mai": "Thailand", "koh samui": "Thailand",
  "paris": "France",       "lyon": "France",       "nice": "France",
  "london": "United Kingdom", "manchester": "United Kingdom", "edinburgh": "United Kingdom",
  "new york": "United States", "los angeles": "United States",
  "san francisco": "United States", "las vegas": "United States",
  "chicago": "United States",
  "sydney": "Australia",   "melbourne": "Australia", "brisbane": "Australia",
  "taipei": "Taiwan",
  "beijing": "China",      "shanghai": "China",   "guangzhou": "China",
  "shenzhen": "China",     "chengdu": "China",    "macau": "China",
  "moscow": "Russia",
  "rome": "Italy",         "milan": "Italy",      "venice": "Italy",
  "florence": "Italy",
  "berlin": "Germany",     "munich": "Germany",   "frankfurt": "Germany",
  "amsterdam": "Netherlands",
  "dubai": "United Arab Emirates", "abu dhabi": "United Arab Emirates",
  "toronto": "Canada",     "vancouver": "Canada", "montreal": "Canada",
  "mumbai": "India",       "delhi": "India",      "bangalore": "India",
  "goa": "India",
  "jakarta": "Indonesia",  "bali": "Indonesia",   "lombok": "Indonesia",
  "kuala lumpur": "Malaysia", "penang": "Malaysia", "johor": "Malaysia",
  "manila": "Philippines", "cebu": "Philippines", "boracay": "Philippines",
  "cairo": "Egypt",
  "istanbul": "Turkey",    "cappadocia": "Turkey",
  "barcelona": "Spain",    "madrid": "Spain",     "seville": "Spain",
  "lisbon": "Portugal",
  "zurich": "Switzerland", "geneva": "Switzerland",
  "vienna": "Austria",
  "brussels": "Belgium",
  "stockholm": "Sweden",
  "oslo": "Norway",
  "copenhagen": "Denmark",
  "helsinki": "Finland",
  "athens": "Greece",      "santorini": "Greece", "mykonos": "Greece",
  "warsaw": "Poland",      "krakow": "Poland",
  "prague": "Czech Republic",
  "budapest": "Hungary",
}

const PRODUCT_KEYWORDS = [
  "gói", "sim", "esim", "data", "mua", "tìm", "sản phẩm",
  "có không", "dung lượng", "unlimited", "không giới hạn",
  "ngày", "gb", "mb", "châu á", "châu âu", "châu mỹ", "châu phi", "châu đại dương",
  "rẻ nhất", "tốt nhất", "phù hợp", "gợi ý", "đề xuất", "recommend",
  "mạng", "operator", "carrier", "network", "roaming",
  "kyc", "hộ chiếu", "passport",
  "giá", "bao nhiêu tiền", "daily", "hàng ngày",
]

interface SearchIntent {
  countryEn: string | null
  operator:  string | null
  simType:   "eSIM" | "SIM" | null
  ngayMin:   number | null
  ngayMax:   number | null
  dataGbMin: number | null
  isProduct: boolean
}

function detectIntent(message: string, data: CacheData): SearchIntent {
  const msg = message.toLowerCase()

  // 1. VN name → EN (dài trước)
  let countryEn: string | null = null
  const sortedVn = Object.entries(VN_TO_EN).sort((a, b) => b[0].length - a[0].length)
  for (const [vn, en] of sortedVn) {
    if (msg.includes(vn)) { countryEn = en; break }
  }

  // 2. City name → country (dài trước để tránh "nice" match trong "announcement")
  if (!countryEn) {
    const sortedCity = Object.entries(CITY_TO_COUNTRY).sort((a, b) => b[0].length - a[0].length)
    for (const [city, country] of sortedCity) {
      if (msg.includes(city)) { countryEn = country; break }
    }
  }

  // 3. English country name từ ref_support_countries (ví dụ user gõ "Japan", "Korea"...)
  if (!countryEn) {
    for (const sc of data.supportCountries) {
      const name = (sc.support_country ?? "").toLowerCase()
      if (name.length > 3 && msg.includes(name)) { countryEn = sc.support_country; break }
    }
  }

  // 4. Operator từ cache (Softbank, Docomo, True Move, v.v.)
  let operator: string | null = null
  const ops = [...new Set(data.skus.map((s: any) => s.operator_code).filter(Boolean))] as string[]
  for (const op of ops) {
    if (op.length > 2 && msg.includes(op.toLowerCase())) { operator = op; break }
  }

  // 5. SIM type
  const isEsim = msg.includes("esim") || msg.includes("e-sim") || msg.includes("e sim")
  const isSim  = !isEsim && (msg.includes("sim vật lý") || msg.includes("sim vật") || msg.includes("sim thường"))
  const simType = isEsim ? "eSIM" : isSim ? "SIM" : null

  // 6. Số ngày
  const dayMatches = [...msg.matchAll(/(\d+)\s*ngày/g)].map(m => parseInt(m[1]))
  const ngayMin = dayMatches.length ? Math.min(...dayMatches) : null
  const ngayMax = dayMatches.length ? Math.max(...dayMatches) : null

  // 7. Dung lượng
  const gbMatch = msg.match(/(\d+)\s*gb/)
  const dataGbMin = gbMatch ? parseInt(gbMatch[1]) : null

  // 8. Product query?
  const isProduct = !!countryEn || !!operator || PRODUCT_KEYWORDS.some(k => msg.includes(k))

  return { countryEn, operator, simType, ngayMin, ngayMax, dataGbMin, isProduct }
}

// ─── Search ───────────────────────────────────────────────────────────────────

const FULL_TYPES = new Set(["C", "E", "1", "2"])
const NCC_THRESHOLD = 5   // khi GoHub < 5 kết quả → thêm NCC catalog

function searchSkus(intent: SearchIntent, data: CacheData, isCost: boolean): string {
  const { countryEn, operator, simType, ngayMin, ngayMax, dataGbMin } = intent

  // Tìm group codes cho nước (từ ref_support_countries)
  let groupCodes: Set<string> | null = null
  const groupsFound: string[] = []

  if (countryEn) {
    const search = countryEn.toLowerCase()
    for (const sc of data.supportCountries) {
      const hay = `${sc.support_country ?? ""} ${sc.country_codes ?? ""}`.toLowerCase()
      if (hay.includes(search)) {
        groupsFound.push(`${sc.code}`)
        if (!groupCodes) groupCodes = new Set()
        groupCodes.add(sc.code)
      }
    }
  }

  // Lọc GoHub SKUs
  let results = data.skus.filter(s => {
    // Fallback: nếu product_type không join được từ products → đọc từ sku_code[1]
    const pt = s.product_type ?? s.sku_code?.[1] ?? ""
    if (!FULL_TYPES.has(pt)) return false
    if (groupCodes) {
      const grp = s.sku_code?.substring(2, 5)
      if (!grp || !groupCodes.has(grp)) return false
    }
    if (simType === "eSIM" && s.sim_esim !== "eSIM") return false
    if (simType === "SIM"  && s.sim_esim !== "SIM")  return false
    if (operator && s.operator_code?.toLowerCase() !== operator.toLowerCase()) return false
    if (ngayMin && (s.day_amount ?? 0) < ngayMin) return false
    if (ngayMax && (s.day_amount ?? 0) > ngayMax) return false
    if (dataGbMin && (s.data_amount ?? 9999) < dataGbMin && (s.data_amount ?? 9999) < 9999) return false
    return true
  })

  // Sort: VN trước, sau đó ngày tăng dần
  results.sort((a, b) => {
    if (a.tenant === "VN" && b.tenant !== "VN") return -1
    if (b.tenant === "VN" && a.tenant !== "VN") return 1
    return (a.day_amount ?? 0) - (b.day_amount ?? 0)
  })

  const totalGoHub = results.length

  // Debug log — xem trong Vercel Function Logs
  console.log(`[chat:search] country="${countryEn}" groups=[${groupsFound.join(",")}] operator="${operator}" simType="${simType}" skus_total=${data.skus.length} results=${totalGoHub}`)
  if (totalGoHub === 0) {
    // Sample 3 SKU để kiểm tra product_type thực tế
    const sample = data.skus.slice(0, 3).map(s => `${s.sku_code} pt=${s.product_type ?? "null"} pt_derived=${s.sku_code?.[1]}`)
    console.log(`[chat:search] sample SKUs: ${sample.join(" | ")}`)
  }

  // Smart sampling khi > 50: lấy đều từ các mốc ngày
  let shown: any[]
  if (totalGoHub <= 50) {
    shown = results
  } else {
    const byDay = new Map<number, any[]>()
    for (const s of results) {
      const d = s.day_amount ?? 0
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d)!.push(s)
    }
    shown = []
    for (const group of byDay.values()) {
      shown.push(...group.slice(0, Math.max(1, Math.ceil(50 / byDay.size))))
      if (shown.length >= 50) break
    }
    shown = shown.slice(0, 50)
  }

  // ── Build GoHub section ──
  const filterDesc = [
    countryEn ? `nước: "${countryEn}"${groupsFound.length ? ` [mã nhóm: ${groupsFound.join(",")}]` : " — chưa có trong ref_support_countries"}` : null,
    operator  ? `operator: "${operator}"` : null,
    simType   ? `loại: ${simType}` : null,
    ngayMin   ? `ngày: ${ngayMin}${ngayMax && ngayMax !== ngayMin ? `–${ngayMax}` : ""}` : null,
    dataGbMin ? `data tối thiểu: ${dataGbMin}GB` : null,
  ].filter(Boolean).join(", ")

  const gohubLines: string[] = []

  if (totalGoHub === 0) {
    gohubLines.push(`=== GOHUB HỆ THỐNG: 0 gói${filterDesc ? ` (${filterDesc})` : ""} — hệ thống chưa có ===`)
  } else {
    gohubLines.push(
      `=== GOHUB HỆ THỐNG: ${totalGoHub} gói${filterDesc ? ` (${filterDesc})` : ""} — hiển thị ${shown.length}${totalGoHub > 50 ? " — còn nhiều hơn, user có thể lọc cụ thể hơn" : ""} ===`,
      `sku_code|tenant|sim|data|days|throttle|operator|kyc|nuoc|vendor_sku` + (isCost ? `|gia_vnd|gia_usd` : ""),
      ...shown.map(s =>
        `${s.sku_code}|${s.tenant}|${s.sim_esim}` +
        `|${fmtData(s.data_amount, s.data_amount_unit)}|${s.day_amount}d` +
        `|${s.throttle_speed ?? "—"}|${s.operator_code ?? "—"}` +
        `|${s.kyc_needed ?? "—"}|${s.supported_countries ?? "—"}` +
        `|${s.vendor_sku ?? "—"}` +
        (isCost ? `|${s.final_cogs_included_vat_vnd ?? "?"}|${s.final_cogs_usd ?? "?"}` : "") +
        (s.note ? ` [${s.note}]` : "")
      )
    )
  }

  // ── NCC section (khi GoHub thiếu) ──
  const nccLines: string[] = []

  if (totalGoHub < NCC_THRESHOLD && countryEn) {
    const search = countryEn.toLowerCase()

    const wmAll = (data.wmProducts as any[]).filter(p =>
      (p.region ?? "").toLowerCase().includes(search)
    )
    const wmShown = wmAll.slice(0, 15)

    const hkAll = (data.zones3hk as any[]).filter(z =>
      (z.country ?? "").toLowerCase().includes(search)
    )

    if (wmAll.length > 0 || hkAll.length > 0) {
      nccLines.push(
        `\n=== NCC CATALOG — GoHub chưa nhập đủ (${wmAll.length} WorldMove + ${hkAll.length} 3HK) ===`,
        `Ghi chú: CO_TRONG_HT = đã có trong GoHub hệ thống, CHUA_NHAP = chưa được nhập`,
      )

      if (wmAll.length > 0) {
        nccLines.push(
          `[WorldMove — ${wmAll.length} SP, hiển thị ${wmShown.length}]`,
          `vendor_id|region|sim_type|days|data|throttle|trang_thai` + (isCost ? `|gia(${wmShown[0]?.cogs_currency ?? "TWD"})` : ""),
          ...wmShown.map(p =>
            `${p.vendor_product_id}|${p.region}|${p.sim_type}|${p.days}d` +
            `|${fmtWmData(p)}|${fmtThrottle(p.throttle_kbps)}` +
            `|${data.wmInSystem.has(p.vendor_product_id) ? "CO_TRONG_HT" : "CHUA_NHAP"}` +
            (isCost ? `|${p.cogs ?? "?"}` : "")
          )
        )
      }

      if (hkAll.length > 0) {
        nccLines.push(
          `[3HK — ${hkAll.length} zone]`,
          `zone|country|network` + (isCost ? `|HKD_per_GB` : "") + `|KYC`,
          ...hkAll.map(z =>
            `${z.zone}|${z.country}|${z.network ?? "—"}` +
            (isCost ? `|${z.price_per_gb_hkd ?? "?"}` : "") +
            (z.is_kyc ? `|Yes` : `|No`)
          )
        )
      }
    } else {
      nccLines.push(`\n=== NCC CATALOG: không có WorldMove hoặc 3HK nào cho "${countryEn}" ===`)
    }
  }

  return [...gohubLines, ...nccLines].join("\n")
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(data: CacheData, role: string): string {
  const isCost = role === "admin" || role === "manager"
  const { supportCountries, countries, vendors, settings } = data

  const lines = [
    `Bạn là trợ lý AI của GoHub — công ty cung cấp SIM/eSIM du lịch.`,
    `Trả lời bằng tiếng Việt. Không đề cập tên bảng/cột database.`,
    `Khi có dữ liệu sản phẩm trong tin nhắn, dựa vào đó để trả lời — không tự bịa sản phẩm.`,
    `Nếu có mục "GOHUB HỆ THỐNG: 0 gói" và có mục "NCC CATALOG", hãy thông báo GoHub chưa có và giới thiệu options từ NCC.`,
    ``,
    `=== NHOM NUOC HO TRO (${supportCountries.length}) ===`,
    ...(supportCountries as any[]).map(sc =>
      `${sc.code}: ${sc.support_country ?? ""}${sc.country_codes ? ` [${sc.country_codes}]` : ""}`
    ),
    ``,
    `=== MA NUOC (${countries.length}) ===`,
    ...(countries as any[]).map((c: any) => `${c.code}=${c.name}`),
    ``,
    `=== VENDOR ===`,
    ...(vendors as any[]).map((v: any) => `${v.vendor_code}=${v.name}`),
  ]

  if (isCost && (settings as any[]).length) {
    lines.push(``, `=== TY GIA ===`)
    lines.push(...(settings as any[]).map((s: any) => `${s.key}=${s.value}`))
  }

  return lines.join("\n")
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { messages, userName } = await req.json()
  const role   = session.user.role || "standard"
  const isCost = role === "admin" || role === "manager"
  const name   = userName || session.user.name || "bạn"

  try {
    const rawData = await getRawData()
    const systemInstruction = `${buildSystemPrompt(rawData, role)}\n\n---\nNgười đang chat: ${name}`

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", systemInstruction })

    const history = messages.slice(0, -1).map((m: any) => ({
      role:  m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }))

    const chat        = model.startChat({ history })
    const lastMessage = messages.at(-1).content

    const intent = detectIntent(lastMessage, rawData)
    const finalMessage = intent.isProduct
      ? `[Dữ liệu tìm được]\n${searchSkus(intent, rawData, isCost)}\n\n[Câu hỏi]\n${lastMessage}`
      : lastMessage

    const result = await chat.sendMessageStream(finalMessage)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text()
            if (text) controller.enqueue(encoder.encode(text))
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
