import { queryAnalytics } from "@/lib/analytics-db"
import { isBasis, isDay, type Basis, type CustRow, type SkuRow, type Totals } from "./pure"

// Đọc gohub_dw (CHỈ SELECT; ràng buộc cứng của plan: không ghi/sửa gì trong gohub_dw). Mọi tham số ngày được kiểm isDay trước khi nối vào SQL.
// Ngày hôm nay có thể còn dở dang (ETL chạy hằng giờ): rollup lưu mọi gì DW có, tầng đọc tự giới hạn tới CURRENT_DATE − 1 như các route hiện tại.
interface BasisDef { table: string; day: string; rev: string; cogs: string; gp: string; qty: string; range: (start: string, end: string) => string }
const BASIS: Record<Basis, BasisDef> = {
  // Cột ngày giao là varchar 'YYYY-MM-DD' (đã đo: luôn 10 ký tự) → so chuỗi, không ép kiểu từng dòng.
  ful: { table: "fact_fulfillment_revenue", day: "f.fulfiled_date", rev: "f.fulfilled_revenue_amount_vnd", cogs: "f.cogs_amount_vnd", gp: "f.gross_profit_vnd", qty: "f.fulfilled_quantity",
    range: (s, e) => `f.fulfiled_date >= '${s}' AND f.fulfiled_date < '${e}'` },
  // Cột ngày tạo là timestamp. Created KHÔNG có giá vốn/GP ở các tab hiện tại (getAnalyticsSource) → giữ 0 để khớp.
  sal: { table: "fact_sales_revenue", day: "f.created_date::date::text", rev: "f.sales_revenue_amount_vnd", cogs: "0", gp: "0", qty: "f.quantity",
    range: (s, e) => `f.created_date >= '${s}'::date AND f.created_date < '${e}'::date` },
}

function def(basis: Basis, start: string, end: string): BasisDef {
  if (!isBasis(basis) || !isDay(start) || !isDay(end) || start >= end) throw new Error(`Tham số rollup không hợp lệ: ${basis} ${start} ${end}`)
  return BASIS[basis]
}

// Nhóm vendor "3HK Datapool" (so tên chuẩn hoá như getAnalyticsSource/BOD): số đo nướng sẵn hk3_rev_vnd.
const HK3 = `TRIM(f.sku) IN (SELECT TRIM(sku) FROM dim_sku WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL')`
const num = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0 }

export function custSql(basis: Basis, start: string, end: string): string {
  const b = def(basis, start, end)
  return `SELECT ${b.day} AS day, COALESCE(f.company_code,'') AS company, COALESCE(f.order_source_code,'') AS source, COALESCE(TRIM(f.customer_code),'') AS customer,
    CASE WHEN f.sku = 'SHIPPINGFEE0' THEN 1 ELSE 0 END AS ship,
    COALESCE(SUM(${b.rev}),0) AS revenue, COALESCE(SUM(${b.cogs}),0) AS cogs, COALESCE(SUM(${b.gp}),0) AS gp, COALESCE(SUM(${b.qty}),0) AS qty,
    COUNT(*) AS lines, COUNT(DISTINCT f.order_code) AS orders, COALESCE(SUM(CASE WHEN ${HK3} THEN ${b.rev} ELSE 0 END),0) AS hk3
  FROM ${b.table} f WHERE ${b.range(start, end)} GROUP BY 1, 2, 3, 4, 5`
}
export function skuSql(basis: Basis, start: string, end: string): string {
  const b = def(basis, start, end)
  return `SELECT ${b.day} AS day, COALESCE(f.company_code,'') AS company, COALESCE(f.order_source_code,'') AS source, COALESCE(TRIM(f.sku),'') AS sku,
    COALESCE(SUM(${b.rev}),0) AS revenue, COALESCE(SUM(${b.cogs}),0) AS cogs, COALESCE(SUM(${b.gp}),0) AS gp, COALESCE(SUM(${b.qty}),0) AS qty,
    COUNT(*) AS lines, COUNT(DISTINCT f.order_code) AS orders
  FROM ${b.table} f WHERE ${b.range(start, end)} GROUP BY 1, 2, 3, 4`
}
export function totalsSql(basis: Basis, start: string, end: string): string {
  const b = def(basis, start, end)
  return `SELECT COALESCE(SUM(${b.rev}),0) AS revenue, COALESCE(SUM(${b.cogs}),0) AS cogs, COALESCE(SUM(${b.gp}),0) AS gp, COALESCE(SUM(${b.qty}),0) AS qty, COUNT(*) AS lines
  FROM ${b.table} f WHERE ${b.range(start, end)}`
}

