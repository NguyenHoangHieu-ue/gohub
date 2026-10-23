import { describe, it, expect } from "vitest"
import { classifyOrderTier, orderTierSql, deriveFilterOptions, normalizeSelection, NO_PIC, type OrderFilterData } from "../lib/orders-filters"
import { baseWhere, filterWhere, parseOrderBase, readFilterParams } from "../lib/orders-where"

const KWS = { Gold: ["GOLD"], Silver: ["SILVER"], Strategic: ["STRATEGIC"], VIP: ["VIP"] }

describe("classifyOrderTier", () => {
  it("B2B theo bảng giá (cùng luật Quarter Report); không khớp = Strategic", () => {
    expect(classifyOrderTier("B2B", "[TV2] VN TIER VIP (KCN)", KWS)).toBe("VIP")
    expect(classifyOrderTier("B2B", "[TV3] VN TIER GOLD (CN)", KWS)).toBe("Gold")
    expect(classifyOrderTier("B2B", "[TV5] VN SILVER", KWS)).toBe("Silver")
    expect(classifyOrderTier("B2B", "[DMM] VN OD Momo", KWS)).toBe("Strategic")
    expect(classifyOrderTier("b2b", null, KWS)).toBe("Strategic")
  })
  it("B2C là B2C kể cả khi bảng giá không khớp từ khoá nào (trước đây bị tô Strategic)", () => {
    expect(classifyOrderTier("B2C", "[BVN] VN B2C Website", KWS)).toBe("B2C")
    expect(classifyOrderTier("B2C", null, KWS)).toBe("B2C")
  })
  it("đơn nội bộ hoặc không rõ nhóm là 'Khác'", () => {
    expect(classifyOrderTier("INTERNAL-TRANSACTION", "[OPU] Internal Ops US", KWS)).toBe("Khác")
    expect(classifyOrderTier(null, "x", KWS)).toBe("Khác")
  })
})

describe("orderTierSql", () => {
  it("cùng thứ tự từ khoá, escape dấu nháy, không dùng LIKE", () => {
    const sql = orderTierSql({ Gold: ["GOLD", "VÀNG'"], VIP: ["VIP"] }, "s.group_name", "dc.price_list_name")
    expect(sql).toContain("WHEN UPPER(COALESCE(s.group_name, '')) = 'B2C' THEN 'B2C'")
    expect(sql.indexOf("'GOLD'")).toBeLessThan(sql.indexOf("'VIP'"))
    expect(sql).toContain("'VÀNG'''")
    expect(sql).toContain("ELSE 'Strategic' END")
    expect(sql).not.toMatch(/\bLIKE\b/)
  })
  it("tier không nằm trong danh mục thì quy về Strategic (không chèn chuỗi lạ vào SQL)", () => {
    expect(orderTierSql({ "x'; DROP": ["A"] }, "g", "p")).not.toContain("DROP")
  })
})

describe("lọc nhiều tầng", () => {
  const data: OrderFilterData = {
    sources: [
      { code: "S0001", name: "VN B2C SAPO SIM", channel: "VN-Web SIM", group: "B2C", status: "Active" },
      { code: "S0003", name: "[INACTIVE] VN B2C Hotline SIM", channel: "VN-Web SIM", group: "B2C", status: "Inactive" },
      { code: "S0100", name: "OD Momo", channel: "Momo", group: "B2B", status: "Active" },
    ],
    staff: [{ code: "A1", name: "An" }, { code: "B2", name: "Bình" }],
    plns: ["[BVN] VN B2C Website", "[DMM] VN OD Momo", "[TV3] VN TIER GOLD (CN)"],
    combos: [[0, 0, 0, 10], [1, 0, 0, 2], [2, 1, 1, 7], [2, -1, 2, 3]],
  }
  const none = { group: "", channel: "", source: "", staff: "", tier: "" }

  it("không chọn gì: mọi lựa chọn kèm số đơn; PIC có 'Chưa gán PIC'; nguồn ngừng được đánh dấu", () => {
    const o = deriveFilterOptions(data, none, KWS)
    expect(o.groups.map(x => [x.value, x.orders])).toEqual([["B2C", 12], ["B2B", 10]])
    expect(o.channels.map(x => x.value).sort()).toEqual(["Momo", "VN-Web SIM"])
    expect(o.staff.find(x => x.value === NO_PIC)?.orders).toBe(3)
    expect(o.sources.find(x => x.value === "S0003")).toMatchObject({ muted: true })
    expect(o.sources.find(x => x.value === "S0003")?.label).toContain("ngừng")
    expect(o.tiers.map(x => x.value)).toEqual(["Strategic", "Gold", "B2C"].filter(t => ["Strategic", "Gold", "B2C"].includes(t)).sort((a, b) => ["Strategic", "VIP", "Gold", "Silver", "B2C", "Khác"].indexOf(a) - ["Strategic", "VIP", "Gold", "Silver", "B2C", "Khác"].indexOf(b)))
  })

  it("chọn nhóm B2C: kênh/nguồn/PIC/tier thu hẹp; bộ lọc Nhóm vẫn thấy cả hai nhóm", () => {
    const o = deriveFilterOptions(data, { ...none, group: "B2C" }, KWS)
    expect(o.channels.map(x => x.value)).toEqual(["VN-Web SIM"])
    expect(o.sources.map(x => x.value).sort()).toEqual(["S0001", "S0003"])
    expect(o.staff.map(x => x.value)).toEqual(["A1"])
    expect(o.tiers.map(x => x.value)).toEqual(["B2C"])
    expect(o.groups.map(x => x.value).sort()).toEqual(["B2B", "B2C"])
  })

  it("tier Gold chỉ còn đơn Gold (B2B, chưa gán PIC)", () => {
    const o = deriveFilterOptions(data, { ...none, tier: "Gold" }, KWS)
    expect(o.staff.map(x => x.value)).toEqual([NO_PIC])
    expect(o.channels.map(x => x.value)).toEqual(["Momo"])
  })

  it("normalizeSelection bỏ lựa chọn con không còn hợp lệ", () => {
    const n = normalizeSelection(data, { ...none, group: "B2C", channel: "Momo", staff: "B2" }, KWS)
    expect(n).toEqual({ group: "B2C", channel: "", source: "", staff: "", tier: "" })
  })
})

describe("orders-where", () => {
  it("Nguồn lọc theo MÃ (không theo tên kênh), PIC chưa gán, Tier hợp lệ, các bộ lọc áp cùng lúc", () => {
    const base = parseOrderBase(new URLSearchParams("startDate=2026-10-01&endDate=2026-10-22&includeShip=1&includeInternalOps=1&companyCode=VN"))
    if ("error" in base) throw new Error(base.error)
    const f = readFilterParams(new URLSearchParams("orderSource=S0001&channel=VN-Web SIM&channelGroup=B2C&staffCode=__none__&tier=Gold"))
    const { where, params } = filterWhere(baseWhere(base), f, "TIER_EXPR")
    expect(where).toContain("COALESCE(s.code, 'nan') = $")
    expect(where).toContain("NULLIF(TRIM(f.staff_code), '') IS NULL")
    expect(where).toContain("TIER_EXPR = $")
    expect(params).toEqual(["2026-10-01", "2026-10-22", "VN", "B2C", "VN-Web SIM", "S0001", "Gold"])
  })
  it("tier lạ bị bỏ; thiếu ngày báo lỗi", () => {
    expect(readFilterParams(new URLSearchParams("tier=Hack")).tier).toBe("")
    expect("error" in parseOrderBase(new URLSearchParams("staffCode=A"))).toBe(true)
  })
})
