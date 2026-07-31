import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { chatwootConfigured, chatwootLeadsBreakdown } from "@/lib/chatwoot"
import { omniConfigured, omniLeadsBreakdown } from "@/lib/omni-leads"
import { adminGohubConfigured, adminGohubCustomerMonthSnapshot } from "@/lib/admin-gohub"
import { tursoLeadsBreakdown, tursoLeadsConfigured } from "@/lib/turso-leads"
import { getB2CChannelBudgetByMonth } from "@/lib/b2c-channel-budget"

export interface MarketCell { vn: number; us: number; total: number }
export interface CustCell { revenue: number; count: number }
export interface CustRow { new: CustCell; returning: CustCell; total: CustCell }
export interface ChannelCell { web: number; app: number; other: number }
export interface MarketChannelCell { vnSales: number; vnWeb: number; usSales: number; usApp: number; usWeb: number }
export interface CustomerChannelCell { vnB2c: CustRow; vnWeb: CustRow; usB2c: CustRow; usWeb: CustRow; usApp: CustRow }
export interface ProfitCell { revenue: number; cogs: number; grossProfit: number; opCost: number; cm1: number }
export interface B2CMonthPayload {
  market: MarketCell
  customers: CustRow
  customerChannels?: CustomerChannelCell
  channels: ChannelCell
  marketChannels?: MarketChannelCell
  profitByChannel?: Record<string, ProfitCell>
  spend: number
  budget: number
  leads: number
  leadsByChannel: { label: string; value: number }[]
}

export interface B2CSnapshotRow {
  month: string
  payload: B2CMonthPayload
  source_status: Record<string, unknown>
  refresh_status: string
  error_message?: string | null
  refreshed_at: string
}

type SourceStatus = Record<string, Record<string, unknown>>
type CostValue = { type?: string; value?: number }

const PROFIT_COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

function parseCostValue(value: unknown): CostValue {
  if (!value) return { type: "amount", value: 0 }
  if (typeof value === "object") return value as CostValue
  try { return JSON.parse(String(value)) as CostValue } catch { return { type: "amount", value: 0 } }
}

function costAmount(value: CostValue, revenue: number, ratio: number): number {
  const n = Number(value?.value) || 0
  if (!n) return 0
  return value?.type === "percent" ? revenue * n / 100 : n * ratio
}

function emptyCustCell(): CustCell {
  return { revenue: 0, count: 0 }
}

function emptyCustRow(): CustRow {
  return {
    new: emptyCustCell(),
    returning: emptyCustCell(),
    total: emptyCustCell(),
  }
}

function emptyCustomerChannelCell(): CustomerChannelCell {
  return {
    vnB2c: emptyCustRow(),
    vnWeb: emptyCustRow(),
    usB2c: emptyCustRow(),
    usWeb: emptyCustRow(),
    usApp: emptyCustRow(),
  }
}

function emptyPayload(): B2CMonthPayload {
  return {
    market: { vn: 0, us: 0, total: 0 },
    customers: {
      new: { revenue: 0, count: 0 },
      returning: { revenue: 0, count: 0 },
      total: { revenue: 0, count: 0 },
    },
    customerChannels: emptyCustomerChannelCell(),
    channels: { web: 0, app: 0, other: 0 },
    marketChannels: { vnSales: 0, vnWeb: 0, usSales: 0, usApp: 0, usWeb: 0 },
    profitByChannel: {},
    spend: 0,
    budget: 0,
    leads: 0,
    leadsByChannel: [],
  }
}

export function monthsYtd(now = new Date()): string[] {
  const months: string[] = []
  for (let i = 0; i <= now.getMonth(); i++) {
    months.push(`${now.getFullYear()}-${String(i + 1).padStart(2, "0")}`)
  }
  return months
}

export async function readB2CMonthlySnapshots(months: string[]): Promise<B2CSnapshotRow[]> {
  if (months.length === 0) return []
  const { data, error } = await supabaseAdmin
    .from("b2c_report_monthly_snapshots")
    .select("month,payload,source_status,refresh_status,error_message,refreshed_at")
    .in("month", months)
    .order("month", { ascending: true })
  if (error) throw error
  return (data ?? []) as B2CSnapshotRow[]
}

