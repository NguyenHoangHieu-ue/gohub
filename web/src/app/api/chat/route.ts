import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "@/lib/supabase"

const CACHE_TTL = 30 * 60 * 1000

let cache: { data: CacheData; at: number } | null = null

interface CacheData {
  // Raw data (dùng cho NCC lookup)
  skus:             any[]
  wmProducts:       any[]
  wmInSystem:       Set<string>
  zones3hk:         any[]
  supportCountries: any[]
  countries:        any[]
  vendors:          any[]
  settings:         any[]
  // Pre-computed context strings (inject thẳng vào system prompt)
  skuCtx:           string   // không có giá
  skuCtxCost:       string   // có giá VND/USD (admin/manager)
}

// ─── Pagination helper — vượt giới hạn 1000 rows của Supabase ────────────────

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

// ─── Data fetching + pre-compute ─────────────────────────────────────────────

const FULL_TYPES = new Set(["C", "E", "1", "2"])

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

function buildSkuCtx(skus: any[], isCost: boolean): string {
  // Chỉ giữ sản phẩm hoàn chỉnh, sort VN trước rồi theo country group
  const full = skus
    .filter(s => FULL_TYPES.has(s.product_type ?? s.sku_code?.[1] ?? ""))
    .sort((a, b) => {
      if (a.tenant === "VN" && b.tenant !== "VN") return -1
      if (b.tenant === "VN" && a.tenant !== "VN") return 1
      return (a.sku_code ?? "").localeCompare(b.sku_code ?? "")
    })

  const header =
    `=== SAN PHAM GOHUB (${full.length} SKU active — chi eSIM Full va SIM Full) ===\n` +
    `Cau truc SKU code 13 ky tu: [source(1)][type(1)][country_group(3)][vendor(2)][data_policy(1)][data_amount(3)][day(2)]\n` +
    `sku_code|tenant|sim|data|days|throttle|operator|kyc|nuoc|vendor_sku` +
    (isCost ? `|gia_vnd|gia_usd` : "")

  const rows = full.map(s =>
    `${s.sku_code}|${s.tenant}|${s.sim_esim}` +
    `|${fmtData(s.data_amount, s.data_amount_unit)}|${s.day_amount}d` +
    `|${s.throttle_speed ?? "—"}|${s.operator_code ?? "—"}` +
    `|${s.kyc_needed ?? "—"}|${s.supported_countries ?? "—"}` +
    `|${s.vendor_sku ?? "—"}` +
    (isCost ? `|${s.final_cogs_included_vat_vnd ?? "?"}|${s.final_cogs_usd ?? "?"}` : "") +
    (s.note ? ` [${s.note}]` : "")
  )

  return [header, ...rows].join("\n")
}

async function getRawData(): Promise<CacheData> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL) return cache.data

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
    supabaseAdmin.from("ref_support_countries").select("code,support_country,country_codes")
      .order("code").then(r => r.data ?? []),
    supabaseAdmin.from("ref_countries").select("code,name")
      .order("name").then(r => r.data ?? []),
    supabaseAdmin.from("ref_vendors").select("vendor_code,name")
      .order("vendor_code").then(r => r.data ?? []),
    supabaseAdmin.from("app_settings").select("key,value")
      .then(r => r.data ?? []),
  ])

  // Enrich SKUs với product data
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

  // Pre-compute SKU context strings (cache 1 lần, dùng cho mọi request)
  const skuCtx     = buildSkuCtx(skus, false)
  const skuCtxCost = buildSkuCtx(skus, true)

  console.log(`[chat:cache] skus=${skus.length} wm=${(wmProductsRaw as any[]).length} full_ctx_chars=${skuCtx.length}`)

  const data: CacheData = {
    skus, wmProducts: wmProductsRaw as any[], wmInSystem,
    zones3hk: zones3hkRaw as any[],
    supportCountries, countries, vendors, settings,
    skuCtx, skuCtxCost,
  }
  cache = { data, at: now }
  return data
}

// ─── NCC lookup (chỉ khi cần — detect country đơn giản) ──────────────────────

// Tên nước VN → EN
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
  "ba lan": "Poland",
  "singapore": "Singapore",
  "indonesia": "Indonesia",
  "malaysia": "Malaysia",
  "philippines": "Philippines",
  "dubai": "United Arab Emirates",
  "uae": "United Arab Emirates",
  "canada": "Canada",
  "mexico": "Mexico",
  "brazil": "Brazil",
  "châu âu": "Europe",
}

