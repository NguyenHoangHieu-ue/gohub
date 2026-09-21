// Admin GoHub Internal API — source for B2C customer metrics.
// Env: ADMIN_GOHUB_API_BASE_URL, ADMIN_GOHUB_API_KEY, ADMIN_GOHUB_API_SECRET.

import { supabaseAdmin } from "@/lib/supabase"

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
  name?: string
  email?: string
  tenantId?: string
  preferredCurrency?: string
  totalOrders?: number
  firstOrderAt?: string
  lastOrderAt?: string
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
      // Phân theo tenant CỦA ĐƠN HÀNG (kênh ghi trên đơn), mỗi tenant kèm byUserType riêng — 1 request cho
      // cả tháng, thay vì gọi lại 1 lần/tenant qua tham số `tenantId`.
      byTenant?: Array<{
        tenantId: string
        customerCount?: number
        totalOrders?: number
        byUserType?: Partial<Record<"new" | "returning", {
          customerCount?: number
          byCurrency?: Array<{ currency: string; totalRevenue: number }>
        }>>
      }>
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

// Tỷ giá USD→VND: ưu tiên DB (Supabase app_settings key 'fx.usd_vnd' — nguồn sự thật, chỉnh trong
// Settings/agents), fallback env ADMIN_GOHUB_USD_TO_VND, cuối cùng 26000.
export async function getUsdToVndRate(): Promise<number> {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "fx.usd_vnd").maybeSingle()
    const dbRate = data ? parseFloat(String(data.value)) : NaN
    if (Number.isFinite(dbRate) && dbRate > 0) return dbRate
  } catch {
    // đọc DB lỗi → dùng fallback env
  }
  const envRate = Number(process.env.ADMIN_GOHUB_USD_TO_VND)
  return Number.isFinite(envRate) && envRate > 0 ? envRate : 26000
}

export function revenueToVnd(buckets: RevenueBucket[] = [], usdRate: number): number {
  return buckets.reduce((sum, b) => {
    const currency = String(b.currency || "").toUpperCase()
    const revenue = Number(b.revenue) || 0
    if (currency === "VND") return sum + revenue
    if (currency === "USD") return sum + revenue * usdRate
    return sum
  }, 0)
}

function summaryRevenueToVnd(buckets: Array<{ currency: string; totalRevenue: number }> = [], usdRate: number): number {
  return revenueToVnd(buckets.map(bucket => ({ currency: bucket.currency, revenue: bucket.totalRevenue })), usdRate)
}

