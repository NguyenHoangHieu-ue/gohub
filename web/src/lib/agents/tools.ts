import { supabaseAdmin } from "@/lib/supabase"
import { runQuery }      from "@/lib/neo4j-client"
import { GoogleGenerativeAI } from "@google/generative-ai"
import type { RefCache } from "./cache"

const FULL_TYPES = new Set(["C", "E", "1", "2"])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCountryCodes(countryEn: string, ref: RefCache) {
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
      .select("sku_code,product_code,tenant,status,sim_esim,product_type,country_group,data_amount,data_amount_unit,is_unlimited,day_amount,throttle_speed,call,hotspot,kyc_needed,operator_code,network_type,vendor_sku,latest_cogs,latest_cogs_currency,note")
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

  return { skus: result.slice(0, 15), note }
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

const LISTING_COLS = [
  "listing_code","reference_product_code","tenant","status","listing_type",
  "listing_name_en","listing_name_vn",
  "type_of_sim","product_type","network_operator",
  "supported_countries",
  "data_type_en","data_type_vn",
  "category_code",
  "daily_reset_time_en","daily_reset_time_vn",
  "activation_time_en","activation_time_vn",
  "network_type",
  "hotspot_en","hotspot_vn",
  "kyc_needed_en","kyc_needed_vn",
  "kyc_links_en","kyc_links_vn",
  "expirations_en","expirations_vn",
  "top_up_options_en","top_up_options_vn",
  "activation_en","activation_vn",
  "activation_links_en","activation_links_vn",
  "special_activation_required_en","special_activation_required_vn",
  "unsupported_apps_en","unsupported_apps_vn",
  "telco_perks_en","telco_perks_vn",
  "note_en","note_vn",
  "call_sms_details_en","call_sms_details_vn",
  "local_phone_number_en","local_phone_number_vn","local_phone_number_country",
  "call_en","call_vn",
  "apn",
].join(",")

const ITEM_COLS = [
  "item_code","alias","sku_code","listing_code","tenant",
  "category_code","status","item_type",
  "item_name_en","item_name_vn",
  "day_amount","day_amount_unit",
  "data_amount","data_amount_unit",
  "throttle_speed_en","throttle_speed_vn",
  "call_en","call_vn",
  "call_sms_details_en","call_sms_details_vn",
  "sales_channel","unitprice","currency",
].join(",")

export async function getProductDetail(sku_code: string): Promise<any> {
  const { data: sku } = await supabaseAdmin
    .from("skus").select("*").eq("sku_code", sku_code).maybeSingle()
  if (!sku) return { error: `SKU "${sku_code}" không tồn tại trong database` }

  const [{ data: product }, { data: listings }, { data: items }] = await Promise.all([
    supabaseAdmin.from("products").select("*").eq("product_code", sku.product_code).maybeSingle(),
    supabaseAdmin.from("listings")
      .select(LISTING_COLS)
      .eq("reference_product_code", sku.product_code)
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
    .from("products").select("*").eq("product_code", product_code).maybeSingle()
  if (!product) return { error: `Product code "${product_code}" không tồn tại trong database` }

  const [{ data: skus }, listings] = await Promise.all([
    supabaseAdmin.from("skus")
      .select("sku_code,status,sim_esim,data_amount,data_amount_unit,day_amount,expirations,throttle_speed,latest_cogs,latest_cogs_currency,vendor_sku,note")
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
}, ref: RefCache): any[] {
  let r = ref.nccWm
  if (params.country) {
    const s = params.country.toLowerCase()
    // Phase 1: exact region match (ví dụ: "Japan", "Taiwan")
    let matched = r.filter((p: any) => (p.region ?? "").toLowerCase().includes(s))
    // Phase 2: nếu không có, tìm theo ISO code hoặc group code liên quan
    if (!matched.length) {
      const { isoUpper, all } = getCountryCodes(params.country, ref)
      if (all.length || isoUpper) {
        // Lấy tên các groups liên quan để match với WM region
        const groupNames = all
          .map(code => (ref.groupMap[code] ?? code).toLowerCase())
          .filter(Boolean)
        matched = r.filter((p: any) => {
          const region = (p.region ?? "").toLowerCase()
          return groupNames.some(g => region.includes(g) || g.includes(region))
        })
      }
    }
    r = matched
  }
  if (params.days) r = r.filter((p: any) => p.days === params.days)
  if (params.sim_type) {
    const s = params.sim_type.toLowerCase()
    r = r.filter((p: any) => (p.sim_type ?? "").toLowerCase().includes(s))
  }
  return r.slice(0, 20).map((p: any) => ({
    ...p, in_system: ref.nccWmInSystem.has(p.vendor_product_id),
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
      ? ref.nccWm.filter((p: any) => (p.region ?? "").toLowerCase().includes(params.country!.toLowerCase()))
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
