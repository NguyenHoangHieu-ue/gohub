import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery } from "@/lib/analytics-helpers"

// Khách B2B đọc THẲNG từ gohub_dw (s240) — thay bảng Supabase `b2b_customers_cache` (112 nghìn dòng, ~37MB, phải sync tay).
// Cùng tiêu chí với bản sync cũ: nhóm nguồn B2B, đến hôm qua, bỏ phí ship, bỏ bảng giá INACTIVE.

export interface B2BCustomerRow {
  customer_code: string
  customer_name: string
  price_list_name: string | null
  currency_code: string | null
  status: string | null
  sales_pic_code: string | null
  total_revenue: number
  total_gp: number
  total_orders: number
  total_units: number
  last_order_date: string | null
}

const TIER_PATTERNS: Record<string, string> = { Strategic: "%STRATEGIC%", VIP: "%VIP%", Gold: "%GOLD%", Silver: "%SILVER%" }
const clampInt = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number.isFinite(v) ? v : min)))

export interface TopB2BOptions { search?: string; tier?: string; currency?: string; limit?: number; offset?: number }

/** Danh sách khách B2B xếp theo doanh thu giảm dần (cache 60 phút). */
export async function topB2BCustomers(o: TopB2BOptions = {}): Promise<B2BCustomerRow[]> {
  const limit = clampInt(o.limit ?? 100, 1, 500), offset = clampInt(o.offset ?? 0, 0, 100_000)
  const params: unknown[] = []
  let extra = ""
  const search = (o.search ?? "").trim()
  if (search) { params.push(`%${search}%`); extra += ` AND COALESCE(c.name, TRIM(f.customer_code)) ILIKE $${params.length}` }
  if (o.currency) { params.push(o.currency.toUpperCase()); extra += ` AND UPPER(c.currency_code) = $${params.length}` }
  const pattern = o.tier ? TIER_PATTERNS[o.tier] : undefined
  if (pattern) { params.push(pattern); extra += ` AND c.price_list_name ILIKE $${params.length}` }
  const key = `b2b-customers:v1:${limit}:${offset}:${search}:${o.tier ?? ""}:${o.currency ?? ""}`
  const rows = await cachedQuery(key, () => queryAnalytics<Record<string, string | null>>(`
    SELECT TRIM(f.customer_code) AS customer_code,
           COALESCE(c.name, TRIM(f.customer_code)) AS customer_name,
           c.price_list_name, c.currency_code, c.status, c.sales_pic_code,
           SUM(f.fulfilled_revenue_amount_vnd) AS total_revenue,
           SUM(f.gross_profit_vnd) AS total_gp,
           COUNT(DISTINCT f.order_code) AS total_orders,
           SUM(f.fulfilled_quantity) AS total_units,
           MAX(f.fulfiled_date::date)::text AS last_order_date
    FROM fact_fulfillment_revenue f
    LEFT JOIN dim_order_source s ON f.order_source_code = s.code
    LEFT JOIN dim_customer c     ON TRIM(f.customer_code) = c.code
    WHERE UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2B'
      AND f.customer_code IS NOT NULL AND TRIM(f.customer_code) != ''
      AND f.fulfiled_date::date <= CURRENT_DATE - 1
      AND f.sku != 'SHIPPINGFEE0'
      AND UPPER(COALESCE(c.price_list_name, '')) NOT LIKE '%INACTIVE%'${extra}
    GROUP BY TRIM(f.customer_code), COALESCE(c.name, TRIM(f.customer_code)), c.price_list_name, c.currency_code, c.status, c.sales_pic_code
    ORDER BY total_revenue DESC
    LIMIT ${limit} OFFSET ${offset}`, params), 60, false, ["order-report"])
  return rows.map(r => ({
    customer_code: String(r.customer_code), customer_name: String(r.customer_name ?? r.customer_code),
    price_list_name: r.price_list_name ?? null, currency_code: r.currency_code ?? null, status: r.status ?? null, sales_pic_code: r.sales_pic_code ?? null,
    total_revenue: parseFloat(String(r.total_revenue)) || 0, total_gp: parseFloat(String(r.total_gp)) || 0,
    total_orders: parseInt(String(r.total_orders)) || 0, total_units: parseInt(String(r.total_units)) || 0,
    last_order_date: r.last_order_date ?? null,
  }))
}

/** Tên khách theo mã (dim_customer). Mã không có thì không xuất hiện trong kết quả. */
export async function b2bCustomerNames(codes: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(codes.map(c => String(c).trim()).filter(Boolean))]
  if (!uniq.length) return {}
  const rows = await queryAnalytics<{ code: string; name: string | null }>("SELECT TRIM(code::text) AS code, name FROM dim_customer WHERE TRIM(code::text) = ANY($1::text[])", [uniq])
  const out: Record<string, string> = {}
  for (const r of rows) if (r.name && String(r.name).trim()) out[String(r.code)] = String(r.name).trim()
  return out
}

/** Trong các mã đã cho, mã nào có doanh thu B2B thật (cùng tiêu chí danh sách) — dùng cho chế độ "repair" chi phí khách. */
export async function b2bCodesWithRevenue(codes: string[]): Promise<Set<string>> {
  const uniq = [...new Set(codes.map(c => String(c).trim()).filter(Boolean))]
  if (!uniq.length) return new Set()
  const rows = await queryAnalytics<{ code: string }>(`
    SELECT DISTINCT TRIM(f.customer_code) AS code
    FROM fact_fulfillment_revenue f
    LEFT JOIN dim_order_source s ON f.order_source_code = s.code
    LEFT JOIN dim_customer c     ON TRIM(f.customer_code) = c.code
    WHERE UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2B'
      AND TRIM(f.customer_code) = ANY($1::text[])
      AND f.fulfiled_date::date <= CURRENT_DATE - 1
      AND f.sku != 'SHIPPINGFEE0'
      AND UPPER(COALESCE(c.price_list_name, '')) NOT LIKE '%INACTIVE%'`, [uniq])
  return new Set(rows.map(r => String(r.code)))
}
