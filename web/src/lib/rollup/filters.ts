// Bộ lọc của đường thô (analytics-helpers / quarterly-settings) dịch sang SQLite cho rollup. PHẢI cho cùng kết quả với đường thô — mỗi hàm ghi rõ bản gốc.
// Bảng `r` = ru_cust_day; `s` = dm_source (LEFT JOIN như dim_order_source ở đường thô).
const esc = (v: string) => `'${v.replace(/'/g, "''")}'`

export interface RollupFilter {
  companyCode?: string          // ALL hoặc rỗng = không lọc
  includeShip: boolean          // shipFilter: bỏ tick thì loại SKU SHIPPINGFEE0 (ship = 1)
  includeInternalOps: boolean   // internalOpsFilter: bỏ tick thì loại nhóm INTERNAL-TRANSACTION
  excludedCustomers?: string[]  // makeExcludeSql: chỉ loại trong nhánh B2B, theo MÃ hoặc TÊN khách
  inactive?: boolean            // luôn loại khách INACTIVE (INACTIVE_FILTER / excludeInactiveCustomers)
}

/** Điều kiện SQL (bắt đầu bằng " AND …") áp lên ru_cust_day r + dm_source s. `safeCompany` đã được kiểm ở nơi gọi (ALL|VN|US). */
export function custFilterSql(f: RollupFilter): string {
  const parts: string[] = []
  if (f.companyCode && f.companyCode !== "ALL") parts.push(`r.company = ${esc(f.companyCode)}`)
  if (!f.includeShip) parts.push("r.ship = 0")
  if (!f.includeInternalOps) parts.push("UPPER(COALESCE(s.group_name, '')) != 'INTERNAL-TRANSACTION'")
  if (f.inactive !== false) parts.push("NOT EXISTS (SELECT 1 FROM dm_customer ic WHERE ic.customer = r.customer AND UPPER(COALESCE(ic.price_list_name, '')) LIKE '%INACTIVE%')")
  const ex = excludeCustomersSql(f.excludedCustomers ?? [])
  if (ex) parts.push(ex)
  return parts.length ? ` AND ${parts.join(" AND ")}` : ""
}

export interface B2bFilter { companyCode?: string; includeShip: boolean; includeInternalOps: boolean; inactive: boolean; excludedCustomers?: string[] }
/**
 * Bộ lọc của các route B2B theo khách (quarterly-b2b-customers…): nguồn B2B đã lọc riêng ở câu SQL, loại KH theo
 * `customerExcludedSql` (TÊN HOẶC MÃ, không ràng buộc nhóm), INACTIVE tuỳ truy vấn. Bảng `c` = dm_customer (LEFT JOIN).
 */
export function b2bFilterSql(f: B2bFilter): string {
  const parts: string[] = []
  if (f.companyCode && f.companyCode !== "ALL") parts.push(`r.company = ${esc(f.companyCode)}`)
  if (!f.includeShip) parts.push("r.ship = 0")
  if (!f.includeInternalOps) parts.push("UPPER(COALESCE(s.group_name, '')) != 'INTERNAL-TRANSACTION'")
  if (f.inactive) parts.push("NOT (UPPER(COALESCE(c.price_list_name, '')) LIKE '%INACTIVE%')")
  const list = (f.excludedCustomers ?? []).map(esc).join(",")
  if (list) parts.push(`NOT (COALESCE(c.name, r.customer) IN (${list}) OR r.customer IN (${list}))`)
  return parts.length ? ` AND ${parts.join(" AND ")}` : ""
}

/** Bản SQLite của makeExcludeSql(): mã (chữ-số-gạch) so trực tiếp, tên so qua dm_customer.name; chỉ loại khi nguồn là B2B. Trả không có "AND " đầu. */
export function excludeCustomersSql(excluded: string[]): string {
  if (!excluded.length) return ""
  const isCode = (e: string) => /^[A-Za-z0-9_-]+$/.test(e.trim())
  const codes = excluded.filter(isCode), names = excluded.filter(e => !isCode(e))
  const parts: string[] = []
  if (codes.length) parts.push(`r.customer IN (${codes.map(esc).join(", ")})`)
  if (names.length) parts.push(`EXISTS (SELECT 1 FROM dm_customer cx WHERE cx.customer = r.customer AND COALESCE(cx.name, '') IN (${names.map(esc).join(", ")}))`)
  return parts.length ? `NOT (UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2B' AND (${parts.join(" OR ")}))` : ""
}
