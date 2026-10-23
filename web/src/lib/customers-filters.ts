import { classifyOrderTier, ORDER_TIERS, NO_PIC, picDisplayName, type Opt } from "@/lib/orders-filters"

// Bộ chọn khách ở tab Customers (s240): danh sách khách B2B CÓ ĐƠN trong kỳ, lọc nhiều tầng Tier → Kênh → PIC kèm số khách,
// xếp theo doanh thu. Thuần (không DB) để dùng chung cho API, trang và test.

export interface CustomerFilterData {
  customers: { code: string; name: string; pln: string }[]
  channels: string[]
  staff: { code: string; name: string }[]
  /** [chỉ số khách, chỉ số kênh (-1 = không rõ), chỉ số PIC (-1 = chưa gán), số đơn, doanh thu VND] */
  combos: [number, number, number, number, number][]
}
export interface CustomerSelection { tier: string; channel: string; staff: string }
export interface CustomerRow { name: string; code: string; tier: string; orders: number; revenue: number }
export interface CustomerOptions { tiers: Opt[]; channels: Opt[]; staff: Opt[]; customers: CustomerRow[]; totalCustomers: number }

/** Tên khách + mã → chuỗi tìm kiếm không dấu, chữ thường. */
export function foldText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()
}

export function deriveCustomerOptions(data: CustomerFilterData, sel: CustomerSelection, kws: Record<string, string[]>, search = ""): CustomerOptions {
  const tierOfCust = data.customers.map(c => classifyOrderTier("B2B", c.pln, kws))
  const q = foldText(search.trim())
  const hit = data.customers.map(c => !q || foldText(c.name).includes(q) || foldText(c.code).includes(q))

  type Combo = [number, number, number, number, number]
  const pass = (c: Combo, skip: keyof CustomerSelection | null): boolean => {
    if (!hit[c[0]]) return false
    if (skip !== "tier" && sel.tier && tierOfCust[c[0]] !== sel.tier) return false
    if (skip !== "channel" && sel.channel && (c[1] < 0 ? "" : data.channels[c[1]]) !== sel.channel) return false
    if (skip !== "staff" && sel.staff) {
      const code = c[2] < 0 ? NO_PIC : data.staff[c[2]]?.code
      if (code !== sel.staff) return false
    }
    return true
  }
  // Đếm KHÁCH (không đếm dòng): một khách có thể mua qua nhiều kênh/PIC
  const countCustomers = (skip: keyof CustomerSelection, keyOf: (c: Combo) => string | null) => {
    const m = new Map<string, Set<number>>()
    for (const c of data.combos) {
      if (!pass(c, skip)) continue
      const k = keyOf(c)
      if (k === null) continue
      let s = m.get(k)
      if (!s) { s = new Set(); m.set(k, s) }
      s.add(c[0])
    }
    return m
  }
  const tiers = countCustomers("tier", c => tierOfCust[c[0]])
  const channels = countCustomers("channel", c => (c[1] < 0 ? null : data.channels[c[1]]))
  const staff = countCustomers("staff", c => (c[2] < 0 ? NO_PIC : data.staff[c[2]]?.code ?? null))

  const rows = new Map<number, CustomerRow>()
  for (const c of data.combos) {
    if (!pass(c, null)) continue
    const cu = data.customers[c[0]]
    const r = rows.get(c[0]) ?? { name: cu.name, code: cu.code, tier: tierOfCust[c[0]], orders: 0, revenue: 0 }
    r.orders += c[3]; r.revenue += c[4]
    rows.set(c[0], r)
  }
  const customers = [...rows.values()].sort((a, b) => b.revenue - a.revenue)
  return {
    tiers: ORDER_TIERS.filter(t => tiers.has(t)).map(t => ({ value: t, label: t, orders: tiers.get(t)!.size })),
    channels: [...channels].map(([v, s]) => ({ value: v, label: v, orders: s.size })).sort((a, b) => a.label.localeCompare(b.label, "vi")),
    staff: [...staff].map(([v, s]) => ({ value: v, label: v === NO_PIC ? "Chưa gán PIC" : picDisplayName(data.staff.find(x => x.code === v)?.name) || v, orders: s.size })).sort((a, b) => a.label.localeCompare(b.label, "vi")),
    customers,
    totalCustomers: customers.length,
  }
}

/** Bỏ lựa chọn không còn khách nào (theo thứ tự Tier > Kênh > PIC) — vd đổi kỳ làm kênh đang chọn hết khách. */
export function normalizeCustomerSelection(data: CustomerFilterData, sel: CustomerSelection, kws: Record<string, string[]>): CustomerSelection {
  const kept: CustomerSelection = { tier: "", channel: "", staff: "" }
  const fields: [keyof CustomerSelection, "tiers" | "channels" | "staff"][] = [["tier", "tiers"], ["channel", "channels"], ["staff", "staff"]]
  for (const [f, key] of fields) {
    const want = sel[f]
    if (!want) continue
    if (deriveCustomerOptions(data, { ...kept, [f]: want }, kws)[key].some(o => o.value === want)) kept[f] = want
  }
  return kept
}
