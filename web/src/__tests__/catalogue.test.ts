import { describe, test, expect } from "vitest"
import { parseCarrierMap, carrierForCountry } from "@/lib/catalogue/carriers"
import {
  throttleSentence, rangeLabel, dataAmountLabel, formatGb, vendorDisplayName, continentLabel,
  summarySentences, yesNo, toGb, throttleShort, throttleSummary,
} from "@/lib/catalogue/plain-language"
import {
  normalizeText, flagEmoji, buildCountryStats, searchCountries, filterProducts, groupByVendor,
  productsOfCountry, countryAliases,
} from "@/lib/catalogue/country-index"
import type { CatalogueCountryRef, CatalogueProductLite, SkuAggregate } from "@/lib/catalogue/types"

const emptySku: SkuAggregate = { count: 0, gbMin: null, gbMax: null, hasUnlimited: false, daysMin: null, daysMax: null, throttles: [] }
function prod(o: Partial<CatalogueProductLite>): CatalogueProductLite {
  return {
    code: "P0000001", vendorCode: "WM", operatorCode: null, tenant: "VN", status: "Active", sim: "eSIM",
    dataKind: "fixed", network: "4G", carrierRaw: null, countries: ["JP"], hotspot: true, kycNeeded: false,
    localNumber: false, localNumberCountry: null, sku: emptySku, ...o,
  }
}

const REFS: CatalogueCountryRef[] = [
  { code: "JP", name: "Japan", nameVn: null, continent: "Asia" },
  { code: "FR", name: "France", nameVn: null, continent: "Europe" },
  { code: "DE", name: "Germany", nameVn: null, continent: "Europe" },
  { code: "US", name: "United States", nameVn: null, continent: "Americas" },
  { code: "AU", name: "Australia", nameVn: null, continent: "Oceania" },
  { code: "NZ", name: "New Zealand", nameVn: null, continent: "Oceania" },
]

describe("carriers — tách nhà mạng theo nước (mẫu thật từ Supabase products.onsite_carrier)", () => {
  const KNOWN = REFS.map(r => r.name).concat(["Singapore", "Malaysia", "Indonesia", "Thailand", "UK", "Italy", "Austria"])

  test("nhiều dòng: mỗi dòng một nước", () => {
    const raw = "Singapore: Simba\nMalaysia: Celcomdigi, U-mobile\nIndonesia: Telkomsel, Indosat\nThailand: AIS / True"
    const m = parseCarrierMap(raw, KNOWN)!
    expect(m.map(e => e.label)).toEqual(["Singapore", "Malaysia", "Indonesia", "Thailand"])
    expect(m[1].carriers).toBe("Celcomdigi, U-mobile")
    expect(m[3].carriers).toBe("AIS / True")
  })

  test("dính liền một dòng, nhãn nhiều từ (New Zealand)", () => {
    const m = parseCarrierMap("Australia: Telstra New Zealand: Spark", KNOWN)!
    expect(m).toEqual([{ label: "Australia", carriers: "Telstra" }, { label: "New Zealand", carriers: "Spark" }])
  })

  test("đoạn dài dạng châu Âu: lấy đúng nhà mạng của nước đang xem", () => {
    const raw = "Germany: Vodafone Germany France: Free Mobile UK: 3 (4G Only) Italy: 3 (4G Only) US: Verizon"
    const de = carrierForCountry(raw, countryAliases("DE", REFS[2]), KNOWN)
    expect(de).toEqual({ mode: "country", text: "Vodafone Germany" })
    const fr = carrierForCountry(raw, countryAliases("FR", REFS[1]), KNOWN)
    expect(fr).toEqual({ mode: "country", text: "Free Mobile" })
    const us = carrierForCountry(raw, countryAliases("US", REFS[3]), KNOWN)   // nhãn "US" là bí danh của United States
    expect(us).toEqual({ mode: "country", text: "Verizon" })
  })

  test("một nhà mạng chung (không có dấu hai chấm)", () => {
    expect(carrierForCountry("Verizon", ["US"], KNOWN)).toEqual({ mode: "single", text: "Verizon" })
  })

  test("nước không có trong đoạn → mode other, giữ nguyên toàn bộ mục", () => {
    const r = carrierForCountry("Australia: Telstra New Zealand: Spark", countryAliases("JP", REFS[0]), KNOWN)
    expect(r.mode).toBe("other")
    if (r.mode === "other") expect(r.entries).toHaveLength(2)
  })

  test("không nhận diện được nhãn → unparsed (hiện nguyên văn, không mất thông tin)", () => {
    const r = carrierForCountry("Ghi chú: xem file đính kèm", ["JP"], KNOWN)
    expect(r.mode).toBe("unparsed")
  })

  test("rỗng/null", () => {
    expect(carrierForCountry(null, ["JP"], KNOWN)).toEqual({ mode: "none" })
    expect(carrierForCountry("  ", ["JP"], KNOWN)).toEqual({ mode: "none" })
  })
})

