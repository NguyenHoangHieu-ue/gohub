import { describe, test, expect } from "vitest"
import { scrubLeaks, leakFilterStream } from "../lib/agents/core/leak-filter"

const EVAL_1 = "Doanh thu tính từ đơn do nhân viên phụ trách tạo đơn (`staff_code`) trong giai đoạn 01/09."
const EVAL_15 = "- **Độ phủ danh mục quốc gia (`ref_countries`)**: 216 quốc gia."
const EXPORT = "Bảng trên.\n```export\nformats: excel\nsql: SELECT `staff_code` FROM fact_fulfillment_revenue\n```"

describe("leak-filter", () => {
  test("xoá tên cột/bảng trong code nội dòng (eval U1b #1, #15)", () => {
    expect(scrubLeaks(EVAL_1)).toBe("Doanh thu tính từ đơn do nhân viên phụ trách tạo đơn trong giai đoạn 01/09.")
    expect(scrubLeaks(EVAL_15)).toBe("- **Độ phủ danh mục quốc gia**: 216 quốc gia.")
  })

  test("không đụng khối ``` (export SQL), mã SKU viết hoa, từ thường", () => {
    expect(scrubLeaks(EXPORT)).toBe(EXPORT)
    expect(scrubLeaks("Mã `3CUSA3DP00107` và `eSIM`")).toBe("Mã `3CUSA3DP00107` và `eSIM`")
  })

  test("stream cắt từng ký tự cho ra đúng như lọc cả đoạn", () => {
    for (const text of [EVAL_1, EVAL_15, EXPORT, "a `b` c (`x_y`) d ``` e_f ``` (`g_h`)"]) {
      let out = ""
      const f = leakFilterStream(s => { out += s })
      for (const ch of text) f.push(ch)
      f.flush()
      expect(out).toBe(scrubLeaks(text))
    }
  })
})
