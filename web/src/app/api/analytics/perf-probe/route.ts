import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { tursoQuery, tursoConfigured } from "@/lib/turso"

// Đo độ trễ THẬT từ vùng chạy function tới từng kho dữ liệu (gohub_dw / Supabase / Turso) — creator-only.
// Dùng để phân biệt "query nặng" với "mỗi hop mạng chậm" khi tab analytics load lâu.
export const dynamic = "force-dynamic"

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

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const gohubDw   = await series(4, () => queryAnalytics("SELECT 1"))
  const supabase  = await series(4, () => supabaseAdmin.from("app_settings").select("value").eq("key", "role_permissions").maybeSingle().then(r => r))
  const supaCache = await series(3, () => supabaseAdmin.from("analytics_query_cache").select("cache_key, cached_at").limit(1).then(r => r))
  const turso     = tursoConfigured() ? await series(4, () => tursoQuery("SELECT 1")) : []
  const dwParallel = await time(() => Promise.all([queryAnalytics("SELECT 1"), queryAnalytics("SELECT 1"), queryAnalytics("SELECT 1")]))

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? null,
    note: "ms mỗi lần gọi tuần tự; lần 1 gồm cả bắt tay kết nối (TLS/DNS), các lần sau dùng lại kết nối",
    gohubDw, gohubDwParallel3: dwParallel, supabaseAppSettings: supabase, supabaseCacheTable: supaCache, turso,
  })
}
