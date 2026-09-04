import { cachedAnalyticsQuery } from "@/lib/analytics-helpers"

// Logic dùng chung cho tab Inventory (kế hoạch nhập hàng theo tuần) — xem docs/wiki/system/tabs/analytics-fulfillment.md.
// Gợi ý "Số bán dự kiến"/"Số nhập" tính từ tốc độ bán 30 ngày gần nhất (gohub_dw) + rule reorder-to-target
// đơn giản: khi tồn dự phóng rớt dưới safety_weeks×velocity → gợi ý nhập đủ lên target_weeks_coverage×velocity.
// OPS ghi đè (sales_forecast/import_qty có giá trị trong inventory_plan_weekly) thì giữ nguyên, không bị
// auto-suggest tính lại đè lên — field *_auto=false đánh dấu ô đã bị ghi đè tay.

export interface SkuPlanConfig {
  sku_code: string
  company_code: string
  target_weeks_coverage: number
  safety_weeks: number
  lead_time_weeks: number
}

export interface WeeklyInputRow {
  week_start_date: string   // YYYY-MM-DD
  actual_stock: number | null
  sales_forecast: number | null
  sales_forecast_auto: boolean
  import_qty: number | null
  import_qty_auto: boolean
}

export interface WeekMeta {
  weekStart: string   // YYYY-MM-DD (thứ Hai)
  isActual: boolean   // tuần đã qua/hiện tại (có thể có actual_stock thật) hay tương lai (forecast)
}

export interface ComputedWeek extends WeekMeta {
  beginStock: number
  actualStock: number | null
  salesForecast: number
  salesForecastAuto: boolean
  importQty: number
  importQtyAuto: boolean
  suggestedImport: number
  endStock: number
  coverageWeeks: number | null   // beginStock / velocity, null nếu velocity=0
}

export type AlertLevel = "critical" | "warning" | "ok" | "none"

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Thứ Hai của tuần chứa ngày d (UTC-safe, không lệch múi giờ).
export function mondayOf(d: Date): Date {
  const day = d.getUTCDay() // 0=CN..6=T7
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  m.setUTCDate(m.getUTCDate() + diff)
  return m
}

// Chuỗi tuần cố định: weeksBack tuần gần nhất (context, coi là "Actual") + weeksForward tuần tới (Forecast).
export function buildWeekSeries(weeksBack = 2, weeksForward = 14, anchor = new Date()): WeekMeta[] {
  const thisMonday = mondayOf(anchor)
  const out: WeekMeta[] = []
  for (let i = -weeksBack; i < weeksForward; i++) {
    const d = new Date(thisMonday)
    d.setUTCDate(d.getUTCDate() + i * 7)
    out.push({ weekStart: toYmd(d), isActual: i < 0 })
  }
  return out
}

// Tốc độ bán trung bình/tuần (30 ngày gần nhất, gohub_dw) cho danh sách SKU. Cache 12h (dữ liệu chỉ đổi 1 lần/ngày).
export async function getWeeklyVelocity(skuCodes: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (!skuCodes.length) return out
  const skuList = skuCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(",")
  try {
    const rows = await cachedAnalyticsQuery<{ sku: string; qty30d: string }>(`
      SELECT TRIM(sku) AS sku, SUM(fulfilled_quantity) AS qty30d
      FROM fact_fulfillment_revenue
      WHERE TRIM(sku) IN (${skuList})
        AND fulfiled_date IS NOT NULL
        AND fulfiled_date::date >= CURRENT_DATE - 30
        AND fulfiled_date::date <= CURRENT_DATE - 1
      GROUP BY TRIM(sku)
    `)
    for (const r of rows) out[r.sku] = (Number(r.qty30d) || 0) / 30 * 7
  } catch {}
  return out
}

export function alertLevel(coverageWeeks: number | null, safetyWeeks: number, targetWeeks: number): AlertLevel {
  if (coverageWeeks == null) return "none"
  if (coverageWeeks < safetyWeeks) return "critical"
  if (coverageWeeks < targetWeeks) return "warning"
  return "ok"
}

// Roll forward theo tuần: đầu tuần = cuối tuần trước (hoặc actual_stock nếu tuần đó có nhập tay).
// Số bán/Số nhập dùng giá trị OPS đã ghi đè nếu có, ngược lại dùng gợi ý auto.
export function computePlan(
  cfg: SkuPlanConfig,
  weeks: WeekMeta[],
  inputBySku: Record<string, WeeklyInputRow>,
  velocity: number,
): ComputedWeek[] {
  const out: ComputedWeek[] = []
  let begin = 0
  let haveActual = false
  for (const w of weeks) {
    const row = inputBySku[w.weekStart]
    const actual = row?.actual_stock ?? null
    if (actual != null) { begin = actual; haveActual = true }
    else if (!haveActual) { begin = 0 }
    // else: begin giữ nguyên = endStock tuần trước (gán ở cuối vòng lặp)

    const salesForecastAuto = row?.sales_forecast_auto !== false
    const salesForecast = row?.sales_forecast != null ? row.sales_forecast : Math.round(velocity)

    const projBeforeImport = begin - salesForecast
    const coverageWeeks = velocity > 0 ? begin / velocity : null
    const suggestedImport = projBeforeImport < cfg.safety_weeks * velocity
      ? Math.max(0, Math.round(cfg.target_weeks_coverage * velocity - projBeforeImport))
      : 0

    const importQtyAuto = row?.import_qty_auto !== false
    const importQty = row?.import_qty != null ? row.import_qty : suggestedImport

    const endStock = projBeforeImport + importQty

    out.push({
      ...w,
      beginStock: begin,
      actualStock: actual,
      salesForecast,
      salesForecastAuto,
      importQty,
      importQtyAuto,
      suggestedImport,
      endStock,
      coverageWeeks,
    })

    begin = endStock
  }
  return out
}

// Tuần đầu tiên coverage rơi vào mức critical, để cảnh báo "cần đặt PO trong lead_time_weeks tới".
export function findFirstCriticalWeek(computed: ComputedWeek[], cfg: SkuPlanConfig): string | null {
  for (const w of computed) {
    if (alertLevel(w.coverageWeeks, cfg.safety_weeks, cfg.target_weeks_coverage) === "critical") return w.weekStart
  }
  return null
}

export function needsOrderSoon(firstCriticalWeek: string | null, cfg: SkuPlanConfig, today = new Date()): boolean {
  if (!firstCriticalWeek) return false
  const weekMs = 7 * 86400_000
  const deadline = new Date(mondayOf(today).getTime() + cfg.lead_time_weeks * weekMs)
  return new Date(firstCriticalWeek + "T00:00:00Z").getTime() <= deadline.getTime()
}
