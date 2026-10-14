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

describe("tên nước kiểu bảng 3HK (US / UK / Vatican City)", () => {
  const refs = [{ code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" }, { code: "VA", name: "Vatican" }, { code: "FR", name: "France" }]
  const groups = [{ code: "ZZ9", en: "Test", iso: "US,GB,VA,FR" }]
  test("nameToIso2 nhận US, UK, Vatican City (trước đây trả null → gói W22/W24 không tra được mã nhóm)", async () => {
    const { nameToIso2 } = await import("@/lib/bc-datapool/iso")
    expect(["US", "UK", "Vatican City", "United States of America", "USA"].map(n => nameToIso2(n, refs, groups))).toEqual(["US", "GB", "VA", "US", "US"])
  })
  test("gói gồm US + UK + Vatican City khớp đúng nhóm có đủ các nước đó", async () => {
    const { pickSupportGroup } = await import("@/lib/bc-datapool/iso")
    const r = pickSupportGroup(groups, ["US", "UK", "Vatican City", "France"], refs)
    expect(r.unresolved).toEqual([]); expect(r.matches.map(m => m.code)).toEqual(["ZZ9"])
  })
})

describe("nhóm nước hỗ trợ cùng tập nước", () => {
  const gs = [{ code: "AS4", en: "Asia 4", iso: "SG,MY,ID,TH" }, { code: "AS5", en: "Asia 4b", iso: "TH, ID, MY, SG" }, { code: "SEA", en: "SEA", iso: "ID,MY,SG,TH" }, { code: "ANZ", en: "ANZ", iso: "AU, NZ" }, { code: "JPN", en: "Japan", iso: "JP" }, { code: "JKD", en: "Japan", iso: "JP" }]
  test("sameSetGroups: trả mọi nhóm đúng tập nước (không phụ thuộc thứ tự), bỏ qua nước đơn", async () => {
    const { sameSetGroups } = await import("@/lib/bc-datapool/iso")
    expect(sameSetGroups(gs, "MY, SG, ID, TH").map(g => g.code)).toEqual(["AS4", "AS5", "SEA"])
    expect(sameSetGroups(gs, "AU,NZ").map(g => g.code)).toEqual(["ANZ"])
    expect(sameSetGroups(gs, "JP")).toEqual([])
  })
  test("sameSetWarning: chỉ báo khi ≥ 2 nhóm; có mã thì ghi 'đang dùng', chưa có thì 'chưa chọn mã'; không chứa chữ 'trùng' (không chặn xuất khi đã có mã)", async () => {
    const { sameSetWarning } = await import("@/lib/bc-datapool/iso")
    const m = [{ code: "AS4" }, { code: "AS5" }]
    expect(sameSetWarning("SP#1", [{ code: "ANZ" }], "ANZ")).toBeNull()
    expect(sameSetWarning("SP#1", m, "AS4")).toMatch(/đang dùng AS4/)
    expect(sameSetWarning("SP#1", m, "")).toMatch(/chưa chọn mã/)
    expect(sameSetWarning("SP#1", m, "AS4")).not.toMatch(/trùng/)
  })
})
