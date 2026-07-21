import { createHash } from "crypto"
import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { queryAnalytics } from "@/lib/analytics-db"
import { tursoQuery } from "@/lib/turso"

// ── Two-level query cache ──────────────────────────────────────────────────────
// L1: in-memory Map (cực nhanh, per serverless instance, mất khi cold start)
// L2: Supabase analytics_query_cache (shared, sống qua cold start, TTL 10 phút)
// → Dữ liệu luôn tươi (max TTL_L2 cũ), cold start không cần re-query gohub_dw.

const _cache = new Map<string, { data: unknown; exp: number }>()
const TTL_L1 = 5  * 60_000  // 5 phút in-memory
const TTL_L2 = 10            // 10 phút trong Supabase (minutes)

export async function cachedQuery<T>(
  key: string,
  fn:  () => Promise<T>,
  ttlMinutes = TTL_L2,
  bypass = false,   // true → bỏ qua ĐỌC cache (L1+L2), tính lại tươi; VẪN ghi cache mới (re-warm).
): Promise<T> {
  if (bypass) {
    const data = await fn()
    _cache.set(key, { data, exp: Date.now() + TTL_L1 })
    try {
      await supabaseAdmin
        .from("analytics_query_cache")
        .upsert({ cache_key: key, data: data as object, cached_at: new Date().toISOString() })
    } catch { /* Supabase lỗi → vẫn trả data */ }
    return data
  }

  // L1 hit
  const hit = _cache.get(key)
  if (hit && Date.now() < hit.exp) return hit.data as T

  // L2 hit (Supabase shared cache)
  try {
    const { data: row } = await supabaseAdmin
      .from("analytics_query_cache")
      .select("data, cached_at")
      .eq("cache_key", key)
      .maybeSingle()
    if (row?.cached_at) {
      const ageMs = Date.now() - new Date(row.cached_at).getTime()
      if (ageMs < ttlMinutes * 60_000) {
        const result = row.data as T
        _cache.set(key, { data: result, exp: Date.now() + TTL_L1 })
        return result
      }
    }
  } catch { /* Supabase unavailable → fall through to gohub_dw */ }

  // Cache miss: query gohub_dw
  const data = await fn()

  // Warm L1
  _cache.set(key, { data, exp: Date.now() + TTL_L1 })
  if (_cache.size > 200) {
    const now = Date.now()
    for (const [k, v] of _cache) { if (v.exp < now) _cache.delete(k) }
  }

  // Warm L2 — PHẢI await: supabase-js builder lazy, `void ...upsert()` KHÔNG gửi request (chỉ chạy khi
  // .then()/await) → trước đây L2 chưa từng persist, chỉ có L1 in-memory (mất khi cold start). Await ~100ms
  // trên nhánh cache-MISS (vốn đã chậm vì query) → đổi lại L2 dùng chung mọi instance + sống qua cold start.
  try {
    await supabaseAdmin
      .from("analytics_query_cache")
      .upsert({ cache_key: key, data: data as object, cached_at: new Date().toISOString() })
  } catch { /* Supabase lỗi → vẫn trả data, chỉ mất L2 */ }

  return data
}

// Xoá toàn bộ L2 cache (admin — gọi từ Settings)
export async function flushAnalyticsCache(): Promise<{ deleted: number }> {
  _cache.clear()
  const { count } = await supabaseAdmin
    .from("analytics_query_cache")
    .delete({ count: "exact" })
    .lt("cached_at", new Date(Date.now() + 1000).toISOString()) // xoá hết
  return { deleted: count ?? 0 }
}

export async function flushAnalyticsCacheByPrefixes(prefixes: string[]): Promise<{ deleted: number }> {
  const clean = prefixes.filter(Boolean)
  if (clean.length === 0) return { deleted: 0 }
  for (const key of Array.from(_cache.keys())) {
    if (clean.some(prefix => key.startsWith(prefix))) _cache.delete(key)
  }

  const all = await supabaseAdmin.from("analytics_query_cache").select("cache_key").limit(5000)
  const keys = (all.data ?? [])
    .map(r => r.cache_key as string)
    .filter(key => clean.some(prefix => key.startsWith(prefix)))
  if (keys.length === 0) return { deleted: 0 }

  const { count } = await supabaseAdmin
    .from("analytics_query_cache")
    .delete({ count: "exact" })
    .in("cache_key", keys)
  return { deleted: count ?? keys.length }
}

