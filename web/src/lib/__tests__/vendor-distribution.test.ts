import { describe, it, expect } from "vitest"
import { buildDistribution, sumRows, focusSql, stripOrgPrefix, type RawDistRow } from "../vendor-distribution"

const raw = (p: Partial<RawDistRow>): RawDistRow => ({
  biz: "B2B-Strategic", unit_key: "k", unit_name: "K", channels: "Momo", codes: "1", orders: "1", units: "1",
  revenue: "100", margin: "40", total_revenue: "200", prev_revenue: "0", ...p,
})

describe("buildDistribution", () => {
  it("gộp Organization nằm ở 2 nhóm, xếp vào nhóm có doanh thu lớn hơn, cộng đủ số", () => {
    const rows = buildDistribution([
      raw({ biz: "B2B-Strategic", unit_key: "VN_Org A", unit_name: "VN_Org A", revenue: "300", total_revenue: "500", codes: "2", orders: "5", channels: "Momo|VN-Ecom" }),
      raw({ biz: "B2B-Non-Strategic", unit_key: "VN_Org A", unit_name: "VN_Org A", revenue: "100", total_revenue: "150", codes: "1", orders: "2", channels: "VN-Wholesales" }),
    ], "customer")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ group: "B2B-Strategic", kind: "customer", name: "A", codes: 3, orders: 7, revenue: 400, totalRevenue: 650 })
    expect(rows[0].channels.sort()).toEqual(["Momo", "VN-Ecom", "VN-Wholesales"])
  })

  it("2 Organization cùng tên khác nước → gắn hậu tố (VN)/(US); không trùng thì giữ nguyên", () => {
    const rows = buildDistribution([
      raw({ unit_key: "US_Org SHOPEEPAY", unit_name: "US_Org SHOPEEPAY", revenue: "500" }),
      raw({ unit_key: "VN_Org SHOPEEPAY", unit_name: "VN_Org SHOPEEPAY", revenue: "100" }),
      raw({ unit_key: "VN_Org Momo", unit_name: "VN_Org Momo", revenue: "50" }),
    ], "customer")
    expect(rows.map(r => r.name)).toEqual(["SHOPEEPAY (US)", "SHOPEEPAY (VN)", "Momo"])
  })

  it("xem theo khách hàng: B2C giữ nguyên theo kênh", () => {
    const rows = buildDistribution([raw({ biz: "B2C", unit_key: "Misc.", unit_name: "Misc.", revenue: "50" })], "customer")
    expect(rows[0]).toMatchObject({ group: "B2C", kind: "channel", key: "Misc.", name: "Misc." })
  })

  it("xem theo kênh: mỗi kênh 1 dòng, không gộp, không bỏ tiền tố", () => {
    const rows = buildDistribution([
      raw({ biz: "B2B", unit_key: "VN-Wholesales", unit_name: "VN-Wholesales", revenue: "700" }),
      raw({ biz: "B2C", unit_key: "VN-Web eSIM", unit_name: "VN-Web eSIM", revenue: "300" }),
    ], "channel")
    expect(rows.map(r => `${r.group}:${r.key}`)).toEqual(["B2B:VN-Wholesales", "B2C:VN-Web eSIM"])
    expect(rows.every(r => r.kind === "channel")).toBe(true)
  })

  it("sắp theo doanh thu giảm dần; sumRows cộng đúng", () => {
    const rows = buildDistribution([
      raw({ unit_key: "a", revenue: "10", total_revenue: "20" }), raw({ unit_key: "b", revenue: "90", total_revenue: "100", biz: "B2C" }),
    ], "customer")
    expect(rows[0].key).toBe("b")
    expect(sumRows(rows)).toMatchObject({ revenue: 100, totalRevenue: 120, count: 2 })
  })
})

describe("focusSql / stripOrgPrefix", () => {
  it("khách hàng: lọc theo mã và theo organization, escape nháy đơn", () => {
    const s = focusSql({ kind: "customer", key: "VN_Org O'Neil", group: "B2B-Strategic", label: "x" })
    expect(s).toContain("TRIM(f.customer_code) = 'VN_Org O''Neil'")
    expect(s).toContain("COALESCE(NULLIF(TRIM(organization), ''), TRIM(code)) = 'VN_Org O''Neil'")
  })
  it("kênh: kèm nhóm B2B/B2C để khớp số của dòng", () => {
    expect(focusSql({ kind: "channel", key: "Misc.", group: "B2C", label: "x" })).toContain("TRIM(channel_name) = 'Misc.' AND UPPER(group_name) = 'B2C'")
    expect(focusSql({ kind: "channel", key: "Misc.", group: "Khác", label: "x" })).not.toContain("group_name")
    expect(focusSql(null)).toBe("")
  })
  it("bỏ tiền tố VN_Org/US_Org", () => {
    expect(stripOrgPrefix("US_Org SHOPEEPAY")).toBe("SHOPEEPAY")
    expect(stripOrgPrefix("Vietravel")).toBe("Vietravel")
  })
})
