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
  groupMap:         Record<string, string>  // group code → tên nước
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
    const { data, error } = await q
    if (error) { console.error(`[fetchAllRows] ${table}:`, error.message); break }
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

function buildSkuCtx(skus: any[], isCost: boolean, groupMap: Record<string, string>): string {
  const full = skus
    .filter(s => FULL_TYPES.has(s.product_type ?? s.sku_code?.[1] ?? ""))
    .sort((a, b) => {
      if (a.tenant === "VN" && b.tenant !== "VN") return -1
      if (b.tenant === "VN" && a.tenant !== "VN") return 1
      return (a.sku_code ?? "").localeCompare(b.sku_code ?? "")
    })

  function decodeGroups(codes: string | null): string {
    if (!codes) return "—"
    return codes.split(/[,\s]+/).filter(Boolean)
      .map(c => {
        const name = groupMap[c.trim()]
        return name ? `${c}(${name})` : c
      })
      .join(" / ")
  }

  const header =
    `=== SAN PHAM GOHUB (${full.length} SKU active — chi eSIM Full va SIM Full) ===\n` +
    `Cau truc SKU code 13 ky tu: [source(1)][type(1)][country_group(3)][vendor(2)][data_policy(1)][data_amount(3)][day(2)]\n` +
    `sku_code|tenant|sim|data|days|throttle|operator|kyc|nuoc|vendor_sku` +
    (isCost ? `|latest_cogs|currency` : "")

  const rows = full.map(s =>
    `${s.sku_code}|${s.tenant}|${s.sim_esim}` +
    `|${fmtData(s.data_amount, s.data_amount_unit)}|${s.day_amount}d` +
    `|${s.throttle_speed ?? "—"}|${s.operator_code ?? "—"}` +
    `|${s.kyc_needed ?? "—"}|${decodeGroups(s.supported_countries)}` +
    `|${s.vendor_sku ?? "—"}` +
    (isCost ? `|${s.latest_cogs ?? "?"}|${s.latest_cogs_currency ?? "?"}` : "") +
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

  // Build group code → country name map để decode supported_countries server-side
  const groupMap: Record<string, string> = {}
  for (const sc of (supportCountries as any[])) groupMap[sc.code] = sc.support_country ?? sc.code

  // Pre-compute SKU context strings (cache 1 lần, dùng cho mọi request)
  const skuCtx     = buildSkuCtx(skus, false, groupMap)
  const skuCtxCost = buildSkuCtx(skus, true, groupMap)

  const withCountries = skus.filter(s => s.supported_countries).length
  console.log(`[chat:cache] skus=${skus.length} with_countries=${withCountries} wm=${(wmProductsRaw as any[]).length} ctx_chars=${skuCtx.length}`)

  const data: CacheData = {
    skus, wmProducts: wmProductsRaw as any[], wmInSystem,
    zones3hk: zones3hkRaw as any[],
    supportCountries, countries, vendors, settings,
    groupMap, skuCtx, skuCtxCost,
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

// ─── Server-side SKU filter theo nước ────────────────────────────────────────

function filterSkusByCountry(skus: any[], countryEn: string, supportCountries: any[]): any[] {
  const search = countryEn.toLowerCase()
  const matchCodes = new Set<string>()
  for (const sc of supportCountries) {
    const haystack = ((sc.support_country ?? "") + " " + (sc.country_codes ?? "")).toLowerCase()
    if (haystack.includes(search)) matchCodes.add(sc.code as string)
  }
  if (!matchCodes.size) return skus

  const filtered = skus.filter(s => {
    // Primary: dùng supported_countries từ products table (join)
    if (s.supported_countries) {
      return (s.supported_countries as string).split(/[,\s]+/).some(g => matchCodes.has(g.trim()))
    }
    // Fallback: ký tự 2-4 của sku_code luôn là country group (không cần join)
    return s.sku_code ? matchCodes.has((s.sku_code as string).slice(2, 5)) : false
  })

  console.log(`[chat] filter country="${countryEn}" codes=${[...matchCodes].join(",")} matched=${filtered.length}/${skus.length}`)
  return filtered.length > 0 ? filtered : skus
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(data: CacheData, role: string, nccSection: string, skuCtxOverride?: string): string {
  const isCost = role === "admin" || role === "manager"
  const { skuCtx, skuCtxCost, supportCountries, countries, vendors, settings } = data

  const lines = [
    `Ban la tro ly AI cua GoHub — cong ty cung cap SIM/eSIM du lich.`,
    `Tra loi bang tieng Viet. Khong de cap ten bang/cot database.`,
    `Danh sach san pham GoHub hien co nam trong phan SAN PHAM GOHUB ben duoi.`,
    `Khi user hoi ve san pham, tim trong danh sach do — khong tu bia them.`,
    `Neu GoHub khong co → thong bao ro rang va gioi thieu catalog NCC neu co.`,
    ``,
    skuCtxOverride ?? (isCost ? skuCtxCost : skuCtx),
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

  lines.push(``,
    `=== XU LY CAU HOI MO HO ===`,
    `Neu user KHONG neu nuoc → hoi lai ngay: "Ban muon di nuoc nao?" (bat buoc, khong the tim duoc neu thieu nuoc)`,
    `Neu co nuoc, THIEU ngay → liet ke TAT CA goi theo nuoc do, sap xep tang dan theo so ngay`,
    `Neu co nuoc + ngay, THIEU data → liet ke cac muc data co san cho nuoc + ngay do`,
    `"1 tuan"=7d | "2 tuan"=14d | "1 thang"=30d | "nua thang"=15d | "vai ngay"=hoi them so ngay cu the`,
    `"khoang X ngay" → tim X ngay chinh xac truoc; neu khong co → neu ro khong co X ngay va goi y nearest below VA nearest above`,
    `Neu khong tim duoc chinh xac → TUYET DOI KHONG noi "khong co san pham" ma goi y san pham gan nhat kem giai thich ly do`,
    `Neu user hoi chung chung ("goi nao tot?", "tu van goi") → hoi nuoc + ngay truoc khi tra loi`,
  )

  lines.push(``,
    `=== GIAI THICH COT DU LIEU ===`,
    `[SKU / San pham]`,
    `day_amount: so NGAY SU DUNG DATA (khong phai ngay het han SIM)`,
    `expirations: so ngay SIM con hieu luc sau kich hoat (>= day_amount). VD: goi 7 ngay nhung SIM het han sau 90 ngay kich hoat`,
    `data_amount: dung luong data (9999 = Unlimited)`,
    `throttle_speed: toc do mang SAU KHI het data highspeed (VD: 128kbps, 5Mbps, 10Mbps). Neu khong co = khong gioi han toc do`,
    `call: co ho tro goi dien khong (Yes/No)`,
    `hotspot: co chia se wifi/hotspot khong (Yes/No)`,
    `kyc_needed: can xac minh danh tinh truoc khi dung khong (Yes/No)`,
    `vendor_sku: ma eSIM cua nha cung cap | vendor_sku_sim: ma SIM vat ly (trong neu la eSIM)`,
    `latest_cogs + latest_cogs_currency: gia von moi nhat theo don vi goc (USD, VND, TWD...)`,
    `final_cogs_included_vat_vnd: gia von cuoi sau VAT (VND) — chi neu duoc hoi cu the`,
    `final_cogs_usd: gia von cuoi sau VAT (USD) — chi neu duoc hoi cu the`,
    `supported_countries: ma NHOM nuoc (3 ky tu), tra muc NHOM NUOC HO TRO de biet ten nuoc cu the`,
    `sim_esim: loai SIM (SIM / eSIM)`,
    `operator_code: ten nha cung cap mang (WORLDMOVE, 3HK...)`,
    `network_type: loai mang (4G / 5G/4G)`,
    ``,
    `[Giai ma product_code (8 ky tu)]`,
    `Ky tu 1 = source_type: VN: 1=StockDirect 2=InternalGHI 3=MonthlyInv 4=TelcoBalance 5=Datapool 6=Others | US: A=StockDirect B=Internal C=MonthlyInv D=TelcoBalance E=Datapool`,
    `Ky tu 2 = product_type: C=eSIM Full  E=SIM Full  A=Datapack  B=eSIM Profile  D=SIM Frame  F=PhiShip  G=Qua  H=Khac  1=eSIM Full VN  2=SIM Full VN  3=PhiShip VN  4=VAT VN`,
    `Ky tu 3-5 = country_group: ma nhom nuoc 3 ky tu (tra NHOM NUOC HO TRO)`,
    `Ky tu 6-7 = vendor_code: WM=WORLDMOVE  3H=3HK  3D=3HK Datapool...`,
    `Ky tu 8 = data_policy: A=Daily Unlim 5Mbps  B=Daily Unlim 10Mbps  C=Unlim 20Mbps  D=Unlim 100Mbps  E=Fixed Unlim 5Mbps  G=Fixed Unlim 10Mbps  H=Unlim 5Mbps  F=Fixed throttle<2Mbps  P=Daily throttle<2Mbps  Y=Fixed no-throttle  Z=Daily no-throttle  K=khong co data`,
    ``,
    `[SKU code (13 ky tu) = product_code(8) + data_amount_code(3) + day_amount(2)]`,
  )

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

    const lastMessage = messages.at(-1).content
    const countryEn   = detectCountry(lastMessage, rawData)
    const nccSection  = countryEn ? buildNccSection(countryEn, rawData, isCost) : ""

    // Khi detect được nước → filter SKUs server-side → context nhỏ, Gemini tìm chính xác hơn
    let skuCtxOverride: string | undefined
    if (countryEn) {
      const filtered = filterSkusByCountry(rawData.skus, countryEn, rawData.supportCountries)
      skuCtxOverride  = buildSkuCtx(filtered, isCost, rawData.groupMap)
      console.log(`[chat] country=${countryEn} skus=${filtered.length}`)
    }

    const systemInstruction =
      `${buildSystemPrompt(rawData, role, nccSection, skuCtxOverride)}\n\n---\nNguoi dang chat: ${name}`

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