// ── Query-route cache + prewarm registry ───────────────────────────────────────
// /api/analytics/query (endpoint generic) gọi qua đây. Khác cachedQuery thường: data gohub_dw chỉ
// update 1 lần/ngày (pipeline ngoài) nên TTL dài (mặc định 12h) → load đầu ngày đập DB, cả ngày còn lại
// lấy cache. Đồng thời GHI LẠI SQL gốc (registry row "sqlreg:<hash>") để cron prewarm chạy lại được.
export const QUERY_TTL_MIN = 12 * 60  // TTL chung cho cache analytics (data gohub_dw đổi 1 lần/ngày)
const _registered = new Set<string>()  // tránh ghi registry trùng trong 1 instance

function queryHash(sql: string): string {
  return createHash("sha1").update(sql.trim()).digest("hex")
}

export async function cachedAnalyticsQuery<T = Record<string, unknown>>(
  sql: string,
  ttlMinutes = QUERY_TTL_MIN,
): Promise<T[]> {
  const h = queryHash(sql)
  // Ghi registry 1 lần/instance (fire-and-forget) → prewarm replay được
  if (!_registered.has(h)) {
    _registered.add(h)
    // .then() để KÍCH builder gửi request (void thuần KHÔNG gửi). Fire-and-forget: query nặng phía sau giữ
    // function sống đủ để upsert xong.
    void supabaseAdmin
      .from("analytics_query_cache")
      .upsert({ cache_key: `sqlreg:${h}`, data: { sql: sql.trim(), ts: Date.now() }, cached_at: new Date().toISOString() })
      .then(() => {}, () => {})
  }
  return cachedQuery<T[]>(`q:${h}`, () => queryAnalytics<T>(sql), ttlMinutes)
}

// Đọc registry rows theo prefix. KHÔNG dùng .like('...%') — toán tử này KHÔNG match trong runtime hiện tại
// (đã verify: select không filter trả đủ rows, .like trả 0). → đọc cache_key (nhẹ) rồi .in() (exact, hoạt động).
async function readCacheByPrefix(prefix: string): Promise<{ key: string; data: any }[]> {
  const all = await supabaseAdmin.from("analytics_query_cache").select("cache_key").limit(5000)
  const keys = (all.data ?? []).map(r => r.cache_key as string).filter(k => k.startsWith(prefix))
  if (keys.length === 0) return []
  const { data } = await supabaseAdmin.from("analytics_query_cache").select("cache_key, data").in("cache_key", keys)
  return (data ?? []).map(r => ({ key: r.cache_key as string, data: (r as any).data }))
}

// Chạy lại các query đã đăng ký (registry) để giữ cache nóng + làm tươi sau khi data ngày mới được nạp.
// Tuần tự, có giới hạn để không vượt maxDuration. Gọi từ cron /api/cron/prewarm-analytics.
export async function prewarmAnalyticsCache(limit = 40): Promise<{ prewarmed: number; failed: number }> {
  const regs = await readCacheByPrefix("sqlreg:")
  // Ưu tiên query dùng gần đây nhất
  const rows = regs
    .map(r => ({ key: r.key, sql: r.data?.sql as string, ts: r.data?.ts ?? 0 }))
    .filter(r => typeof r.sql === "string" && r.sql.length > 0)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)

  let prewarmed = 0, failed = 0
  for (const r of rows) {
    try {
      const data = await queryAnalytics(r.sql)
      const dataKey = r.key.replace("sqlreg:", "q:")
      _cache.set(dataKey, { data, exp: Date.now() + TTL_L1 })
      await supabaseAdmin
        .from("analytics_query_cache")
        .upsert({ cache_key: dataKey, data: data as object, cached_at: new Date().toISOString() })
      prewarmed++
    } catch { failed++ }
  }
  return { prewarmed, failed }
}

