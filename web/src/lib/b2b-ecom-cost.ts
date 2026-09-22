// Chi phí kênh nhập tay cho VN Ecom Breakdown (B2B Performance) — theo customer/shop/sub-shop × tháng.
// Bảng RIÊNG với b2b_customer_cost_monthly (theo yêu cầu Hiếu 2026-09-22): breakdown VN Ecom tách theo
// shop (SIM/eSIM) và sub-shop (Gohub/Nobrand) — không có customer_code cho từng cấp đó, chỉ có
// customer_name/shop_name/subshop_name. cost_lines = [{label,type,value}] — cùng format b2b-customer-cost.ts.

import { tursoQuery } from "@/lib/turso"
import type { CostRecord } from "@/lib/b2b-customer-cost"

export type { CostRecord }

export function ecomCostKey(month: string, customerName: string, shopName: string, subshopName: string): string {
  return `${month}::${customerName}::${shopName}::${subshopName || ""}`
}

/** Đọc toàn bộ chi phí VN Ecom của các tháng → Map key `ecomCostKey(...)`. */
export async function fetchEcomCosts(months: string[]): Promise<Map<string, CostRecord>> {
  const map = new Map<string, CostRecord>()
  if (months.length === 0) return map
  try {
    const placeholders = months.map(() => "?").join(", ")
    const rows = await tursoQuery<{
      month: string; customer_name: string; shop_name: string; subshop_name: string | null
      cost_type: string | null; cost_value: number | null; cost_lines: string | null
    }>(
      `SELECT month, customer_name, shop_name, subshop_name, cost_type, cost_value, cost_lines
       FROM b2b_ecom_cost_monthly WHERE month IN (${placeholders})`,
      months,
    )
    rows.forEach(r => {
      map.set(ecomCostKey(r.month, r.customer_name, r.shop_name, r.subshop_name || ""), {
        cost_type: r.cost_type ?? "amount",
        cost_value: Number(r.cost_value) || 0,
        cost_lines: typeof r.cost_lines === "string" ? r.cost_lines : JSON.stringify(r.cost_lines ?? []),
      })
    })
  } catch { /* bảng chưa tạo */ }
  return map
}

/** Tạo bảng b2b_ecom_cost_monthly nếu chưa có. force=true → drop và tạo mới (dùng khi lỗi schema cũ). */
export async function ensureB2bEcomCostTable(force = false): Promise<void> {
  if (force) await tursoQuery(`DROP TABLE IF EXISTS b2b_ecom_cost_monthly`)
  await tursoQuery(`
    CREATE TABLE IF NOT EXISTS b2b_ecom_cost_monthly (
      id             TEXT PRIMARY KEY,
      month          TEXT NOT NULL,
      customer_name  TEXT NOT NULL,
      shop_name      TEXT NOT NULL,
      subshop_name   TEXT DEFAULT '',
      cost_type      TEXT DEFAULT 'amount',
      cost_value     REAL DEFAULT 0,
      cost_lines     TEXT DEFAULT '[]',
      updated_by     TEXT,
      updated_at     TEXT
    )
  `)
  await tursoQuery(`CREATE INDEX IF NOT EXISTS idx_b2b_ecom_cost_month ON b2b_ecom_cost_monthly (month)`)
}
