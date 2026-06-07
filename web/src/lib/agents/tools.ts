import { supabaseAdmin } from "@/lib/supabase"
import type { RefCache } from "./cache"

const FULL_TYPES = new Set(["C", "E", "1", "2"])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCountryCodes(countryEn: string, ref: RefCache) {
  const s = countryEn.toLowerCase()
  const single: string[] = [], all: string[] = []
  for (const sc of ref.supportCountries) {
    const hay = ((sc.support_country ?? "") + " " + (sc.country_codes ?? "")).toLowerCase()
    if (!hay.includes(s)) continue
    all.push(sc.code)
    if (!sc.support_country?.includes(",")) single.push(sc.code)
  }
  return { single, all }
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
  const { single, all } = getCountryCodes(params.country, ref)
  if (!all.length) return { skus: [], note: `Không tìm thấy mã nhóm nào cho "${params.country}"` }

  const queryByCodes = async (codes: string[]) => {
    const { data, error } = await supabaseAdmin
      .from("sku_catalog")
      .select("sku_code,product_code,tenant,status,sim_esim,product_type,country_group,data_amount,data_amount_unit,is_unlimited,day_amount,throttle_speed,call,hotspot,kyc_needed,operator_code,network_type,vendor_sku,latest_cogs,latest_cogs_currency,note")
      .eq("status", "Active")
      .in("country_group", codes)
    if (error) console.error("[searchSkus]", error.message)
    return data ?? []
  }

  // Phase 1: mã đơn nước, Phase 2: nhóm nước nếu rỗng
  let rows = single.length ? await queryByCodes(single) : []
  let note = ""
  if (!rows.length) {
    rows = await queryByCodes(all)
    if (rows.length) note = `Mở rộng sang nhóm nước chứa ${params.country}`
  }
  if (!rows.length) return { skus: [], note: `GoHub không có sản phẩm cho ${params.country}` }

  // Sort VN trước US, lọc thêm theo các tiêu chí tuỳ chọn
  let result = [...rows].sort((a: any, b: any) => (a.tenant === "VN" ? -1 : b.tenant === "VN" ? 1 : 0))

  if (params.vendor) {
    const v = result.filter((s: any) => (s.sku_code as string).slice(5, 7) === params.vendor)
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
    const v = result.filter((s: any) => s.is_unlimited)
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

// ─── Tool: get_product_detail ─────────────────────────────────────────────────

export async function getProductDetail(sku_code: string): Promise<any> {
  const { data: sku } = await supabaseAdmin
    .from("skus").select("*").eq("sku_code", sku_code).maybeSingle()
  if (!sku) return { error: `SKU "${sku_code}" không tồn tại trong database` }

  const [{ data: product }, { data: listings }] = await Promise.all([
    supabaseAdmin.from("products").select("*").eq("product_code", sku.product_code).maybeSingle(),
    supabaseAdmin.from("listings")
      .select("listing_name_vn,listing_name_en,activation_vn,activation_en,kyc_needed_vn,kyc_links_vn,expirations_vn,apn,network_type,hotspot_vn,call_vn")
      .eq("reference_product_code", sku.product_code)
      .eq("status", "Active")
      .limit(3),
  ])

  return { sku, product: product ?? {}, listings: listings ?? [] }
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
    r = r.filter((p: any) => (p.region ?? "").toLowerCase().includes(s))
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

// ─── Tool dispatcher ──────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, any>,
  ref: RefCache
): Promise<any> {
  switch (name) {
    case "search_skus":           return searchSkus(args as any, ref)
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
