import { describe, it, expect } from "vitest"
import { deriveVendorOptions, normalizeVendorSelection, type VendorFilterData } from "../lib/vendors-filters"

const data: VendorFilterData = {
  vendors: ["3HK DATAPOOL", "WorldMove", "BC Datapool (CMHK)"],
  groups: ["B2B", "B2C"],
  channels: ["Momo", "VN-Web SIM", "Global-Web"],
  // [vendor, nhóm, kênh, đơn, doanh thu]
  combos: [[0, 0, 0, 100, 500_000_000], [0, 1, 1, 40, 80_000_000], [1, 1, 1, 30, 200_000_000], [1, 1, 2, 10, 30_000_000], [2, 0, 0, 5, 20_000_000]],
}
const none = { vendors: [] as string[], group: "", channel: "" }

describe("vendors-filters", () => {
  it("không chọn gì: vendor xếp theo doanh thu, kèm đơn + doanh thu; nhóm/kênh đủ", () => {
    const o = deriveVendorOptions(data, none)
    expect(o.vendors.map(v => [v.value, v.orders, v.revenue])).toEqual([
      ["3HK DATAPOOL", 140, 580_000_000], ["WorldMove", 40, 230_000_000], ["BC Datapool (CMHK)", 5, 20_000_000],
    ])
    expect(o.groups.map(g => g.value)).toEqual(["B2B", "B2C"])
    expect(o.channels.length).toBe(3)
  })

  it("chọn vendor: nhóm/kênh thu hẹp theo vendor, bộ lọc Vendor vẫn thấy đủ vendor", () => {
    const o = deriveVendorOptions(data, { ...none, vendors: ["WorldMove"] })
    expect(o.groups.map(g => g.value)).toEqual(["B2C"])
    expect(o.channels.map(c => c.value).sort()).toEqual(["Global-Web", "VN-Web SIM"])
    expect(o.vendors.length).toBe(3)
  })

  it("chọn nhóm B2B: vendor chỉ còn vendor có bán B2B, doanh thu chỉ tính trong B2B", () => {
    const o = deriveVendorOptions(data, { ...none, group: "B2B" })
    expect(o.vendors.map(v => [v.value, v.revenue])).toEqual([["3HK DATAPOOL", 500_000_000], ["BC Datapool (CMHK)", 20_000_000]])
    expect(o.channels.map(c => c.value)).toEqual(["Momo"])
  })

  it("nhiều vendor cùng lúc cộng gộp", () => {
    const o = deriveVendorOptions(data, { ...none, vendors: ["WorldMove", "BC Datapool (CMHK)"] })
    expect(o.groups.map(g => [g.value, g.revenue])).toEqual([["B2C", 230_000_000], ["B2B", 20_000_000]])
  })

  it("normalize bỏ nhóm/kênh không còn doanh thu, giữ vendor người dùng chọn", () => {
    expect(normalizeVendorSelection(data, { vendors: ["WorldMove"], group: "B2B", channel: "Momo" }))
      .toEqual({ vendors: ["WorldMove"], group: "", channel: "" })
    expect(normalizeVendorSelection(data, { vendors: ["WorldMove"], group: "B2C", channel: "Momo" }))
      .toEqual({ vendors: ["WorldMove"], group: "B2C", channel: "" })
  })
})
