import { supabaseAdmin } from "@/lib/supabase"

const TTL = 30 * 60 * 1000

export interface RefCache {
  supportCountries: any[]
  countries:        any[]   // includes continent + sub_region when populated
  vendors:          any[]
  nccWm:            any[]
  nccWmInSystem:    Set<string>
  ncc3hk:           any[]
  groupMap:         Record<string, string>
  // Derived geo maps (computed from countries after cache load)
  continentMap:     Record<string, string>   // ISO code → continent
  subRegionMap:     Record<string, string>   // ISO code → sub_region
  categoriesMap:    Record<string, any>      // category_code → ref_categories row
}

let _cache: { data: RefCache; at: number } | null = null

// Fetch tất cả rows vượt Supabase 1000-row cap
async function fetchAllRows(table: string, select: string, filter?: { col: string; val: string }): Promise<any[]> {
  const all: any[] = []
  for (let off = 0; ; off += 1000) {
    let q = (supabaseAdmin.from(table) as any).select(select).range(off, off + 999)
    if (filter) q = q.eq(filter.col, filter.val)
    const { data } = await q
    if (!data?.length) break
    all.push(...data)
    if (data.length < 1000) break
  }
  return all
}

export async function getRefCache(): Promise<RefCache> {
  const now = Date.now()
  if (_cache && now - _cache.at < TTL) return _cache.data

  // Fetch các bảng nhỏ song song — countries thêm continent + sub_region
  const [sc, ct, vd, hk, cats] = await Promise.all([
    supabaseAdmin.from("ref_support_countries")
      .select("code,support_country,support_country_vn,country_codes").order("code")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ref_countries")
      .select("code,name,name_vn,continent,sub_region").order("name")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ref_vendors")
      .select("vendor_code,name,description")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ncc_3hk")
      .select("zone,country,network,price_per_gb_hkd,is_kyc").order("zone")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ref_categories")
      .select("category_code,name_en,name_vn,iso_code,region_type")
      .then(r => r.data ?? [], () => [] as any[]),  // graceful: table may not exist yet
  ])

  // ncc_worldmove: 8921 rows — parallel fetch thay vì sequential để tránh timeout
  // 12 requests đồng thời (~200ms) vs 9 requests nối tiếp (~2000ms)
  const WM_SELECT = "vendor_product_id,product_name,region,sim_type,days,data_gb,is_daily,is_unlimited,throttle_kbps,cogs,cogs_currency,is_kyc,is_lesim,apn,apn_summary,network_type,onsite_carrier,providers,coverage,data_reset,notification,prepaid_card,exist"
  const wmBatches = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      (supabaseAdmin.from("ncc_worldmove") as any)
        .select(WM_SELECT)
        .eq("status", "active")
        .range(i * 1000, i * 1000 + 999)
        .then((r: any) => (r.data ?? []) as any[])
    )
  )
  const wm = wmBatches.flat().filter((r: any) => r.vendor_product_id)

  const groupMap: Record<string, string> = {}
  for (const s of sc as any[]) groupMap[s.code] = s.support_country ?? s.code

  // Derived geo maps — built from ref_countries data (empty if continent not yet populated)
  const continentMap: Record<string, string> = {}
  const subRegionMap: Record<string, string> = {}
  for (const c of ct as any[]) {
    if (c.continent)  continentMap[c.code]  = c.continent
    if (c.sub_region) subRegionMap[c.code]  = c.sub_region
  }

  // ref_categories map
  const categoriesMap: Record<string, any> = {}
  for (const cat of cats as any[]) categoriesMap[cat.category_code] = cat

  // Dùng cột exist thay vì query skus riêng (exist được sync.py cập nhật mỗi ngày)
  const nccWmInSystem = new Set(
    (wm as any[])
      .filter((r: any) => r.exist === "Yes")
      .map((r: any) => r.vendor_product_id as string)
  )

  const data: RefCache = {
    supportCountries: sc as any[],
    countries:        ct as any[],
    vendors:          vd as any[],
    nccWm:            wm as any[],
    nccWmInSystem,
    ncc3hk:           hk as any[],
    groupMap,
    continentMap,
    subRegionMap,
    categoriesMap,
  }
  _cache = { data, at: now }
  return data
}