// ── Prewarm cho endpoint CHUYÊN DỤNG (bod/b2b/b2c/channels) ────────────────────
// Khác generic /api/analytics/query: các endpoint này có cache key bespoke theo params, không replay
// bằng SQL được. Cách làm: (1) mỗi request thật GHI LẠI URL (registry "urlreg:<hash>"); (2) cron prewarm
// xoá key dedicated rồi RE-FETCH chính URL đó (qua Bearer CRON_SECRET) → endpoint tính lại data tươi.
const _urlReg = new Set<string>()

export function isCronReq(req: NextRequest): boolean {
  if (!process.env.CRON_SECRET) return false
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
}

// FE thêm ?nocache=1 (sau khi lưu cost/target) → route bỏ qua đọc cache, tính lại tươi + re-warm.
// Dùng: cachedQuery(key, fn, ttl, noCache(req)).
export function noCache(req: NextRequest): boolean {
  return req.nextUrl.searchParams.get("nocache") === "1"
}

// Gọi đầu mỗi GET endpoint analytics cacheable. Cho cron (Bearer) bypass session + ghi URL để prewarm.
// Trả 401 Response nếu không có session và không phải cron; ngược lại trả null (cho chạy tiếp).
export function analyticsGuard(req: NextRequest, session: unknown): NextResponse | null {
  const cron = isCronReq(req)
  if (!cron) {
    const url = req.nextUrl.pathname + req.nextUrl.search
    const h = createHash("sha1").update(url).digest("hex")
    if (!_urlReg.has(h)) {
      _urlReg.add(h)
      // .then() để KÍCH builder gửi request (void thuần KHÔNG gửi). Đăng ký chạy ở đầu handler, query
      // nặng phía sau giữ function sống đủ để upsert xong.
      void supabaseAdmin
        .from("analytics_query_cache")
        .upsert({ cache_key: `urlreg:${h}`, data: { url, ts: Date.now() }, cached_at: new Date().toISOString() })
        .then(() => {}, () => {})
    }
  }
  if (!session && !cron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return null
}

// Cron prewarm cho endpoint chuyên dụng: xoá key dedicated (force tươi) rồi re-fetch URL đã đăng ký.
export async function prewarmAnalyticsUrls(baseUrl: string, limit = 50): Promise<{ prewarmed: number; failed: number }> {
  const regs = await readCacheByPrefix("urlreg:")
  const urls = regs
    .map(r => ({ url: r.data?.url as string, ts: r.data?.ts ?? 0 }))
    .filter(r => typeof r.url === "string" && r.url.startsWith("/api/analytics/"))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)

  // Xoá key dedicated (bod-/b2b-/b2c-/ch-) ở L2+L1 → lần fetch sau = cache-miss → data mới.
  const all = await supabaseAdmin.from("analytics_query_cache").select("cache_key").limit(5000)
  const delKeys = (all.data ?? []).map(r => r.cache_key as string).filter(k => /^(bod-|b2b-|b2c-|ch-)/.test(k))
  if (delKeys.length > 0) {
    await supabaseAdmin.from("analytics_query_cache").delete().in("cache_key", delKeys)
    for (const k of delKeys) _cache.delete(k)
  }

  const auth = `Bearer ${process.env.CRON_SECRET ?? ""}`
  let prewarmed = 0, failed = 0
  for (const u of urls) {
    try {
      const res = await fetch(`${baseUrl}${u.url}`, { headers: { authorization: auth }, cache: "no-store" })
      res.ok ? prewarmed++ : failed++
    } catch { failed++ }
  }
  return { prewarmed, failed }
}

// Cache-Control header value for API responses (browser + CDN cache 5 min)
export const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
} as const

// ── Input sanitization (chống SQL injection cho filter nội suy chuỗi) ─────────
// Date phải đúng YYYY-MM-DD; companyCode chỉ chữ/số/_/- . Sai → bỏ qua (an toàn).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function safeDate(s: string | null | undefined): string | null {
  return s && DATE_RE.test(s) ? s : null
}

