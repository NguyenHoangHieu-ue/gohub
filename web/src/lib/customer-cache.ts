// Supabase mirror của dim_customer — mọi thay đổi schema gohub_dw không ảnh hưởng đến web.
// Dùng raw_data JSONB để future-proof: ngay cả khi gohub_dw thêm/đổi cột, raw_data vẫn có.

import { supabaseAdmin } from "@/lib/supabase"

export interface CustomerEntry {
  code: string
  name: string
  price_list_name: string | null
  currency_code: string | null
  status: string | null
  raw_data: Record<string, any> | null
}

// ── In-process L1 cache ────────────────────────────────────────────────────────
const _cache = new Map<string, CustomerEntry>()
let _allLoaded = false
let _loadedAt = 0
const TTL_MS = 30 * 60_000  // 30 phút

async function ensureLoaded() {
  if (_allLoaded && Date.now() - _loadedAt < TTL_MS) return
  // Tải toàn bộ cache vào bộ nhớ (dim_customer thường < 10k rows)
  const { data } = await supabaseAdmin
    .from("dim_customer_cache")
    .select("code, name, price_list_name, currency_code, status, raw_data")
    .limit(20000)
  if (data && data.length > 0) {
    _cache.clear()
    data.forEach((r: any) => _cache.set(r.code, r as CustomerEntry))
    _allLoaded = true
    _loadedAt = Date.now()
  }
}

/** Lookup nhiều customer cùng lúc — dùng sau khi query customer_codes từ gohub_dw. */
export async function lookupCustomers(codes: string[]): Promise<Map<string, CustomerEntry>> {
  if (codes.length === 0) return new Map()
  try {
    await ensureLoaded()
    const result = new Map<string, CustomerEntry>()
    codes.forEach(code => {
      const entry = _cache.get(code)
      if (entry) result.set(code, entry)
    })
    // Nếu không tìm thấy gì, thử query trực tiếp Supabase (cache mới chưa load)
    if (result.size === 0 && codes.length > 0) {
      const { data } = await supabaseAdmin
        .from("dim_customer_cache")
        .select("code, name, price_list_name, currency_code, status, raw_data")
        .in("code", codes.slice(0, 1000))
      ;(data || []).forEach((r: any) => {
        _cache.set(r.code, r)
        result.set(r.code, r)
      })
    }
    return result
  } catch {
    return new Map()
  }
}

/** Search tên khách hàng từ cache (cho dropdown). */
export async function searchCustomerNames(q: string): Promise<string[]> {
  try {
    await ensureLoaded()
    if (_cache.size === 0) {
      // fallback: query Supabase trực tiếp
      let qb = supabaseAdmin
        .from("dim_customer_cache")
        .select("name")
        .not("name", "is", null)
      if (q) qb = (qb as any).ilike("name", `%${q}%`)
      const { data } = await (qb as any).limit(100)
      return Array.from(new Set((data || []).map((r: any) => String(r.name) as string))).sort() as string[]
    }
    const needle = q.toLowerCase()
    const names: string[] = []
    _cache.forEach(entry => {
      if (!entry.name) return
      if (!q || entry.name.toLowerCase().includes(needle)) names.push(entry.name)
    })
    return Array.from(new Set(names)).sort().slice(0, q ? 100 : 50)
  } catch {
    return []
  }
}

/** Đọc full cache (cho quarterly-b2b-customers route). */
export async function getAllCustomers(): Promise<Map<string, CustomerEntry>> {
  try {
    await ensureLoaded()
    return new Map(_cache)
  } catch {
    return new Map()
  }
}

/** Số dòng trong Supabase cache. */
export async function getCacheStats(): Promise<{ count: number; syncedAt: string | null }> {
  try {
    const [countRes, latestRes] = await Promise.all([
      supabaseAdmin.from("dim_customer_cache").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("dim_customer_cache").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
    ])
    return { count: countRes.count ?? 0, syncedAt: latestRes.data?.synced_at ?? null }
  } catch {
    return { count: 0, syncedAt: null }
  }
}

/** Invalidate L1 cache — gọi sau khi sync. */
export function invalidateCustomerCache() {
  _cache.clear()
  _allLoaded = false
  _loadedAt = 0
}
