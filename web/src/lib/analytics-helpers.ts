import { supabaseAdmin } from "@/lib/supabase"
import { queryAnalytics } from "@/lib/analytics-db"

// ── Server-side query cache (5 phút TTL, per serverless instance) ─────────────
// Giúp tránh query lại gohub_dw khi cùng params được gọi nhiều lần

const _cache = new Map<string, { data: unknown; exp: number }>()
const CACHE_TTL = 5 * 60_000 // 5 minutes

export async function cachedQuery<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = _cache.get(key)
  if (hit && Date.now() < hit.exp) return hit.data as T
  const data = await fn()
  _cache.set(key, { data, exp: Date.now() + CACHE_TTL })
  // Prevent unbounded growth
  if (_cache.size > 200) {
    const now = Date.now()
    for (const [k, v] of _cache) { if (v.exp < now) _cache.delete(k) }
  }
  return data
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
  let filter = sd && ed
    ? `f.${dateColumn}::date BETWEEN '${sd}' AND '${ed}'`
    : `f.${dateColumn}::date >= NOW()::date - INTERVAL '${defaultInterval}'`
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
      const s = new Date(sd)
      const e = new Date(ed)
      const ps = new Date(s.setFullYear(s.getFullYear() - 1)).toISOString().split("T")[0]
      const pe = new Date(e.setFullYear(e.getFullYear() - 1)).toISOString().split("T")[0]
      filter = `f.${dateColumn}::date BETWEEN '${ps}' AND '${pe}'`
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
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "partner_tiers")
      .single()
    if (data?.value) return JSON.parse(data.value)
  } catch {}
  return { Strategic: [] }
}

export async function getStrategicPartnersList(): Promise<string> {
  const tiers = await getPartnerTiers()
  const strategic: string[] = (tiers["Strategic"] || Object.values(tiers).flat()) as string[]
  return strategic.length > 0
    ? strategic.map((c: string) => `'%${c.replace(/'/g, "''").trim()}%'`).join(",")
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

export function getDestinationSQL(rule: DestRule): string {
  return `CASE
    WHEN SUBSTRING(f.sku, 1, 1) BETWEEN '1' AND '6' THEN SUBSTRING(f.sku, 4, 3)
    WHEN SUBSTRING(f.sku, 1, 1) BETWEEN 'A' AND 'E' THEN SUBSTRING(f.sku, 4, 3)
    WHEN SUBSTRING(f.sku, 1, 1) = '${rule.prefix}' THEN SUBSTRING(f.sku, ${rule.offset + 1}, ${rule.codeLength})
    ELSE SUBSTRING(f.sku, 1, 3)
  END`
}

// ── Country code → name mapping (from gohub_dw dim_location) ─────────────────

export async function getCountryMappings(): Promise<Record<string, string>> {
  try {
    const rows = await queryAnalytics<{ code: string; name: string }>(
      `SELECT DISTINCT SUBSTRING(sku, 4, 3) as code,
              MAX(l.location_name) as name
       FROM fact_fulfillment_revenue f
       LEFT JOIN dim_location l ON f.location_id = l.location_id
       WHERE l.location_name IS NOT NULL
       GROUP BY 1 LIMIT 200`
    )
    const map: Record<string, string> = {}
    rows.forEach(r => { if (r.code) map[r.code] = r.name })
    return map
  } catch {
    return {}
  }
}

// ── Day-range helpers (for target/cost pro-rata) ──────────────────────────────

export function getDaysInMonth(monthStr: string): number {
  const [year, month] = monthStr.split("-").map(Number)
  return new Date(year, month, 0).getDate()
}

export function getDaysInRange(startDate: string, endDate: string, monthStr: string): number {
  const [y, m] = monthStr.split("-").map(Number)
  const monthStart = new Date(y, m - 1, 1)
  const monthEnd   = new Date(y, m, 0)
  const start      = new Date(startDate)
  const end        = new Date(endDate)
  const rangeStart = start > monthStart ? start : monthStart
  const rangeEnd   = end   < monthEnd   ? end   : monthEnd
  if (rangeEnd < rangeStart) return 0
  return Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1
}

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

  const actualRows = await queryAnalytics<{ total_actual: string }>(
    `SELECT SUM(fulfilled_revenue_amount_vnd) as total_actual
     FROM fact_fulfillment_revenue f
     WHERE f.fulfiled_date::date BETWEEN $1 AND $2`,
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