export function snapshotsToMonthlyResponse(snapshots: B2CSnapshotRow[], months: string[]) {
  const byMonth = new Map(snapshots.map(row => [row.month, row]))
  const markets: Record<string, MarketCell> = {}
  const customers: Record<string, CustRow> = {}
  const customerChannels: Record<string, CustomerChannelCell> = {}
  const channels: Record<string, ChannelCell> = {}
  const marketChannels: Record<string, MarketChannelCell> = {}
  const profitByChannel: Record<string, Record<string, ProfitCell>> = {}
  const spend: Record<string, number> = {}
  const budget: Record<string, number> = {}
  const leads: Record<string, number> = {}
  const channelLabels = new Set<string>()

  for (const month of months) {
    const payload = byMonth.get(month)?.payload ?? emptyPayload()
    markets[month] = payload.market
    customers[month] = payload.customers
    customerChannels[month] = payload.customerChannels ?? emptyCustomerChannelCell()
    channels[month] = payload.channels
    marketChannels[month] = payload.marketChannels ?? { vnSales: 0, vnWeb: 0, usSales: 0, usApp: 0, usWeb: 0 }
    profitByChannel[month] = payload.profitByChannel ?? {}
    spend[month] = payload.spend
    budget[month] = payload.budget
    leads[month] = payload.leads
    for (const c of payload.leadsByChannel ?? []) channelLabels.add(c.label)
  }

  const leadsByChannel = Array.from(channelLabels).map(label => ({
    label,
    byMonth: Object.fromEntries(months.map(month => [
      month,
      byMonth.get(month)?.payload.leadsByChannel?.find(c => c.label === label)?.value ?? 0,
    ])) as Record<string, number>,
  }))

  return {
    markets,
    customers,
    customerChannels,
    channels,
    marketChannels,
    profitByChannel,
    spend,
    budget,
    leads,
    leadsByChannel,
    snapshotStatus: snapshots.map(row => ({
      month: row.month,
      refreshStatus: row.refresh_status,
      refreshedAt: row.refreshed_at,
      sourceStatus: row.source_status,
      errorMessage: row.error_message,
    })),
  }
}

