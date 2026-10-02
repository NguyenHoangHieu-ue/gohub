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

import { pickSupportGroup } from "@/lib/bc-datapool/iso"

describe("nhóm nước hỗ trợ cho gói đa vùng: khớp ĐÚNG tập nước", () => {
  const g = (code: string, en: string, iso: string) => ({ code, en, vn: en, iso })
  const groups = [
    g("STE", "Turkey, Egypt, UAE, Saudi Arabia", "TR, EG, AE, SA"),
    g("AAF", "Bahrain, Egypt, Saudi Arabia", "BH, EG, SA"),
    g("AS4", "Singapore, Malaysia, Indonesia, Thailand", "SG, MY, ID, TH"),
    g("AS5", "Singapore, Malaysia, Indonesia, Thailand", "SG, MY, TH, ID"),
    g("CHM", "China, Hong Kong, Macao", "CN, HK, MO"),
    g("CNM", "China, Macao", "CN, MO"),
    g("VNM", "Vietnam", "VN"),
  ]
  const refs = [{ code: "AE", name: "United Arab Emirates" }, { code: "HK", name: "Hong Kong" }, { code: "MO", name: "Macau" }, { code: "TR", name: "Turkey" }, { code: "EG", name: "Egypt" }, { code: "SA", name: "Saudi Arabia" }, { code: "CN", name: "China" }, { code: "SG", name: "Singapore" }, { code: "MY", name: "Malaysia" }, { code: "ID", name: "Indonesia" }, { code: "TH", name: "Thailand" }]

  test("ME 4 (Portal ghi UAE, thứ tự khác) → STE", () => {
    expect(pickSupportGroup(groups, ["Saudi Arabia", "Turkey", "Egypt", "UAE"], refs).matches.map(m => m.code)).toEqual(["STE"])
  })
  test("Macau (Portal) = Macao (nhóm) và '(China)' bị bỏ; không nhận nhóm thừa/thiếu nước", () => {
    expect(pickSupportGroup(groups, ["Hong Kong (China)", "China", "Macau (China)"], refs).matches.map(m => m.code)).toEqual(["CHM"])
    expect(pickSupportGroup(groups, ["China", "Macau (China)"], refs).matches.map(m => m.code)).toEqual(["CNM"])
    expect(pickSupportGroup(groups, ["China", "Hong Kong (China)"], refs).matches).toEqual([])
  })
  test("nhiều nhóm cùng tập nước → trả hết để người dùng chọn; nước lạ → unresolved", () => {
    expect(pickSupportGroup(groups, ["Singapore", "Malaysia", "Thailand", "Indonesia"], refs).matches.map(m => m.code)).toEqual(["AS4", "AS5"])
    expect(pickSupportGroup(groups, ["Turkey", "Atlantis"], refs).unresolved).toEqual(["Atlantis"])
  })
})
