import { cachedQuery } from "@/lib/analytics-helpers"
import { packLifecycleRows, unpackLifecycleRows, type B2BLifecycleRow } from "@/lib/analytics-engine/b2b-lifecycle"
import { rq } from "./client"
import { excludeCustomersSql } from "./filters"

// Bản rollup của fetchB2BLifecycleRows: ngày mua ĐẦU TIÊN của mỗi KH B2B (không ship, không INACTIVE, loại danh sách loại trừ), toàn lịch sử đã dựng (từ 01/2025, giống bảng thô).
// Cache 6h riêng + khoá theo data_version (đổi version → tính lại), nén như bản thô để vừa trần 2MB của Runtime Cache.
export async function fetchB2BLifecycleRollup(companyCode: string, excludedCustomers: string[], exclHash: string, version: number, refresh = false): Promise<B2BLifecycleRow[]> {
  const co = companyCode !== "ALL" ? ` AND r.company = '${companyCode.replace(/'/g, "''")}'` : ""
  const ex = excludeCustomersSql(excludedCustomers)
  const packed = await cachedQuery(`b2b_lifecycle_ru:${companyCode}:${exclHash}:v${version}`, async () => {
    const rows = await rq(`SELECT r.customer AS customer_code, MIN(TRIM(c.sales_pic_code)) AS sales_pic_code, MIN(r.day) AS first_order_date
      FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer
      WHERE r.basis = 'ful' AND UPPER(COALESCE(s.group_name, '')) = 'B2B' AND r.ship = 0
        AND NOT (UPPER(COALESCE(c.price_list_name, '')) LIKE '%INACTIVE%')${co}${ex ? ` AND ${ex}` : ""}
      GROUP BY 1`)
    return packLifecycleRows(rows.map(r => ({ customer_code: String(r.customer_code), customer_name: "", sales_pic_code: r.sales_pic_code == null ? null : String(r.sales_pic_code), first_order_date: String(r.first_order_date) })))
  }, 360, refresh)
  return unpackLifecycleRows(packed)
}

export interface LifecycleDiff { ok: boolean; raw: number; rollup: number; onlyRaw: number; onlyRollup: number; dateMismatch: number; picMismatch: number; sample: string[] }
export function diffLifecycle(raw: B2BLifecycleRow[], ru: B2BLifecycleRow[]): LifecycleDiff {
  const b = new Map(ru.map(r => [r.customer_code, r] as const))
  let onlyRaw = 0, dateMismatch = 0, picMismatch = 0
  const sample: string[] = []
  for (const r of raw) {
    const o = b.get(r.customer_code)
    if (!o) { onlyRaw++; if (sample.length < 5) sample.push(`chỉ thô: ${r.customer_code}`); continue }
    if (o.first_order_date !== r.first_order_date) { dateMismatch++; if (sample.length < 5) sample.push(`${r.customer_code}: ${r.first_order_date} ≠ ${o.first_order_date}`) }
    else if ((o.sales_pic_code ?? "") !== (r.sales_pic_code ?? "")) picMismatch++
  }
  const a = new Set(raw.map(r => r.customer_code))
  const onlyRollup = ru.filter(r => !a.has(r.customer_code)).length
  return { ok: !onlyRaw && !onlyRollup && !dateMismatch && !picMismatch, raw: raw.length, rollup: ru.length, onlyRaw, onlyRollup, dateMismatch, picMismatch, sample }
}