export function safeCompanyCode(s: string | null | undefined): string {
  return s && /^[A-Za-z0-9_-]+$/.test(s) ? s : "ALL"
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function getDateFilter(
  startDate: string | null,
  endDate:   string | null,
  dateColumn = "fulfiled_date",
  defaultInterval = "30 days",
  companyCode?: string
): string {
  const sd = safeDate(startDate)
  const ed = safeDate(endDate)
  let filter = sd && ed
    ? `f.${dateColumn}::date BETWEEN '${sd}' AND '${ed}'`
    : `f.${dateColumn}::date >= NOW()::date - INTERVAL '${defaultInterval}'`
  const cc = safeCompanyCode(companyCode)
  if (cc !== "ALL") {
    filter += ` AND f.company_code = '${cc}'`
  }
  return filter
}

export function getPrevDateFilter(
  startDate:      string | null,
  endDate:        string | null,
  comparisonType  = "none",
  dateColumn      = "fulfiled_date",
  defaultInterval = "30 days",
  companyCode?:   string
): string {
  let filter = ""
  const sd = safeDate(startDate)
  const ed = safeDate(endDate)
  if (sd && ed) {
    if (comparisonType === "previous_year") {
      const s = new Date(sd); s.setFullYear(s.getFullYear() - 1)
      const e = new Date(ed); e.setFullYear(e.getFullYear() - 1)
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
      filter = `f.${dateColumn}::date BETWEEN '${fmt(s)}' AND '${fmt(e)}'`
    } else {
      filter = `f.${dateColumn}::date >= '${sd}'::date - (('${ed}'::date - '${sd}'::date) + 1) AND f.${dateColumn}::date < '${sd}'::date`
    }
  } else {
    const days = parseInt(defaultInterval)
    filter = `f.${dateColumn}::date >= NOW()::date - INTERVAL '${days * 2} days' AND f.${dateColumn}::date < NOW()::date - INTERVAL '${days} days'`
  }
  const cc = safeCompanyCode(companyCode)
  if (cc !== "ALL") {
    filter += ` AND f.company_code = '${cc}'`
  }
  return filter
}

export function getAnalyticsSource(dateColumn: string) {
  const isSales = dateColumn === "created_date"
  return {
    mainTable:   isSales ? "fact_sales_revenue"        : "fact_fulfillment_revenue",
    revenueCol:  isSales ? "sales_revenue_amount_vnd"  : "fulfilled_revenue_amount_vnd",
    quantityCol: isSales ? "quantity"                  : "fulfilled_quantity",
    dateCol:     isSales ? "created_date"              : "fulfiled_date",
    marginCol:   isSales ? "0"                         : "gross_profit_vnd",
    cogsCol:     isSales ? "0"                         : "cogs_amount_vnd",
  }
}

// ── Partner tiers (from Supabase app_settings) ────────────────────────────────

export async function getPartnerTiers(): Promise<Record<string, string[]>> {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "partner_tiers")
      .single()
    if (data?.value) return JSON.parse(data.value)
  } catch {}
  return { Strategic: [] }
}

export async function getStrategicPartnersList(): Promise<string> {
  const tiers = await getPartnerTiers()
  // Dùng TẤT CẢ partners từ mọi tier (nhất quán với Dashboard và b2b/strategic-performance)
  const all: string[] = Object.values(tiers).flat() as string[]
  return all.length > 0
    ? all.map((c: string) => `'%${c.replace(/'/g, "''").trim()}%'`).join(",")
    : "''"
}

// ── SQL group case ────────────────────────────────────────────────────────────

export function getGroupCaseSQL(strategicList: string): string {
  return `CASE
    WHEN UPPER(s.group_name) = 'B2B' AND s.channel_name ILIKE ANY(ARRAY[${strategicList}]::text[]) THEN 'B2B-Strategic'
    WHEN UPPER(s.group_name) = 'B2B' THEN 'B2B-Non-Strategic'
    WHEN UPPER(s.group_name) = 'B2C' THEN 'B2C'
    ELSE 'Other'
  END`
}