type Raw = Record<string, unknown>
export async function fetchCustRows(basis: Basis, start: string, end: string): Promise<CustRow[]> {
  const rows = await queryAnalytics<Raw>(custSql(basis, start, end))
  return rows.map(r => ({ day: String(r.day), company: String(r.company), source: String(r.source), customer: String(r.customer), ship: num(r.ship) ? 1 : 0, revenue: num(r.revenue), cogs: num(r.cogs), gp: num(r.gp), qty: num(r.qty), lines: num(r.lines), orders: num(r.orders), hk3: num(r.hk3) }))
}
export async function fetchSkuRows(basis: Basis, start: string, end: string): Promise<SkuRow[]> {
  const rows = await queryAnalytics<Raw>(skuSql(basis, start, end))
  return rows.map(r => ({ day: String(r.day), company: String(r.company), source: String(r.source), sku: String(r.sku), revenue: num(r.revenue), cogs: num(r.cogs), gp: num(r.gp), qty: num(r.qty), lines: num(r.lines), orders: num(r.orders) }))
}
export async function fetchTotals(basis: Basis, start: string, end: string): Promise<Totals> {
  const [r] = await queryAnalytics<Raw>(totalsSql(basis, start, end))
  return { revenue: num(r?.revenue), cogs: num(r?.cogs), gp: num(r?.gp), qty: num(r?.qty), lines: num(r?.lines) }
}

// ── Bản sao dim (chỉ cột cần dùng khi đọc) ──
export interface DimSource { source: string; channel_name: string | null; group_name: string | null; sub_group_name: string | null; sapo_name: string | null }
export interface DimSku { sku: string; vendor: string | null; category_name: string | null; type_of_sim: string | null }
export interface DimStaff { code: string; name: string | null }
export interface DimCustomer { customer: string; name: string | null; organization: string | null; organization_code: string | null; price_list_name: string | null; currency_code: string | null; sales_pic_code: string | null; status: string | null }
const s = (v: unknown): string | null => (v == null ? null : String(v))

export async function fetchDimSource(): Promise<DimSource[]> {
  const rows = await queryAnalytics<Raw>(`SELECT TRIM(code) AS source, channel_name, group_name, sub_group_name, sapo_name FROM dim_order_source`)
  return rows.map(r => ({ source: String(r.source), channel_name: s(r.channel_name), group_name: s(r.group_name), sub_group_name: s(r.sub_group_name), sapo_name: s(r.sapo_name) }))
}
export async function fetchDimSku(): Promise<DimSku[]> {
  const rows = await queryAnalytics<Raw>(`SELECT TRIM(sku) AS sku, vendor, category_name, type_of_sim FROM dim_sku`)
  return rows.map(r => ({ sku: String(r.sku), vendor: s(r.vendor), category_name: s(r.category_name), type_of_sim: s(r.type_of_sim) }))
}
export async function fetchDimStaff(): Promise<DimStaff[]> {
  const rows = await queryAnalytics<Raw>(`SELECT TRIM(code) AS code, name FROM dim_staff`)
  return rows.map(r => ({ code: String(r.code), name: s(r.name) }))
}
/** Phân trang theo khoá (code > after) để không kéo cả 355k khách một lần; không dùng OFFSET. */
export async function fetchDimCustomerPage(after: string, limit: number): Promise<DimCustomer[]> {
  const rows = await queryAnalytics<Raw>(`SELECT code AS customer, name, organization, organization_code, price_list_name, currency_code, sales_pic_code, status FROM dim_customer WHERE code > $1 ORDER BY code LIMIT ${Math.min(Math.max(1, Math.floor(limit)), 5000)}`, [after])
  return rows.map(r => ({ customer: String(r.customer), name: s(r.name), organization: s(r.organization), organization_code: s(r.organization_code), price_list_name: s(r.price_list_name), currency_code: s(r.currency_code), sales_pic_code: s(r.sales_pic_code), status: s(r.status) }))
}
