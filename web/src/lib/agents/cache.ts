import { supabaseAdmin } from "@/lib/supabase"

const TTL = 30 * 60 * 1000

export interface RefCache {
  supportCountries: any[]
  countries:        any[]
  vendors:          any[]
  nccWm:            any[]
  nccWmInSystem:    Set<string>
  ncc3hk:           any[]
  groupMap:         Record<string, string>  // group code → support_country name
}

let _cache: { data: RefCache; at: number } | null = null

export async function getRefCache(): Promise<RefCache> {
  const now = Date.now()
  if (_cache && now - _cache.at < TTL) return _cache.data

  const [sc, ct, vd, wm, wmSkus, hk] = await Promise.all([
    supabaseAdmin.from("ref_support_countries")
      .select("code,support_country,country_codes").order("code")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ref_countries")
      .select("code,name").order("name")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ref_vendors")
      .select("vendor_code,name")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ncc_worldmove")
      .select("vendor_product_id,product_name,region,sim_type,days,data_gb,is_daily,is_unlimited,throttle_kbps,cogs,cogs_currency,is_kyc")
      .eq("status", "active")
      .then(r => r.data ?? []),
    supabaseAdmin.from("skus")
      .select("vendor_sku").ilike("vendor_sku", "WM-%")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ncc_3hk")
      .select("zone,country,network,price_per_gb_hkd,is_kyc").order("zone")
      .then(r => r.data ?? []),
  ])

  const groupMap: Record<string, string> = {}
  for (const s of sc as any[]) groupMap[s.code] = s.support_country ?? s.code

  const data: RefCache = {
    supportCountries: sc as any[],
    countries:        ct as any[],
    vendors:          vd as any[],
    nccWm:            wm as any[],
    nccWmInSystem:    new Set((wmSkus as any[]).map((s: any) => s.vendor_sku as string)),
    ncc3hk:           hk as any[],
    groupMap,
  }
  _cache = { data, at: now }
  return data
}
