import { describe, expect, it } from "vitest"
import { MODEL_IDS, costOf, isModelKey, keyOfModel, resolveModel } from "@/lib/argon/models"

describe("mô hình Argon: nhanh / sâu", () => {
  it("khoá hợp lệ ra đúng id; khoá lạ hoặc trống = sâu (hành vi cũ)", () => {
    expect(resolveModel("fast")).toBe(MODEL_IDS.fast)
    expect(resolveModel("deep")).toBe(MODEL_IDS.deep)
    expect(resolveModel(undefined)).toBe(MODEL_IDS.deep)
    expect(resolveModel("gpt-5")).toBe(MODEL_IDS.deep)
    expect(isModelKey("fast")).toBe(true); expect(isModelKey("x")).toBe(false)
  })
  it("id đã lưu ra lại đúng khoá (để Tiếp tục viết / việc nền dùng đúng model)", () => {
    expect(keyOfModel(MODEL_IDS.fast)).toBe("fast")
    expect(keyOfModel(MODEL_IDS.deep)).toBe("deep")
    expect(keyOfModel(null)).toBe("deep")
    expect(keyOfModel("model-la")).toBe("deep")
  })
  it("giá: nhanh rẻ hơn sâu cho cùng số token; sâu giảm giá phần token trúng cache", () => {
    const fast = costOf(MODEL_IDS.fast, 100_000, 5_000), deep = costOf(MODEL_IDS.deep, 100_000, 5_000)
    expect(fast).toBeLessThan(deep)
    expect(costOf(MODEL_IDS.deep, 100_000, 5_000, 90_000)).toBeLessThan(deep)
  })
})
