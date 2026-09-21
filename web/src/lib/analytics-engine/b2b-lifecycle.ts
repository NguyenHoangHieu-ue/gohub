// Vòng đời khách hàng B2B — New / Recurring / Inactive (s200).
// Dùng chung bởi quarterly-report + squad-progress. Xem docs/wiki/system/tabs/analytics-quarterly.md.
//
// "First order date" quét TOÀN BỘ lịch sử fact_fulfillment_revenue (không giới hạn ngày dưới) — cùng lớp
// rủi ro full-scan đã gây timeout ở B2C (s195+15). Khác b2c/monthly: đây CHỈ 1 query GROUP BY (không phải
// CTE lồng trong query per-page-load), và cache TTL RIÊNG dài hạn (LIFECYCLE_TTL_MIN, KHÔNG dùng chung
// QUERY_TTL_MIN=60' của 20 route khác) vì "ngày mua đầu tiên" gần như không đổi trong ngày.

import { gzipSync, gunzipSync } from "node:zlib"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery } from "@/lib/analytics-helpers"

const LIFECYCLE_TTL_MIN = 360 // 6 giờ — riêng cho lifecycle, không ảnh hưởng QUERY_TTL_MIN dùng chung

export interface B2BLifecycleRow {
  customer_code: string
  /** Rỗng khi lấy từ cache — chỉ cần tên cho vài dòng hiển thị, dùng `fetchCustomerNames()`. */
  customer_name: string
  sales_pic_code: string | null
  first_order_date: string // YYYY-MM-DD
}

// s203: bảng này có ~112.000 KH B2B (chỉ ~200 KH hoạt động mỗi quý) → JSON gốc ~3,4MB, VƯỢT trần 2MB/mục của Vercel Runtime
// Cache nên trước đây KHÔNG lưu được L2 và mỗi instance nguội phải quét lại cả lịch sử (8-13s). Nén gzip+base64 dạng mảng
// [mã, PIC, ngày] (~0,7MB) để vừa L2, bỏ tên KH khỏi khối cache (tên chỉ cần cho top-10 hiển thị → `fetchCustomerNames`).
interface PackedLifecycle { z: string; n: number }
export function packLifecycleRows(rows: B2BLifecycleRow[]): PackedLifecycle {
  const arr = rows.map(r => [r.customer_code, r.sales_pic_code ?? "", r.first_order_date])
  return { z: gzipSync(Buffer.from(JSON.stringify(arr))).toString("base64"), n: rows.length }
}
export function unpackLifecycleRows(p: PackedLifecycle): B2BLifecycleRow[] {
  const arr = JSON.parse(gunzipSync(Buffer.from(p.z, "base64")).toString()) as [string, string, string][]
  return arr.map(([customer_code, pic, first_order_date]) => ({
    customer_code, customer_name: "", sales_pic_code: pic || null, first_order_date,
  }))
}

/** Tên KH cho một nhóm mã nhỏ (vd top-10 KH rời bỏ mỗi squad) — 1 query nhẹ, không cache. */
export async function fetchCustomerNames(codes: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(codes.filter(Boolean))]
  const out = new Map<string, string>()
  if (uniq.length === 0) return out
  const list = uniq.map(c => `'${c.replace(/'/g, "''")}'`).join(",")
  const rows = await queryAnalytics<{ code: string; name: string | null }>(
    `SELECT TRIM(code::text) as code, MIN(name) as name FROM dim_customer WHERE TRIM(code::text) IN (${list}) GROUP BY 1`,
  )
  for (const r of rows) if (r.name) out.set(r.code, r.name)
  return out
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
  const cacheKey = `b2b_lifecycle_v2:${companyCode}:${cacheKeySuffix}`

  const packed = await cachedQuery(cacheKey, async () => {
    const rows = await queryAnalytics<{ customer_code: string; sales_pic_code: string | null; first_order_date: string }>(`
    SELECT
      TRIM(f.customer_code) as customer_code,
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
  `)
    return packLifecycleRows(rows.map(r => ({ ...r, customer_name: "" })))
  }, LIFECYCLE_TTL_MIN, refresh)
  return unpackLifecycleRows(packed)
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