async function loadRevenue(months: string[]) {
  const windowStart = `${months[0]}-01`
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const elapsedDays = now.getDate()
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const [marketRows, channelRows, marketChannelRows, profitRows] = await Promise.all([
    queryAnalytics<{ month: string; market: string; revenue: string }>(
      `SELECT to_char(f.fulfiled_date::date, 'YYYY-MM') AS month,
              COALESCE(f.company_code, 'NA')           AS market,
              SUM(f.fulfilled_revenue_amount_vnd)      AS revenue
       FROM fact_fulfillment_revenue f
       JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE UPPER(s.group_name) = 'B2C'
         AND f.fulfiled_date::date >= $1
       GROUP BY 1, 2`,
      [windowStart],
    ),
    queryAnalytics<{ month: string; ctype: string; revenue: string }>(
      `SELECT to_char(f.fulfiled_date::date, 'YYYY-MM') AS month,
              CASE WHEN s.sub_group_name = 'Websites'   THEN 'web'
                   WHEN s.sub_group_name = 'Mobile-App' THEN 'app'
                   ELSE 'other' END                     AS ctype,
              SUM(f.fulfilled_revenue_amount_vnd)       AS revenue
       FROM fact_fulfillment_revenue f
       JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE UPPER(s.group_name) = 'B2C'
         AND f.fulfiled_date::date >= $1
       GROUP BY 1, 2`,
      [windowStart],
    ),
    queryAnalytics<{ month: string; market: string; ctype: string; revenue: string }>(
      `SELECT to_char(f.fulfiled_date::date, 'YYYY-MM') AS month,
              COALESCE(f.company_code, 'NA')            AS market,
              CASE WHEN s.sub_group_name = 'Websites'   THEN 'web'
                   WHEN s.sub_group_name = 'Mobile-App' THEN 'app'
                   ELSE 'sales' END                     AS ctype,
              SUM(f.fulfilled_revenue_amount_vnd)       AS revenue
       FROM fact_fulfillment_revenue f
       JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE UPPER(s.group_name) = 'B2C'
         AND f.fulfiled_date::date >= $1
       GROUP BY 1, 2, 3`,
      [windowStart],
    ),
    queryAnalytics<{ month: string; channel: string; revenue: string; cogs: string; gross_profit: string }>(
      `SELECT to_char(f.fulfiled_date::date, 'YYYY-MM')          AS month,
              COALESCE(NULLIF(TRIM(s.channel_name), ''), 'Khác') AS channel,
              SUM(COALESCE(f.fulfilled_revenue_amount_vnd, 0))   AS revenue,
              SUM(COALESCE(f.cogs_amount_vnd, 0))                AS cogs,
              SUM(COALESCE(f.gross_profit_vnd, COALESCE(f.fulfilled_revenue_amount_vnd, 0) - COALESCE(f.cogs_amount_vnd, 0), 0)) AS gross_profit
       FROM fact_fulfillment_revenue f
       JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE UPPER(s.group_name) = 'B2C'
         AND f.fulfiled_date::date >= $1
       GROUP BY 1, 2`,
      [windowStart],
    ),
  ])

  const payloads: Record<string, Pick<B2CMonthPayload, "market" | "channels" | "marketChannels" | "profitByChannel">> = {}
  for (const month of months) payloads[month] = {
    market: { vn: 0, us: 0, total: 0 },
    channels: { web: 0, app: 0, other: 0 },
    marketChannels: { vnSales: 0, vnWeb: 0, usSales: 0, usApp: 0, usWeb: 0 },
    profitByChannel: {},
  }

  for (const r of marketRows) {
    const cell = payloads[r.month]?.market
    if (!cell) continue
    const rev = parseFloat(r.revenue || "0")
    if (r.market === "VN") cell.vn += rev
    else if (r.market === "US") cell.us += rev
    cell.total += rev
  }
  for (const r of channelRows) {
    const cell = payloads[r.month]?.channels
    if (!cell) continue
    const rev = parseFloat(r.revenue || "0")
    if (r.ctype === "web") cell.web += rev
    else if (r.ctype === "app") cell.app += rev
    else cell.other += rev
  }
  for (const r of marketChannelRows) {
    const cell = payloads[r.month]?.marketChannels
    if (!cell) continue
    const rev = parseFloat(r.revenue || "0")
    if (r.market === "VN") {
      if (r.ctype === "web") cell.vnWeb += rev
      else cell.vnSales += rev
    } else if (r.market === "US") {
      if (r.ctype === "web") cell.usWeb += rev
      else if (r.ctype === "app") cell.usApp += rev
      else cell.usSales += rev
    }
  }
  for (const r of profitRows) {
    const profit = payloads[r.month]?.profitByChannel
    if (!profit) continue
    const revenue = parseFloat(r.revenue || "0")
    const cogs = parseFloat(r.cogs || "0")
    const grossProfit = parseFloat(r.gross_profit || "0")
    profit[r.channel || "Khác"] = { revenue, cogs, grossProfit, opCost: 0, cm1: grossProfit }
  }

  try {
    const { data: costRows, error } = await supabaseAdmin
      .from("analytics_channel_costs")
      .select("channel, month, ads, platform_fee, sponsor_products, media")
      .in("month", months)
    if (error) throw new Error(error.message)
    for (const row of costRows ?? []) {
      const month = String(row.month)
      const channel = String(row.channel || "Khác")
      const profit = payloads[month]?.profitByChannel
      if (!profit) continue
      const cell = profit[channel] ?? { revenue: 0, cogs: 0, grossProfit: 0, opCost: 0, cm1: 0 }
      const ratio = month === currentMonth ? elapsedDays / totalDays : 1
      const costs = {
        ads: parseCostValue(row.ads),
        platformFee: parseCostValue(row.platform_fee),
        sponsorProducts: parseCostValue(row.sponsor_products),
        media: parseCostValue(row.media),
      }
      cell.opCost += PROFIT_COST_KEYS.reduce((sum, key) => sum + costAmount(costs[key], cell.revenue, ratio), 0)
      cell.cm1 = cell.grossProfit - cell.opCost
      profit[channel] = cell
    }
  } catch (e) {
    console.error("[b2c/snapshot] profit channel costs", (e as Error).message)
  }

  return payloads
}

