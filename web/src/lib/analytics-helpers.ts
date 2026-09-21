import { createHash } from "crypto"
import { getCache, waitUntil } from "@vercel/functions"
import { NextResponse, type NextRequest } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { memo } from "@/lib/memo"
import { queryAnalytics } from "@/lib/analytics-db"
import { tursoQuery } from "@/lib/turso"
import { fetchQuarterlySettings, exclHash } from "@/lib/quarterly-settings"
import { getDaysInMonth, getDaysInRange } from "@/lib/analytics-engine/date-math"

export function isLocalPreviewReq(req: NextRequest): boolean {
  const host = req.nextUrl.hostname
  return process.env.NODE_ENV === "development" && req.nextUrl.searchParams.get("localPreview") === "1" && (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1"
  )
}

// ── Query cache: L1 in-memory + L2 Vercel Runtime Cache, stale-while-revalidate ─────────────────────────
// s203 (audit tốc độ): đo thật từ vùng chạy function (iad1) — Supabase mỗi lần đọc/ghi 280-450ms (bảng cache
// tới 1,3s vì payload JSON lớn), trong khi gohub_dw chỉ ~30ms/query. Cache cũ dùng chính Supabase làm L2 nên
// MỖI request (kể cả cache-hit) tốn ≥1 hop chậm, cache-miss thêm 1 hop ghi chặn response → route B2B 5-22s.
//   L1  = Map trong instance (mất khi cold start), TTL ngắn L1_TTL_MS.
//   L2  = Vercel Runtime Cache (`@vercel/functions` getCache) — dùng chung mọi instance trong vùng, sống qua
//         cold start/deploy, vài ms/lần. Bảng Supabase `analytics_query_cache` CHỈ còn giữ registry prewarm
//         (`sqlreg:`/`urlreg:`), không còn chứa dữ liệu cache.
//   SWR = hết TTL (hoặc ETL vừa nạp data mới → `softExpireAll`) thì TRẢ NGAY bản cũ (≤ MAX_STALE_MS) và tính lại
//         ở nền qua waitUntil → người dùng không phải chờ cold-query. Bản cũ quá MAX_STALE_MS, "Tải lại mới"
//         (nocache=1) hoặc route ghi dữ liệu (flush*) thì tính lại ĐỒNG BỘ như trước.
//   Trùng lặp: nhiều request cùng key đến 1 instance chỉ chạy `fn` 1 lần (in-flight dedupe).

interface CacheEntry<T = unknown> { data: T; cachedAt: number }
interface L1Entry extends CacheEntry { deps: string[] }

const _cache = new Map<string, L1Entry>()
const _inflight = new Map<string, Promise<unknown>>()
const L1_TTL_MS    = 45_000               // ngắn: L2 đã nhanh, L1 chỉ để né hop khi bấm liên tục
const TTL_L2       = 10                   // phút — mặc định khi route không truyền ttl
const MAX_STALE_MS = 6 * 60 * 60_000      // quá 6h thì không phục vụ bản cũ nữa
const L2_TTL_S     = MAX_STALE_MS / 1000
const TAG_ALL      = "aq-all"

function runtimeCache() { return getCache({ namespace: "aq" }) }
const prefixTag = (key: string) => `pfx:${key.split(":")[0].replace(/,/g, "_").slice(0, 200)}`
const depTag    = (d: string)   => `dep:${d.replace(/,/g, "_").slice(0, 200)}`