describe("plain-language — tiếng thường", () => {
  test("throttleSentence", () => {
    expect(throttleSentence("Stop")).toMatch(/ngừng/)
    expect(throttleSentence("128 kbps")).toMatch(/128 kbps/)
    expect(throttleSentence("500 MB high speed then drop to 10 mbps")).toBe("Dùng tốc độ cao 500 MB, sau đó giảm còn 10 Mbps.")
    expect(throttleSentence("Unlimited 50mbps")).toBe("Không giới hạn dung lượng, tốc độ tối đa 50 Mbps.")
    expect(throttleSentence("Unlimited")).toBe("Không giới hạn dung lượng.")
    expect(throttleSentence("2GB tốc độ cao sau đó tốc độ giảm còn 5Mbps")).toBe("2GB tốc độ cao sau đó tốc độ giảm còn 5Mbps")
    expect(throttleSentence(null)).toBeNull()
  })

  test("throttleShort / throttleSummary: phân biệt các gói trông giống nhau", () => {
    expect(throttleShort("Stop")).toBe("ngừng dùng")
    expect(throttleShort("128 kbps")).toBe("rất chậm (128 kbps)")
    expect(throttleShort("Unlimited 100 mbps")).toBe("không giới hạn (tối đa 100 Mbps)")
    expect(throttleShort("500 MB high speed then drop to 10 mbps")).toBe("500 MB đầu chạy nhanh, sau đó còn 10 Mbps")
    expect(throttleSummary(["128 kbps", "128 kbps", "Stop"])).toBe("rất chậm (128 kbps) / ngừng dùng")
    expect(throttleSummary([])).toBeNull()
  })

  test("dung lượng: MB/GB/không giới hạn", () => {
    expect(dataAmountLabel(500, "MB")).toBe("500 MB")
    expect(dataAmountLabel(5, "GB")).toBe("5 GB")
    expect(dataAmountLabel(9999, "GB")).toBe("Không giới hạn")
    expect(dataAmountLabel(null, "GB")).toBe("—")
    expect(formatGb(0.5)).toBe("500 MB")
    expect(toGb(500, "MB")).toBe(0.5)
  })

  test("rangeLabel", () => {
    expect(rangeLabel({ count: 5, gbMin: 1, gbMax: 30, hasUnlimited: false, daysMin: 3, daysMax: 30, throttles: [] }, "fixed")).toBe("1 GB – 30 GB · 3 – 30 ngày")
    expect(rangeLabel({ count: 2, gbMin: 1, gbMax: 1, hasUnlimited: false, daysMin: 7, daysMax: 7, throttles: [] }, "daily")).toBe("1 GB/ngày · 7 ngày")
    expect(rangeLabel({ count: 3, gbMin: 2, gbMax: 5, hasUnlimited: true, daysMin: 5, daysMax: 10, throttles: [] }, "fixed")).toBe("2 GB – 5 GB hoặc không giới hạn · 5 – 10 ngày")
    expect(rangeLabel({ count: 1, gbMin: null, gbMax: null, hasUnlimited: true, daysMin: 5, daysMax: 5, throttles: [] }, "daily")).toBe("không giới hạn · 5 ngày")
    expect(rangeLabel(emptySku, "fixed")).toBeNull()
  })

  test("vendor: bảng chuẩn thắng ref_vendors viết hoa", () => {
    expect(vendorDisplayName("3D", "3HK DATAPOOL")).toBe("3HK Datapool")
    expect(vendorDisplayName("WM", "WORLDMOVE")).toBe("WorldMove")
    expect(vendorDisplayName("ZZ", "SOME VENDOR")).toBe("Some Vendor")
    expect(vendorDisplayName("ZZ", null)).toBe("ZZ")
  })

  test("châu lục & yes/no", () => {
    expect(continentLabel("Asia")).toBe("Châu Á")
    expect(continentLabel(null)).toBe("Khác")
    expect(yesNo("Yes")).toBe(true)
    expect(yesNo("No")).toBe(false)
    expect(yesNo("Truemove")).toBe(true)
    expect(yesNo(null)).toBeNull()
  })

  test("summarySentences: đủ ý, không lộ thuật ngữ thô", () => {
    const p = prod({ dataKind: "daily", localNumber: true, localNumberCountry: "US", kycNeeded: true,
      sku: { count: 4, gbMin: 1, gbMax: 3, hasUnlimited: false, daysMin: 5, daysMax: 15, throttles: [] } })
    const s = summarySentences(p, { vendorName: "WorldMove", countryNames: ["Mỹ"], carrierText: "T-Mobile" }).join(" ")
    expect(s).toMatch(/eSIM của WorldMove/)
    expect(s).toMatch(/T-Mobile/)
    expect(s).toMatch(/số điện thoại/)
    expect(s).toMatch(/xác minh danh tính/)
    expect(s).not.toMatch(/Daily Data|Fixed Data|throttle/)
  })
})

