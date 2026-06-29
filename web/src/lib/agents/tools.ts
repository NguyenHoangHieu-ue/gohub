import { supabaseAdmin } from "@/lib/supabase"
import { runQuery }      from "@/lib/neo4j-client"
import { GoogleGenerativeAI } from "@google/generative-ai"
import type { RefCache } from "./cache"

const FULL_TYPES = new Set(["C", "E", "1", "2"])

// ─── Region data ──────────────────────────────────────────────────────────────

export const REGION_COUNTRIES: Record<string, string[]> = {
  asia: [
    "Japan", "South Korea", "Taiwan", "Hong Kong", "Singapore",
    "Thailand", "Malaysia", "Philippines", "Indonesia", "India",
    "China", "Macao", "Mongolia", "Vietnam",
  ],
  southeast_asia: [
    "Thailand", "Malaysia", "Philippines", "Indonesia", "Singapore",
    "Vietnam", "Myanmar", "Cambodia", "Laos",
  ],
  europe: [
    "United Kingdom", "France", "Germany", "Italy", "Spain",
    "Netherlands", "Switzerland", "Sweden", "Norway", "Denmark",
    "Finland", "Poland", "Austria", "Belgium", "Portugal",
    "Greece", "Czech Republic", "Turkey", "Hungary", "Romania",
    "Croatia", "Serbia", "Ukraine",
  ],
  north_america: ["United States", "Canada", "Mexico"],
  americas: [
    "United States", "Canada", "Mexico", "Brazil", "Argentina",
    "Chile", "Colombia", "Peru",
  ],
  middle_east: [
    "United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait",
    "Bahrain", "Jordan", "Israel",
  ],
  africa: [
    "South Africa", "Nigeria", "Kenya", "Ghana", "Egypt",
    "Morocco", "Tanzania", "Ethiopia",
  ],
  oceania: ["Australia", "New Zealand"],
}

export const REGION_DISPLAY: Record<string, string> = {
  asia:           "Châu Á",
  southeast_asia: "Đông Nam Á",
  europe:         "Châu Âu",
  north_america:  "Bắc Mỹ",
  americas:       "Châu Mỹ",
  middle_east:    "Trung Đông",
  africa:         "Châu Phi",
  oceania:        "Châu Đại Dương",
}

// ─── NCC country ↔ region matcher ─────────────────────────────────────────────
// ncc_worldmove.region chỉ có ~40 nhãn thô ("Europe", "USA", "Korea", "Southeast Asia"...).
// Match thuần region.includes(country) HỎNG cho phần lớn nước (Germany→"Europe" miss,
// United States→"USA" miss, South Korea→"Korea" miss). Bộ matcher dưới đây chấm điểm:
//   3 = nước xuất hiện trực tiếp trong region/product_name (chính xác nhất)
//   2 = gói khu vực rộng có chứa nước (Europe→các nước EU, Southeast Asia→...)
//   1 = gói toàn cầu (Worldwide/Global)
//   0 = không liên quan

// Members (lowercase) cho từng region rộng — match nước thành viên với gói khu vực
const NCC_REGION_MEMBERS: Record<string, string[]> = {
  asia: [
    "japan","south korea","korea","taiwan","hong kong","singapore","thailand",
    "malaysia","philippines","indonesia","india","china","macao","macau","mongolia",
    "vietnam","sri lanka","bangladesh","cambodia","laos","myanmar","maldives","nepal","brunei",
  ],
  southeast_asia: [
    "thailand","malaysia","philippines","indonesia","singapore","vietnam",
    "myanmar","cambodia","laos","brunei",
  ],
  europe: [
    "united kingdom","france","germany","italy","spain","netherlands","switzerland",
    "sweden","norway","denmark","finland","poland","austria","belgium","portugal",
    "greece","czech republic","czechia","turkey","hungary","romania","croatia","serbia",
    "ukraine","ireland","russia","iceland","luxembourg","slovakia","slovenia","bulgaria",
    "estonia","latvia","lithuania","malta","cyprus",
  ],
  north_america: ["united states","usa","canada","mexico"],
  americas: [
    "united states","usa","canada","mexico","brazil","argentina","chile",
    "colombia","peru","ecuador","uruguay","bolivia","paraguay",
  ],
  middle_east: [
    "united arab emirates","uae","saudi arabia","qatar","kuwait","bahrain",
    "jordan","israel","oman","turkey",
  ],
  africa: [
    "south africa","nigeria","kenya","ghana","egypt","morocco","tanzania",
    "ethiopia","uganda","tunisia",
  ],
  oceania: ["australia","new zealand"],
}

// Nhãn region thô của WM → region id rộng (lowercase region → region id, hoặc "WORLD")
const NCC_BROAD_REGION_LABEL: Record<string, string> = {
  "europe":          "europe",
  "asia":            "asia",
  "southeast asia":  "southeast_asia",
  "north america":   "north_america",
  "south america":   "americas",
  "persian gulf":    "middle_east",
  "africa":          "africa",
  "worldwide":       "WORLD",
  "global":          "WORLD",
  "any":             "WORLD",
}

// Alias tên nước → các token có thể xuất hiện trong region/product_name
const NCC_COUNTRY_ALIASES: Record<string, string[]> = {
  "united states":        ["united states","usa","u.s","america"],
  "south korea":          ["south korea","korea"],
  "united kingdom":       ["united kingdom","uk","britain","england"],
  "united arab emirates": ["united arab emirates","uae"],
  "hong kong":            ["hong kong","hongkong"],
  "macao":                ["macao","macau"],
  "china":                ["china","mainland china"],
  "czech republic":       ["czech republic","czechia"],
}

function nccCountryTokens(country: string): string[] {
  const c = country.toLowerCase().trim()
  return NCC_COUNTRY_ALIASES[c] ?? [c]
}

