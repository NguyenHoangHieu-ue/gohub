import { describe, expect, test } from "vitest"
import { ISO3, pickSupportCountry } from "@/lib/bc-datapool/iso"

// Dữ liệu thật từ ref_support_countries: nhiều mã cùng tên nước
const list = [
  { code: "JKD", en: "Japan", iso: "JP" }, { code: "JPN", en: "Japan", iso: "JP" },
  { code: "CMT", en: "China", iso: "CN" }, { code: "CHN", en: "China", iso: "CN" },
  { code: "MAL", en: "Malaysia", iso: "MY" }, { code: "MYS", en: "Malaysia", iso: "MY" },
  { code: "THA", en: "Thailand", iso: "TH" }, { code: "THD", en: "Thailand", iso: "TH" }, { code: "THT", en: "Thailand", iso: "TH" },
  { code: "TWN", en: "Taiwan", iso: "TW" },
  { code: "XX1", en: "Zedland", iso: "ZZ" }, { code: "XX2", en: "Zedland", iso: "ZZ" },
]

describe("chọn mã nước cho khu vực", () => {
  test("nhiều mã cùng tên → lấy mã ISO alpha-3 (không phải JKD/CMT/MAL/THD)", () => {
    expect(pickSupportCountry(list, "Japan").code).toBe("JPN")
    expect(pickSupportCountry(list, "China").code).toBe("CHN")
    expect(pickSupportCountry(list, "Malaysia").code).toBe("MYS")
    expect(pickSupportCountry(list, "Thailand").code).toBe("THA")
  })
  test("chỉ 1 mã → dùng luôn; không phân biệt hoa thường", () => {
    expect(pickSupportCountry(list, "taiwan")).toMatchObject({ code: "TWN", candidates: [] })
  })
  test("nhiều mã mà không có ISO3 khớp → KHÔNG đoán, để trống kèm danh sách ứng viên", () => {
    const r = pickSupportCountry(list, "Zedland")
    expect(r.code).toBe("")
    expect(r.candidates).toEqual(["XX1", "XX2"])
  })
  test("không có trong bảng → rỗng", () => {
    expect(pickSupportCountry(list, "Atlantis")).toEqual({ match: null, code: "", candidates: [] })
  })
  test("ISO3 là mã 3 chữ hoa, không trùng lặp", () => {
    const v = Object.values(ISO3)
    expect(v.every(c => /^[A-Z]{3}$/.test(c))).toBe(true)
    expect(new Set(v).size).toBe(v.length)
  })
})
