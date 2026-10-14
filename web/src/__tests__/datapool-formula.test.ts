import { describe, expect, it, test } from "vitest"
import { CUSTOM_UNLIMITED_KEY, DATAPOOL_FORMULA, FORMULA_KEYS, UNLIMITED_LEVELS_KEY, findLevel, parseCustomUnlimited, parseUnlimitedLevels, resolveFormula } from "@/lib/datapool-formula"
import { unlimitedFactor } from "@/lib/bc-datapool/pricing"

describe("công thức Datapool dùng chung", () => {
  test("có 5 công thức, kể cả 1.7 cho 3GB tốc độ cao + Unlimited 10Mbps", () => {
    expect(DATAPOOL_FORMULA.map(d => d.key)).toEqual([
      "datapool.fixed_factor", "datapool.daily_factor", "datapool.unlim_500mb_5mbps_gb_day", "datapool.unlim_500mb_10mbps_gb_day", "datapool.unlim_3gb_10mbps_gb_day",
    ])
    const f = resolveFormula([])
    expect(f[FORMULA_KEYS.fixed]).toBe(0.55)
    expect(f[FORMULA_KEYS.daily]).toBe(0.38)
    expect(f[FORMULA_KEYS.unl500mb5]).toBe(1.6)
    expect(f[FORMULA_KEYS.unl500mb10]).toBe(1.8)
    expect(f[FORMULA_KEYS.unl3gb10]).toBe(1.7)
  })

  test("chưa có key mới thì đọc key cũ 3hk.* (không mất số đã nhập)", () => {
    const f = resolveFormula([
      { key: "3hk.fixed_factor", value: "0.6" }, { key: "3hk.daily_factor", value: "0.4" },
      { key: "3hk.unlim_5mbps_gb_day", value: "1.5" }, { key: "3hk.unlim_10mbps_gb_day", value: "2" },
    ])
    expect(f[FORMULA_KEYS.fixed]).toBe(0.6)
    expect(f[FORMULA_KEYS.daily]).toBe(0.4)
    expect(f[FORMULA_KEYS.unl500mb5]).toBe(1.5)
    expect(f[FORMULA_KEYS.unl500mb10]).toBe(2)
    expect(f[FORMULA_KEYS.unl3gb10]).toBe(1.7)   // mục mới, không có key cũ
  })

  test("key mới thắng key cũ; giá trị rác/âm/0 bị bỏ qua", () => {
    const f = resolveFormula([
      { key: "3hk.fixed_factor", value: "0.6" }, { key: "datapool.fixed_factor", value: "0.5" },
      { key: "datapool.daily_factor", value: "abc" }, { key: "3hk.daily_factor", value: "0.4" },
      { key: "datapool.unlim_3gb_10mbps_gb_day", value: "-1" },
    ])
    expect(f[FORMULA_KEYS.fixed]).toBe(0.5)
    expect(f[FORMULA_KEYS.daily]).toBe(0.4)
    expect(f[FORMULA_KEYS.unl3gb10]).toBe(1.7)
  })
})

describe("Unlimited tự thêm (datapool.unlimited_custom)", () => {
  it("đọc JSON hợp lệ, bỏ dòng sai và trùng", () => {
    const v = JSON.stringify([{ dataMb: 1024, speedMbps: 5, gbPerDay: 2.1 }, { dataMb: 1024, speedMbps: 5, gbPerDay: 9 }, { dataMb: 0, speedMbps: 5, gbPerDay: 1 }, { dataMb: 512, speedMbps: 10, gbPerDay: 1.9 }])
    expect(parseCustomUnlimited([{ key: CUSTOM_UNLIMITED_KEY, value: v }])).toEqual([{ dataMb: 1024, speedMbps: 5, gbPerDay: 2.1 }, { dataMb: 512, speedMbps: 10, gbPerDay: 1.9 }])
  })
  it("JSON hỏng hoặc thiếu → rỗng", () => {
    expect(parseCustomUnlimited([{ key: CUSTOM_UNLIMITED_KEY, value: "{oops" }])).toEqual([])
    expect(parseCustomUnlimited([])).toEqual([])
  })
  it("unlimitedFactor tra BẢNG MỨC: đúng cặp (GB tốc độ cao, Mbps), lạ → null", () => {
    const a = { fixedPct: 0.55, dailyPct: 0.38, unl3gb10: 2, unlLevels: [{ dataMb: 3072, speedMbps: 10, gbPerDay: 2 }, { dataMb: 1024, speedMbps: 5, gbPerDay: 2.1 }] }
    expect(unlimitedFactor(a, 3, "GB", 10)).toMatchObject({ idx: 0, gbPerDay: 2 })
    expect(unlimitedFactor(a, 1, "GB", 5)).toMatchObject({ idx: 1, gbPerDay: 2.1 })
    expect(unlimitedFactor(a, 2, "GB", 5)).toBeNull(); expect(unlimitedFactor(a, 3, "GB", 5)).toBeNull()
  })
  it("dữ liệu cũ (chưa có unlLevels): dựng từ unl3gb10 + unlCustom", () => {
    const a = { fixedPct: 0.55, dailyPct: 0.38, unl3gb10: 2, unlCustom: [{ dataMb: 1024, speedMbps: 5, gbPerDay: 2.1 }] }
    expect(unlimitedFactor(a, 3, "GB", 10)).toMatchObject({ idx: 0, gbPerDay: 2 }); expect(unlimitedFactor(a, 1, "GB", 5)).toMatchObject({ idx: 1 })
  })
})

describe("Bảng mức Unlimited (datapool.unlimited_levels)", () => {
  it("chưa lưu: mặc định = 3 mức từ khoá cũ + mức tự thêm cũ (giá trị khoá cũ được giữ)", () => {
    const lv = parseUnlimitedLevels([{ key: "datapool.unlim_500mb_10mbps_gb_day", value: "2" }, { key: "datapool.unlim_3gb_10mbps_gb_day", value: "1.9" }, { key: CUSTOM_UNLIMITED_KEY, value: JSON.stringify([{ dataMb: 1024, speedMbps: 5, gbPerDay: 2.1 }]) }])
    expect(lv.map(l => `${l.dataMb}@${l.speedMbps}=${l.gbPerDay}`)).toEqual(["500@5=1.6", "500@10=2", "3072@10=1.9", "1024@5=2.1"])
  })
  it("đã lưu: dùng đúng bảng đã lưu (kể cả bỏ mức mặc định hoặc để rỗng), lọc dòng sai/trùng", () => {
    const saved = JSON.stringify([{ dataMb: 2048, speedMbps: 10, gbPerDay: 1.8 }, { dataMb: 2048, speedMbps: 10, gbPerDay: 9 }, { dataMb: 0, speedMbps: 5, gbPerDay: 1 }])
    expect(parseUnlimitedLevels([{ key: UNLIMITED_LEVELS_KEY, value: saved }])).toEqual([{ dataMb: 2048, speedMbps: 10, gbPerDay: 1.8 }])
    expect(parseUnlimitedLevels([{ key: UNLIMITED_LEVELS_KEY, value: "[]" }])).toEqual([])
    expect(parseUnlimitedLevels([{ key: UNLIMITED_LEVELS_KEY, value: "{hỏng" }]).length).toBe(3)   // JSON hỏng → dùng mặc định
  })
  it("findLevel", () => { expect(findLevel([{ dataMb: 500, speedMbps: 5, gbPerDay: 1.6 }], 500, 5)?.gbPerDay).toBe(1.6); expect(findLevel([], 500, 5)).toBeUndefined() })
})
