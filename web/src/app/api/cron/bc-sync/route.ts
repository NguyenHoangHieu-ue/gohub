import { NextRequest, NextResponse } from "next/server"
import { isCronReq } from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"
import { alertCronFailure } from "@/lib/cron-alert"
import { sendLarkMessage } from "@/lib/lark"
import {
  bcGetCountries, bcGetProducts, bcGetPrices, bcGetBalance,
  type BCCountry, type BCProduct, type BCPrice,
} from "@/lib/bc-api"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Cron chạy 7h sáng ICT (00:00 UTC): sync F001/F002/F003/F014 về Supabase.
// Gửi Lark nếu có thay đổi (sản phẩm thêm/xóa/đổi, giá thay đổi, số dư thay đổi).

interface SyncChanges {
  products:  { added: string[]; removed: string[]; modified: string[] }
  prices:    { changed: string[] }
  countries: { added: string[]; removed: string[] }
  balance:   { prev: number | null; current: number }
}

async function syncCountries(): Promise<{ added: string[]; removed: string[] }> {
  const res = await bcGetCountries()
  if (res.tradeCode !== "1000" || !res.tradeData) return { added: [], removed: [] }

  const incoming = res.tradeData as BCCountry[]
  const { data: existing } = await supabaseAdmin.from("bc_countries").select("mcc")
  const existingSet = new Set((existing ?? []).map((r: { mcc: string }) => r.mcc))
  const incomingSet = new Set(incoming.map(c => c.mcc))

  const added   = incoming.filter(c => !existingSet.has(c.mcc)).map(c => c.name)
  const removed = (existing ?? [])
    .filter((r: { mcc: string }) => !incomingSet.has(r.mcc))
    .map((r: { mcc: string }) => r.mcc)

  await supabaseAdmin.from("bc_countries").upsert(
    incoming.map(c => ({ mcc: c.mcc, continent: c.continent, name: c.name, url: c.url ?? null, synced_at: new Date().toISOString() })),
    { onConflict: "mcc" },
  )
  return { added, removed }
}

async function syncProducts(): Promise<{ added: string[]; removed: string[]; modified: string[] }> {
  const res = await bcGetProducts()
  if (res.tradeCode !== "1000" || !res.tradeData) return { added: [], removed: [], modified: [] }

  const incoming = res.tradeData as BCProduct[]
  const { data: existing } = await supabaseAdmin.from("bc_products").select("sku_id,name,type,high_flow_size_kb")
  const existingMap = new Map((existing ?? []).map((r: { sku_id: string; name: string; type: string; high_flow_size_kb: string }) => [r.sku_id, r]))
  const incomingMap = new Map(incoming.map(p => [p.skuId, p]))

  const added    = incoming.filter(p => !existingMap.has(p.skuId)).map(p => p.name)
  const removed  = (existing ?? []).filter((r: { sku_id: string }) => !incomingMap.has(r.sku_id)).map((r: { sku_id: string }) => r.sku_id)
  const modified = incoming
    .filter(p => {
      const ex = existingMap.get(p.skuId)
      if (!ex) return false
      return ex.name !== p.name || ex.type !== p.type || ex.high_flow_size_kb !== (p.highFlowSize ?? null)
    })
    .map(p => p.name)

  if (incoming.length > 0) {
    await supabaseAdmin.from("bc_products").upsert(
      incoming.map(p => ({
        sku_id:            p.skuId,
        name:              p.name,
        type:              p.type,
        days:              p.days ?? null,
        capacity_kb:       p.capacity ?? null,
        high_flow_size_kb: p.highFlowSize ?? null,
        limit_flow_speed:  p.limitFlowSpeed ?? null,
        hotspot_support:   p.hotspotSupport ?? null,
        plan_type:         p.planType ?? null,
        validity_period:   p.validityPeroid ?? null,
        description:       p.desc ?? null,
        countries:         p.country ?? null,
        full_data:         p as object,
        synced_at:         new Date().toISOString(),
      })),
      { onConflict: "sku_id" },
    )
  }
  return { added, removed, modified }
}

