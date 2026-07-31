// Admin GoHub Internal API — source for B2C customer metrics.
// Env: ADMIN_GOHUB_API_BASE_URL, ADMIN_GOHUB_API_KEY, ADMIN_GOHUB_API_SECRET.

const BASE = (process.env.ADMIN_GOHUB_API_BASE_URL || "").replace(/\/$/, "")
const KEY = process.env.ADMIN_GOHUB_API_KEY || ""
const SECRET = process.env.ADMIN_GOHUB_API_SECRET || ""

interface RevenueBucket {
  currency: string
  revenue: number
}

interface CustomerRevenueItem {
  customerId: string
  userType?: string
  revenueByCurrency?: RevenueBucket[]
}

interface CustomerRevenueResponse {
  success: boolean
  data?: {
    items?: CustomerRevenueItem[]
    summary?: {
      customerCount?: number
      byCurrency?: Array<{
        currency: string
        totalRevenue: number
        customerCount: number
        totalOrders: number
      }>
      byUserType?: Partial<Record<"new" | "returning", {
        customerCount?: number
        totalOrders?: number
        byCurrency?: Array<{
          currency: string
          totalRevenue: number
          customerCount: number
          totalOrders: number
        }>
      }>>
    }
  }
  pagination?: {
    page: number
    limit: number
    total: number
    pages?: number
    totalPages?: number
    hasNextPage?: boolean
  }
  error?: { message?: string; code?: string }
  message?: string
}

export interface AdminCustomerRow {
  month: string
  type: "new" | "returning" | "total"
  revenue: string
  count: string
}

export type AdminCustomerChannelBucket = "vnB2c" | "vnWeb" | "usB2c" | "usWeb" | "usApp"

export interface AdminCustomerChannelRow {
  month: string
  bucket: AdminCustomerChannelBucket
  type: "new" | "returning"
  revenue: string
  count: string
}

export interface AdminCustomerMonthSnapshot {
  month: string
  rows: AdminCustomerRow[]
  pagesFetched: number
  recordsFetched: number
  totalPages: number
  totalRecords: number
}

export function adminGohubConfigured(): boolean {
  return !!(BASE && KEY && SECRET)
}

function monthRange(month: string): { dateFrom: string; dateTo: string } {
  const [year, monthIndex] = month.split("-").map(Number)
  const start = new Date(Date.UTC(year, monthIndex - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0) - 1)
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() }
}

export function revenueToVnd(buckets: RevenueBucket[] = []): number {
  const usdRate = Number(process.env.ADMIN_GOHUB_USD_TO_VND || "25000")
  return buckets.reduce((sum, b) => {
    const currency = String(b.currency || "").toUpperCase()
    const revenue = Number(b.revenue) || 0
    if (currency === "VND") return sum + revenue
    if (currency === "USD") return sum + revenue * usdRate
    return sum
  }, 0)
}

function summaryRevenueToVnd(buckets: Array<{ currency: string; totalRevenue: number }> = []): number {
  return revenueToVnd(buckets.map(bucket => ({ currency: bucket.currency, revenue: bucket.totalRevenue })))
}

async function fetchCustomerPage(month: string, page: number, extraParams: Record<string, string> = {}): Promise<CustomerRevenueResponse> {
  const { dateFrom, dateTo } = monthRange(month)
  const url = new URL(`${BASE}/v1/internal/customers/revenue`)
  url.searchParams.set("page", String(page))
  url.searchParams.set("limit", "100")
  url.searchParams.set("sortBy", "revenue")
  url.searchParams.set("sortOrder", "desc")
  url.searchParams.set("dateFrom", dateFrom)
  url.searchParams.set("dateTo", dateTo)
  for (const [key, value] of Object.entries(extraParams)) {
    if (value) url.searchParams.set(key, value)
  }

  const res = await fetch(url, {
    headers: {
      "X-API-Key": KEY,
      "X-API-Secret": SECRET,
      "X-API-Secrect": SECRET,
    },
  })
  const body = await res.json().catch(() => null) as CustomerRevenueResponse | null
  if (!res.ok || !body?.success) {
    const message = body?.error?.message || body?.message || `Admin GoHub customers ${res.status}`
    throw new Error(message)
  }
  return body
}

