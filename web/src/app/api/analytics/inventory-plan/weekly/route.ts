import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { canWriteTab } from "@/lib/writable-tabs"
import {
  buildWeekSeries, getWeeklyVelocity, getLatestStock, computePlan, alertLevel, findFirstCriticalWeek, needsOrderSoon,
  type SkuPlanConfig, type WeeklyInputRow,
} from "@/lib/inventory-plan"

const READ_ROLES  = ["admin", "creator", "manager", "staff", "bod", "ops-&-cs"]
const WRITE_ROLES = ["admin", "creator", "manager", "staff"]

async function requireRead() {
  const session = await getServerSession(authOptions)
  if (!session || !READ_ROLES.includes(session.user.role)) throw new Error("Unauthorized")
  return session
}

async function requireWrite() {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error("Unauthorized")
  const ok = await canWriteTab(session.user.username, "fulfillment", WRITE_ROLES)
  if (!ok) throw new Error("Forbidden")
  return session
}

// GET ?company=VN|US&weeks=14 — lưới tuần đã tính sẵn (đầu/cuối tuần, gợi ý bán/nhập, alert) cho mọi SKU
// đang theo dõi của thị trường đó.
export async function GET(req: NextRequest) {
  try {
    await requireRead()
    const company = req.nextUrl.searchParams.get("company") || "VN"
    const weeksForward = Number(req.nextUrl.searchParams.get("weeks")) || 14

    const { data: skus, error: skuErr } = await supabaseAdmin
      .from("inventory_plan_skus")
      .select("*")
      .eq("company_code", company)
      .eq("is_active", true)
      .order("sku_code")
    if (skuErr) return NextResponse.json({ error: skuErr.message }, { status: 500 })
    if (!skus?.length) return NextResponse.json({ weeks: [], skus: [] })

    const skuCodes = skus.map(s => s.sku_code)
    const weeks = buildWeekSeries(2, weeksForward)
    const weekStarts = weeks.map(w => w.weekStart)

    const [{ data: weeklyRows }, velocityMap, liveStockMap] = await Promise.all([
      supabaseAdmin
        .from("inventory_plan_weekly")
        .select("*")
        .in("sku_code", skuCodes)
        .in("week_start_date", weekStarts),
      getWeeklyVelocity(skuCodes),
      getLatestStock(skuCodes),
    ])

    const bySku: Record<string, Record<string, WeeklyInputRow>> = {}
    for (const r of weeklyRows ?? []) {
      (bySku[r.sku_code] ??= {})[r.week_start_date] = {
        week_start_date: r.week_start_date,
        actual_stock: r.actual_stock,
        sales_forecast: r.sales_forecast,
        sales_forecast_auto: r.sales_forecast_auto,
        import_qty: r.import_qty,
        import_qty_auto: r.import_qty_auto,
      }
    }

    const result = skus.map(sku => {
      const cfg: SkuPlanConfig = {
        sku_code: sku.sku_code,
        company_code: sku.company_code,
        target_weeks_coverage: sku.target_weeks_coverage,
        safety_weeks: sku.safety_weeks,
        lead_time_weeks: sku.lead_time_weeks,
      }
      const velocity = velocityMap[sku.sku_code] ?? 0
      const computed = computePlan(cfg, weeks, bySku[sku.sku_code] ?? {}, velocity, liveStockMap[sku.sku_code])
      const thisWeek = computed.find(w => !w.isActual) ?? computed[computed.length - 1]
      const firstCritical = findFirstCriticalWeek(computed, cfg)
      return {
        sku_code: sku.sku_code,
        vendor: sku.vendor,
        target_weeks_coverage: sku.target_weeks_coverage,
        safety_weeks: sku.safety_weeks,
        lead_time_weeks: sku.lead_time_weeks,
        note: sku.note,
        velocity: Math.round(velocity),
        currentStock: thisWeek?.beginStock ?? 0,
        alert: alertLevel(thisWeek?.coverageWeeks ?? null, sku.safety_weeks, sku.target_weeks_coverage),
        needsOrderSoon: needsOrderSoon(firstCritical, cfg),
        firstCriticalWeek: firstCritical,
        weeks: computed,
      }
    })

    return NextResponse.json({ weeks: weeks, skus: result })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}

// POST — batch upsert OPS edit từng ô: [{sku_code, week_start_date, actual_stock?, sales_forecast?, import_qty?}]
// Field nào có mặt trong payload (kể cả null để xoá) → ghi field đó + set *_auto=false tương ứng
// (trừ actual_stock — không có khái niệm "auto" vì chưa có nguồn tự động).
export async function POST(req: NextRequest) {
  try {
    const session = await requireWrite()
    const { updates } = await req.json() as {
      updates: Array<{
        sku_code: string; week_start_date: string
        actual_stock?: number | null; sales_forecast?: number | null; import_qty?: number | null
      }>
    }
    if (!Array.isArray(updates) || !updates.length)
      return NextResponse.json({ error: "updates required" }, { status: 400 })

    const now = new Date().toISOString()
    const email = session.user.name ?? session.user.email ?? ""

    const rows = updates.map(u => {
      const row: Record<string, unknown> = {
        sku_code: u.sku_code,
        week_start_date: u.week_start_date,
        updated_by: email,
        updated_at: now,
      }
      if ("actual_stock" in u) row.actual_stock = u.actual_stock
      if ("sales_forecast" in u) { row.sales_forecast = u.sales_forecast; row.sales_forecast_auto = u.sales_forecast == null }
      if ("import_qty" in u) { row.import_qty = u.import_qty; row.import_qty_auto = u.import_qty == null }
      return row
    })

    const { error } = await supabaseAdmin
      .from("inventory_plan_weekly")
      .upsert(rows, { onConflict: "sku_code,week_start_date" })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
}