// Mốc "coi như hết hạn mềm / cứng" toàn cục, lưu ở L2 (cache 5s trong instance để khỏi thêm 1 hop mỗi request).
//   soft: entry cũ hơn mốc này bị coi là HẾT TTL → vẫn phục vụ bản cũ + tính lại nền (ETL vừa nạp data mới)
//   hard: entry cũ hơn mốc này bị BỎ hẳn → tính lại đồng bộ (admin bấm "xoá cache toàn hệ thống")
interface Epoch { soft: number; hard: number }
let _epoch: { v: Epoch; at: number } | null = null
const EPOCH_KEY = "epoch"
async function getEpoch(): Promise<Epoch> {
  if (_epoch && Date.now() - _epoch.at < 5_000) return _epoch.v
  let v: Epoch = { soft: 0, hard: 0 }
  try {
    const e = (await runtimeCache().get(EPOCH_KEY)) as Epoch | undefined
    if (e) v = { soft: e.soft || 0, hard: e.hard || 0 }
  } catch { /* L2 lỗi → không có mốc */ }
  _epoch = { v, at: Date.now() }
  return v
}
async function setEpoch(patch: Partial<Epoch>): Promise<void> {
  const cur = await getEpoch()
  const next = { ...cur, ...patch }
  _epoch = { v: next, at: Date.now() }
  try { await runtimeCache().set(EPOCH_KEY, next, { ttl: 30 * 24 * 3600, name: "aq-epoch" }) } catch { /* bỏ qua */ }
}

/** Đánh dấu MỌI cache hiện có là "hết TTL" nhưng còn dùng được làm bản cũ (SWR) — dùng khi ETL vừa nạp data mới. */
export async function softExpireAll(): Promise<void> { await setEpoch({ soft: Date.now() }) }

export async function persistCacheEntry<T>(key: string, data: T, deps: string[] = []): Promise<void> {
  const entry: CacheEntry<T> = { data, cachedAt: Date.now() }
  l1Set(key, entry, deps)
  try {
    await runtimeCache().set(key, entry, {
      ttl: L2_TTL_S, name: "analytics-query",
      tags: [TAG_ALL, prefixTag(key), ...deps.map(depTag)],
    })
  } catch (e: any) {
    console.warn("[analytics-cache] L2 set lỗi (dùng L1 thôi):", key.slice(0, 60), e?.message)
  }
}

function l1Set(key: string, entry: CacheEntry, deps: string[]) {
  _cache.set(key, { ...entry, deps })
  if (_cache.size > 200) {
    const now = Date.now()
    for (const [k, v] of _cache) if (now - v.cachedAt > MAX_STALE_MS) _cache.delete(k)
  }
}

/**
 * `deps` (s190+2 — thay cơ chế prefix-list viết tay, đã gây ≥3 sự cố lịch sử: thiếu flush s168b, prefix
 * lệch version thành no-op s169, flush toàn bộ gây chậm app s169(c)): mỗi route cache tự khai NÓ phụ thuộc
 * "chủ đề" dữ liệu nào (vd `["b2b-cost"]`) NGAY tại chỗ gọi `cachedQuery` — không còn danh sách rời rạc
 * (`B2B_COST_CACHE_PREFIXES` cũ) nào có thể lệch khỏi thực tế khi thêm route mới hoặc đổi cache-key.
 * Route ghi dữ liệu gọi `flushByDeps(["b2b-cost"])` — không cần biết route nào đang cache nó.
 */
export async function cachedQuery<T>(
  key: string,
  fn:  () => Promise<T>,
  ttlMinutes = TTL_L2,
  bypass = false,   // true → bỏ qua ĐỌC cache, tính lại tươi ĐỒNG BỘ; VẪN ghi cache mới (re-warm).
  deps: string[] = [],
): Promise<T> {
  const freshMs = ttlMinutes * 60_000

  const compute = (): Promise<T> => {
    const running = _inflight.get(key) as Promise<T> | undefined
    if (running) return running
    const p = (async () => {
      const data = await fn()
      // Ghi cache KHÔNG chặn response (waitUntil giữ function sống tới khi ghi xong).
      waitUntil(persistCacheEntry(key, data, deps))
      return data
    })().finally(() => { _inflight.delete(key) })
    _inflight.set(key, p)
    return p
  }

  if (bypass) return compute()

  const epoch = await getEpoch()
  const now   = Date.now()
  const usable = (e: CacheEntry | undefined | null): e is CacheEntry =>
    !!e && typeof e.cachedAt === "number" && e.cachedAt >= epoch.hard && now - e.cachedAt < MAX_STALE_MS
  const isFresh = (e: CacheEntry) => now - e.cachedAt < freshMs && e.cachedAt >= epoch.soft

  // L1 chỉ dùng khi còn tươi và chưa quá L1_TTL_MS (tránh giữ bản cũ ở instance này khi flush đã xảy ra ở instance khác).
  const l1 = _cache.get(key) as CacheEntry<T> | undefined
  if (usable(l1) && isFresh(l1) && now - l1.cachedAt < L1_TTL_MS) return l1.data

  let entry: CacheEntry<T> | undefined
  try { entry = (await runtimeCache().get(key)) as CacheEntry<T> | undefined } catch { entry = undefined }

  if (usable(entry)) {
    if (isFresh(entry)) { l1Set(key, entry, deps); return entry.data }
    // Hết TTL (hoặc ETL vừa nạp data mới): trả bản cũ ngay, làm mới ở nền.
    waitUntil(compute().then(() => {}, () => {}))
    return entry.data
  }

  return compute()
}

