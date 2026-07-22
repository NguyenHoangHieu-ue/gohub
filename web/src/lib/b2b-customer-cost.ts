// Chi phí kênh nhập tay cho từng khách hàng B2B theo tháng (Quarter Report › Chi tiết B2B).
// Lưu ở Supabase b2b_customer_cost_monthly. cost_lines = [{label,type,value}].

import { supabaseAdmin } from "@/lib/supabase"

export interface CostLine { label?: string; type: "amount" | "percent"; value: number }
export interface CostRecord {
  cost_type: string
  cost_value: number
  cost_lines: string   // JSON string (đồng bộ với reference gohub.py)
}

/** Tính tổng chi phí của 1 record theo doanh thu raw của tháng (mirror _calc_record_cost). */
export function calcRecordCost(rec: CostRecord | undefined, rawRevenue: number): number {
  if (!rec) return 0
  // Ưu tiên cost_lines
  if (rec.cost_lines) {
    try {
      const lines: CostLine[] = typeof rec.cost_lines === "string" ? JSON.parse(rec.cost_lines) : (rec.cost_lines as any)
      if (Array.isArray(lines) && lines.length > 0) {
        let tot = 0
        for (const l of lines) {
          const val = Number(l?.value) || 0
          tot += l?.type === "percent" ? (val / 100) * rawRevenue : val
        }
        return tot
      }
    } catch { /* fallthrough */ }
  }
  // Fallback: cột đơn cost_type/cost_value
  const cval = Number(rec.cost_value) || 0
  return rec.cost_type === "percent" ? (cval / 100) * rawRevenue : cval
}

/** Đọc toàn bộ chi phí KH của các tháng trong quý → Map key `${month}_${code}`. */
export async function fetchCustomerCosts(months: string[]): Promise<Map<string, CostRecord>> {
  const map = new Map<string, CostRecord>()
  try {
    const { data } = await supabaseAdmin
      .from("b2b_customer_cost_monthly")
      .select("month, customer_code, cost_type, cost_value, cost_lines")
      .in("month", months)
    ;(data || []).forEach((r: any) => {
      map.set(`${r.month}_${r.customer_code}`, {
        cost_type: r.cost_type ?? "amount",
        cost_value: Number(r.cost_value) || 0,
        cost_lines: typeof r.cost_lines === "string" ? r.cost_lines : JSON.stringify(r.cost_lines ?? []),
      })
    })
  } catch { /* bảng chưa tạo → trả rỗng */ }
  return map
}
