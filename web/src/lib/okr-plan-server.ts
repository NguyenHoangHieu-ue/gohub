// Đọc kế hoạch quý + tự đo + đánh giá (dùng chung route my-metrics/plan và "Đánh giá hôm nay" / Lark DM 8:30 — s227).
import { supabaseAdmin } from "@/lib/supabase"
import { cachedQuery } from "@/lib/analytics-helpers"
import { queryAnalytics } from "@/lib/analytics-db"
import { parseQuarterLabel } from "@/lib/okr-helpers"
import { loadMarketData } from "@/lib/market-data"
import type { MarketData } from "@/lib/market-breakdown"
import { buildMeasureContext, evaluate, measure, newSkuCandidates, type PlanEvaluation, type PlanItem, type PlanKind } from "@/lib/okr-plan"

const MARKET_KINDS: PlanKind[] = ["vendor_share", "market_gm", "market_datapool", "vendor_dependency", "new_markets", "new_skus"]

export async function pendingQuotes(): Promise<number | null> {
  const { count, error } = await supabaseAdmin.from("vendor_quotes").select("id", { count: "exact", head: true }).eq("status", "reviewing")
  return error ? null : count ?? 0
}

export type EvaluatedPlanItem = PlanItem & { eval: PlanEvaluation }

export async function loadPlan(quarter: string, bypass = false): Promise<{
  items: EvaluatedPlanItem[]; start: string; end: string; today: string; market: MarketData | null
}> {
  const { data: rows, error } = await supabaseAdmin
    .from("okr_plan_items").select("*").eq("quarter", quarter).order("sort").order("created_at")
  if (error) {
    const missing = error.code === "42P01" || error.code === "PGRST205" || /okr_plan_items/.test(error.message)
    throw new Error(missing ? "Chưa chạy migration v70_okr_plan_items.sql (Supabase) — chạy xong nhớ Reload schema." : error.message)
  }
  const items = (rows ?? []) as PlanItem[]

  const needMarket = items.some(i => !i.dropped && MARKET_KINDS.includes(i.kind))
  const needQuotes = items.some(i => !i.dropped && i.kind === "quotes_review")
  const [market, quotes] = await Promise.all([
    needMarket ? loadMarketData(quarter, "ALL", bypass).catch(() => null) : Promise.resolve(null),
    needQuotes ? pendingQuotes() : Promise.resolve(null),
  ])
  const ctx = buildMeasureContext(market)

  // "SKU mới" = lần đầu có doanh thu: ứng viên (quý này có, quý trước không) còn phải chưa từng bán trước quý trước.
  let soldBefore = new Set<string>()
  if (ctx && market && items.some(i => !i.dropped && i.kind === "new_skus")) {
    const cand = newSkuCandidates(ctx)
    if (cand.length) {
      const rows = await cachedQuery(`okr_plan_sold_before:v1:${quarter}:${market.cutoff}:${cand.length}`, () =>
        queryAnalytics<{ sku: string }>(
          `SELECT DISTINCT TRIM(sku) AS sku FROM fact_fulfillment_revenue
           WHERE TRIM(sku) = ANY($1::text[]) AND fulfiled_date::date < $2::date AND fulfilled_revenue_amount_vnd > 0`,
          [cand, market.prevStart]), 720).catch(() => [] as { sku: string }[])
      soldBefore = new Set(rows.map(r => r.sku))
    }
  }

  const { start, end } = parseQuarterLabel(quarter)
  const today = market?.cutoff ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  return { start, end, today, market, items: items.map(i => ({ ...i, eval: evaluate(i, measure(i, ctx, quotes, soldBefore), start, end, today) })) }
}