function tenantList(envKey: string, fallback: string): string[] {
  return String(process.env[envKey] || fallback)
    .split(",")
    .map(v => v.trim())
    .filter(Boolean)
}

function emptyBucketRows(month: string, bucket: AdminCustomerChannelBucket): AdminCustomerChannelRow[] {
  return [
    { month, bucket, type: "new", revenue: "0", count: "0" },
    { month, bucket, type: "returning", revenue: "0", count: "0" },
  ]
}

async function customerRowsForTenants(month: string, bucket: AdminCustomerChannelBucket, tenants: string[]): Promise<AdminCustomerChannelRow[]> {
  if (tenants.length === 0) return emptyBucketRows(month, bucket)

  const sums = {
    new: { revenue: 0, count: 0 },
    returning: { revenue: 0, count: 0 },
  }

  for (const tenantId of tenants) {
    const response = await fetchCustomerPage(month, 1, { tenantId })
    const byUserType = response.data?.summary?.byUserType
    sums.new.revenue += summaryRevenueToVnd(byUserType?.new?.byCurrency ?? [])
    sums.new.count += Number(byUserType?.new?.customerCount ?? 0)
    sums.returning.revenue += summaryRevenueToVnd(byUserType?.returning?.byCurrency ?? [])
    sums.returning.count += Number(byUserType?.returning?.customerCount ?? 0)
  }

  return [
    { month, bucket, type: "new", revenue: String(sums.new.revenue), count: String(sums.new.count) },
    { month, bucket, type: "returning", revenue: String(sums.returning.revenue), count: String(sums.returning.count) },
  ]
}

function normalizeUserType(type: unknown): "new" | "returning" {
  const value = String(type ?? "").toLowerCase()
  if (value.includes("new")) return "new"
  return "returning"
}

function pageCount(response: CustomerRevenueResponse): number {
  return Number(response.pagination?.pages ?? response.pagination?.totalPages ?? 1) || 1
}

export async function adminGohubCustomerMonthSnapshot(month: string): Promise<AdminCustomerMonthSnapshot> {
  if (!adminGohubConfigured()) {
    throw new Error("Admin GoHub API chưa được cấu hình")
  }

  const buckets: Record<"new" | "returning", { revenue: number; count: number }> = {
    new: { revenue: 0, count: 0 },
    returning: { revenue: 0, count: 0 },
  }

  const first = await fetchCustomerPage(month, 1)
  const totalPages = pageCount(first)
  const totalRecords = Number(first.pagination?.total ?? first.data?.summary?.customerCount ?? 0)
  const byUserType = first.data?.summary?.byUserType

  if (byUserType?.new || byUserType?.returning) {
    const newBucket = byUserType.new
    const returningBucket = byUserType.returning
    return {
      month,
      rows: [
        {
          month,
          type: "new",
          revenue: String(summaryRevenueToVnd(newBucket?.byCurrency ?? [])),
          count: String(Number(newBucket?.customerCount ?? 0)),
        },
        {
          month,
          type: "returning",
          revenue: String(summaryRevenueToVnd(returningBucket?.byCurrency ?? [])),
          count: String(Number(returningBucket?.customerCount ?? 0)),
        },
      ],
      pagesFetched: 1,
      recordsFetched: Number(newBucket?.customerCount ?? 0) + Number(returningBucket?.customerCount ?? 0),
      totalPages,
      totalRecords,
    }
  }

  const maxPages = Number(process.env.ADMIN_GOHUB_CUSTOMER_MAX_PAGES_PER_MONTH || "30")

  if (totalPages > maxPages) {
    throw new Error(`Admin GoHub customer ${month} cần ${totalPages} pages, vượt giới hạn ${maxPages}. Hãy chạy backfill theo tháng hoặc tăng ADMIN_GOHUB_CUSTOMER_MAX_PAGES_PER_MONTH có chủ đích.`)
  }

  const collect = (response: CustomerRevenueResponse) => {
    for (const item of response.data?.items ?? []) {
      const type = normalizeUserType(item.userType)
      buckets[type].count += 1
      buckets[type].revenue += revenueToVnd(item.revenueByCurrency)
    }
  }

  collect(first)
  for (let page = 2; page <= totalPages; page++) {
    collect(await fetchCustomerPage(month, page))
  }

  return {
    month,
    rows: [
      { month, type: "new", revenue: String(buckets.new.revenue), count: String(buckets.new.count) },
      { month, type: "returning", revenue: String(buckets.returning.revenue), count: String(buckets.returning.count) },
    ],
    pagesFetched: totalPages,
    recordsFetched: buckets.new.count + buckets.returning.count,
    totalPages,
    totalRecords,
  }
}