// Bộ lọc thực thể cho BOD (port từ gohub-intel getBODFilters): vendors / subChannels / channelGroups /
// productTypes. Trả chuỗi AND clauses (rỗng nếu không filter → giữ nguyên hành vi cũ). Dùng alias f cho
// fact table. Append sau date filter trong WHERE. SELECT-only (chạy qua queryAnalytics).
export function getBODFilters(searchParams: URLSearchParams): string {
  const esc = (v: string) => v.replace(/'/g, "''")
  let filter = ""

  const vendors = searchParams.get("vendors")
  if (vendors) {
    const list = vendors.split(",").filter(Boolean).map(v => `'${esc(v)}'`).join(",")
    if (list) filter += ` AND TRIM(f.sku) IN (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE TRIM(vendor) IN (${list}))`
  }

  const subChannels = searchParams.get("subChannels")
  if (subChannels) {
    const list = subChannels.split(",").filter(Boolean).map(s => `'${esc(s)}'`).join(",")
    if (list) filter += ` AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE TRIM(sapo_name) IN (${list}))`
  }

  const channelGroups = searchParams.get("channelGroups")
  if (channelGroups) {
    const conditions = channelGroups.split(",").filter(Boolean).map(g => {
      const dbGroup = (g === "Wholesales" || g === "WS" || g === "OD" || g === "On-Demand") ? "B2B" : g
      return `f.order_source_code IN (SELECT code FROM dim_order_source WHERE UPPER(TRIM(group_name)) = '${esc(dbGroup.toUpperCase())}')`
    })
    if (conditions.length > 0) filter += ` AND (${conditions.join(" OR ")})`
  }

  const productTypes = searchParams.get("productTypes")
  if (productTypes) {
    const list = productTypes.split(",").filter(Boolean).map(p => `'${esc(p)}'`).join(",")
    if (list) filter += ` AND TRIM(f.sku) IN (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE TRIM(category_name) IN (${list}))`
  }

  return filter
}

// ── SKU destination (for region chart) ───────────────────────────────────────

type DestRule = { prefix: string; codeLength: number; offset: number }

export async function getSkuDestinationRule(): Promise<DestRule> {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "sku_destination_rule")
      .single()
    if (data?.value) return JSON.parse(data.value)
  } catch {}
  return { prefix: "E", codeLength: 3, offset: 3 }
}

// The destination country code is embedded in the SKU but at different positions
// per SKU family (verified against real fact_fulfillment_revenue data):
//   digit-prefix (old catalog)  2CTHACBF05010   → country = chars 3-5 (THA)
//   E-prefix (eSIM/SIM)         EJPNBCPY500M30D → country = chars 2-4 (JPN)
//   3-letter legacy (e.g. 3HK)  CHN3D07GBFY05D  → country = chars 1-3 (CHN)
// Resulting codes are mapped to country names via getCountryMappings (Turso country_codes).
export function getDestinationSQL(_rule?: DestRule): string {
  return `CASE
    WHEN f.sku ~ '^[1-6]'            THEN UPPER(SUBSTRING(f.sku, 3, 3))
    WHEN f.sku ~ '^E'               THEN UPPER(SUBSTRING(f.sku, 2, 3))
    WHEN f.sku ~ '^[A-DF-Z]{3}[0-9]' THEN UPPER(SUBSTRING(f.sku, 1, 3))
    ELSE UPPER(SUBSTRING(f.sku, 1, 3))
  END`
}

// ── Country code → name mapping (from Turso country_codes, 332 rows, accurate) ──
// NOTE: dim_location is NOT a destination dimension — it stores branch/pickup
// locations ("Tân Sơn Nhất - HCM", "ESIM Only"...), so destination codes parsed
// from the SKU (getDestinationSQL) are mapped via the country_codes catalog.
export async function getCountryMappings(): Promise<Record<string, string>> {
  try {
    const rows = await tursoQuery<{ code: string; country: string }>(
      "SELECT code, country FROM country_codes"
    )
    const map: Record<string, string> = {}
    rows.forEach(r => { if (r.code) map[String(r.code).toUpperCase()] = String(r.country) })
    return map
  } catch {
    return {}
  }
}

// ── Day-range helpers (for target/cost pro-rata) ──────────────────────────────

export function getDaysInMonth(monthStr: string): number {
  const [year, month] = monthStr.split("-").map(Number)
  return new Date(year, month, 0).getDate()
}

export function getDaysInRange(startDate: string, endDate: string, monthStr: string): number {
  const [y, m] = monthStr.split("-").map(Number)
  const monthStart = new Date(y, m - 1, 1)
  const monthEnd   = new Date(y, m, 0)
  const start      = new Date(startDate)
  const end        = new Date(endDate)
  const rangeStart = start > monthStart ? start : monthStart
  const rangeEnd   = end   < monthEnd   ? end   : monthEnd
  if (rangeEnd < rangeStart) return 0
  return Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1
}