// Chấm điểm 1 sản phẩm NCC (theo region + product_name) so với 1 nước. 0 = không match.
export function nccCountryScore(region: string | null, productName: string | null, country: string): number {
  const r = (region ?? "").toLowerCase()
  const pn = (productName ?? "").toLowerCase()
  const tokens = nccCountryTokens(country)

  // 3 — nước xuất hiện trực tiếp (region hoặc product_name)
  for (const t of tokens) {
    if (r.includes(t) || pn.includes(t)) return 3
  }
  // 2/1 — region rộng có chứa nước
  const rid = NCC_BROAD_REGION_LABEL[r.trim()]
  if (rid) {
    if (rid === "WORLD") return 1
    const members = NCC_REGION_MEMBERS[rid] ?? []
    if (tokens.some(t => members.includes(t))) return 2
  }
  return 0
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCountryCodes(countryEn: string, ref: RefCache) {
  const s = countryEn.toLowerCase().trim()

  // Tìm ISO code từ ref_countries (exact match tên hoặc code)
  const isoRow = ref.countries.find(
    (c: any) => (c.name ?? "").toLowerCase() === s || (c.code ?? "").toLowerCase() === s
  )
  // Fallback: tìm partial match tên (đề phòng tên khác nhau chút, ví dụ "Viet Nam" vs "Vietnam")
  const isoRowPartial = !isoRow
    ? ref.countries.find((c: any) => {
        const n = (c.name ?? "").toLowerCase()
        return n.startsWith(s.slice(0, 5)) || s.startsWith(n.slice(0, 5))
      })
    : null
  const isoUpper = ((isoRow ?? isoRowPartial)?.code ?? "").toUpperCase()  // e.g., "BY", "RU"

  const single: string[] = [], all: string[] = []
  for (const sc of ref.supportCountries) {
    const supportText = (sc.support_country ?? "").toLowerCase()
    // Tách country_codes thành array, kiểm tra exact match (tránh false positive như "by" trong "nearby")
    const codesArr = (sc.country_codes ?? "")
      .toUpperCase().split(/[\s,;|/]+/).map((c: string) => c.trim()).filter(Boolean)

    const byName     = supportText.includes(s)
    const byIso      = !!isoUpper && codesArr.includes(isoUpper)
    const byCodeText = (sc.country_codes ?? "").toLowerCase().includes(s)  // tên nước trong cột country_codes

    if (!byName && !byIso && !byCodeText) continue
    all.push(sc.code)
    if (!(sc.support_country ?? "").includes(",")) single.push(sc.code)
  }
  return { single, all, isoUpper }
}

async function enrichWithProducts(rows: any[]): Promise<any[]> {
  if (!rows.length) return []
  const codes = [...new Set(rows.map((s: any) => s.product_code).filter(Boolean))]
  const { data: prods } = await supabaseAdmin
    .from("products")
    .select("product_code,product_type,operator_code,network_type,kyc_needed,supported_countries,note,hotspot,activation_time")
    .in("product_code", codes)
  const pm: Record<string, any> = {}
  for (const p of prods ?? []) pm[p.product_code] = p
  return rows.map((s: any) => ({
    ...s,
    product_type:        pm[s.product_code]?.product_type        ?? s.sku_code?.[1] ?? null,
    operator_code:       pm[s.product_code]?.operator_code       ?? null,
    network_type:        pm[s.product_code]?.network_type        ?? null,
    kyc_needed:          pm[s.product_code]?.kyc_needed          ?? null,
    supported_countries: pm[s.product_code]?.supported_countries ?? null,
    note:                pm[s.product_code]?.note                ?? null,
    hotspot:             pm[s.product_code]?.hotspot             ?? null,
  }))
}

// ─── Channel helper ──────────────────────────────────────────────────────────
// Từ role → channel filter cho items (B2C / B2B / null = all)
export function getChannelFromRole(role: string): "B2C" | "B2B" | null {
  const r = (role || "").toLowerCase()
  if (r === "b2c" || r === "saleb2c") return "B2C"
  if (r === "b2b") return "B2B"
  return null
}

// Default prefix mapping — được ghi đè bởi app_settings key "item_channel_types"
const CHANNEL_TYPE_DEFAULTS: Record<string, string[]> = {
  B2C: ["B2C", "ECO"],
  B2B: ["OD", "WS", "Strategic", "TIER", "SILVER", "DEAL", "B2B"],
}
let _channelTypesCache: { data: Record<string, string[]>; at: number } | null = null

// Fetch (và cache 30 phút) config mapping channel → item_type prefix list.
// Phần lớn item_type B2B không chứa "B2B" literal mà là "OD …", "WS …", "Strategic …", etc.
export async function getChannelTypes(): Promise<Record<string, string[]>> {
  const now = Date.now()
  if (_channelTypesCache && now - _channelTypesCache.at < 30 * 60 * 1000) return _channelTypesCache.data
  const { data } = await supabaseAdmin.from("app_settings")
    .select("value").eq("key", "item_channel_types").maybeSingle()
  let result = CHANNEL_TYPE_DEFAULTS
  try { if (data?.value) result = JSON.parse(data.value) } catch {}
  _channelTypesCache = { data: result, at: now }
  return result
}

// Fetch giá bán (unitprice) từ bảng items, filter theo channel + sku_code.
// Returns map: sku_code → { unitprice, currency, item_type }
// Nếu channel=null → trả Map rỗng (không cần filter)
export async function getChannelPrices(
  skuCodes: string[],
  channel:  "B2C" | "B2B" | null
): Promise<Map<string, { unitprice: number; currency: string; item_type: string }>> {
  if (!channel || !skuCodes.length) return new Map()
  const channelTypes = await getChannelTypes()
  const prefixes = channelTypes[channel] ?? []
  if (!prefixes.length) return new Map()

  // Build Supabase OR filter: item_type ILIKE '%OD%' OR ILIKE '%WS%' OR ...
  const orFilter = prefixes.map(p => `item_type.ilike.%${p}%`).join(",")
  const { data } = await supabaseAdmin
    .from("items")
    .select("sku_code, unitprice, currency, item_type")
    .in("sku_code", skuCodes)
    .or(orFilter)
    .eq("status", "Active")
  const map = new Map<string, { unitprice: number; currency: string; item_type: string }>()
  for (const item of data ?? []) {
    if (!map.has(item.sku_code) && item.unitprice != null) {
      map.set(item.sku_code, { unitprice: item.unitprice, currency: item.currency, item_type: item.item_type })
    }
  }
  return map
}

// ─── Tool: search_skus ────────────────────────────────────────────────────────
// Query bảng sku_catalog (pre-joined, chỉ full-type C/E/1/2, có index trên country_group)

export async function searchSkus(params: {
  country: string
  days?: number
  data_gb?: number
  is_unlimited?: boolean
  vendor?: string
  sim_type?: string
  tenant?: string
}, ref: RefCache): Promise<{ skus: any[]; note: string }> {
  const { single, all, isoUpper } = getCountryCodes(params.country, ref)

  const queryByCodes = async (codes: string[]) => {
    if (!codes.length) return []
    const { data, error } = await supabaseAdmin
      .from("sku_catalog")
      .select("sku_code,product_code,tenant,status,sim_esim,product_type,country_group,data_amount,data_amount_unit,is_unlimited,is_daily,day_amount,expirations,throttle_speed,call,call_sms_details,hotspot,kyc_needed,operator_code,network_type,vendor_sku,latest_cogs,latest_cogs_currency,note")
      .eq("status", "Active")
      .in("country_group", codes)
    if (error) console.error("[searchSkus]", error.message)
    return data ?? []
  }

  let rows: any[] = []
  let note = ""
  const usedCodes = new Set<string>([...single, ...all])

  // Phase 1: gói riêng cho nước (single-country groups)
  if (single.length) {
    rows = await queryByCodes(single)
  }

  // Phase 2: nhóm nước bao gồm nước đó (cache-based)
  if (!rows.length && all.length) {
    const multi = all.filter(c => !single.includes(c))
    rows = await queryByCodes(multi.length ? multi : all)
    if (rows.length) {
      note = `GoHub không có gói riêng cho ${params.country}${isoUpper ? ` (${isoUpper})` : ""}. Hiển thị gói nhóm nước có bao gồm ${params.country}:`
    }
  }

  // Phase 3: DB query mở rộng — phòng cache miss hoặc tên nước viết khác
  if (!rows.length) {
    const orClauses = [`support_country.ilike.%${params.country}%`]
    if (isoUpper) orClauses.push(`country_codes.ilike.%${isoUpper}%`)
    const { data: p3Groups } = await (supabaseAdmin.from("ref_support_countries") as any)
      .select("code").or(orClauses.join(","))
    const p3Codes = (p3Groups ?? [])
      .map((r: any) => r.code as string)
      .filter((c: string) => !usedCodes.has(c))
    if (p3Codes.length) {
      rows = await queryByCodes(p3Codes)
      p3Codes.forEach((c: string) => usedCodes.add(c))
      if (rows.length) {
        note = `GoHub không có gói riêng cho ${params.country}${isoUpper ? ` (${isoUpper})` : ""}. Tìm thấy gói nhóm nước liên quan:`
      }
    }
  }

  // Phase 4: khu vực/thuộc địa rộng — chỉ dùng khi country được nhận dạng (có isoUpper)
  if (!rows.length && isoUpper) {
    const regionalCodes = ref.supportCountries
      .filter((sc: any) => {
        const t = (sc.support_country ?? "").toLowerCase()
        return /world|global|international|europe|asia|cis|africa|americas|middle east|caribbean|pacific/i.test(t)
      })
      .map((sc: any) => sc.code as string)
      .filter((c: string) => !usedCodes.has(c))
    if (regionalCodes.length) {
      rows = await queryByCodes(regionalCodes)
      if (rows.length) {
        note = `GoHub chưa có gói dành riêng cho ${params.country}${isoUpper ? ` (${isoUpper})` : ""}. Các gói khu vực rộng dưới đây có thể sử dụng được — vui lòng xác nhận thêm với team trước khi tư vấn khách:`
      }
    }
  }

  if (!rows.length) {
    return {
      skus: [],
      note: `GoHub chưa có sản phẩm nào hỗ trợ ${params.country}${isoUpper ? ` (${isoUpper})` : ""}. Đã tìm qua ${usedCodes.size} nhóm nước trong hệ thống.`,
    }
  }

  // Sort VN trước US, lọc thêm theo các tiêu chí tuỳ chọn
  let result = [...rows].sort((a: any, b: any) => (a.tenant === "VN" ? -1 : b.tenant === "VN" ? 1 : 0))

  if (params.vendor) {
    const v = result.filter((s: any) => (s.sku_code as string).slice(5, 7).toUpperCase() === params.vendor!.toUpperCase())
    if (v.length) result = v
    else note += ` | Không có vendor ${params.vendor}, hiển thị tất cả`
  }
  if (params.sim_type) {
    const v = result.filter((s: any) => s.sim_esim?.toLowerCase() === params.sim_type!.toLowerCase())
    if (v.length) result = v
  }
  if (params.tenant) {
    const v = result.filter((s: any) => s.tenant === params.tenant)
    if (v.length) result = v
  }
  if (params.is_unlimited) {
    // Unlimited = is_unlimited flag OR data_amount >= 9999 (flag không phải lúc nào cũng đồng bộ)
    const v = result.filter((s: any) => s.is_unlimited || (s.data_amount ?? 0) >= 9999)
    if (v.length) result = v
    else note += ` | Không có gói unlimited`
  } else if (params.data_gb != null) {
    const exact = result.filter((s: any) => s.data_amount === params.data_gb)
    if (exact.length) {
      result = exact
    } else {
      const close = result.filter((s: any) => Math.abs((s.data_amount ?? 0) - params.data_gb!) <= 0.5)
      if (close.length) result = close
    }
  }
  if (params.days != null) {
    const exact = result.filter((s: any) => s.day_amount === params.days)
    if (exact.length) {
      result = exact
    } else {
      const avail = [...new Set(result.map((s: any) => s.day_amount as number))].sort((a, b) => a - b)
      note += ` | Không có gói ${params.days}d, có: ${avail.slice(0, 6).join("/")}d`
    }
  }

  if (result.length > 40) note += ` | ⚠ Hiển thị 40/${result.length} SKU (có nhiều hơn — thông báo với user)`
  return { skus: result.slice(0, 40), note }
}

// ─── Tool: search_skus_for_region ────────────────────────────────────────────
// Tìm SKU cho cả một khu vực (châu Á, châu Âu...).
// Dùng coverage ratio để phân loại nhóm nước: single-country vs multi-country.

function buildRegionIsoSet(region: string, ref: RefCache): Set<string> {
  // Map region id → continent/sub_region target
  const REGION_TO_GEO: Record<string, { continent?: string; subRegion?: string }> = {
    "asia":           { continent: "Asia" },
    "southeast_asia": { subRegion: "Southeast Asia" },
    "europe":         { continent: "Europe" },
    "americas":       { continent: "Americas" },
    "north_america":  { subRegion: "North America" },
    "middle_east":    { continent: "Middle East" },
    "africa":         { continent: "Africa" },
    "oceania":        { continent: "Oceania" },
  }
  const geo = REGION_TO_GEO[region]
  if (!geo) return new Set()

  const isoSet = new Set<string>()
  for (const c of ref.countries as any[]) {
    if (geo.subRegion && c.sub_region === geo.subRegion) isoSet.add(c.code)
    else if (!geo.subRegion && geo.continent && c.continent === geo.continent) isoSet.add(c.code)
  }

  // Fallback: use hardcoded if DB not populated
  if (!isoSet.size) {
    const fallbackCountries = REGION_COUNTRIES[region] ?? []
    for (const name of fallbackCountries) {
      const row = (ref.countries as any[]).find(
        (c: any) => (c.name ?? "").toLowerCase() === name.toLowerCase()
      )
      if (row) isoSet.add(row.code)
    }
  }
  return isoSet
}

export async function searchSkusForRegion(
  region: string,
  filter: { days?: number; simType?: string; isUnlimited?: boolean; vendor?: string },
  ref: RefCache
): Promise<string> {
  const displayName = REGION_DISPLAY[region] ?? region

  // 1. Get ISO codes belonging to this region
  const regionIso = buildRegionIsoSet(region, ref)
  if (!regionIso.size) return ""

  // 2. For each support_countries group, compute coverage ratio
  //    ratio = (countries in this region) / (total countries in group)
  //    primary  group: ratio ≥ 0.5  → group is mostly this region
  //    mixed    group: ratio < 0.5  → skip (too broad / global)
  type GroupMeta = {
    code: string
    displayName: string
    overlapIso: string[]   // ISO codes in this group that are in the region
    totalCodes: number
    isSingle: boolean      // only covers 1 country
  }
  const primaryGroups: GroupMeta[] = []

  for (const sc of ref.supportCountries as any[]) {
    const ccStr = (sc.country_codes ?? "")
    const groupCodes = ccStr.split(/[\s,;|/]+/)
      .map((c: string) => c.trim().toUpperCase()).filter(Boolean)
    if (!groupCodes.length) continue

    const overlap = groupCodes.filter((c: string) => regionIso.has(c))
    if (!overlap.length) continue

    const ratio = overlap.length / groupCodes.length
    if (ratio < 0.5) continue  // skip global / mixed groups

    primaryGroups.push({
      code:        sc.code,
      displayName: sc.support_country ?? sc.code,
      overlapIso:  overlap,
      totalCodes:  groupCodes.length,
      isSingle:    groupCodes.length === 1,
    })
  }

  if (!primaryGroups.length) return `GoHub chưa có sản phẩm nào cho ${displayName}`

  // 3. Single DB query for all primary groups
  const primaryCodes = primaryGroups.map(g => g.code)
  let q = supabaseAdmin
    .from("sku_catalog")
    .select("sku_code,country_group,sim_esim,day_amount,is_unlimited,is_daily")
    .eq("status", "Active")
    .in("country_group", primaryCodes)

  if (filter.simType)     q = q.eq("sim_esim", filter.simType === "esim" ? "eSIM" : "SIM") as typeof q
  if (filter.days)        q = q.eq("day_amount", filter.days) as typeof q
  if (filter.isUnlimited) q = q.eq("is_unlimited", true) as typeof q

  const { data: allSkus } = await q
  if (!allSkus?.length) return `GoHub chưa có SKU Active nào cho ${displayName}`

  // 4. Build group → meta map; SKU count per group
  const groupMeta: Record<string, GroupMeta> = {}
  for (const g of primaryGroups) groupMeta[g.code] = g

  type Stat = { count: number; simTypes: Set<string>; days: Set<number>; vendors: Set<string>; meta: GroupMeta }
  const statsByGroup: Record<string, Stat> = {}
  for (const sku of allSkus as any[]) {
    const meta = groupMeta[sku.country_group]
    if (!meta) continue
    if (!statsByGroup[meta.code]) {
      statsByGroup[meta.code] = { count: 0, simTypes: new Set(), days: new Set(), vendors: new Set(), meta }
    }
    statsByGroup[meta.code].count++
    if (sku.sim_esim)   statsByGroup[meta.code].simTypes.add(sku.sim_esim)
    if (sku.day_amount) statsByGroup[meta.code].days.add(sku.day_amount)
    const vendor = (sku.sku_code as string)?.slice(5, 7)
    if (vendor)         statsByGroup[meta.code].vendors.add(vendor)
  }

  // 5. Map single-country groups to country names (for cleaner display)
  const isoToName: Record<string, string> = {}
  for (const c of ref.countries as any[]) isoToName[c.code] = c.name

  // 6. Separate single-country vs multi-country groups
  const singles = Object.values(statsByGroup).filter(s => s.meta.isSingle)
  const multis  = Object.values(statsByGroup).filter(s => !s.meta.isSingle)

  const fmtRow = (s: Stat, nameOverride?: string) => {
    const daysArr = [...s.days].sort((a, b) => a - b)
    const daysStr = daysArr.length <= 5 ? daysArr.join("/") + "d"
      : `${daysArr[0]}-${daysArr[daysArr.length - 1]}d`
    const name = nameOverride ?? s.meta.displayName
    return `${name}|${s.count}|${[...s.simTypes].join("/")}|${daysStr}|${[...s.vendors].join(",")}`
  }

  // Countries with no single-country group
  const coveredIso = new Set(singles.flatMap(s => s.meta.overlapIso))
  const uncoveredCountries = [...regionIso]
    .filter(iso => !coveredIso.has(iso))
    .map(iso => isoToName[iso] || iso)
    .filter(Boolean)

  const lines: string[] = [
    `=== KHU VỰC: ${displayName.toUpperCase()} ===`,
    `Tổng: ${allSkus.length} SKU | ${singles.length} nước riêng | ${multis.length} gói đa quốc gia`,
    ``,
    `── Gói theo nước cụ thể (${singles.length}) ──`,
    `tên nước|SKU|loại SIM|ngày có|vendor`,
  ]

  for (const s of singles.sort((a, b) => b.count - a.count)) {
    const countryName = s.meta.overlapIso.length === 1
      ? (isoToName[s.meta.overlapIso[0]] || s.meta.displayName)
      : s.meta.displayName
    lines.push(fmtRow(s, countryName))
  }

  if (multis.length) {
    lines.push(``, `── Gói đa quốc gia trong khu vực (${multis.length}) ──`)
    lines.push(`mã nhóm|nước gồm|SKU|loại SIM|ngày có|vendor`)
    for (const s of multis.sort((a, b) => b.count - a.count)) {
      const isoNames = s.meta.overlapIso.map(iso => isoToName[iso] || iso).join("+")
      const daysArr = [...s.days].sort((a, b) => a - b)
      const daysStr = daysArr.length <= 5 ? daysArr.join("/") + "d" : `${daysArr[0]}-${daysArr[daysArr.length - 1]}d`
      lines.push(`${s.meta.code}|${isoNames}|${s.count}|${[...s.simTypes].join("/")}|${daysStr}|${[...s.vendors].join(",")}`)
    }
  }

  if (uncoveredCountries.length) {
    lines.push(``, `Không có gói riêng: ${uncoveredCountries.slice(0, 10).join(", ")}${uncoveredCountries.length > 10 ? `... (+${uncoveredCountries.length - 10})` : ""}`)
  }

  return lines.join("\n")
}

// ─── Tool: search_skus_by_group_code ─────────────────────────────────────────
// Query trực tiếp bằng GoHub 3-char code (JPN, CHM, EU1, APA, GLO...)
// Dùng khi user gõ thẳng mã nhóm nước hoặc category code

export async function searchSkusByGroupCode(
  groupCode: string,
  filter: { days?: number; simType?: string; isUnlimited?: boolean; vendor?: string; dataGB?: number },
  isCost: boolean,
  fx: Record<string, number>
): Promise<string> {
  const code = groupCode.toUpperCase()

  let q = supabaseAdmin
    .from("sku_catalog")
    .select("sku_code,product_code,tenant,sim_esim,data_amount,data_amount_unit,is_unlimited,is_daily,day_amount,throttle_speed,call,hotspot,kyc_needed,operator_code,vendor_sku,latest_cogs,latest_cogs_currency,note")
    .eq("status", "Active")
    .eq("country_group", code)

  if (filter.simType)     q = q.eq("sim_esim", filter.simType === "esim" ? "eSIM" : "SIM") as typeof q
  if (filter.days)        q = q.eq("day_amount", filter.days) as typeof q
  if (filter.isUnlimited) q = q.eq("is_unlimited", true) as typeof q

  const { data: skus, error } = await q.order("tenant").order("day_amount")
  if (error || !skus?.length) {
    return `=== MÃ NHÓM "${code}" ===\nKhông tìm thấy SKU Active nào cho mã nhóm ${code}`
  }

  let result = skus as any[]
  if (filter.vendor) {
    const v = result.filter(s => s.sku_code.slice(5, 7).toUpperCase() === filter.vendor!.toUpperCase())
    if (v.length) result = v
  }
  if (filter.dataGB != null) {
    const exact = result.filter(s => s.data_amount === filter.dataGB)
    if (exact.length) result = exact
  }

  const rows = result.slice(0, 50).map((s: any) => {
    const dataStr = s.is_unlimited || (s.data_amount ?? 0) >= 9999 ? "Unlimited"
      : s.data_amount != null ? `${s.data_amount}${s.data_amount_unit ?? "GB"}${s.is_daily ? "/ngày" : ""}` : null
    let cogsVnd: string | null = null, cogsUsd: string | null = null
    if (isCost && s.latest_cogs != null) {
      const usdVnd = fx["fx.usd_vnd"] ?? 26000
      const hkdUsd = fx["fx.hkd_usd"] ?? 0.128
      const twdUsd = fx["fx.twd_usd"] ?? 0.031
      let usd = 0
      switch ((s.latest_cogs_currency ?? "").toUpperCase()) {
        case "USD": usd = s.latest_cogs; break
        case "VND": usd = s.latest_cogs / usdVnd; break
        case "HKD": usd = s.latest_cogs * hkdUsd; break
        case "TWD": usd = s.latest_cogs * twdUsd; break
        default:    usd = s.latest_cogs; break
      }
      cogsVnd = Math.round(usd * usdVnd).toLocaleString("en-US")
      cogsUsd = `$${Math.round(usd * 10000) / 10000}`
    }
    return [s.sku_code, s.tenant, s.sim_esim, dataStr, `${s.day_amount}d`,
      s.throttle_speed ? `throttle:${s.throttle_speed}` : null,
      s.kyc_needed ? `kyc:${s.kyc_needed}` : null,
      s.call ? `call:${s.call}` : null,
      cogsVnd, cogsUsd,
      s.note ? `[note:${s.note}]` : null,
    ].filter(Boolean).join("|")
  })

  const truncNote = result.length > 50 ? ` (hiển thị 50/${result.length} — có thêm, thông báo với user)` : ""
  return [
    `=== MÃ NHÓM "${code}": ${result.length} SKU Active${truncNote} ===`,
    `sku_code|tenant|sim|data|days|throttle|kyc|call${isCost ? "|cogs_vnd|cogs_usd" : ""}`,
    ...rows
  ].join("\n")
}

// ─── Tool: identify_code ─────────────────────────────────────────────────────

export async function identifyCode(code: string): Promise<any> {
  const c = code.trim().toUpperCase()
  const len = c.length

  const hints: string[] = []

  // SKU: 13 ký tự
  if (len === 13 && /^[A-Z0-9]{13}$/.test(c)) {
    const { data } = await supabaseAdmin.from("skus").select("sku_code,status").eq("sku_code", c).maybeSingle()
    if (data) return { found: true, type: "SKU", code: c, status: data.status }
    hints.push("Định dạng khớp SKU (13 ký tự) nhưng không tìm thấy trong database")
  }

  // Product code: 8 ký tự
  if (len === 8 && /^[A-Z0-9]{8}$/.test(c)) {
    const { data } = await supabaseAdmin.from("products").select("product_code,status").eq("product_code", c).maybeSingle()
    if (data) return { found: true, type: "Product Code", code: c, status: data.status }
    hints.push("Định dạng khớp Product Code (8 ký tự) nhưng không tìm thấy trong database")
  }

  // Alias / Item code: 18 ký tự
  if (len === 18 && /^[A-Z0-9]{18}$/.test(c)) {
    const { data } = await supabaseAdmin.from("items").select("item_code,alias,status").eq("item_code", c).maybeSingle()
    if (data) return { found: true, type: "Item Code", code: c, status: data.status }
    // Try alias
    const { data: byAlias } = await supabaseAdmin.from("items").select("item_code,alias,sku_code,status").eq("alias", c).maybeSingle()
    if (byAlias) return { found: true, type: "Alias (Item)", code: c, item_code: byAlias.item_code, sku_code: byAlias.sku_code }
    hints.push("Định dạng khớp Item Code/Alias (18 ký tự) nhưng không tìm thấy")
  }

  // Alias bất kỳ độ dài
  if (len !== 13 && len !== 8 && len !== 18) {
    const { data: byAlias } = await supabaseAdmin.from("items").select("item_code,alias,sku_code,status").eq("alias", c).maybeSingle()
    if (byAlias) return { found: true, type: "Alias (Item)", code: c, item_code: byAlias.item_code, sku_code: byAlias.sku_code }

    const { data: byListing } = await supabaseAdmin.from("listings").select("listing_code,status").eq("listing_code", c).maybeSingle()
    if (byListing) return { found: true, type: "Listing Code", code: c, status: byListing.status }
  }

  // Không nhận ra
  return {
    found: false,
    code: c,
    length: len,
    hint: hints.length ? hints[0] : `Mã "${c}" (${len} ký tự) không khớp định dạng nào trong hệ thống GoHub. Vui lòng kiểm tra lại. Các định dạng hợp lệ: SKU (13 ký tự), Product Code (8 ký tự), Item Code/Alias (18 ký tự), Listing Code.`,
  }
}

// ─── Tool: get_product_detail ─────────────────────────────────────────────────

// Chỉ đọc cột VN (bỏ _en), bỏ date_created/last_modified_date
const LISTING_COLS = [
  "listing_code","reference_product_code","tenant","status","listing_type",
  "listing_name_vn",
  "type_of_sim","product_type","network_operator",
  "supported_countries",
  "data_type_vn",
  "category_code",
  "daily_reset_time_vn",
  "activation_time_vn",
  "network_type",
  "hotspot_vn",
  "kyc_needed_vn",
  "kyc_links_vn",
  "expirations_vn",
  "top_up_options_vn",
  "activation_vn",
  "activation_links_vn",
  "special_activation_required_vn",
  "unsupported_apps_vn",
  "telco_perks_vn",
  "note_vn",
  "call_sms_details_vn",
  "local_phone_number_vn","local_phone_number_country",
  "call_vn",
  "apn",
  "synced_at",
].join(",")

// Chỉ đọc cột VN, bỏ _en và date fields
const ITEM_COLS = [
  "item_code","alias","sku_code","listing_code","tenant",
  "category_code","status","item_type",
  "item_name_vn",
  "day_amount","day_amount_unit",
  "data_amount","data_amount_unit",
  "throttle_speed_vn",
  "call_vn",
  "call_sms_details_vn",
  "sales_channel","unitprice","currency",
  "synced_at",
].join(",")

// Explicit columns cho products (bỏ data_plan_type, date_created, last_modified_date)
const PRODUCT_COLS = [
  "product_code","tenant","status","type_of_sim","product_type","operator_code",
  "vendor_code","purchase_type","source_type","sku_type","data_type","import_type",
  "supported_countries","network_type","onsite_carrier","local_phone_number",
  "hotspot","kyc_code","kyc_needed","top_up_options","base_sim_esim_sku_code",
  "daily_reset_time","activation_time","apn_original","apn","local_number_country",
  "kyc_links","activation","unsupported_apps","telco_perks","note","synced_at",
].join(",")

// Explicit columns cho skus (bỏ wr_group + dropped cost cols + date fields)
const SKU_COLS = [
  "sku_code","product_code","tenant","status","sim_esim","product_type",
  "throttle_speed","call","expirations","currency",
  "day_amount","day_amount_unit","data_amount","data_amount_unit",
  "frame","datapack","call_sms_details","vendor_sku","vendor_sku_sim",
  "latest_cogs","latest_cogs_currency","synced_at",
].join(",")

export async function getProductDetail(sku_code: string): Promise<any> {
  const { data: sku } = await supabaseAdmin
    .from("skus").select(SKU_COLS).eq("sku_code", sku_code).maybeSingle()
  if (!sku) return { error: `SKU "${sku_code}" không tồn tại trong database` }

  const skuAny = sku as any
  const [{ data: product }, { data: listings }, { data: items }] = await Promise.all([
    supabaseAdmin.from("products").select(PRODUCT_COLS).eq("product_code", skuAny.product_code).maybeSingle(),
    supabaseAdmin.from("listings")
      .select(LISTING_COLS)
      .eq("reference_product_code", skuAny.product_code)
      .eq("status", "Active")
      .limit(5),
    supabaseAdmin.from("items")
      .select(ITEM_COLS)
      .eq("sku_code", sku_code)
      .eq("status", "Active")
      .limit(10),
  ])

  return { sku, product: product ?? {}, listings: listings ?? [], items: items ?? [] }
}

// ─── Tool: get_product_by_code ───────────────────────────────────────────────

export async function getProductByCode(product_code: string): Promise<any> {
  const { data: product } = await supabaseAdmin
    .from("products").select(PRODUCT_COLS).eq("product_code", product_code).maybeSingle()
  if (!product) return { error: `Product code "${product_code}" không tồn tại trong database` }

  const [{ data: skus }, listings] = await Promise.all([
    supabaseAdmin.from("skus")
      .select("sku_code,status,sim_esim,data_amount,data_amount_unit,day_amount,expirations,throttle_speed,latest_cogs,latest_cogs_currency,vendor_sku,note,synced_at")
      .eq("product_code", product_code)
      .eq("status", "Active")
      .order("day_amount"),
    searchListings({ product_code }),
  ])

  return { product, skus: skus ?? [], listings }
}

// ─── Tool: get_items ──────────────────────────────────────────────────────────

export async function getItems(params: { sku_code?: string; listing_code?: string }): Promise<any[]> {
  let q = supabaseAdmin.from("items").select(ITEM_COLS).eq("status", "Active")
  if (params.sku_code)     q = q.eq("sku_code", params.sku_code)
  if (params.listing_code) q = q.eq("listing_code", params.listing_code)
  const { data } = await q.limit(20)
  return data ?? []
}

// ─── Tool: search_listings ────────────────────────────────────────────────────

export async function searchListings(params: { product_code?: string; name?: string; tenant?: string }): Promise<any[]> {
  let q = supabaseAdmin.from("listings").select(LISTING_COLS).eq("status", "Active")
  if (params.product_code) q = q.eq("reference_product_code", params.product_code)
  if (params.tenant)       q = q.eq("tenant", params.tenant)
  if (params.name) {
    q = q.or(`listing_name_vn.ilike.%${params.name}%,listing_name_en.ilike.%${params.name}%`)
  }
  const { data } = await q.limit(5)
  return data ?? []
}

// ─── Tool: decode_sku_code ────────────────────────────────────────────────────

export function decodeSkuCode(sku_code: string): Record<string, string> {
  if (!sku_code || sku_code.length !== 13)
    return { error: "SKU code phải đúng 13 ký tự" }

  const SOURCE: Record<string, string> = {
    "1":"VN StockDirect","2":"VN InternalGHI","3":"VN MonthlyInvoice",
    "4":"VN TelcoBalance","5":"VN Datapool","6":"VN Others",
    "A":"US StockDirect","B":"US Internal","C":"US MonthlyInvoice",
    "D":"US TelcoBalance","E":"US Datapool",
  }
  const TYPE: Record<string, string> = {
    "C":"eSIM Full","E":"SIM Full","A":"Datapack","B":"eSIM Profile","D":"SIM Frame",
    "F":"Phí Ship","G":"Quà tặng","H":"Khác","1":"eSIM Full VN","2":"SIM Full VN",
  }
  const POLICY: Record<string, string> = {
    "A":"Daily cap → Unlimited 5Mbps","B":"Daily cap → Unlimited 10Mbps",
    "C":"Unlimited 20Mbps","D":"Unlimited 100Mbps",
    "E":"Fixed cap → Unlimited 5Mbps","G":"Fixed cap → Unlimited 10Mbps",
    "H":"Unlimited 5Mbps","F":"Fixed throttle <2Mbps","P":"Daily throttle <2Mbps",
    "Y":"Fixed no-throttle","Z":"Daily no-throttle","K":"Không có data",
  }

  return {
    sku_code,
    "ký tự 1 — Source":       `${sku_code[0]} → ${SOURCE[sku_code[0]] ?? "Unknown"}`,
    "ký tự 2 — Product Type":  `${sku_code[1]} → ${TYPE[sku_code[1]] ?? "Unknown"}`,
    "ký tự 3-5 — Country Group": sku_code.slice(2, 5),
    "ký tự 6-7 — Vendor":      sku_code.slice(5, 7),
    "ký tự 8 — Data Policy":   `${sku_code[7]} → ${POLICY[sku_code[7]] ?? "Unknown"}`,
    "ký tự 9-11 — Data Amount": sku_code.slice(8, 11),
    "ký tự 12-13 — Day Amount": sku_code.slice(11, 13),
  }
}

// ─── Tool: get_country_info ───────────────────────────────────────────────────

export function getCountryInfo(country_name: string | undefined, ref: RefCache): any[] {
  if (!country_name) return ref.supportCountries
  const s = country_name.toLowerCase()
  return ref.supportCountries.filter((sc: any) =>
    ((sc.support_country ?? "") + " " + (sc.country_codes ?? "")).toLowerCase().includes(s)
  )
}

// ─── Tool: get_vendor_info ────────────────────────────────────────────────────

export function getVendorInfo(vendor_code: string | undefined, ref: RefCache): any[] {
  if (vendor_code) return ref.vendors.filter((v: any) => v.vendor_code === vendor_code)
  return ref.vendors
}

// ─── Tool: get_fx_rates ───────────────────────────────────────────────────────

export async function getFxRates(): Promise<any[]> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("key,value,label").like("key", "fx.%")
  return data ?? []
}