// Xoá toàn bộ cache (admin — gọi từ Settings, nút "Tải lại mới" toàn hệ thống). Bản cũ KHÔNG còn được phục vụ.
export async function flushAnalyticsCache(): Promise<{ deleted: number }> {
  const n = _cache.size
  _cache.clear()
  await setEpoch({ hard: Date.now() })
  return { deleted: n }
}

/**
 * Xoá MỌI cache-entry đã tự khai phụ thuộc 1 trong các `deps` này (xem comment `cachedQuery` ở trên).
 * Gọi từ route ghi dữ liệu — không cần biết/nhớ route nào đang cache nó, khác cơ chế prefix cũ.
 */
export async function flushByDeps(deps: string[]): Promise<{ deleted: number }> {
  const clean = deps.filter(Boolean)
  if (clean.length === 0) return { deleted: 0 }
  let n = 0
  for (const [k, v] of _cache) {
    if (v.deps?.some(d => clean.includes(d))) { _cache.delete(k); n++ }
  }
  try { await runtimeCache().expireTag(clean.map(depTag)) } catch (e: any) { console.warn("[analytics-cache] expireTag lỗi:", e?.message) }
  return { deleted: n }
}

// Xoá cache theo prefix cache-key literal (phần trước dấu ':' đầu tiên) — vẫn hợp lệ cho các route CHƯA
// khai `deps` (vd b2c-monthly/b2c-leads, quarterly-report/quarterly-b2b-customers). Import prefix TRỰC TIẾP từ
// module sinh ra key, không hardcode chuỗi rời rạc — xem `quarterly-cache-flush/route.ts`.
export async function flushAnalyticsCacheByPrefixes(prefixes: string[]): Promise<{ deleted: number }> {
  const clean = prefixes.filter(Boolean)
  if (clean.length === 0) return { deleted: 0 }
  let n = 0
  for (const key of Array.from(_cache.keys())) {
    if (clean.some(prefix => key.startsWith(prefix))) { _cache.delete(key); n++ }
  }
  try { await runtimeCache().expireTag(clean.map(p => prefixTag(p))) } catch (e: any) { console.warn("[analytics-cache] expireTag lỗi:", e?.message) }
  return { deleted: n }
}

