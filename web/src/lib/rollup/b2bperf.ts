import { memo } from "@/lib/memo"
import { rq } from "./client"
import { b2bFilterSql } from "./filters"
import { diffRows } from "./quarter"

// Bản rollup của truy vấn gốc trong /api/analytics/b2b/performance (groupBy=channel | customer): doanh thu/lãi/số lượng B2B theo kênh hoặc khách × kênh con × tháng.
// Trả ĐÚNG hình dạng dòng của đường thô (chuỗi số) để phần tổng hợp phía sau dùng nguyên. Các groupBy khác (vendor, sku, destination, staff) rollup không có chiều → đường thô.
export type PerfGroupBy = "channel" | "customer"
export type PerfRow = Record<string, string>
export interface PerfArgs { groupBy: PerfGroupBy; basis: "ful" | "sal"; start: string; end: string; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }

// Postgres so MAX() text theo collation, SQLite nhị phân → gộp MAX phía JS bằng Intl.Collator (xem b2bcust.ts).
const collator = new Intl.Collator("en")
const maxText = (a: string | null | undefined, b: string | null | undefined) => (a == null ? b ?? null : b == null ? a : collator.compare(a, b) >= 0 ? a : b)
const n = (v: unknown) => String(Number(v ?? 0))

/** Ngày đầu tiên rollup có của một cơ sở (ful từ 2025-01-01, sal từ 2025-12-09); trước mốc này rollup thiếu dữ liệu nên phải dùng đường thô. */
export async function rollupFirstDay(basis: "ful" | "sal"): Promise<string | null> {
  return memo(`ru_first_day:${basis}`, 300_000, async () => {
    const r = await rq("SELECT MIN(day) AS d FROM ru_day_hash WHERE basis = ?", [basis])
    return r[0]?.d == null ? null : String(r[0].d)
  })
}

export async function fetchB2bPerfRollup(a: PerfArgs): Promise<PerfRow[]> {
  const f = b2bFilterSql({ includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, inactive: true, excludedCustomers: a.excludedCustomers })
  const cust = a.groupBy === "customer"
  const nameExpr = cust ? "COALESCE(c.name, NULLIF(NULLIF(r.customer, ''), 'NaN'), 'Chưa xác định')" : "TRIM(s.channel_name)"
  const rows = await rq(`SELECT ${nameExpr} AS name, r.customer AS customer_code, TRIM(s.channel_name) AS channel, TRIM(COALESCE(s.sub_group_name, '')) AS sub_group_name, r.source AS source_code,
      c.price_list_name AS price_list_name, c.currency_code AS currency_code, TRIM(s.sapo_name) AS sub_channel, substr(r.day, 1, 7) AS month,
      SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS margin, SUM(r.qty) AS units
    FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer
    WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2B'${f}
    GROUP BY 1, ${cust ? "2," : ""} 3, 4, 5, 6, 7, 8, 9`, [a.basis, a.start, a.end])

  // Gộp về đúng mức nhóm của đường thô: kênh → (kênh, kênh con, tháng); khách → (tên, mã, kênh con, tháng); MAX các cột chữ.
  const out = new Map<string, PerfRow & { _ch: string | null; _sg: string | null; _src: string | null; _pl: string | null; _cur: string | null }>()
  for (const r of rows) {
    const key = [cust ? `${r.name}|${r.customer_code}` : String(r.name), String(r.sub_channel ?? ""), r.month].join("\u0001")
    let o = out.get(key)
    if (!o) {
      o = { name: r.name == null ? (null as unknown as string) : String(r.name), sub_channel: r.sub_channel == null ? (null as unknown as string) : String(r.sub_channel), month: String(r.month), revenue: "0", margin: "0", units: "0",
        ...(cust ? { customer_code: String(r.customer_code ?? "") } : {}), _ch: null, _sg: null, _src: null, _pl: null, _cur: null } as never
      out.set(key, o)
    }
    o.revenue = n(Number(o.revenue) + Number(r.revenue ?? 0)); o.margin = n(Number(o.margin) + Number(r.margin ?? 0)); o.units = n(Number(o.units) + Number(r.units ?? 0))
    o._ch = maxText(o._ch, r.channel == null ? null : String(r.channel)); o._sg = maxText(o._sg, r.sub_group_name == null ? null : String(r.sub_group_name))
    o._src = maxText(o._src, r.source_code == null ? null : String(r.source_code))
    o._pl = maxText(o._pl, r.price_list_name == null ? null : String(r.price_list_name)); o._cur = maxText(o._cur, r.currency_code == null ? null : String(r.currency_code))
  }
  return [...out.values()].map(({ _ch, _sg, _src, _pl, _cur, ...o }) => ({ ...o, channel: _ch as string, sub_group_name: _sg as string, source_code: _src as string, ...(cust ? { price_list_name: _pl as string, currency_code: _cur as string } : {}) }))
}

export function diffB2bPerf(raw: PerfRow[], ru: PerfRow[]) {
  const key = (r: PerfRow) => `${r.name ?? ""}|${r.customer_code ?? ""}|${r.sub_channel ?? ""}|${r.month}`
  const d = diffRows(raw, ru, key, ["revenue", "margin", "units"])
  const b = new Map(ru.map(r => [key(r), r] as const))
  let textMismatch = 0
  const sample: string[] = []
  for (const r of raw) {
    const o = b.get(key(r))
    if (!o) continue
    for (const k of ["channel", "sub_group_name", "source_code", "price_list_name", "currency_code"]) {
      if ((r[k] ?? "") !== (o[k] ?? "")) { textMismatch++; if (sample.length < 5) sample.push(`${key(r)} ${k}: thô "${r[k] ?? ""}" ≠ rollup "${o[k] ?? ""}"`); break }
    }
  }
  return { ok: d.ok && !textMismatch, rows: d, textMismatch, textSample: sample }
}