// ─── Tool: get_sku_cogs ───────────────────────────────────────────────────────

export async function getSkuCogs(sku_code: string): Promise<any> {
  const { data } = await supabaseAdmin
    .from("skus")
    .select("sku_code,status,latest_cogs,latest_cogs_currency,final_cogs_included_vat_vnd,final_cogs_usd")
    .eq("sku_code", sku_code)
    .maybeSingle()
  return data ?? { error: `Không tìm thấy SKU ${sku_code}` }
}

// ─── Tool: calculate_3hk_cogs ─────────────────────────────────────────────────

export async function calculate3hkCogs(params: {
  zone: string
  days: number
  data_type: "fixed" | "daily" | "unlim_10mbps" | "unlim_5mbps"
  data_gb?: number
}): Promise<any> {
  const [{ data: zone3hk }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("ncc_3hk").select("*").eq("zone", params.zone).maybeSingle(),
    supabaseAdmin.from("app_settings").select("key,value").then(r => r),
  ])
  if (!zone3hk) return { error: `Không tìm thấy zone ${params.zone}` }

  const s: Record<string, number> = {}
  for (const row of settings ?? []) s[row.key] = parseFloat(row.value)

  const hkdPerGb = zone3hk.price_per_gb_hkd
  const hkdToUsd = s["fx.hkd_usd"] ?? 0.12824
  const vndPerUsd = s["fx.usd_vnd"] ?? 26394

  let gbUsed = 0
  if (params.data_type === "fixed")
    gbUsed = (params.data_gb ?? 0) * (s["3hk.fixed_factor"] ?? 0.55)
  else if (params.data_type === "daily")
    gbUsed = (params.data_gb ?? 0) * params.days * (s["3hk.daily_factor"] ?? 0.40)
  else if (params.data_type === "unlim_10mbps")
    gbUsed = (s["3hk.unlim_10mbps_gb_day"] ?? 1.8) * params.days
  else
    gbUsed = (s["3hk.unlim_5mbps_gb_day"] ?? 1.6) * params.days

  const cogsHkd = gbUsed * hkdPerGb
  const cogsUsd = cogsHkd * hkdToUsd
  const cogsVnd = cogsUsd * vndPerUsd

  return {
    zone: params.zone, data_type: params.data_type, days: params.days,
    data_gb: params.data_gb, gb_assumed: +gbUsed.toFixed(2),
    price_per_gb_hkd: hkdPerGb,
    cogs_hkd: +cogsHkd.toFixed(2),
    cogs_usd: +cogsUsd.toFixed(4),
    cogs_vnd: Math.round(cogsVnd),
  }
}