async function loadCustomerChannels(months: string[]) {
  const windowStart = `${months[0]}-01`
  const rows = await queryAnalytics<{ month: string; bucket: keyof CustomerChannelCell; type: string; revenue: string; count: string }>(
    `WITH first_order AS (
       SELECT f.customer_code,
              MIN(to_char(f.fulfiled_date::date, 'YYYY-MM')) AS first_month
       FROM fact_fulfillment_revenue f
       JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE UPPER(s.group_name) = 'B2C'
         AND f.customer_code IS NOT NULL
       GROUP BY 1
     ),
     monthly_channel AS (
       SELECT to_char(f.fulfiled_date::date, 'YYYY-MM') AS month,
              f.customer_code,
              COALESCE(f.company_code, 'NA')            AS market,
              CASE WHEN s.sub_group_name = 'Websites'   THEN 'web'
                   WHEN s.sub_group_name = 'Mobile-App' THEN 'app'
                   ELSE 'other' END                     AS ctype,
              SUM(f.fulfilled_revenue_amount_vnd)       AS revenue
       FROM fact_fulfillment_revenue f
       JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE UPPER(s.group_name) = 'B2C'
         AND f.fulfiled_date::date >= $1
         AND f.customer_code IS NOT NULL
       GROUP BY 1, 2, 3, 4
     ),
     typed AS (
       SELECT m.*,
              CASE WHEN m.month = fo.first_month THEN 'new' ELSE 'returning' END AS type
       FROM monthly_channel m
       JOIN first_order fo ON m.customer_code = fo.customer_code
     )
     SELECT month, bucket, type, SUM(revenue) AS revenue, COUNT(DISTINCT customer_code) AS count
     FROM (
       SELECT month, 'vnB2c'::text AS bucket, type, customer_code, revenue FROM typed WHERE market = 'VN' AND ctype = 'web'
       UNION ALL
       SELECT month, 'vnWeb'::text AS bucket, type, customer_code, revenue FROM typed WHERE market = 'VN' AND ctype = 'web'
       UNION ALL
       SELECT month, 'usB2c'::text AS bucket, type, customer_code, revenue FROM typed WHERE market = 'US' AND ctype IN ('web', 'app')
       UNION ALL
       SELECT month, 'usWeb'::text AS bucket, type, customer_code, revenue FROM typed WHERE market = 'US' AND ctype = 'web'
       UNION ALL
       SELECT month, 'usApp'::text AS bucket, type, customer_code, revenue FROM typed WHERE market = 'US' AND ctype = 'app'
     ) buckets
     GROUP BY 1, 2, 3`,
    [windowStart],
  )

  const payloads: Record<string, CustomerChannelCell> = {}
  for (const month of months) payloads[month] = emptyCustomerChannelCell()
  for (const r of rows) {
    const monthCell = payloads[r.month]
    if (!monthCell) continue
    const bucket = monthCell[r.bucket]
    if (!bucket) continue
    const target = r.type === "new" ? bucket.new : bucket.returning
    const revenue = parseFloat(r.revenue || "0")
    const count = parseInt(r.count || "0")
    target.revenue += revenue
    target.count += count
    bucket.total.revenue += revenue
    bucket.total.count += count
  }
  return payloads
}

