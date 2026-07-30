import { NextRequest, NextResponse } from "next/server"
import { isCronReq }                from "@/lib/analytics-helpers"
import { supabaseAdmin }             from "@/lib/supabase"

// Sync PM API → Supabase: pm_operators, pm_price_lists, sku_vat
// Cron: POST /api/cron/sync-pm-data (Bearer CRON_SECRET)
// Manual trigger: POST /api/cron/sync-pm-data?tables=operators,price_lists,sku_vat
// Env: PM_API_BASE_URL, PM_API_KEY

export const maxDuration = 300

const PM_BASE = (process.env.PM_API_BASE_URL || "https://api-pm.space.gohub.com/api-pull/gohub-cloud").replace(/\/$/, "")
const PM_KEY  = process.env.PM_API_KEY || ""

function pmHeaders() {
  return { "Authorization": `Bearer ${PM_KEY}`, "Content-Type": "application/json" }
}

// ─── Paginated fetch via POST body ────────────────────────────────────────────

async function fetchAllPages<T>(path: string, extra: Record<string, unknown> = {}): Promise<T[]> {
  const items: T[] = []
  let page = 1
  const LIMIT = 200

  while (true) {
    const res = await fetch(`${PM_BASE}${path}`, {
      method:  "POST",
      headers: pmHeaders(),
      body:    JSON.stringify({ page, limit: LIMIT, ...extra }),
      signal:  AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.error(`[sync-pm] ${path} p${page} → ${res.status}`, text.slice(0, 200))
      break
    }
    const body = await res.json()
    const batch: T[] = body?.data?.items ?? []
    items.push(...batch)
    const total: number = body?.data?.pagination?.total ?? 0
    if (items.length >= total || batch.length === 0) break
    page++
  }
  return items
}

// ─── Sync operators ───────────────────────────────────────────────────────────

async function syncOperators(): Promise<{ synced: number; error?: string }> {
  try {
    const items = await fetchAllPages<Record<string, unknown>>("/operators")
    if (!items.length) return { synced: 0, error: "0 operators returned from PM" }

    const rows = items.map(op => ({
      code:               String(op.code ?? "").trim(),
      name:               op.name ?? null,
      description:        op.description ?? null,
      image_url:          op.image_url ?? null,
      country:            op.country ?? null,
      category_codes:     op.category_codes ?? null,   // JSONB
      date_created:       op.date_created ?? null,
      last_modified_date: op.last_modified_date ?? null,
      synced_at:          new Date().toISOString(),
    })).filter(r => r.code)

    const { error } = await supabaseAdmin.from("pm_operators")
      .upsert(rows, { onConflict: "code" })
    return error ? { synced: 0, error: error.message } : { synced: rows.length }
  } catch (e: unknown) {
    return { synced: 0, error: String(e) }
  }
}

// ─── Sync price lists ─────────────────────────────────────────────────────────

async function syncPriceLists(): Promise<{ synced: number; error?: string }> {
  try {
    // Fetch both types in parallel
    const [extItems, itnItems] = await Promise.all([
      fetchAllPages<Record<string, unknown>>("/price-lists", { type: "ext" }),
      fetchAllPages<Record<string, unknown>>("/price-lists", { type: "itn" }),
    ])
    const items = [...extItems, ...itnItems]
    if (!items.length) return { synced: 0, error: "0 price lists returned from PM" }

    // Dedupe by code (ext + itn may overlap if PM returns both for same code)
    const seen = new Set<string>()
    const rows = items
      .map(pl => ({
        code:               String(pl.code ?? "").trim(),
        type:               pl.type ?? null,
        tenant:             pl.tenant ?? null,
        channel:            pl.channel ?? null,
        channel_code:       pl.channel_code ?? null,
        label:              pl.label ?? null,
        description:        pl.description ?? null,
        listing_type:       pl.listing_type ?? null,
        sort_order:         pl.sort_order != null ? Number(pl.sort_order) : null,
        is_active:          pl.is_active !== false,
        date_created:       pl.date_created ?? null,
        last_modified_date: pl.last_modified_date ?? null,
        synced_at:          new Date().toISOString(),
      }))
      .filter(r => {
        if (!r.code || seen.has(r.code)) return false
        seen.add(r.code)
        return true
      })

    const { error } = await supabaseAdmin.from("pm_price_lists")
      .upsert(rows, { onConflict: "code" })
    return error ? { synced: 0, error: error.message } : { synced: rows.length }
  } catch (e: unknown) {
    return { synced: 0, error: String(e) }
  }
}

// ─── Sync sku_vat ─────────────────────────────────────────────────────────────

async function syncSkuVat(): Promise<{ synced: number; error?: string }> {
  try {
    // Step 1: collect all sku_codes that have vat_status=Yes
    const skuCodes: string[] = []
    let page = 1
    while (true) {
      const res = await fetch(`${PM_BASE}/sku-vat/sku-codes`, {
        method:  "POST",
        headers: pmHeaders(),
        body:    JSON.stringify({ page, limit: 200 }),
        signal:  AbortSignal.timeout(15_000),
      })
      if (!res.ok) break
      const body = await res.json()
      const batch: string[] = (body?.data?.items ?? []).map((i: Record<string, unknown>) => String(i.sku_code ?? "").trim()).filter(Boolean)
      skuCodes.push(...batch)
      if (!body?.data?.pagination?.hasNextPage || !batch.length) break
      page++
    }

    if (!skuCodes.length) return { synced: 0, error: "No VAT SKU codes found" }

    // Step 2: batch-fetch VAT details (max 200/request)
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < skuCodes.length; i += 200) {
      const batch = skuCodes.slice(i, i + 200)
      try {
        const res = await fetch(`${PM_BASE}/sku-vat`, {
          method:  "POST",
          headers: pmHeaders(),
          body:    JSON.stringify({ skuCodes: batch }),
          signal:  AbortSignal.timeout(20_000),
        })
        if (!res.ok) continue
        const body = await res.json()
        for (const item of body?.data?.items ?? []) {
          rows.push({
            sku_code:     String(item.sku_code ?? "").trim(),
            vendor_code:  item.vendor_code  ?? null,
            product_code: item.product_code ?? null,
            product_type: item.product_type ?? null,
            vat_status:   item.vat_status   ?? "No",
            name_vn:      item.name_vn      ?? null,
            vat_unit:     item.vat_unit     ?? null,
            vat_price:    item.vat_price != null ? Number(item.vat_price) : null,
            vat_tax_rate: item.vat_tax_rate ?? null,
            synced_at:    new Date().toISOString(),
          })
        }
      } catch { continue }
    }

    if (!rows.length) return { synced: 0, error: "No VAT details fetched" }

    // Upsert in batches of 500
    let synced = 0
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabaseAdmin.from("sku_vat")
        .upsert(rows.slice(i, i + 500) as Parameters<typeof supabaseAdmin.from>["0"] extends never ? never : any[], { onConflict: "sku_code" })
      if (!error) synced += Math.min(500, rows.length - i)
    }
    return { synced }
  } catch (e: unknown) {
    return { synced: 0, error: String(e) }
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!PM_KEY) {
    return NextResponse.json({ error: "PM_API_KEY chưa được cấu hình trong Vercel env" }, { status: 500 })
  }

  // Optional: ?tables=operators,price_lists,sku_vat để chạy chọn lọc
  const tableParam = req.nextUrl.searchParams.get("tables")
  const targets    = tableParam ? new Set(tableParam.split(",").map(s => s.trim())) : null
  const shouldRun  = (t: string) => !targets || targets.has(t)

  const ts = Date.now()

  const skip = { synced: 0, skipped: true } as { synced: number; error?: string }
  const [operators, priceLists, skuVat] = await Promise.allSettled([
    shouldRun("operators")    ? syncOperators()  : Promise.resolve(skip),
    shouldRun("price_lists")  ? syncPriceLists() : Promise.resolve(skip),
    shouldRun("sku_vat")      ? syncSkuVat()     : Promise.resolve(skip),
  ])

  const result = {
    operators:   operators.status   === "fulfilled" ? operators.value   : { synced: 0, error: String(operators.reason)   },
    price_lists: priceLists.status  === "fulfilled" ? priceLists.value  : { synced: 0, error: String(priceLists.reason)  },
    sku_vat:     skuVat.status      === "fulfilled" ? skuVat.value      : { synced: 0, error: String(skuVat.reason)      },
    elapsed_ms:  Date.now() - ts,
  }

  const ok = !result.operators.error && !result.price_lists.error && !result.sku_vat.error
  console.log(`[sync-pm-data] ok=${ok}`, JSON.stringify(result))
  return NextResponse.json({ ok, result })
}
