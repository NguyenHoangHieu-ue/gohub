import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "@/lib/supabase"

const CACHE_TTL = 30 * 60 * 1000

let cache: { data: CacheData; at: number } | null = null

interface CacheData {
  // Reference data — ít thay đổi, cache 30 phút hợp lý
  wmProducts:       any[]
  wmInSystem:       Set<string>
  zones3hk:         any[]
  supportCountries: any[]
  countries:        any[]
  vendors:          any[]
  settings:         any[]
  groupMap:         Record<string, string>  // group code → tên nước
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

  // Chỉ fetch reference data — SKU/product luôn query DB trực tiếp per-request
  const [
    wmProductsRaw, wmSkusRaw, zones3hkRaw,
    supportCountries, countries, vendors, settings,
  ] = await Promise.all([
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

  const wmInSystem = new Set<string>((wmSkusRaw as any[]).map((s: any) => s.vendor_sku as string))

  const groupMap: Record<string, string> = {}
  for (const sc of (supportCountries as any[])) groupMap[sc.code] = sc.support_country ?? sc.code

  console.log(`[chat:cache] wm=${(wmProductsRaw as any[]).length} support_countries=${(supportCountries as any[]).length}`)

  const data: CacheData = {
    wmProducts: wmProductsRaw as any[], wmInSystem,
    zones3hk: zones3hkRaw as any[],
    supportCountries, countries, vendors, settings,
    groupMap,
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

// ─── Intent detection + SKU filtering ────────────────────────────────────────

interface Intent {
  country:     string | null
  vendor:      string | null   // sku_code[5:7]: "WM", "3H", ...
  days:        number | null
  dataGB:      number | null
  isUnlimited: boolean
}

function detectIntent(message: string, data: CacheData): Intent {
  const msg = message.toLowerCase()

  const country = detectCountry(message, data)

  let vendor: string | null = null
  if (/worldmove/.test(msg) || /\bwm\b/.test(msg)) vendor = "WM"
  else if (/3hk|3 hk/.test(msg)) vendor = "3H"

  let days: number | null = null
  const dayMatch   = msg.match(/(\d+)\s*(ngày|ngay)/)
  const weekMatch  = msg.match(/(\d+)\s*(tuần|tuan)/)
  const monthMatch = msg.match(/(\d+)\s*(tháng|thang)/)
  if      (dayMatch)   days = parseInt(dayMatch[1])
  else if (weekMatch)  days = parseInt(weekMatch[1]) * 7
  else if (monthMatch) days = parseInt(monthMatch[1]) * 30

  let dataGB: number | null = null
  let isUnlimited = false
  if (/unlimited|không giới hạn|khong gioi han|vô hạn|vo han/.test(msg)) {
    isUnlimited = true
  }
  const gm = msg.match(/(\d+(?:\.\d+)?)\s*gb/)
  const mm = msg.match(/(\d+(?:\.\d+)?)\s*mb/)
  if (gm) dataGB = parseFloat(gm[1])
  else if (mm) dataGB = Math.round(parseFloat(mm[1]) / 1000 * 100) / 100

  return { country, vendor, days, dataGB, isUnlimited }
}

async function querySkusFromDB(
  intent: Intent,
  data: CacheData
): Promise<{ skus: any[]; note: string }> {
  const search = intent.country!.toLowerCase()

  // Phân loại mã nhóm: đơn nước vs nhóm nhiều nước
  const singleCodes: string[] = []
  const allCodes:    string[] = []
  for (const sc of data.supportCountries) {
    const hay = ((sc.support_country ?? "") + " " + (sc.country_codes ?? "")).toLowerCase()
    if (!hay.includes(search)) continue
    allCodes.push(sc.code as string)
    if (!((sc.support_country as string) ?? "").includes(",")) singleCodes.push(sc.code as string)
  }
  if (!allCodes.length) return { skus: [], note: `khong tim thay ma nhom cho ${intent.country}` }

  // Query Supabase với ILIKE pattern trên sku_code[2:5] (__ = source + type, ${code} = country group)
  const queryByCodes = async (codes: string[]) => {
    const orPat = codes.map(c => `sku_code.ilike.__${c}%`).join(",")
    const { data: rows, error } = await supabaseAdmin
      .from("skus")
      .select("sku_code,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,day_amount,day_amount_unit,throttle_speed,expirations,vendor_sku,latest_cogs,latest_cogs_currency,final_cogs_included_vat_vnd,final_cogs_usd")
      .eq("status", "Active")
      .or(orPat)
    if (error) console.error("[querySkusFromDB]", error.message)
    return rows ?? []
  }

  // Phase 1: đơn nước, Phase 2: mở rộng nhóm nếu rỗng
  let rawRows = singleCodes.length ? await queryByCodes(singleCodes) : []
  let note = ""
  if (!rawRows.length) {
    rawRows = await queryByCodes(allCodes)
    if (rawRows.length) note = `mo rong sang nhom nuoc chua ${intent.country}`
    else return { skus: [], note: `khong co san pham GoHub cho ${intent.country}` }
  }

  // Fetch product details cho đúng product_codes cần thiết — direct DB, luôn fresh
  const productCodes = [...new Set(rawRows.map((s: any) => s.product_code as string).filter(Boolean))]
  const { data: prodsData } = await supabaseAdmin
    .from("products")
    .select("product_code,product_type,operator_code,network_type,kyc_needed,supported_countries,note")
    .in("product_code", productCodes)
  const localProdMap: Record<string, any> = Object.fromEntries((prodsData ?? []).map((p: any) => [p.product_code, p]))

  let result: any[] = rawRows.map((s: any) => {
    const p = localProdMap[s.product_code] ?? {}
    return {
      ...s,
      product_type:        p.product_type        ?? null,
      operator_code:       p.operator_code       ?? null,
      network_type:        p.network_type        ?? null,
      kyc_needed:          p.kyc_needed          ?? null,
      supported_countries: p.supported_countries ?? null,
      note:                p.note                ?? null,
    }
  })

  // FULL_TYPES filter (C/E/1/2 = sản phẩm hoàn chỉnh)
  result = result.filter((s: any) => FULL_TYPES.has(s.product_type ?? s.sku_code?.[1] ?? ""))

  // Vendor filter: sku_code[5:7]
  if (intent.vendor) {
    const withV = result.filter((s: any) => (s.sku_code as string).slice(5, 7) === intent.vendor)
    if (withV.length) result = withV
    else note += (note ? " | " : "") + `khong co vendor ${intent.vendor}, hien thi tat ca`
  }

  // Days filter
  if (intent.days !== null) {
    const exact = result.filter((s: any) => s.day_amount === intent.days)
    if (exact.length) {
      result = exact
    } else {
      const avail = [...new Set<number>(result.map((s: any) => s.day_amount as number))].sort((a, b) => a - b)
      note += (note ? " | " : "") + `khong co goi ${intent.days}d, co: ${avail.slice(0, 6).join("/")}d`
    }
  }

  // Data filter
  if (intent.isUnlimited) {
    const u = result.filter((s: any) => (s.data_amount ?? 0) >= 9999)
    if (u.length) result = u
    else note += (note ? " | " : "") + `khong co goi unlimited`
  } else if (intent.dataGB !== null) {
    const exact = result.filter((s: any) => s.data_amount === intent.dataGB)
    if (exact.length) {
      result = exact
    } else {
      const close = result.filter((s: any) => Math.abs((s.data_amount ?? 0) - intent.dataGB!) <= 0.5)
      if (close.length) {
        result = close
      } else {
        const avail = [...new Set<number>(result.map((s: any) => s.data_amount as number))]
          .sort((a, b) => a - b).map((n: number) => n >= 9999 ? "Unlimited" : `${n}GB`)
        note += (note ? " | " : "") + `khong co ${intent.dataGB}GB, co: ${avail.slice(0, 6).join("/")}`
      }
    }
  }

  console.log(`[chat] DB query country="${intent.country}" phase=${singleCodes.length ? "single" : "all"} result=${result.length} note="${note}"`)
  return { skus: result, note }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(data: CacheData, role: string, nccSection: string, skuCtxOverride?: string): string {
  const isCost = role === "admin" || role === "manager"
  const { supportCountries, countries, vendors, settings } = data

  const lines = [
    `Ban la tro ly AI cua GoHub — cong ty cung cap SIM/eSIM du lich.`,
    `Tra loi bang tieng Viet. Khong de cap ten bang/cot database.`,
    `Danh sach san pham GoHub hien co nam trong phan SAN PHAM GOHUB ben duoi.`,
    `Khi user hoi ve san pham, tim trong danh sach do — khong tu bia them.`,
    `Neu GoHub khong co → thong bao ro rang va gioi thieu catalog NCC neu co.`,
    ``,
    skuCtxOverride ?? `=== SAN PHAM GOHUB ===\n[Chua co tieu chi tim kiem. Neu user hoi san pham, yeu cau cung cap ten nuoc truoc.]`,
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
    let skuCtxOverride: string | undefined
    let nccSection = ""

    // Case 1: user cung cấp trực tiếp mã SKU 13 ký tự → query DB trực tiếp (bypass cache)
    const skuDirectMatch = lastMessage.match(/\b([A-Z0-9]{13})\b/i)
    if (skuDirectMatch) {
      const skuCode = skuDirectMatch[1].toUpperCase()

      const [{ data: skuRow }, { data: prodRow }] = await Promise.all([
        supabaseAdmin.from("skus")
          .select("sku_code,product_code,tenant,status,sim_esim,data_amount,data_amount_unit,day_amount,day_amount_unit,throttle_speed,expirations,vendor_sku,latest_cogs,latest_cogs_currency,final_cogs_included_vat_vnd,final_cogs_usd")
          .eq("sku_code", skuCode)
          .maybeSingle(),
        supabaseAdmin.from("skus")
          .select("product_code")
          .eq("sku_code", skuCode)
          .maybeSingle()
          .then(async r => {
            if (!r.data?.product_code) return { data: null }
            return supabaseAdmin.from("products")
              .select("product_type,operator_code,network_type,kyc_needed,supported_countries,note")
              .eq("product_code", r.data.product_code)
              .maybeSingle()
          }),
      ])

      if (!skuRow) {
        skuCtxOverride = `[SKU "${skuCode}" khong ton tai trong database. Ma co the sai.]`
      } else if (skuRow.status !== "Active") {
        skuCtxOverride = `[SKU "${skuCode}" ton tai nhung dang o trang thai "${skuRow.status}" (chua phai Active). Thong bao chinh xac trang thai nay cho user.]`
      } else {
        const enriched = {
          ...skuRow,
          product_type:        (prodRow as any)?.product_type ?? null,
          operator_code:       (prodRow as any)?.operator_code ?? null,
          network_type:        (prodRow as any)?.network_type ?? null,
          kyc_needed:          (prodRow as any)?.kyc_needed ?? null,
          supported_countries: (prodRow as any)?.supported_countries ?? null,
          note:                (prodRow as any)?.note ?? null,
        }
        skuCtxOverride = `[Tim truc tiep tu DB: SKU ${skuCode} — Active]\n` + buildSkuCtx([enriched], isCost, rawData.groupMap)
      }
    } else {
      // Case 2: intent detection + query DB trực tiếp theo country/vendor/days/data
      const intent = detectIntent(lastMessage, rawData)
      nccSection   = intent.country ? buildNccSection(intent.country, rawData, isCost) : ""
      if (intent.country) {
        const { skus: filtered, note } = await querySkusFromDB(intent, rawData)
        const criteria = [
          `nuoc=${intent.country}`,
          intent.vendor      && `vendor=${intent.vendor}`,
          intent.days   != null && `${intent.days}d`,
          intent.isUnlimited   ? "Unlimited" : (intent.dataGB != null && `${intent.dataGB}GB`),
        ].filter(Boolean).join(" ")
        skuCtxOverride = `[Tim kiem: ${criteria}${note ? ` | ${note}` : ""}]\n` + buildSkuCtx(filtered, isCost, rawData.groupMap)
      }
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
