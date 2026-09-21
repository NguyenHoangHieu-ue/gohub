import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { tursoQuery, tursoConfigured } from "@/lib/turso"
import { Redis } from "@upstash/redis"
import { getCache } from "@vercel/functions"

// Đo độ trễ THẬT từ vùng chạy function tới từng kho dữ liệu (gohub_dw / Supabase / Turso / Upstash) — creator-only.
// Dùng để phân biệt "query nặng" với "mỗi hop mạng chậm" khi tab analytics load lâu.

async function time<T>(fn: () => PromiseLike<T>): Promise<number> {
  const t = performance.now()
  try { await fn() } catch { return -1 }
  return Math.round(performance.now() - t)
}

async function series(n: number, fn: () => PromiseLike<unknown>): Promise<number[]> {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(await time(fn))
  return out
}

export async function runPerfProbe() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const gohubDw    = await series(4, () => queryAnalytics("SELECT 1"))
  const dwParallel = await time(() => Promise.all([queryAnalytics("SELECT 1"), queryAnalytics("SELECT 1"), queryAnalytics("SELECT 1")]))
  // Khả năng chạy song song của gohub_dw: 1 query nặng chạy 1 mình vs 3 cùng lúc (pool app max=3).
  const heavy = "SELECT COUNT(DISTINCT f.order_code) c, SUM(f.fulfilled_revenue_amount_vnd) r FROM fact_fulfillment_revenue f LEFT JOIN dim_order_source s ON f.order_source_code = s.code WHERE UPPER(s.group_name) = 'B2B' AND f.fulfiled_date >= '2026-07-01'"
  const heavy1 = await series(2, () => queryAnalytics(heavy))
  const heavy3 = await series(2, () => Promise.all([queryAnalytics(heavy), queryAnalytics(heavy), queryAnalytics(heavy)]))
  const supabase   = await series(4, () => supabaseAdmin.from("app_settings").select("value").eq("key", "role_permissions").maybeSingle().then(r => r))
  const supaCache  = await series(3, () => supabaseAdmin.from("analytics_query_cache").select("cache_key, cached_at").limit(1).then(r => r))
  const turso      = tursoConfigured() ? await series(4, () => tursoQuery("SELECT 1")) : []
  const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  let upstash: number[] = [], upstash50k: number[] = []
  if (hasUpstash) {
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
    upstash = await series(4, () => redis.get("perf-probe:none"))
    await redis.set("perf-probe:50k", { blob: "x".repeat(50_000) }, { ex: 120 })
    upstash50k = await series(3, () => redis.get("perf-probe:50k"))
  }

  const rc = getCache({ namespace: "perf-probe" })
  const rcSet = await series(2, () => rc.set("blob50k", { blob: "x".repeat(50_000) }, { ttl: 120, tags: ["perf-probe"] }))
  const rcGet = await series(4, () => rc.get("blob50k"))
  const rcMiss = await series(2, () => rc.get("no-such-key"))
  const rcHit = await rc.get("blob50k")

  return NextResponse.json({
    runtimeCache: { setMs: rcSet, get50kMs: rcGet, missMs: rcMiss, hitOk: !!rcHit },
    region: process.env.VERCEL_REGION ?? null,
    note: "ms mỗi lần gọi tuần tự; lần 1 gồm cả bắt tay kết nối (TLS/DNS), các lần sau dùng lại kết nối",
    gohubDw, gohubDwParallel3: dwParallel, heavy1, heavy3, supabaseAppSettings: supabase, supabaseCacheTable: supaCache, turso, upstash, upstashGet50KB: upstash50k,
  })
}
