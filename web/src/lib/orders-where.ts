import { NO_PIC, ORDER_TIERS } from "@/lib/orders-filters"

// Điều kiện WHERE dùng chung cho tab Orders (order-report + order-filters) để hai API không lệch nhau.
export interface OrderBase {
  startDate: string; endDate: string; companyCode: string; dataSource: string
  includeShip: boolean; includeInternalOps: boolean
  mainTable: string; dateCol: string; revCol: string; qtyCol: string; gpCol: string
}

export function parseOrderBase(p: URLSearchParams): OrderBase | { error: string } {
  // singleDate shorthand: date → startDate=endDate (lọc 1 ngày)
  const singleDate = p.get("date") || ""
  const startDate = singleDate || p.get("startDate") || ""
  const endDate = singleDate || p.get("endDate") || ""
  if (!startDate || !endDate) return { error: "startDate and endDate are required" }
  const isSales = (p.get("dataSource") || "fulfilled") === "created"
  return {
    startDate, endDate,
    companyCode: p.get("companyCode") || "ALL",
    dataSource: isSales ? "created" : "fulfilled",
    includeShip: p.get("includeShip") === "1",
    includeInternalOps: p.get("includeInternalOps") === "1",
    mainTable: isSales ? "fact_sales_revenue" : "fact_fulfillment_revenue",
    dateCol: isSales ? "created_date" : "fulfiled_date",
    revCol: isSales ? "sales_revenue_amount_vnd" : "fulfilled_revenue_amount_vnd",
    qtyCol: isSales ? "f.quantity" : "f.fulfilled_quantity",   // fact_sales_revenue dùng "quantity"
    gpCol: isSales ? "0" : "f.gross_profit_vnd",               // fact_sales_revenue không có gross_profit_vnd
  }
}

/** Ngày + Phí ship + Đơn nội bộ + Entity. Alias bắt buộc: f (fact), s (dim_order_source). */
export function baseWhere(b: OrderBase): { where: string; params: unknown[] } {
  const params: unknown[] = [b.startDate, b.endDate]
  let where = `WHERE f.${b.dateCol}::date BETWEEN $1 AND $2`
  if (!b.includeShip) where += ` AND f.sku != 'SHIPPINGFEE0'`
  if (!b.includeInternalOps) where += ` AND (UPPER(COALESCE(s.group_name, '')) != 'INTERNAL-TRANSACTION')`
  if (b.companyCode && b.companyCode !== "ALL") { params.push(b.companyCode); where += ` AND f.company_code = $${params.length}` }
  return { where, params }
}

export interface OrderFilterParams { staffCode: string; channelGroup: string; channel: string; orderSource: string; tier: string }

export function readFilterParams(p: URLSearchParams): OrderFilterParams {
  const tier = p.get("tier") || ""
  return {
    staffCode: p.get("staffCode") || "",
    channelGroup: p.get("channelGroup") || "",
    channel: p.get("channel") || "",
    orderSource: p.get("orderSource") || "",
    tier: (ORDER_TIERS as readonly string[]).includes(tier) ? tier : "",
  }
}

/** Các bộ lọc Nhóm / Kênh / Nguồn / PIC / Tier — áp CÙNG LÚC (AND). Cần alias dc (dim_customer) cho Tier (tierExpr). */
export function filterWhere(base: { where: string; params: unknown[] }, f: OrderFilterParams, tierExpr: string): { where: string; params: unknown[] } {
  let where = base.where
  const params = [...base.params]
  const add = (cond: (n: number) => string, v: unknown) => { params.push(v); where += ` AND ${cond(params.length)}` }
  if (f.staffCode === NO_PIC) where += ` AND NULLIF(TRIM(f.staff_code), '') IS NULL`
  else if (f.staffCode) add(n => `TRIM(f.staff_code) = $${n}`, f.staffCode)
  if (f.channelGroup && f.channelGroup !== "All") add(n => `UPPER(COALESCE(s.group_name, '')) = UPPER($${n})`, f.channelGroup)
  if (f.channel) add(n => `TRIM(s.channel_name) = $${n}`, f.channel)
  if (f.orderSource) add(n => `COALESCE(s.code, 'nan') = $${n}`, f.orderSource)
  if (f.tier) add(n => `${tierExpr} = $${n}`, f.tier)
  return { where, params }
}