// ── Query-route cache + prewarm registry ───────────────────────────────────────
// /api/analytics/query (endpoint generic) gọi qua đây. Đồng thời GHI LẠI SQL gốc (registry row
// "sqlreg:<hash>") để cron prewarm chạy lại được.
// s199+3 (2026-09-16): TTL trước là 12h, dựa giả định "data gohub_dw chỉ update 1 lần/ngày" — SAI so với
// thực tế hiện tại. Verify trực tiếp bảng `jobs`/`job_logs` (gohub_dw): fact_fulfillment_revenue/
// fact_sales_revenue được ETL nạp HÀNG GIỜ (cron `50 * * * *`/`55 * * * *`), không phải 1 lần/ngày như
// comment cũ. TTL 12h khiến 2 tab cache độc lập (VD B2B Performance vs Quarter Report) có thể lệch nhau
// tới nửa ngày doanh thu nếu không cùng bấm "Tải lại mới" — Hiếu báo đúng hiện tượng này (s199+3). Hạ
// xuống khớp chu kỳ ETL thật, còn dư biên (ETL chạy :50/:55 mỗi giờ, TTL 60' đảm bảo cache luôn ≤1 chu kỳ).
export const QUERY_TTL_MIN = 60  // TTL chung cho cache analytics — khớp chu kỳ ETL thật (hàng giờ)
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
      await persistCacheEntry(r.key.replace("sqlreg:", "q:"), data)
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
export async function prewarmAnalyticsUrls(baseUrl: string, limit = 50, concurrency = 3): Promise<{ prewarmed: number; failed: number }> {
  const regs = await readCacheByPrefix("urlreg:")
  const urls = regs
    .map(r => ({ url: r.data?.url as string, ts: r.data?.ts ?? 0 }))
    .filter(r => typeof r.url === "string" && r.url.startsWith("/api/analytics/"))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)

  // Gọi lại URL kèm nocache=1 → route bỏ qua đọc cache, tính lại tươi và GHI cache mới (không cần xoá key trước,
  // nên người dùng vào giữa lúc prewarm vẫn có bản cũ để xem). Chạy `concurrency` URL song song (pool DB max=3/instance).
  const auth = `Bearer ${process.env.CRON_SECRET ?? ""}`
  let prewarmed = 0, failed = 0
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const u = urls[next++]
      try {
        const sep = u.url.includes("?") ? "&" : "?"
        const target = u.url.includes("nocache=") ? u.url : `${u.url}${sep}nocache=1`
        const res = await fetch(`${baseUrl}${target}`, { headers: { authorization: auth }, cache: "no-store" })
        res.ok ? prewarmed++ : failed++
      } catch { failed++ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker))
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
  // Clamp endDate tới CURRENT_DATE - 1: gohub_dw ETL chạy 08h mỗi ngày, hôm nay chưa đủ data.
  let filter = sd && ed
    ? `f.${dateColumn}::date BETWEEN '${sd}' AND LEAST('${ed}'::date, CURRENT_DATE - 1)`
    : `f.${dateColumn}::date >= NOW()::date - INTERVAL '${defaultInterval}' AND f.${dateColumn}::date <= CURRENT_DATE - 1`
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
    return await memo("partner_tiers", 15_000, async () => {
      const { data, error } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "partner_tiers")
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data?.value ? JSON.parse(data.value) as Record<string, string[]> : { Strategic: [] }
    })
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