// ── Channel costs (from Supabase, replaces Turso channel_costs) ───────────────

export function getMonthsInRange(startDate: string, endDate: string): string[] {
  const start  = new Date(startDate)
  const end    = new Date(endDate)
  const months: string[] = []
  let curr = new Date(start.getFullYear(), start.getMonth(), 1)
  while (curr <= end) {
    months.push(`${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, "0")}`)
    curr.setMonth(curr.getMonth() + 1)
  }
  return months
}

export type CostValue = { type: "amount" | "percent"; value: number }
export type ChannelCostRow = {
  channel: string; month: string
  ads: CostValue; platformFee: CostValue; sponsorProducts: CostValue; media: CostValue
}

function parseCostJSON(v: unknown): CostValue {
  if (!v) return { type: "amount", value: 0 }
  if (typeof v === "object") return v as CostValue
  try { return JSON.parse(v as string) } catch { return { type: "amount", value: 0 } }
}

export async function getChannelCostsForMonths(months: string[]): Promise<ChannelCostRow[]> {
  if (!months.length) return []
  try {
    const { data } = await supabaseAdmin
      .from("analytics_channel_costs")
      .select("channel, month, ads, platform_fee, sponsor_products, media")
      .in("month", months)
    return (data || []).map(r => ({
      channel:         r.channel,
      month:           r.month,
      ads:             parseCostJSON(r.ads),
      platformFee:     parseCostJSON(r.platform_fee),
      sponsorProducts: parseCostJSON(r.sponsor_products),
      media:           parseCostJSON(r.media),
    }))
  } catch { return [] }
}

export async function getCostSettingsForMonths(months: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!months.length) return map
  try {
    const { data } = await supabaseAdmin
      .from("analytics_cost_input_settings")
      .select("channel, month, mode")
      .in("month", months)
    ;(data || []).forEach(r => map.set(`${r.channel}_${r.month}`, r.mode))
  } catch {}
  return map
}

export async function getGroupCostsForMonths(months: string[]): Promise<Array<Record<string, unknown>>> {
  if (!months.length) return []
  try {
    const { data } = await supabaseAdmin
      .from("analytics_channel_group_costs")
      .select("*")
      .in("month", months)
    return data || []
  } catch { return [] }
}

// ── Target planning (from Supabase) ───────────────────────────────────────────

export async function getTargetSummary(startDate: string, endDate: string) {
  const start = new Date(startDate)
  const end   = new Date(endDate)
  const months: { month: string; factor: number }[] = []
  let curr = new Date(start.getFullYear(), start.getMonth(), 1)
  while (curr <= end) {
    const monthStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, "0")}`
    const daysInMonth = getDaysInMonth(monthStr)
    const days = getDaysInRange(startDate, endDate, monthStr)
    months.push({ month: monthStr, factor: daysInMonth > 0 ? days / daysInMonth : 0 })
    curr.setMonth(curr.getMonth() + 1)
  }

  let totalTarget = 0
  let proRataTarget = 0

  try {
    const monthStrings = months.map(m => m.month)
    const { data } = await supabaseAdmin
      .from("analytics_target_planning")
      .select("month, target_revenue, channel")
      .in("month", monthStrings)
    if (data) {
      months.forEach(({ month, factor }) => {
        const rows = data.filter(r => r.month === month)
        const sum = rows.reduce((s, r) => s + Number(r.target_revenue || 0), 0)
        totalTarget   += sum
        proRataTarget += sum * factor
      })
    }
  } catch {}

  const actualRows = await queryAnalytics<{ total_actual: string }>(
    `SELECT SUM(fulfilled_revenue_amount_vnd) as total_actual
     FROM fact_fulfillment_revenue f
     WHERE f.fulfiled_date::date BETWEEN $1 AND $2`,
    [startDate, endDate]
  )
  const totalActual = parseFloat(actualRows[0]?.total_actual || "0")

  return {
    totalTarget,
    proRataTarget,
    totalActual,
    progress:      totalTarget    > 0 ? (totalActual / totalTarget)    * 100 : 0,
    proRataProgress: proRataTarget > 0 ? (totalActual / proRataTarget) * 100 : 0,
  }
}
