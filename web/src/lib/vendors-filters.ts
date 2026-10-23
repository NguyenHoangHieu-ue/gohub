// Bộ lọc tab Vendors (s240): lựa chọn Vendor / Nhóm kênh / Kênh CHỈ GỒM những gì có doanh thu trong kỳ, lọc nhiều tầng kèm số đơn + doanh thu.
// Dùng cùng chuẩn "doanh thu SP thuần" của trang (loại phí ship + đơn nội bộ). Thuần (không DB).

export interface VendorFilterData {
  vendors: string[]
  groups: string[]
  channels: string[]
  /** [chỉ số vendor, chỉ số nhóm (-1 = không rõ), chỉ số kênh (-1 = không rõ), số đơn, doanh thu VND] */
  combos: [number, number, number, number, number][]
}
export interface VendorSelection { vendors: string[]; group: string; channel: string }
export interface VOpt { value: string; label: string; orders: number; revenue: number }
export interface VendorOptions { vendors: VOpt[]; groups: VOpt[]; channels: VOpt[] }

type Combo = [number, number, number, number, number]

export function deriveVendorOptions(data: VendorFilterData, sel: VendorSelection): VendorOptions {
  const chosen = new Set(sel.vendors)
  const pass = (c: Combo, skip: "vendor" | "group" | "channel"): boolean => {
    if (skip !== "vendor" && chosen.size && !chosen.has(data.vendors[c[0]])) return false
    if (skip !== "group" && sel.group && (c[1] < 0 ? "" : data.groups[c[1]]) !== sel.group) return false
    if (skip !== "channel" && sel.channel && (c[2] < 0 ? "" : data.channels[c[2]]) !== sel.channel) return false
    return true
  }
  const tally = (skip: "vendor" | "group" | "channel", keyOf: (c: Combo) => string | null): VOpt[] => {
    const m = new Map<string, VOpt>()
    for (const c of data.combos) {
      if (!pass(c, skip)) continue
      const k = keyOf(c)
      if (k === null || k === "") continue
      const o = m.get(k) ?? { value: k, label: k, orders: 0, revenue: 0 }
      o.orders += c[3]; o.revenue += c[4]
      m.set(k, o)
    }
    return [...m.values()]
  }
  const byRevenue = (a: VOpt, b: VOpt) => b.revenue - a.revenue
  return {
    vendors: tally("vendor", c => data.vendors[c[0]]).sort(byRevenue),
    groups: tally("group", c => (c[1] < 0 ? null : data.groups[c[1]])).sort(byRevenue),
    channels: tally("channel", c => (c[2] < 0 ? null : data.channels[c[2]])).sort(byRevenue),
  }
}

/** Bỏ Nhóm/Kênh không còn doanh thu khi đổi vendor hoặc kỳ (ưu tiên Vendor > Nhóm > Kênh; vendor người dùng chọn thì giữ nguyên). */
export function normalizeVendorSelection(data: VendorFilterData, sel: VendorSelection): VendorSelection {
  const kept: VendorSelection = { vendors: sel.vendors, group: "", channel: "" }
  if (sel.group && deriveVendorOptions(data, { ...kept, group: sel.group }).groups.some(o => o.value === sel.group)) kept.group = sel.group
  if (sel.channel && deriveVendorOptions(data, { ...kept, channel: sel.channel }).channels.some(o => o.value === sel.channel)) kept.channel = sel.channel
  return kept
}