// ─── Tool: search_ncc_wm ─────────────────────────────────────────────────────

export function searchNccWm(params: {
  country?: string
  days?: number
  sim_type?: string
  limit?: number
}, ref: RefCache): any[] {
  let scored: { p: any; score: number }[]

  if (params.country) {
    // Chấm điểm từng sản phẩm theo độ liên quan với nước (3=trực tiếp, 2=khu vực, 1=toàn cầu)
    scored = ref.nccWm
      .map((p: any) => ({ p, score: nccCountryScore(p.region, p.product_name, params.country!) }))
      .filter(x => x.score > 0)
  } else {
    scored = ref.nccWm.map((p: any) => ({ p, score: 0 }))
  }

  if (params.days)     scored = scored.filter(x => x.p.days === params.days)
  if (params.sim_type) {
    const s = params.sim_type.toLowerCase()
    scored = scored.filter(x => (x.p.sim_type ?? "").toLowerCase().includes(s))
  }

  // Sort: ưu tiên match trực tiếp (score cao) trước, rồi đã-tạo-GoHub, rồi ít ngày
  scored.sort((a, b) =>
    b.score - a.score ||
    (ref.nccWmInSystem.has(b.p.vendor_product_id) ? 1 : 0) - (ref.nccWmInSystem.has(a.p.vendor_product_id) ? 1 : 0) ||
    (a.p.days ?? 99) - (b.p.days ?? 99)
  )

  return scored.slice(0, params.limit ?? 40).map(x => ({
    ...x.p, in_system: ref.nccWmInSystem.has(x.p.vendor_product_id), _score: x.score,
  }))
}