async function syncPrices(): Promise<{ changed: string[] }> {
  const res = await bcGetPrices()
  if (res.tradeCode !== "1000" || !res.tradeData) return { changed: [] }

  const incoming = res.tradeData as BCPrice[]
  const rows: { sku_id: string; copies: string; retail_price: number; settlement_price: number; synced_at: string }[] = []
  for (const item of incoming) {
    for (const p of item.price ?? []) {
      rows.push({
        sku_id:           item.skuId,
        copies:           p.copies,
        retail_price:     parseFloat(p.retailPrice) || 0,
        settlement_price: parseFloat(p.settlementPrice) || 0,
        synced_at:        new Date().toISOString(),
      })
    }
  }

  const { data: existing } = await supabaseAdmin.from("bc_prices").select("sku_id,copies,settlement_price")
  const existingMap = new Map(
    (existing ?? []).map((r: { sku_id: string; copies: string; settlement_price: number }) =>
      [`${r.sku_id}:${r.copies}`, r.settlement_price],
    ),
  )
  const changed = rows
    .filter(r => {
      const prev = existingMap.get(`${r.sku_id}:${r.copies}`)
      return prev !== undefined && prev !== r.settlement_price
    })
    .map(r => r.sku_id)

  if (rows.length > 0) {
    await supabaseAdmin.from("bc_prices").upsert(rows, { onConflict: "sku_id,copies" })
  }
  return { changed: [...new Set(changed)] }
}

async function syncBalance(): Promise<{ prev: number | null; current: number }> {
  const res = await bcGetBalance()
  const current = parseFloat((res.tradeData as { saleBalance?: string })?.saleBalance ?? "0") || 0

  const { data: last } = await supabaseAdmin
    .from("bc_balance_log")
    .select("balance")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const prev = last ? parseFloat(String(last.balance)) : null

  await supabaseAdmin.from("bc_balance_log").insert({ balance: current, synced_at: new Date().toISOString() })
  return { prev, current }
}

async function notifyLark(changes: SyncChanges) {
  const hasChange =
    changes.products.added.length > 0 || changes.products.removed.length > 0 ||
    changes.products.modified.length > 0 || changes.prices.changed.length > 0 ||
    changes.countries.added.length > 0 || changes.countries.removed.length > 0 ||
    (changes.balance.prev !== null && Math.abs(changes.balance.current - changes.balance.prev) > 0.01)
  if (!hasChange) return

  const { data: cfg } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "lark_notify_chat_id").maybeSingle()
  if (!cfg?.value) return

  const time = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
  const balDiff = changes.balance.prev !== null
    ? ` (${changes.balance.current > changes.balance.prev ? "+" : ""}${(changes.balance.current - changes.balance.prev).toFixed(2)})`
    : ""

  const lines: string[] = [
    `🔄 *BC Datapool Sync* — ${time}`,
  ]
  if (changes.products.added.length)    lines.push(`📦 Sản phẩm MỚI (+${changes.products.added.length}): ${changes.products.added.slice(0, 3).join(", ")}${changes.products.added.length > 3 ? "..." : ""}`)
  if (changes.products.removed.length)  lines.push(`❌ Sản phẩm XÓA (-${changes.products.removed.length})`)
  if (changes.products.modified.length) lines.push(`✏️ Sản phẩm ĐỔI (~${changes.products.modified.length}): ${changes.products.modified.slice(0, 3).join(", ")}${changes.products.modified.length > 3 ? "..." : ""}`)
  if (changes.prices.changed.length)    lines.push(`💰 Giá thay đổi: ${changes.prices.changed.length} SKU`)
  if (changes.countries.added.length)   lines.push(`🌍 Quốc gia MỚI: ${changes.countries.added.join(", ")}`)
  if (changes.countries.removed.length) lines.push(`🌍 Quốc gia XÓA: ${changes.countries.removed.join(", ")}`)
  if (changes.balance.prev !== null)    lines.push(`💳 Số dư: ${changes.balance.current.toFixed(2)}${balDiff}`)

  await sendLarkMessage(cfg.value, "chat_id", lines.join("\n"))
}

export async function GET(req: NextRequest) {
  if (!isCronReq(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const [countries, products, prices, balance] = await Promise.all([
      syncCountries(),
      syncProducts(),
      syncPrices(),
      syncBalance(),
    ])

    const changes: SyncChanges = { products, prices, countries, balance }

    await Promise.all([
      notifyLark(changes),
      supabaseAdmin.from("bc_sync_log").insert({
        changes: changes as object,
        synced_at: new Date().toISOString(),
      }),
    ])

    return NextResponse.json({ ok: true, changes })
  } catch (err) {
    await alertCronFailure("bc-sync", err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
