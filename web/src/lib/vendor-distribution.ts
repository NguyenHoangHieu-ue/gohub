// Phân bổ doanh thu 1 (hoặc nhiều) vendor theo KHÁCH HÀNG / KÊNH — logic thuần cho api/analytics/vendors/distribution.
// SQL trả mỗi dòng = (nhóm kinh doanh × đơn vị) đã tính sẵn: số của vendor, tổng doanh thu MỌI vendor của đơn vị đó
// (để ra %Contrib) và doanh thu kỳ trước. Ở đây chỉ gộp Organization trải qua nhiều nhóm + tách nhãn hiển thị.

export type DistView = "customer" | "channel"
export type DistGroup = "B2B-Strategic" | "B2B-Non-Strategic" | "B2B" | "B2C" | "Khác"

export interface RawDistRow {
  biz: string
  unit_key: string
  unit_name: string | null
  channels: string | null
  codes: string | null
  orders: string | null
  units: string | null
  revenue: string | null
  margin: string | null
  total_revenue: string | null
  prev_revenue: string | null
}

export interface DistRow {
  group: DistGroup
  kind: "customer" | "channel"
  key: string
  name: string
  channels: string[]
  codes: number
  orders: number
  units: number
  revenue: number
  margin: number
  totalRevenue: number
  prevRevenue: number
}

export const GROUP_ORDER: DistGroup[] = ["B2B-Strategic", "B2B-Non-Strategic", "B2B", "B2C", "Khác"]

/** "VN_Org Vietravel" → "Vietravel" (tên Organization trong dim_customer có tiền tố nước). */
export const stripOrgPrefix = (name: string) => name.replace(/^(VN|US)_Org\s+/i, "")

const num = (v: string | null | undefined) => parseFloat(v || "0") || 0
const GROUPS = new Set<string>(GROUP_ORDER)
const asGroup = (biz: string): DistGroup => (GROUPS.has(biz) ? (biz as DistGroup) : "Khác")

/**
 * Xem theo khách hàng: dòng B2B = 1 Organization (mã KH cùng organization gộp lại, kể cả khi các mã rơi vào 2 nhóm
 * Strategic/Non-Strategic → xếp vào nhóm có doanh thu vendor lớn nhất, giống cách Quarter Report chọn đại diện);
 * dòng B2C = 1 kênh (B2C chỉ có vài mã KH dùng chung nên không có "khách" thật để tách).
 * Xem theo kênh: mỗi kênh 1 dòng trong nhóm B2B hoặc B2C (không tách Strategic nên không bị đếm trùng).
 */
export function buildDistribution(raw: RawDistRow[], view: DistView): DistRow[] {
  const toRow = (r: RawDistRow): DistRow => {
    const group = asGroup(r.biz)
    const kind = view === "customer" && group.startsWith("B2B") ? "customer" : "channel"
    const rawName = r.unit_name || r.unit_key
    return {
      group, kind, key: r.unit_key, name: kind === "customer" ? stripOrgPrefix(rawName) : rawName,
      channels: r.channels ? r.channels.split("|").filter(Boolean) : [],
      codes: num(r.codes), orders: num(r.orders), units: num(r.units),
      revenue: num(r.revenue), margin: num(r.margin), totalRevenue: num(r.total_revenue), prevRevenue: num(r.prev_revenue),
    }
  }

  const out: DistRow[] = []
  const customers = new Map<string, DistRow & { _best: number }>()
  for (const r of raw.map(toRow)) {
    if (r.kind !== "customer") { out.push(r); continue }
    const cur = customers.get(r.key)
    if (!cur) { customers.set(r.key, { ...r, _best: r.revenue }); continue }
    cur.codes += r.codes; cur.orders += r.orders; cur.units += r.units
    cur.revenue += r.revenue; cur.margin += r.margin; cur.totalRevenue += r.totalRevenue; cur.prevRevenue += r.prevRevenue
    cur.channels = [...new Set([...cur.channels, ...r.channels])]
    if (r.revenue > cur._best) { cur._best = r.revenue; cur.group = r.group; cur.name = r.name }
  }
  customers.forEach(c => { const { _best, ...row } = c; void _best; out.push(row) })
  // 2 Organization khác nước nhưng cùng tên sau khi bỏ tiền tố (vd VN_Org SHOPEEPAY / US_Org SHOPEEPAY) → gắn lại (VN)/(US) để phân biệt.
  const count = new Map<string, number>()
  out.forEach(r => { if (r.kind === "customer") count.set(r.name, (count.get(r.name) ?? 0) + 1) })
  out.forEach(r => {
    if (r.kind !== "customer" || (count.get(r.name) ?? 0) < 2) return
    const m = r.key.match(/^(VN|US)_Org\s/i)
    if (m) r.name = `${r.name} (${m[1].toUpperCase()})`
  })
  return out.sort((a, b) => b.revenue - a.revenue)
}

export interface DistTotals { orders: number; units: number; revenue: number; margin: number; totalRevenue: number; prevRevenue: number; count: number }
export function sumRows(rows: DistRow[]): DistTotals {
  return rows.reduce((t, r) => ({
    orders: t.orders + r.orders, units: t.units + r.units, revenue: t.revenue + r.revenue, margin: t.margin + r.margin,
    totalRevenue: t.totalRevenue + r.totalRevenue, prevRevenue: t.prevRevenue + r.prevRevenue, count: t.count + 1,
  }), { orders: 0, units: 0, revenue: 0, margin: 0, totalRevenue: 0, prevRevenue: 0, count: 0 })
}

/** Điều kiện SQL (alias f, KHÔNG alias cho dim) giới hạn bảng SKU theo 1 khách hàng/kênh đang chọn. */
export interface DistFocus { kind: "customer" | "channel"; key: string; group: DistGroup; label: string }
export function focusSql(focus: DistFocus | null): string {
  if (!focus) return ""
  const esc = (s: string) => s.replace(/'/g, "''")
  if (focus.kind === "customer") {
    const k = esc(focus.key)
    return `AND (TRIM(f.customer_code) = '${k}' OR TRIM(f.customer_code) IN (SELECT TRIM(code) FROM dim_customer WHERE COALESCE(NULLIF(TRIM(organization), ''), TRIM(code)) = '${k}'))`
  }
  const grp = focus.group === "B2B" || focus.group === "B2C" ? ` AND UPPER(group_name) = '${focus.group}'` : ""
  const chan = focus.key === "Unknown" ? "(channel_name IS NULL OR TRIM(channel_name) = '')" : `TRIM(channel_name) = '${esc(focus.key)}'`
  return `AND f.order_source_code IN (SELECT code FROM dim_order_source WHERE ${chan}${grp})`
}