async function loadMarketing(months: string[]) {
  const spend: Record<string, number> = Object.fromEntries(months.map(m => [m, 0])) as Record<string, number>
  const budget = await getB2CChannelBudgetByMonth(months)

  const { data: costRows } = await supabaseAdmin
    .from("analytics_channel_group_costs")
    .select("month, amount")
    .eq("group_name", "B2C")
    .gte("month", months[0])
  for (const r of costRows ?? []) {
    if (spend[r.month] !== undefined) spend[r.month] += Number(r.amount) || 0
  }

  return { spend, budget }
}

async function loadLeads(months: string[]) {
  if (tursoLeadsConfigured()) return tursoLeadsBreakdown(months)
  if (omniConfigured()) return omniLeadsBreakdown(months)
  if (!chatwootConfigured()) return { total: Object.fromEntries(months.map(m => [m, 0])) as Record<string, number>, channels: [] as { label: string; byMonth: Record<string, number> }[] }
  return chatwootLeadsBreakdown(months)
}

export async function refreshB2CMonthlySnapshots(months: string[]) {
  if (months.length === 0) return { refreshed: 0, months: [] as string[] }
  const refreshedAt = new Date().toISOString()
  const [revenue, customerChannels, marketing, leads] = await Promise.all([
    loadRevenue(months),
    loadCustomerChannels(months),
    loadMarketing(months),
    loadLeads(months),
  ])

  const rows = []
  for (const month of months) {
    const payload = emptyPayload()
    const leadSource = tursoLeadsConfigured() ? "turso" : omniConfigured() ? "omni" : chatwootConfigured() ? "chatwoot" : "none"
    const sourceStatus: SourceStatus = {
      analytics_db: { status: "success", refreshed_at: refreshedAt },
      marketing: { status: "success", refreshed_at: refreshedAt },
      leads: { status: leadSource === "none" ? "not_configured" : "success", source: leadSource, refreshed_at: refreshedAt },
      admin_gohub: { status: adminGohubConfigured() ? "pending" : "not_configured", refreshed_at: refreshedAt },
    }
    let refreshStatus = "success"
    let errorMessage: string | null = null

    payload.market = revenue[month]?.market ?? payload.market
    payload.customerChannels = customerChannels[month] ?? payload.customerChannels
    payload.channels = revenue[month]?.channels ?? payload.channels
    payload.marketChannels = revenue[month]?.marketChannels ?? payload.marketChannels
    payload.profitByChannel = revenue[month]?.profitByChannel ?? payload.profitByChannel
    payload.spend = marketing.spend[month] ?? 0
    payload.budget = marketing.budget[month] ?? 0
    payload.leads = leads.total[month] ?? 0
    payload.leadsByChannel = leads.channels.map(c => ({ label: c.label, value: c.byMonth[month] ?? 0 }))

    if (adminGohubConfigured()) {
      try {
        const customer = await adminGohubCustomerMonthSnapshot(month)
        for (const r of customer.rows) {
          const target = r.type === "new" ? payload.customers.new : payload.customers.returning
          target.revenue += parseFloat(r.revenue || "0")
          target.count += parseInt(r.count || "0")
        }
        payload.customers.total.revenue = payload.customers.new.revenue + payload.customers.returning.revenue
        payload.customers.total.count = payload.customers.new.count + payload.customers.returning.count
        sourceStatus.admin_gohub = {
          status: "success",
          refreshed_at: refreshedAt,
          pages_fetched: customer.pagesFetched,
          records_fetched: customer.recordsFetched,
          total_pages: customer.totalPages,
          total_records: customer.totalRecords,
        }
      } catch (err) {
        refreshStatus = "partial"
        errorMessage = (err as Error).message
        sourceStatus.admin_gohub = { status: "error", refreshed_at: refreshedAt, error: errorMessage }
      }
    }

    rows.push({
      month,
      payload,
      source_status: sourceStatus,
      refresh_status: refreshStatus,
      error_message: errorMessage,
      refreshed_at: refreshedAt,
    })
  }

  const { error } = await supabaseAdmin
    .from("b2c_report_monthly_snapshots")
    .upsert(rows, { onConflict: "month" })
  if (error) throw error

  return { refreshed: rows.length, months, refreshedAt }
}