const CITY_TO_COUNTRY: Record<string, string> = {
  "tokyo": "Japan",        "osaka": "Japan",      "kyoto": "Japan",     "fukuoka": "Japan",
  "seoul": "South Korea",  "busan": "South Korea", "jeju": "South Korea",
  "bangkok": "Thailand",   "phuket": "Thailand",  "pattaya": "Thailand",
  "chiang mai": "Thailand",
  "paris": "France",       "london": "United Kingdom",
  "new york": "United States", "los angeles": "United States",
  "sydney": "Australia",   "melbourne": "Australia",
  "taipei": "Taiwan",
  "beijing": "China",      "shanghai": "China",   "guangzhou": "China",  "bali": "Indonesia",
  "moscow": "Russia",
  "rome": "Italy",         "milan": "Italy",
  "berlin": "Germany",     "munich": "Germany",
  "amsterdam": "Netherlands",
  "dubai": "United Arab Emirates",
  "toronto": "Canada",     "vancouver": "Canada",
  "mumbai": "India",       "delhi": "India",
  "jakarta": "Indonesia",
  "kuala lumpur": "Malaysia", "penang": "Malaysia",
  "manila": "Philippines", "cebu": "Philippines",
  "istanbul": "Turkey",
  "barcelona": "Spain",    "madrid": "Spain",
  "lisbon": "Portugal",
  "zurich": "Switzerland",
  "vienna": "Austria",
  "stockholm": "Sweden",
  "oslo": "Norway",
  "copenhagen": "Denmark",
  "athens": "Greece",      "santorini": "Greece",
  "warsaw": "Poland",
  "prague": "Czech Republic",
  "budapest": "Hungary",
}

function detectCountry(message: string, data: CacheData): string | null {
  const msg = message.toLowerCase()
  const sorted = Object.entries(VN_TO_EN).sort((a, b) => b[0].length - a[0].length)
  for (const [vn, en] of sorted) {
    if (msg.includes(vn)) return en
  }
  const sortedCity = Object.entries(CITY_TO_COUNTRY).sort((a, b) => b[0].length - a[0].length)
  for (const [city, country] of sortedCity) {
    if (msg.includes(city)) return country
  }
  for (const sc of data.supportCountries) {
    const name = (sc.support_country ?? "").toLowerCase()
    if (name.length > 3 && msg.includes(name)) return sc.support_country
  }
  return null
}

function buildNccSection(countryEn: string, data: CacheData, isCost: boolean): string {
  const search = countryEn.toLowerCase()

  const wmMatches = (data.wmProducts as any[])
    .filter(p => (p.region ?? "").toLowerCase().includes(search))
    .slice(0, 15)

  const hkMatches = (data.zones3hk as any[])
    .filter(z => (z.country ?? "").toLowerCase().includes(search))

  if (!wmMatches.length && !hkMatches.length) return ""

  const lines: string[] = [
    `\n=== NCC CATALOG cho "${countryEn}" (${wmMatches.length} WorldMove + ${hkMatches.length} 3HK) ===`,
    `Ghi chu: CO_TRONG_HT = da nhap vao GoHub, CHUA_NHAP = chua duoc nhap`,
  ]

  if (wmMatches.length) {
    lines.push(
      `[WorldMove]`,
      `vendor_id|region|sim_type|days|data|throttle|trang_thai` + (isCost ? `|gia` : ""),
      ...wmMatches.map(p =>
        `${p.vendor_product_id}|${p.region}|${p.sim_type}|${p.days}d` +
        `|${fmtWmData(p)}|${fmtThrottle(p.throttle_kbps)}` +
        `|${data.wmInSystem.has(p.vendor_product_id) ? "CO_TRONG_HT" : "CHUA_NHAP"}` +
        (isCost ? `|${p.cogs ?? "?"}${p.cogs_currency ?? ""}` : "")
      )
    )
  }

  if (hkMatches.length) {
    lines.push(
      `[3HK]`,
      `zone|country|network` + (isCost ? `|HKD/GB` : "") + `|KYC`,
      ...hkMatches.map(z =>
        `${z.zone}|${z.country}|${z.network ?? "—"}` +
        (isCost ? `|${z.price_per_gb_hkd ?? "?"}` : "") +
        (z.is_kyc ? `|Yes` : `|No`)
      )
    )
  }

  return lines.join("\n")
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(data: CacheData, role: string, nccSection: string): string {
  const isCost = role === "admin" || role === "manager"
  const { skuCtx, skuCtxCost, supportCountries, countries, vendors, settings } = data

  const lines = [
    `Ban la tro ly AI cua GoHub — cong ty cung cap SIM/eSIM du lich.`,
    `Tra loi bang tieng Viet. Khong de cap ten bang/cot database.`,
    `Danh sach san pham GoHub hien co nam trong phan SAN PHAM GOHUB ben duoi.`,
    `Khi user hoi ve san pham, tim trong danh sach do — khong tu bia them.`,
    `Neu GoHub khong co → thong bao ro rang va gioi thieu catalog NCC neu co.`,
    ``,
    isCost ? skuCtxCost : skuCtx,
  ]

  if (nccSection) lines.push(nccSection)

  lines.push(
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
  )

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

    // Detect country chỉ để inject NCC catalog nếu cần
    const lastMessage = messages.at(-1).content
    const countryEn   = detectCountry(lastMessage, rawData)
    const nccSection  = countryEn ? buildNccSection(countryEn, rawData, isCost) : ""

    const systemInstruction =
      `${buildSystemPrompt(rawData, role, nccSection)}\n\n---\nNguoi dang chat: ${name}`

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", systemInstruction })

    const history = messages.slice(0, -1).map((m: any) => ({
      role:  m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }))

    const result = await model.startChat({ history }).sendMessageStream(lastMessage)

    const encoder = new TextEncoder()
    const stream  = new ReadableStream({
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