describe("country-index — nước, tìm kiếm, lọc, gom vendor", () => {
  const P = [
    prod({ code: "JP1", vendorCode: "KD", countries: ["JP"], sim: "eSIM" }),
    prod({ code: "JP2", vendorCode: "WM", countries: ["JP"], sim: "SIM", localNumber: true }),
    prod({ code: "JP3", vendorCode: "WM", countries: ["JP"], status: "Inactive" }),
    prod({ code: "EU1", vendorCode: "3D", countries: ["FR", "DE", "JP"], dataKind: "daily", kycNeeded: true }),
    prod({ code: "AU1", vendorCode: "3D", countries: ["AU", "NZ"] }),
  ]

  test("gói nhiều nước xuất hiện ở MỌI nước nó phủ; mặc định bỏ gói ngưng bán", () => {
    const stats = buildCountryStats(P, REFS)
    const jp = stats.find(s => s.code === "JP")!
    expect(jp.productCount).toBe(3)                 // JP1 + JP2 + EU1 (JP3 Inactive bị bỏ)
    expect(jp.vendorCodes.sort()).toEqual(["3D", "KD", "WM"])
    expect(jp.esimCount).toBe(2); expect(jp.simCount).toBe(1)
    expect(stats.find(s => s.code === "FR")!.productCount).toBe(1)
    expect(buildCountryStats(P, REFS, { sellableOnly: false }).find(s => s.code === "JP")!.productCount).toBe(4)
  })

  test("productsOfCountry giữ cả gói khu vực", () => {
    expect(productsOfCountry(P, "de").map(p => p.code)).toEqual(["EU1"])
    expect(productsOfCountry(P, "JP").length).toBe(4)
  })

  test("tìm không dấu: 'nhat' → Nhật Bản; 'japan' → Nhật Bản; 'usa' → Mỹ", () => {
    const stats = buildCountryStats([...P, prod({ code: "US1", countries: ["US"] })], REFS)
    expect(searchCountries(stats, REFS, "nhat")[0].code).toBe("JP")
    expect(searchCountries(stats, REFS, "japan")[0].code).toBe("JP")
    expect(searchCountries(stats, REFS, "usa")[0].code).toBe("US")
    expect(searchCountries(stats, REFS, "zzzz")).toEqual([])
    expect(searchCountries(stats, REFS, "").length).toBe(stats.length)
  })

  test("normalizeText & cờ", () => {
    expect(normalizeText("Nhật Bản Đài Loan")).toBe("nhat ban dai loan")
    expect(flagEmoji("JP")).toBe("🇯🇵")
    expect(flagEmoji("xx1")).toBe("🌐")
  })

  test("filterProducts", () => {
    const jp = productsOfCountry(P, "JP")
    expect(filterProducts(jp, {}).map(p => p.code).sort()).toEqual(["EU1", "JP1", "JP2"])
    expect(filterProducts(jp, { sim: "SIM" }).map(p => p.code)).toEqual(["JP2"])
    expect(filterProducts(jp, { localNumber: true }).map(p => p.code)).toEqual(["JP2"])
    expect(filterProducts(jp, { noKyc: true }).map(p => p.code).sort()).toEqual(["JP1", "JP2"])   // EU1 cần KYC
    expect(filterProducts(jp, { dataKind: "daily" }).map(p => p.code)).toEqual(["EU1"])
    expect(filterProducts(jp, { sellableOnly: false }).length).toBe(4)
    expect(filterProducts(jp, { vendor: "KD" }).map(p => p.code)).toEqual(["JP1"])
  })

  test("scope: gói riêng vs dùng chung; gói riêng xếp trước trong nhóm", () => {
    const list = productsOfCountry(P, "JP")
    expect(filterProducts(list, { scope: "own" }).map(p => p.code).sort()).toEqual(["JP1", "JP2"])
    expect(filterProducts(list, { scope: "shared" }).map(p => p.code)).toEqual(["EU1"])
    const g = groupByVendor([prod({ code: "Z1", vendorCode: "3D", countries: ["JP", "FR"] }), prod({ code: "A1", vendorCode: "3D", countries: ["JP"], sim: "SIM" })])
    expect(g[0].products.map(p => p.code)).toEqual(["A1", "Z1"])   // riêng (dù là SIM) trước gói chung
  })

  test("groupByVendor: nhóm đông gói lên trước, hoà thì theo mã; eSIM trước SIM", () => {
    const list = filterProducts(productsOfCountry(P, "JP"), {})
    expect(groupByVendor(list).map(x => x.vendorCode)).toEqual(["3D", "KD", "WM"])   // mỗi nhóm 1 gói → theo mã
    const more = [...list, prod({ code: "JP9", vendorCode: "WM", countries: ["JP"], sim: "eSIM" })]
    const g = groupByVendor(more)
    expect(g[0].vendorCode).toBe("WM")                              // WM có 2 gói
    expect(g[0].products.map(p => p.code)).toEqual(["JP9", "JP2"])  // eSIM (JP9) trước SIM (JP2)
  })
})
