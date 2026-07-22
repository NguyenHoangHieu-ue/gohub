import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { invalidateCustomerCache } from "@/lib/customer-cache"
import { invalidateDimCustomerCache } from "@/lib/dim-schema"

// Sync dim_customer từ gohub_dw → Supabase dim_customer_cache.
// Paginated: mỗi call xử lý PAGE_SIZE rows để tránh Vercel 60s timeout.
// Client tự loop cho đến khi hasMore=false.

const PAGE_SIZE = 300  // rows per call — đủ nhỏ để < 60s

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !["admin", "creator"].includes(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const page: number = typeof body.page === "number" ? body.page : 0

    // --- Test connection ---
    const connTest = await queryAnalytics<{ ok: number }>("SELECT 1 AS ok").catch((e: any) => ({ error: e.message }))
    if ("error" in connTest)
      return NextResponse.json({ error: `Không kết nối được gohub_dw: ${(connTest as any).error}` }, { status: 503 })

    // --- Probe schema once (page 0 only to save time) ---
    let codeCol = "code", nameCol = "name", plnCol: string | null = null
    let ccCol: string | null = null, statusCol: string | null = null
    let orgCol: string | null = null, orgCodeCol: string | null = null, cgcCol: string | null = null
    let colNames: string[] = []
    let totalRows = 0

    if (page === 0) {
      const schemaCols = await queryAnalytics<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'dim_customer'
         ORDER BY ordinal_position`
      )
      if (schemaCols.length === 0)
        return NextResponse.json({ error: "dim_customer không tồn tại trong gohub_dw" }, { status: 400 })

      colNames = schemaCols.map(r => r.column_name)

      // Count total rows
      const countRes = await queryAnalytics<{ n: string }>("SELECT COUNT(*)::bigint AS n FROM dim_customer")
      totalRows = Number(countRes[0]?.n ?? 0)
    }

    // Xác định cột — dùng params từ body (page > 0) hoặc probe mới
    const resolvedCode = body.codeCol || colNames.find((c: string) => c === "code") || colNames.find((c: string) => c === "customer_code") || colNames.find((c: string) => c === "customer_id") || colNames[0] || "code"
    const resolvedName = body.nameCol || colNames.find((c: string) => c === "name") || colNames.find((c: string) => c === "customer_name") || colNames.find((c: string) => (c as string).includes("name")) || colNames[1] || "name"
    codeCol = resolvedCode
    nameCol = resolvedName

    // Chỉ select các cột cần thiết (không raw_data để tránh slow query)
    const essentialCols = [codeCol, nameCol, "price_list_name", "currency_code", "status", "organization", "organization_code", "customer_group_code"]

    // Probe available columns nếu page=0, sinon dùng từ body
    let selectCols: string[]
    if (page === 0 && colNames.length > 0) {
      selectCols = essentialCols.filter((c: string) => colNames.includes(c))
      if (!selectCols.includes(codeCol)) selectCols.unshift(codeCol)
      if (!selectCols.includes(nameCol) && nameCol !== codeCol) selectCols.push(nameCol)
    } else {
      selectCols = body.selectCols || essentialCols
    }

    const colListSQL = selectCols.map((c: string) => `"${c}"`).join(", ")
    const offset = page * PAGE_SIZE

    // --- Pull page of rows ---
    const dwRows = await queryAnalytics<Record<string, any>>(
      `SELECT ${colListSQL} FROM dim_customer ORDER BY "${codeCol}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`
    )

    const hasMore = dwRows.length === PAGE_SIZE

    if (dwRows.length === 0) {
      if (page === 0) {
        return NextResponse.json({ ok: true, synced: 0, total: 0, page, hasMore: false, done: true, message: "dim_customer trống" })
      }
      return NextResponse.json({ ok: true, synced: 0, page, hasMore: false, done: true })
    }

    // --- Upsert batch to Supabase ---
    const now = new Date().toISOString()
    const toUpsert = dwRows
      .map((row: Record<string, any>) => {
        const code = row[codeCol] ? String(row[codeCol]).trim() : null
        if (!code) return null
        return {
          code,
          name:              row[nameCol] ? String(row[nameCol]).trim() : null,
          price_list_name:   row["price_list_name"] ?? null,
          currency_code:     row["currency_code"] ?? null,
          status:            row["status"] ?? null,
          organization:      row["organization"] ?? null,
          organization_code: row["organization_code"] ?? null,
          customer_group_code: row["customer_group_code"] ?? null,
          raw_data:          row,  // JSONB chứa toàn bộ row
          synced_at:         now,
        }
      })
      .filter(Boolean) as any[]

    const { error: upsertErr } = await supabaseAdmin
      .from("dim_customer_cache")
      .upsert(toUpsert, { onConflict: "code" })

    if (upsertErr) {
      return NextResponse.json({ error: `Supabase upsert lỗi: ${upsertErr.message}` }, { status: 500 })
    }

    // Invalidate caches khi sync xong (page cuối)
    if (!hasMore) {
      invalidateCustomerCache()
      invalidateDimCustomerCache()
    }

    return NextResponse.json({
      ok: true,
      synced: toUpsert.length,
      page,
      hasMore,
      done: !hasMore,
      total: totalRows || undefined,
      // Truyền lại metadata cho client dùng ở page tiếp theo
      codeCol,
      nameCol,
      selectCols,
    })

  } catch (e: any) {
    console.error("[sync-dim-customer]", e.message)
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !["admin", "creator"].includes(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const [countRes, latestRes, dwRes] = await Promise.all([
      supabaseAdmin.from("dim_customer_cache").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("dim_customer_cache").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
      queryAnalytics<{ n: string; sample_code: string; sample_name: string }>(
        `SELECT COUNT(*)::bigint AS n,
                (SELECT "${
                  // try to get code column
                  "code"}" FROM dim_customer LIMIT 1) AS sample_code,
                (SELECT name FROM dim_customer LIMIT 1) AS sample_name
         FROM dim_customer`
      ).catch(() => [{ n: "0", sample_code: null, sample_name: null }]),
    ])

    return NextResponse.json({
      cacheRows: countRes.count ?? 0,
      lastSynced: latestRes.data?.synced_at ?? null,
      dwRows: Number((dwRes as any)[0]?.n ?? 0),
      sampleCode: (dwRes as any)[0]?.sample_code ?? null,
      sampleName: (dwRes as any)[0]?.sample_name ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