export async function adminGohubCustomerRows(months: string[]): Promise<AdminCustomerRow[]> {
  if (!adminGohubConfigured()) return []

  const rows: AdminCustomerRow[] = []
  for (const month of months) {
    const response = await fetchCustomerPage(month, 1)
    const summary = response.data?.summary
    const byUserType = summary?.byUserType
    if (byUserType?.new || byUserType?.returning) {
      rows.push(
        {
          month,
          type: "new",
          revenue: String(summaryRevenueToVnd(byUserType.new?.byCurrency ?? [])),
          count: String(Number(byUserType.new?.customerCount ?? 0)),
        },
        {
          month,
          type: "returning",
          revenue: String(summaryRevenueToVnd(byUserType.returning?.byCurrency ?? [])),
          count: String(Number(byUserType.returning?.customerCount ?? 0)),
        },
      )
      continue
    }

    rows.push({
      month,
      type: "total",
      revenue: String(summaryRevenueToVnd(summary?.byCurrency ?? [])),
      count: String(Number(summary?.customerCount ?? response.pagination?.total ?? 0)),
    })
  }

  return rows
}

export async function adminGohubCustomerChannelRows(months: string[]): Promise<AdminCustomerChannelRow[]> {
  if (!adminGohubConfigured()) return []

  const tenantMap = {
    vnWeb: tenantList("ADMIN_GOHUB_TENANT_VN_WEB", "gohub-vn"),
    usWeb: tenantList("ADMIN_GOHUB_TENANT_US_WEB", "gohub-com"),
    usApp: tenantList("ADMIN_GOHUB_TENANT_US_APP", "gohub-app"),
  }

  const rows: AdminCustomerChannelRow[] = []
  for (const month of months) {
    const vnWeb = await customerRowsForTenants(month, "vnWeb", tenantMap.vnWeb)
    const usWeb = await customerRowsForTenants(month, "usWeb", tenantMap.usWeb)
    const usApp = await customerRowsForTenants(month, "usApp", tenantMap.usApp)

    const appendParent = (bucket: AdminCustomerChannelBucket, children: AdminCustomerChannelRow[][]) => {
      const byType = {
        new: { revenue: 0, count: 0 },
        returning: { revenue: 0, count: 0 },
      }
      for (const childRows of children) {
        for (const row of childRows) {
          byType[row.type].revenue += Number(row.revenue) || 0
          byType[row.type].count += Number(row.count) || 0
        }
      }
      rows.push(
        { month, bucket, type: "new", revenue: String(byType.new.revenue), count: String(byType.new.count) },
        { month, bucket, type: "returning", revenue: String(byType.returning.revenue), count: String(byType.returning.count) },
      )
    }

    appendParent("vnB2c", [vnWeb])
    rows.push(...vnWeb)
    appendParent("usB2c", [usWeb, usApp])
    rows.push(...usWeb, ...usApp)
  }

  return rows
}
