// Vòng đời khách hàng B2B — New / Recurring / Inactive (s200).
// Dùng chung bởi quarterly-report + squad-progress. Xem docs/wiki/system/tabs/analytics-quarterly.md.
//
// "First order date" quét TOÀN BỘ lịch sử fact_fulfillment_revenue (không giới hạn ngày dưới) — cùng lớp
// rủi ro full-scan đã gây timeout ở B2C (s195+15). Khác b2c/monthly: đây CHỈ 1 query GROUP BY (không phải
// CTE lồng trong query per-page-load), và cache TTL RIÊNG dài hạn (LIFECYCLE_TTL_MIN, KHÔNG dùng chung
// QUERY_TTL_MIN=60' của 20 route khác) vì "ngày mua đầu tiên" gần như không đổi trong ngày.

import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery } from "@/lib/analytics-helpers"

const LIFECYCLE_TTL_MIN = 360 // 6 giờ — riêng cho lifecycle, không ảnh hưởng QUERY_TTL_MIN dùng chung

export interface B2BLifecycleRow {
  customer_code: string
  customer_name: string
  sales_pic_code: string | null
  first_order_date: string // YYYY-MM-DD
}

/**
 * Ngày mua ĐẦU TIÊN của mỗi KH B2B, quét toàn bộ lịch sử (không lọc theo quý). Luôn loại phí ship
 * (SHIPPINGFEE0) + KH INACTIVE — "vòng đời" trả lời "công ty này từng mua sản phẩm thật chưa", không
 * phụ thuộc toggle Ship/Internal-Ops của trang (khác các query doanh thu khác trên Quarter Report).
 */
export async function fetchB2BLifecycleRows(
  companyCode: string,
  excludeCustSql: string,
  cacheKeySuffix: string,
  refresh = false,
): Promise<B2BLifecycleRow[]> {
  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""
  const cacheKey = `b2b_lifecycle_v1:${companyCode}:${cacheKeySuffix}`

  return cachedQuery(cacheKey, () => queryAnalytics<B2BLifecycleRow>(`
    SELECT
      TRIM(f.customer_code) as customer_code,
      COALESCE(MIN(c.name), TRIM(f.customer_code)) as customer_name,
      MIN(TRIM(c.sales_pic_code)) as sales_pic_code,
      MIN(f.fulfiled_date::date)::text as first_order_date
    FROM fact_fulfillment_revenue f
    LEFT JOIN dim_order_source s ON f.order_source_code = s.code
    LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
    WHERE UPPER(COALESCE(s.group_name,'')) = 'B2B'
      AND f.sku != 'SHIPPINGFEE0'
      AND NOT (UPPER(COALESCE(c.price_list_name,'')) LIKE '%INACTIVE%')
      ${companyFilter}
      ${excludeCustSql}
    GROUP BY 1
  `), LIFECYCLE_TTL_MIN, refresh)
}

export type LifecycleState = "new" | "recurring" | "inactive"

/**
 * Phân loại từng KH theo quý đang xem — hàm thuần, không DB, dễ unit test.
 * - new: đơn đầu tiên rơi trong khoảng [qStartDate, qEndDate].
 * - recurring: đã mua trước qStartDate VÀ có doanh thu trong quý này (activeCodesThisQuarter).
 * - inactive: đã mua trước qStartDate NHƯNG không có doanh thu quý này.
 * - KH có first_order_date > qEndDate: chưa tồn tại ở quý đang xem → bỏ qua (không map).
 */
export function classifyB2BLifecycle(
  rows: B2BLifecycleRow[],
  activeCodesThisQuarter: Set<string>,
  qStartDate: string,
  qEndDate: string,
): Map<string, LifecycleState> {
  const result = new Map<string, LifecycleState>()
  for (const row of rows) {
    if (row.first_order_date > qEndDate) continue
    if (row.first_order_date >= qStartDate) {
      result.set(row.customer_code, "new")
    } else if (activeCodesThisQuarter.has(row.customer_code)) {
      result.set(row.customer_code, "recurring")
    } else {
      result.set(row.customer_code, "inactive")
    }
  }
  return result
}
