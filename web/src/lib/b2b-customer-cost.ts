// Chi phí kênh nhập tay cho từng khách hàng B2B theo tháng (Quarter Report › Chi tiết B2B).
// Primary store: Turso (gohub-intel). Fallback: Supabase (legacy, data cũ trước khi migrate sang Turso).
// cost_lines = [{label,type,value}].

import { tursoQuery } from "@/lib/turso"
import { supabaseAdmin } from "@/lib/supabase"

export interface CostLine { label?: string; type: "amount" | "percent"; value: number }
export interface CostRecord {
  cost_type: string
  cost_value: number
  cost_lines: string   // JSON string (đồng bộ với reference gohub.py)
}

/** Tính tổng chi phí của 1 record theo doanh thu raw (không có factor — dùng cho tháng đã hoàn thành). */
export function calcRecordCost(rec: CostRecord | undefined, rawRevenue: number): number {
  return calcRecordCostProjected(rec, rawRevenue, 1, 1)
}

/**
 * Tính chi phí với pro-rata projection:
 * - amount (tiền cố định):
 *   + Thực tế tới hôm nay (isActual): val * elapsedRatio (phân bổ theo số ngày đã qua).
 *   + Dự phóng trọn tháng (Projected): val * 1 (giữ nguyên tiền cố định cả tháng).
 * - percent:
 *   + Thực tế tới hôm nay: (val / 100) * rawRevenue.
 *   + Dự phóng trọn tháng: (val / 100) * rawRevenue * factor.
 */
export function calcRecordCostProjected(
  rec: CostRecord | undefined,
  rawRevenue: number,
  factor: number,
  elapsedRatio: number = 1,
): number {
  if (!rec) return 0
  if (rec.cost_lines) {
    try {
      const lines: CostLine[] = typeof rec.cost_lines === "string" ? JSON.parse(rec.cost_lines) : (rec.cost_lines as any)
      if (Array.isArray(lines) && lines.length > 0) {
        let tot = 0
        for (const l of lines) {
          const val = Number(l?.value) || 0
          tot += l?.type === "percent" ? (val / 100) * rawRevenue * factor : val * elapsedRatio
        }
        return tot
      }
    } catch { /* fallthrough */ }
  }
  const cval = Number(rec.cost_value) || 0
  return rec.cost_type === "percent" ? (cval / 100) * rawRevenue * factor : cval * elapsedRatio
}

/** Đọc toàn bộ chi phí KH của các tháng trong quý → Map key `${month}_${code}`.
 *  Primary: Turso. Fallback: Supabase (legacy — data lưu trước khi migrate sang Turso).
 */
export async function fetchCustomerCosts(months: string[]): Promise<Map<string, CostRecord>> {
  const map = new Map<string, CostRecord>()
  if (months.length === 0) return map

  const parseRow = (r: { month: string; customer_code: string; cost_type?: string | null; cost_value?: number | null; cost_lines?: unknown }) => {
    map.set(`${r.month}_${r.customer_code}`, {
      cost_type: (r.cost_type as string) ?? "amount",
      cost_value: Number(r.cost_value) || 0,
      cost_lines: typeof r.cost_lines === "string" ? r.cost_lines : JSON.stringify(r.cost_lines ?? []),
    })
  }

  // 1. Turso (primary — data Q3+)
  try {
    const placeholders = months.map(() => "?").join(", ")
    const rows = await tursoQuery<{ month: string; customer_code: string; cost_type: string | null; cost_value: number | null; cost_lines: string | null }>(
      `SELECT month, customer_code, cost_type, cost_value, cost_lines
       FROM b2b_customer_cost_monthly WHERE month IN (${placeholders})`,
      months,
    )
    rows.forEach(parseRow)
    if (map.size > 0) return map  // Turso có data → xong
  } catch { /* bảng chưa tạo hoặc Turso chưa cấu hình */ }

  // 2. Supabase fallback (legacy — data Q2 lưu trước khi migrate sang Turso)
  try {
    const { data } = await supabaseAdmin
      .from("b2b_customer_cost_monthly")
      .select("month, customer_code, cost_type, cost_value, cost_lines")
      .in("month", months)
      ; (data ?? []).forEach(parseRow)
  } catch { /* bảng đã bị drop (v22) hoặc không tồn tại */ }

  return map
}

/** Tạo bảng b2b_customer_cost_monthly nếu chưa có (gọi 1 lần từ API init). Nếu force=true thì drop và tạo mới. */
export async function ensureB2bCostTable(force = false): Promise<void> {
  if (force) {
    await tursoQuery(`DROP TABLE IF EXISTS b2b_customer_cost_monthly`)
  }
  await tursoQuery(`
    CREATE TABLE IF NOT EXISTS b2b_customer_cost_monthly (
      id            TEXT PRIMARY KEY,
      month         TEXT NOT NULL,
      customer_code TEXT NOT NULL,
      cost_type     TEXT DEFAULT 'amount',
      cost_value    REAL DEFAULT 0,
      cost_lines    TEXT DEFAULT '[]',
      updated_by    TEXT,
      updated_at    TEXT
    )
  `)
  await tursoQuery(`CREATE INDEX IF NOT EXISTS idx_b2b_cost_month ON b2b_customer_cost_monthly (month)`)
  await tursoQuery(`CREATE INDEX IF NOT EXISTS idx_b2b_cost_code  ON b2b_customer_cost_monthly (customer_code)`)
}