// ─── Tool: search_ncc_3hk ─────────────────────────────────────────────────────

export function searchNcc3hk(country: string | undefined, ref: RefCache): any[] {
  if (!country) return ref.ncc3hk
  const s = country.toLowerCase()
  return ref.ncc3hk.filter((z: any) => (z.country ?? "").toLowerCase().includes(s))
}

// ─── Tool: find_gaps ─────────────────────────────────────────────────────────

export function findGaps(params: {
  country?: string
  vendor?: "wm" | "3hk" | "all"
}, ref: RefCache): any {
  const vendor = params.vendor ?? "all"
  const result: any = {}

  if (vendor === "wm" || vendor === "all") {
    const filtered = params.country
      ? ref.nccWm.filter((p: any) => nccCountryScore(p.region, p.product_name, params.country!) > 0)
      : ref.nccWm
    const notIn = filtered.filter((p: any) => !ref.nccWmInSystem.has(p.vendor_product_id))
    result.worldmove = {
      total: filtered.length,
      in_system: filtered.length - notIn.length,
      not_in_system_count: notIn.length,
      not_in_system_sample: notIn.slice(0, 15),
    }
  }
  if (vendor === "3hk" || vendor === "all") {
    result["3hk"] = {
      zones: params.country
        ? ref.ncc3hk.filter((z: any) => (z.country ?? "").toLowerCase().includes(params.country!.toLowerCase()))
        : ref.ncc3hk,
    }
  }
  return result
}