async function fetchCustomerPageRange(dateFrom: string, dateTo: string, page: number, extraParams: Record<string, string> = {}): Promise<CustomerRevenueResponse> {
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

async function fetchCustomerPage(month: string, page: number, extraParams: Record<string, string> = {}): Promise<CustomerRevenueResponse> {
  const { dateFrom, dateTo } = monthRange(month)
  return fetchCustomerPageRange(dateFrom, dateTo, page, extraParams)
}

// Trang 1 (summary) của 1 tháng, dùng chung giữa số khách tổng, số khách theo kênh và snapshot — trước mỗi
// nơi tự gọi lại nên 1 lần dựng breakdown 9 tháng tốn 36 request, vượt trần 30 request/5 phút của Admin API.
const MONTH_SUMMARY_TTL_MS = 60_000
const monthSummaryMemo = new Map<string, { at: number; p: Promise<CustomerRevenueResponse> }>()
function fetchMonthSummary(month: string): Promise<CustomerRevenueResponse> {
  const hit = monthSummaryMemo.get(month)
  if (hit && Date.now() - hit.at < MONTH_SUMMARY_TTL_MS) return hit.p
  const p = fetchCustomerPage(month, 1)
  monthSummaryMemo.set(month, { at: Date.now(), p })
  p.catch(() => { if (monthSummaryMemo.get(month)?.p === p) monthSummaryMemo.delete(month) })
  return p
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
  const usdRate = await getUsdToVndRate()

  const sums = {
    new: { revenue: 0, count: 0 },
    returning: { revenue: 0, count: 0 },
  }

  // Kênh theo tenant ghi trên ĐƠN (summary.byTenant) — 1 request/tháng dùng chung; new/returning là
  // userType toàn cục của khách (khách từng mua ở kênh khác vẫn tính "quay lại"). Chỉ khi API không trả
  // byTenant mới rơi về cách cũ (gọi lại mỗi tenant qua tham số tenantId).
  const monthSummary = (await fetchMonthSummary(month)).data?.summary
  if (Array.isArray(monthSummary?.byTenant)) {
    for (const t of monthSummary.byTenant) {
      if (!tenants.includes(t.tenantId)) continue
      sums.new.revenue += summaryRevenueToVnd(t.byUserType?.new?.byCurrency ?? [], usdRate)
      sums.new.count += Number(t.byUserType?.new?.customerCount ?? 0)
      sums.returning.revenue += summaryRevenueToVnd(t.byUserType?.returning?.byCurrency ?? [], usdRate)
      sums.returning.count += Number(t.byUserType?.returning?.customerCount ?? 0)
    }
    return [
      { month, bucket, type: "new", revenue: String(sums.new.revenue), count: String(sums.new.count) },
      { month, bucket, type: "returning", revenue: String(sums.returning.revenue), count: String(sums.returning.count) },
    ]
  }

  for (const tenantId of tenants) {
    const response = await fetchCustomerPage(month, 1, { tenantId })
    const byUserType = response.data?.summary?.byUserType
    sums.new.revenue += summaryRevenueToVnd(byUserType?.new?.byCurrency ?? [], usdRate)
    sums.new.count += Number(byUserType?.new?.customerCount ?? 0)
    sums.returning.revenue += summaryRevenueToVnd(byUserType?.returning?.byCurrency ?? [], usdRate)
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

  const usdRate = await getUsdToVndRate()
  const buckets: Record<"new" | "returning", { revenue: number; count: number }> = {
    new: { revenue: 0, count: 0 },
    returning: { revenue: 0, count: 0 },
  }

  const first = await fetchMonthSummary(month)
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
          revenue: String(summaryRevenueToVnd(newBucket?.byCurrency ?? [], usdRate)),
          count: String(Number(newBucket?.customerCount ?? 0)),
        },
        {
          month,
          type: "returning",
          revenue: String(summaryRevenueToVnd(returningBucket?.byCurrency ?? [], usdRate)),
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
      buckets[type].revenue += revenueToVnd(item.revenueByCurrency, usdRate)
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

  const usdRate = await getUsdToVndRate()
  const rows: AdminCustomerRow[] = []
  for (const month of months) {
    const response = await fetchMonthSummary(month)
    const summary = response.data?.summary
    const byUserType = summary?.byUserType
    if (byUserType?.new || byUserType?.returning) {
      rows.push(
        {
          month,
          type: "new",
          revenue: String(summaryRevenueToVnd(byUserType.new?.byCurrency ?? [], usdRate)),
          count: String(Number(byUserType.new?.customerCount ?? 0)),
        },
        {
          month,
          type: "returning",
          revenue: String(summaryRevenueToVnd(byUserType.returning?.byCurrency ?? [], usdRate)),
          count: String(Number(byUserType.returning?.customerCount ?? 0)),
        },
      )
      continue
    }

    rows.push({
      month,
      type: "total",
      revenue: String(summaryRevenueToVnd(summary?.byCurrency ?? [], usdRate)),
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


// ── Danh sách KH B2C theo khoảng ngày (Quarter Report — breakdown KH mới/quay lại/rời bỏ, s203) ─────────────────
// API giới hạn 100 KH/trang (limit>100 → 400) → 1 quý ~6-8k KH = 60-80 trang; tải song song có giới hạn.
export interface AdminCustomerDetail {
  id: string
  name: string
  emailMasked: string
  market: "VN" | "US" | "Khác"
  userType: "new" | "returning"
  revenueVnd: number
  orders: number
  firstOrderAt: string | null
  lastOrderAt: string | null
}

/** a***@domain — danh sách này hiển thị cho người xem báo cáo, không đưa email đầy đủ ra trình duyệt. */
export function maskEmail(email?: string): string {
  if (!email || !email.includes("@")) return ""
  const [user, domain] = email.split("@")
  return `${user.slice(0, 1)}***@${domain}`
}

function marketOf(item: CustomerRevenueItem): "VN" | "US" | "Khác" {
  const cur = String(item.preferredCurrency || item.revenueByCurrency?.[0]?.currency || "").toUpperCase()
  if (cur === "VND") return "VN"
  if (cur === "USD") return "US"
  return "Khác"
}

/** Tổng hợp nhanh (1 request): số KH + doanh thu mới/quay lại của cả khoảng — dùng cho ô tổng quan, không cần tải danh sách. */
export async function adminGohubCustomerRangeSummary(dateFrom: string, dateTo: string): Promise<{
  new: { count: number; revenue: number }; returning: { count: number; revenue: number }; total: number
}> {
  if (!adminGohubConfigured()) throw new Error("Admin GoHub API chưa được cấu hình")
  const usdRate = await getUsdToVndRate()
  const first = await fetchCustomerPageRange(dateFrom, dateTo, 1)
  const by = first.data?.summary?.byUserType
  return {
    new: { count: Number(by?.new?.customerCount ?? 0), revenue: summaryRevenueToVnd(by?.new?.byCurrency ?? [], usdRate) },
    returning: { count: Number(by?.returning?.customerCount ?? 0), revenue: summaryRevenueToVnd(by?.returning?.byCurrency ?? [], usdRate) },
    total: Number(first.pagination?.total ?? first.data?.summary?.customerCount ?? 0),
  }
}

export async function adminGohubCustomerList(dateFrom: string, dateTo: string, opts?: { concurrency?: number; maxPages?: number }): Promise<AdminCustomerDetail[]> {
  if (!adminGohubConfigured()) throw new Error("Admin GoHub API chưa được cấu hình")
  const usdRate = await getUsdToVndRate()
  const concurrency = opts?.concurrency ?? 6
  const maxPages = opts?.maxPages ?? 150

  const toDetail = (it: CustomerRevenueItem): AdminCustomerDetail => ({
    id: it.customerId,
    name: it.name || "",
    emailMasked: maskEmail(it.email),
    market: marketOf(it),
    userType: normalizeUserType(it.userType),
    revenueVnd: Math.round(revenueToVnd(it.revenueByCurrency, usdRate)),
    orders: Number(it.totalOrders) || 0,
    firstOrderAt: it.firstOrderAt ?? null,
    lastOrderAt: it.lastOrderAt ?? null,
  })

  // Retry nhẹ 2 lần (429/5xx từng gặp ở API ngoài) — lỗi kéo dài thì ném ra, KHÔNG trả danh sách cụt.
  const getPage = async (page: number): Promise<CustomerRevenueResponse> => {
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await fetchCustomerPageRange(dateFrom, dateTo, page) } catch (e) {
        lastErr = e
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      }
    }
    throw lastErr
  }

  const first = await getPage(1)
  const totalPages = pageCount(first)
  if (totalPages > maxPages) throw new Error(`Admin GoHub customers ${dateFrom.slice(0, 10)}→${dateTo.slice(0, 10)} cần ${totalPages} trang, vượt giới hạn ${maxPages}`)
  const pages: CustomerRevenueResponse[] = [first]
  let next = 2
  const worker = async () => {
    while (next <= totalPages) {
      const page = next++
      pages[page - 1] = await getPage(page)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(0, totalPages - 1)) }, worker))
  return pages.flatMap(pg => (pg.data?.items ?? []).map(toDetail))
}