// ── Phân loại B2B-Strategic/Non theo KHÁCH (price_list_name) — 1 ĐỊNH NGHĨA DÙNG CHUNG ───────────────────
// Nguồn: quarterly-settings (tierKeywords + excludedCustomers) — CÙNG cấu hình với Quarter Report (chỉnh 1 chỗ,
// mọi tab theo: Dashboard chart, BOD group-margin, All-Time). Mirror makeClassifyTier: Strategic ⇔ price_list_name
// NULL hoặc KHÔNG khớp keyword của tier NON-Strategic nào. Query PHẢI JOIN dim_order_source s + dim_customer c + có f.customer_code.
export function buildIsStrategicSql(tierKeywords: Record<string, string[]>): string {
  const nonStrat = Object.entries(tierKeywords)
    .filter(([tier]) => tier !== "Strategic")
    .flatMap(([, kws]) => kws)
    .map(kw => kw.toUpperCase().replace(/'/g, "''"))
  if (nonStrat.length === 0) return "(TRUE)"   // không có tier non-Strategic → mọi KH B2B đều Strategic
  const conds = nonStrat.map(kw => `UPPER(c.price_list_name) NOT LIKE '%${kw}%'`).join(" AND ")
  return `(c.price_list_name IS NULL OR (${conds}))`
}
export function buildCustomerExcludeSql(excludedCustomers: string[]): string {
  return excludedCustomers.map(n => `'${n.replace(/'/g, "''")}'`).join(",")
}
// Row bị loại (ops/B2C-in-B2B) → 'Excluded' (caller lọc khỏi groupNames).
export function buildGroupCaseByCustomerSql(tierKeywords: Record<string, string[]>, excludedCustomers: string[]): string {
  const isStrat = buildIsStrategicSql(tierKeywords)
  const excl = buildCustomerExcludeSql(excludedCustomers)
  const exclLine = excl ? `WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' AND COALESCE(c.name, TRIM(f.customer_code)) IN (${excl}) THEN 'Excluded'` : ""
  return `CASE
    ${exclLine}
    WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' AND ${isStrat} THEN 'B2B-Strategic'
    WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' THEN 'B2B-Non-Strategic'
    WHEN UPPER(COALESCE(s.group_name,'')) = 'B2C' THEN 'B2C'
    ELSE 'Other'
  END`
}

// Fetch settings 1 lần → trả các mảnh SQL + hash (để nhét vào cache key, auto-invalidate khi đổi tier/exclude).
export async function getCustomerStrategicSql(): Promise<{ isStrategicSql: string; excludeSql: string; groupCaseSql: string; hash: string }> {
  const { tierKeywords, excludedCustomers } = await fetchQuarterlySettings()
  return {
    isStrategicSql: buildIsStrategicSql(tierKeywords),
    excludeSql: buildCustomerExcludeSql(excludedCustomers),
    groupCaseSql: buildGroupCaseByCustomerSql(tierKeywords, excludedCustomers),
    hash: strategicSettingsHash(tierKeywords, excludedCustomers),
  }
}
function strategicSettingsHash(tierKeywords: Record<string, string[]>, excludedCustomers: string[]): string {
  const tierStr = Object.entries(tierKeywords).map(([t, k]) => `${t}=${[...k].sort().join("|")}`).sort().join(";")
  return createHash("sha1").update(`${tierStr}::${exclHash(excludedCustomers)}`).digest("hex").slice(0, 10)
}
// Chỉ lấy hash (cho route chỉ cần cache key, không build SQL — vd bod-group-margin/bod-summary).
export async function getStrategicSettingsHash(): Promise<string> {
  const { tierKeywords, excludedCustomers } = await fetchQuarterlySettings()
  return strategicSettingsHash(tierKeywords, excludedCustomers)
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

// ── Filter fragments chuẩn (dùng chung mọi route) ────────────────────────────
// Đồng bộ theo chuẩn order-report: include=false (default) = loại khỏi doanh thu SP thuần.
// Khi bật CẢ 2 + includeOpsCustomers=true → khớp số liệu gohub_dw raw.

/** Loại SHIPPINGFEE0 (phí ship). Alias fact table = f. */
export function shipFilter(include: boolean): string {
  return include ? "" : "AND f.sku != 'SHIPPINGFEE0'"
}

/** Loại nhóm INTERNAL-TRANSACTION (đơn SIM nội bộ: revenue=0, GP âm). Alias dim_order_source = s. */
export function internalOpsFilter(include: boolean): string {
  return include ? "" : "AND UPPER(COALESCE(s.group_name, '')) != 'INTERNAL-TRANSACTION'"
}

/**
 * Loại INTERNAL-TRANSACTION bằng subquery (dùng khi dim_order_source chưa JOIN, chỉ có f.order_source_code).
 * Alias fact table = f.
 */
export function internalOpsFilterByCode(include: boolean): string {
  return include ? "" : "AND f.order_source_code NOT IN (SELECT code FROM dim_order_source WHERE UPPER(COALESCE(group_name,'')) = 'INTERNAL-TRANSACTION')"
}

/**
 * Loại khách ops theo customer_code (không cần JOIN dim_customer với alias cụ thể).
 * Dùng khi query không sẵn alias dim_customer = c (ví dụ trong CTE b2b_raw).
 */
export function excludeOpsByCode(excludedCustomers: string[]): string {
  if (excludedCustomers.length === 0) return ""
  const esc = excludedCustomers.map(n => `'${n.replace(/'/g, "''")}'`).join(", ")
  return `AND COALESCE(TRIM(f.customer_code), '') NOT IN (SELECT TRIM(code) FROM dim_customer WHERE name IN (${esc}))`
}

/**
 * Loại KH có price_list_name chứa "INACTIVE" (vd "[INACTIVE] Sponsor") — CÙNG định nghĩa với
 * Quarter Report (`quarterly-report`/`quarterly-b2b-customers`). Trước đây b2b/kpis, b2b/performance,
 * b2b/trend KHÔNG lọc điều này → revenue/CM1 B2B Performance cao hơn Quarter Report có hệ thống
 * bất cứ khi nào 1 KH INACTIVE có phát sinh trong kỳ. Self-contained subquery, không cần JOIN dim_customer.
 */
export function excludeInactiveCustomers(): string {
  return `AND NOT EXISTS (SELECT 1 FROM dim_customer ic WHERE TRIM(ic.code::text) = TRIM(f.customer_code) AND UPPER(COALESCE(ic.price_list_name,'')) LIKE '%INACTIVE%')`
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

// The destination country code is embedded in the SKU — vị trí phụ thuộc ĐỘ DÀI sku, không phải
// ký tự đầu (bug s195+19: code cũ branch theo ký tự đầu (digit/'E'/khác) — SAI cho mọi SKU 13 ký
// tự pháp nhân dạng CHỮ (US: A-E), vì ký tự 1 luôn CHỈ 1 ký tự bất kể số hay chữ (xem
// business/ma-sku.md) nên nước LUÔN ở vị trí 3-5, không lệch theo digit/chữ. Verify bằng SQL Query
// trực tiếp trên TOÀN BỘ lịch sử fact_fulfillment_revenue (không đoán):
//   13 ký tự (chuẩn hiện tại — digit 1-6 HOẶC chữ A-E đều 1 ký tự) → nước = ký tự 3-5
//     vd digit: 2CTHACBF05010 → THA. vd chữ (trước đây SAI): ECJPN3DBUNL01 → JPN (code cũ ra "CJP")
//   14 ký tự (legacy, không có ký tự pháp nhân riêng) CHN3D07GBFY05D → nước = ký tự 1-3 (CHN)
//   15 ký tự (legacy Datapool) EJPN3DFY05GB15D → nước = ký tự 2-4 (JPN)
//   Độ dài khác (9-12/18...) = mã phí/thủ công (HOATOC/BUUDIEN/SHIPPINGFEE...), không mang thông
//     tin nước → fallback ký tự 3-5 (không tệ hơn trước, các mã này vốn không có nước thật)
// Resulting codes are mapped to country names via getCountryMappings (Turso country_codes).
export function getDestinationSQL(_rule?: DestRule): string {
  return `CASE
    WHEN LENGTH(f.sku) = 14 THEN UPPER(SUBSTRING(f.sku, 1, 3))
    WHEN LENGTH(f.sku) = 15 THEN UPPER(SUBSTRING(f.sku, 2, 3))
    ELSE UPPER(SUBSTRING(f.sku, 3, 3))
  END`
}

// JS mirror của getDestinationSQL() — dùng khi đã có SKU sẵn trong JS (vd sau khi query đã trả về
// hàng loạt SKU và cần group theo nước phía TypeScript, như My Metrics SKU GM/Datapool hierarchy)
// thay vì phải thêm CASE vào SQL. PHẢI giữ ĐÚNG logic y hệt getDestinationSQL — sửa 1 bên thì sửa cả 2.
export function decodeSkuDestinationCode(sku: string): string {
  const s = sku.toUpperCase()
  if (s.length === 14) return s.slice(0, 3)
  if (s.length === 15) return s.slice(1, 4)
  return s.slice(2, 5)
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
// Nguồn thật: analytics-engine/date-math.ts (pure, client-safe, không lệch theo timezone máy chạy).
// Re-export giữ tên cũ để ~10 file đang import getDaysInMonth/getDaysInRange từ đây không phải sửa (s183 Phase 2).
export { getDaysInMonth, getDaysInRange }

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

  // Chuẩn "doanh thu SP thuần" toàn hệ thống (loại phí ship/đơn nội bộ/KH INACTIVE) — trước route này
  // tính SUM thô, không áp filter nào → Actual cao hơn số ở BOD/Quarter Report/B2B (fix s197 audit toàn
  // hệ thống logic dữ liệu).
  const actualRows = await queryAnalytics<{ total_actual: string }>(
    `SELECT SUM(fulfilled_revenue_amount_vnd) as total_actual
     FROM fact_fulfillment_revenue f
     WHERE f.fulfiled_date::date BETWEEN $1 AND $2 ${shipFilter(false)} ${internalOpsFilterByCode(false)} ${excludeInactiveCustomers()}`,
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