// ─── Tool: semantic_search ───────────────────────────────────────────────────
// Fallback khi 4-step Supabase search trả về 0 kết quả.
// Embed query → Neo4j vector index 'sku_embedding' → trả SKU codes.

export async function searchSkusSemantic(query: string, topK = 10): Promise<string[]> {
  try {
    const genAI    = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model    = genAI.getGenerativeModel({ model: "gemini-embedding-001" })
    const result   = await model.embedContent(query.slice(0, 500))
    const embedding = result.embedding.values

    const records = await runQuery<{ sku_code: string; score: number }>(
      `CALL db.index.vector.queryNodes('sku_embedding', $topK, $embedding)
       YIELD node AS sku, score
       WHERE score > 0.65
       RETURN sku.sku_code AS sku_code, score
       ORDER BY score DESC`,
      { topK, embedding }
    )
    return records.map(r => r.sku_code).filter(Boolean)
  } catch (err: any) {
    console.error("[searchSkusSemantic]", err?.message?.slice(0, 80))
    return []
  }
}

// ─── KB Search ───────────────────────────────────────────────────────────────

export async function searchKnowledgeBase(query: string, department?: string): Promise<string> {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/kb/search`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query, department: department || null, limit: 8 }),
    })
    if (!res.ok) return ""
    const data = await res.json()
    const results: any[] = data.results ?? []
    if (results.length === 0) return ""
    return results
      .map((r: any) => `[${r.document_name}]\n${r.content}`)
      .join("\n\n---\n\n")
  } catch {
    return ""
  }
}

// ─── Tool dispatcher ──────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, any>,
  ref: RefCache
): Promise<any> {
  switch (name) {
    case "search_skus":           return searchSkus(args as any, ref)
    case "get_product_by_code":   return getProductByCode(args.product_code)
    case "get_product_detail":    return getProductDetail(args.sku_code)
    case "decode_sku_code":       return decodeSkuCode(args.sku_code)
    case "get_country_info":      return getCountryInfo(args.country_name, ref)
    case "get_vendor_info":       return getVendorInfo(args.vendor_code, ref)
    case "get_fx_rates":          return getFxRates()
    case "get_sku_cogs":          return getSkuCogs(args.sku_code)
    case "calculate_3hk_cogs":    return calculate3hkCogs(args as any)
    case "search_ncc_wm":         return searchNccWm(args as any, ref)
    case "search_ncc_3hk":        return searchNcc3hk(args.country, ref)
    case "find_gaps":             return findGaps(args as any, ref)
    default:                      return { error: `Unknown tool: ${name}` }
  }
}
