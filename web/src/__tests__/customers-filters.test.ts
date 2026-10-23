import { describe, it, expect } from "vitest"
import { deriveCustomerOptions, normalizeCustomerSelection, foldText, type CustomerFilterData } from "../lib/customers-filters"
import { NO_PIC } from "../lib/orders-filters"

const KWS = { Gold: ["GOLD"], Silver: ["SILVER"], Strategic: ["STRATEGIC"], VIP: ["VIP"] }
const data: CustomerFilterData = {
  customers: [
    { code: "C1", name: "Công ty Momo", pln: "[DMM] VN OD Momo" },
    { code: "C2", name: "Đại lý Vàng", pln: "[TV3] VN TIER GOLD (CN)" },
    { code: "C3", name: "Khách Bạc", pln: "[TV5] VN SILVER" },
  ],
  channels: ["Momo", "Wholesales", "Portal"],
  staff: [{ code: "A1", name: "An|EN-An" }, { code: "B2", name: "Bình" }],
  // [khách, kênh, PIC, đơn, doanh thu]
  combos: [[0, 0, 0, 10, 500_000_000], [1, 1, 1, 4, 120_000_000], [1, 2, 1, 1, 30_000_000], [2, 1, -1, 2, 8_000_000]],
}
const none = { tier: "", channel: "", staff: "" }

describe("customers-filters", () => {
  it("không lọc: khách xếp theo doanh thu, đếm KHÁCH (không đếm dòng), tier theo bảng giá B2B", () => {
    const o = deriveCustomerOptions(data, none, KWS)
    expect(o.customers.map(c => c.name)).toEqual(["Công ty Momo", "Đại lý Vàng", "Khách Bạc"])
    expect(o.customers[1]).toMatchObject({ tier: "Gold", orders: 5, revenue: 150_000_000 })
    expect(o.tiers.map(t => [t.value, t.orders])).toEqual([["Strategic", 1], ["Gold", 1], ["Silver", 1]])
    expect(o.channels.find(c => c.value === "Wholesales")?.orders).toBe(2)   // Gold + Silver
    expect(o.staff.map(s => s.label).sort()).toEqual(["An", "Bình", "Chưa gán PIC"].sort())   // tên PIC chỉ phần trước "|"
  })

  it("chọn kênh: doanh thu/đơn của khách chỉ tính trong kênh đó; các bộ lọc khác thu hẹp", () => {
    const o = deriveCustomerOptions(data, { ...none, channel: "Wholesales" }, KWS)
    expect(o.customers.map(c => c.name)).toEqual(["Đại lý Vàng", "Khách Bạc"])
    expect(o.customers[0].revenue).toBe(120_000_000)
    expect(o.tiers.map(t => t.value)).toEqual(["Gold", "Silver"])
    expect(o.channels.length).toBe(3)   // bộ lọc Kênh vẫn thấy đủ kênh của các khách còn lại
  })

  it("lọc chưa gán PIC, tìm không dấu theo tên/mã", () => {
    expect(deriveCustomerOptions(data, { ...none, staff: NO_PIC }, KWS).customers.map(c => c.name)).toEqual(["Khách Bạc"])
    expect(deriveCustomerOptions(data, none, KWS, "dai ly vang").customers.map(c => c.name)).toEqual(["Đại lý Vàng"])
    expect(deriveCustomerOptions(data, none, KWS, "c1").customers.map(c => c.name)).toEqual(["Công ty Momo"])
    expect(foldText("Đại lý Vàng")).toBe("dai ly vang")
  })

  it("normalize bỏ lựa chọn không còn khách (ưu tiên Tier > Kênh > PIC)", () => {
    expect(normalizeCustomerSelection(data, { tier: "Gold", channel: "Momo", staff: "" }, KWS)).toEqual({ tier: "Gold", channel: "", staff: "" })
    expect(normalizeCustomerSelection(data, { tier: "", channel: "Portal", staff: "A1" }, KWS)).toEqual({ tier: "", channel: "Portal", staff: "" })
  })
})
