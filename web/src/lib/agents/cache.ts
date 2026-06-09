import { supabaseAdmin } from "@/lib/supabase"

const TTL = 30 * 60 * 1000

export interface RefCache {
  supportCountries: any[]
  countries:        any[]
  vendors:          any[]
  nccWm:            any[]
  nccWmInSystem:    Set<string>
  ncc3hk:           any[]
  groupMap:         Record<string, string>
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

  // Fetch các bảng nhỏ song song
  const [sc, ct, vd, hk] = await Promise.all([
    supabaseAdmin.from("ref_support_countries")
      .select("code,support_country,country_codes").order("code")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ref_countries")
      .select("code,name").order("name")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ref_vendors")
      .select("vendor_code,name")
      .then(r => r.data ?? []),
    supabaseAdmin.from("ncc_3hk")
      .select("zone,country,network,price_per_gb_hkd,is_kyc").order("zone")
      .then(r => r.data ?? []),
  ])

  // ncc_worldmove: 8921 rows — parallel fetch thay vì sequential để tránh timeout
  // 12 requests đồng thời (~200ms) vs 9 requests nối tiếp (~2000ms)
  const WM_SELECT = "vendor_product_id,product_name,region,sim_type,days,data_gb,is_daily,is_unlimited,throttle_kbps,cogs,cogs_currency,is_kyc,is_lesim,apn,network_type,onsite_carrier,providers,coverage,data_reset,notification,prepaid_card,exist"
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
  }
  _cache = { data, at: now }
  return data
}
