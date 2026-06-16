import { supabaseAdmin } from "@/lib/supabase"
import { queryAnalytics } from "@/lib/analytics-db"

// ── Date helpers ──────────────────────────────────────────────────────────────

export function getDateFilter(
  startDate: string | null,
  endDate:   string | null,
  dateColumn = "fulfiled_date",
  defaultInterval = "30 days",
  companyCode?: string
): string {
  let filter = startDate && endDate
    ? `f.${dateColumn}::date BETWEEN '${startDate}' AND '${endDate}'`
    : `f.${dateColumn}::date >= NOW()::date - INTERVAL '${defaultInterval}'`
  if (companyCode && companyCode !== "ALL" && companyCode !== "undefined") {
    filter += ` AND f.company_code = '${companyCode}'`
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
  if (startDate && endDate) {
    if (comparisonType === "previous_year") {
      const s = new Date(startDate)
      const e = new Date(endDate)
      const ps = new Date(s.setFullYear(s.getFullYear() - 1)).toISOString().split("T")[0]
      const pe = new Date(e.setFullYear(e.getFullYear() - 1)).toISOString().split("T")[0]
      filter = `f.${dateColumn}::date BETWEEN '${ps}' AND '${pe}'`
    } else {
      filter = `f.${dateColumn}::date >= '${startDate}'::date - (('${endDate}'::date - '${startDate}'::date) + 1) AND f.${dateColumn}::date < '${startDate}'::date`
    }
  } else {
    const days = parseInt(defaultInterval)
    filter = `f.${dateColumn}::date >= NOW()::date - INTERVAL '${days * 2} days' AND f.${dateColumn}::date < NOW()::date - INTERVAL '${days} days'`
  }
  if (companyCode && companyCode !== "ALL" && companyCode !== "undefined") {
    filter += ` AND f.company_code = '${companyCode}'`
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
      .from("target_planning")
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
