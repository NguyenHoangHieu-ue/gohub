import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { invalidateCustomerCache } from "@/lib/customer-cache"
import { invalidateDimCustomerCache } from "@/lib/dim-schema"

// Sync dim_customer từ gohub_dw → Supabase dim_customer_cache.
// Schema-agnostic: probe information_schema trước, sau đó dùng raw_data JSONB
// để lưu toàn bộ row — không bị ảnh hưởng khi dim_customer đổi cột.

const BATCH_SIZE = 500

export async function POST(req: NextRequest) {
  try {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const statusOnly = body?.statusOnly === true

  // --- Status only mode ---
  if (statusOnly) {
    try {
      const [countRes, latestRes, dwCountRes] = await Promise.all([
        supabaseAdmin.from("dim_customer_cache").select("*", { count: "exact", head: true }),
        supabaseAdmin.from("dim_customer_cache").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
        queryAnalytics<{ n: string }>("SELECT COUNT(*)::bigint AS n FROM dim_customer"),
      ])
      return NextResponse.json({
        cacheRows: countRes.count ?? 0,
        lastSynced: latestRes.data?.synced_at ?? null,
        dwRows: Number(dwCountRes[0]?.n ?? 0),
      })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  // --- Full sync ---
  try {
    // 0. Test kết nối gohub_dw trước
    const connTest = await queryAnalytics<{ ok: number }>("SELECT 1 AS ok").catch((e: any) => ({ error: e.message }))
    if ("error" in connTest) {
      return NextResponse.json({ error: `Không kết nối được gohub_dw: ${(connTest as any).error}` }, { status: 503 })
    }

    // 1. Probe thực tế dim_customer schema (schema-agnostic)
    const schemaCols = await queryAnalytics<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'dim_customer'
       ORDER BY ordinal_position`
    )
    if (schemaCols.length === 0) {
      return NextResponse.json({ error: "dim_customer không tồn tại hoặc không có cột nào trong information_schema" }, { status: 400 })
    }

    const colNames = schemaCols.map(r => r.column_name)
    const colListSQL = colNames.map(c => `"${c}"`).join(", ")

    // 2. Tìm cột "code" (customer identifier) và "name" theo priority
    const codeCol = colNames.find(c => c === "code")
      ?? colNames.find(c => c === "customer_code")
      ?? colNames.find(c => c === "customer_id")
      ?? colNames.find(c => c.endsWith("_code") || c.endsWith("_id"))
      ?? colNames[0]

    const nameCol = colNames.find(c => c === "name")
      ?? colNames.find(c => c === "customer_name")
      ?? colNames.find(c => c.includes("name"))
      ?? colNames[1]

    const plnCol = colNames.find(c => c === "price_list_name") ?? null
    const ccCol  = colNames.find(c => c === "currency_code") ?? null
    const statusCol = colNames.find(c => c === "status") ?? null
    const orgCol = colNames.find(c => c === "organization") ?? null
    const orgCodeCol = colNames.find(c => c === "organization_code") ?? null
    const cgcCol = colNames.find(c => c === "customer_group_code") ?? null

    // 3. Pull ALL rows từ gohub_dw
    const dwRows = await queryAnalytics<Record<string, any>>(
      `SELECT ${colListSQL} FROM dim_customer`
    )

    if (dwRows.length === 0) {
      return NextResponse.json({ ok: false, synced: 0, skipped: 0, message: "dim_customer trống" })
    }

    // 4. Map sang Supabase schema + lưu raw_data JSONB
    const now = new Date().toISOString()
    const toUpsert = dwRows
      .map(row => {
        const code = row[codeCol] ? String(row[codeCol]).trim() : null
        if (!code) return null  // bỏ qua row không có code
        return {
          code,
          name:              nameCol   ? (row[nameCol]   ? String(row[nameCol]).trim()   : null) : null,
          price_list_name:   plnCol    ? (row[plnCol]    ?? null) : null,
          currency_code:     ccCol     ? (row[ccCol]     ?? null) : null,
          status:            statusCol ? (row[statusCol] ?? null) : null,
          organization:      orgCol    ? (row[orgCol]    ?? null) : null,
          organization_code: orgCodeCol ? (row[orgCodeCol] ?? null) : null,
          customer_group_code: cgcCol  ? (row[cgcCol]   ?? null) : null,
          raw_data: row,
          synced_at: now,
        }
      })
      .filter(Boolean) as any[]

    // 5. Upsert theo batch
    let synced = 0, failed = 0
    for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
      const batch = toUpsert.slice(i, i + BATCH_SIZE)
      const { error } = await supabaseAdmin
        .from("dim_customer_cache")
        .upsert(batch, { onConflict: "code" })
      if (error) { failed += batch.length; console.error("[sync-dim-customer]", error.message) }
      else synced += batch.length
    }

    // 6. Xóa các row đã bị xóa khỏi gohub_dw (code không còn tồn tại)
    const activeCodes = toUpsert.map((r: any) => r.code)
    // Chỉ xóa nếu có đủ data (tránh xóa nhầm khi gohub_dw lỗi partial)
    if (activeCodes.length > 10) {
      // Lấy tất cả codes trong cache, so sánh
      const { data: cachedCodes } = await supabaseAdmin
        .from("dim_customer_cache")
        .select("code")
        .limit(50000)
      const activeSet = new Set(activeCodes)
      const toDelete = (cachedCodes || [])
        .map((r: any) => r.code)
        .filter((c: string) => !activeSet.has(c))
      if (toDelete.length > 0 && toDelete.length < activeCodes.length) {
        await supabaseAdmin.from("dim_customer_cache").delete().in("code", toDelete)
      }
    }

    // 7. Invalidate caches
    invalidateCustomerCache()
    invalidateDimCustomerCache()

    return NextResponse.json({
      ok: true,
      synced,
      failed,
      total: dwRows.length,
      schemaUsed: { codeCol, nameCol, plnCol, ccCol },
      columns: colNames,
      message: `Sync OK: ${synced}/${dwRows.length} khách hàng → Supabase`,
    })
  } catch (e: any) {
    console.error("[sync-dim-customer inner]", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  // Outer try-catch: bắt lỗi module load / auth để luôn trả JSON, không HTML
  } catch (e: any) {
    console.error("[sync-dim-customer outer]", e.message)
    return NextResponse.json({ error: "Server error: " + (e.message || "unknown") }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  // GET = status check only
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const [countRes, latestRes, dwRes] = await Promise.all([
      supabaseAdmin.from("dim_customer_cache").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("dim_customer_cache").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
      queryAnalytics<{ n: string; sample_code: string; sample_name: string }>(
        `SELECT COUNT(*)::bigint AS n,
                (SELECT code::text FROM dim_customer LIMIT 1) AS sample_code,
                (SELECT name FROM dim_customer LIMIT 1) AS sample_name
         FROM dim_customer`
      ).catch(() => [{ n: "0", sample_code: null, sample_name: null }]),
    ])
    return NextResponse.json({
      cacheRows: countRes.count ?? 0,
      lastSynced: latestRes.data?.synced_at ?? null,
      dwRows: Number(dwRes[0]?.n ?? 0),
      sampleCode: dwRes[0]?.sample_code ?? null,
      sampleName: dwRes[0]?.sample_name ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
