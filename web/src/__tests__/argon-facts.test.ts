import { describe, it, expect } from "vitest"
import { bucketFacts, daysUntil, dueReminders, expiredIds, factKey, factLine, factsBlock, isoDate, keyDate, nightlyMessage, normalizeFacts, vnToday, type FactRow } from "@/lib/argon/facts-pure"
import { parseDigestFull } from "@/lib/argon/source-digest"

const F = (id: string, o: Partial<FactRow> = {}): FactRow => ({
  id, username: "u", type: "khuyen_mai", vendor: "BC", subject: "Thái Lan", summary: "Giảm 10%", evidence: "", effective_from: null, expires_at: null, status: "active", origin: "auto", edited: false,
  source_id: "s", source_name: "Mail BC", superseded_by: null, remind_days: 3, reminded_at: null, announced_at: null, created_at: "2026-10-20T00:00:00Z", updated_at: "2026-10-20T00:00:00Z", ...o,
})
const TODAY = "2026-10-22"

describe("ngày", () => {
  it("isoDate chỉ nhận ngày đúng lịch", () => { expect(isoDate("2026-11-30")).toBe("2026-11-30"); expect(isoDate("2026-02-30")).toBeNull(); expect(isoDate("30/11/2026")).toBeNull(); expect(isoDate(null)).toBeNull(); expect(isoDate("1999-01-01")).toBeNull() })
  it("vnToday theo giờ VN (UTC+7)", () => { expect(vnToday(Date.parse("2026-10-21T18:00:00Z"))).toBe("2026-10-22") })
  it("daysUntil", () => { expect(daysUntil("2026-10-25", TODAY)).toBe(3); expect(daysUntil("2026-10-20", TODAY)).toBe(-2) })
})

describe("normalizeFacts", () => {
  it("bỏ mục thiếu tóm tắt, loại lạ → khac, ngày sai → null, hạn trước hiệu lực → bỏ hạn", () => {
    const r = normalizeFacts([
      { type: "doi_gia", vendor: "BC", subject: "TH 1GB", summary: "Lên 0.58 USD", effectiveFrom: "2026-12-01", expiresAt: "2026-11-01" },
      { type: "lạ", summary: "x", effectiveFrom: "31/12/2026", expiresAt: "2026-13-40" },
      { type: "khuyen_mai", summary: "" }, null, "chuỗi",
    ])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ type: "doi_gia", effectiveFrom: "2026-12-01", expiresAt: null })
    expect(r[1]).toMatchObject({ type: "khac", effectiveFrom: null, expiresAt: null })
  })
  it("tối đa 8 mục; không phải mảng → rỗng", () => {
    expect(normalizeFacts(Array.from({ length: 20 }, (_, i) => ({ summary: `s${i}` })))).toHaveLength(8)
    expect(normalizeFacts("x")).toEqual([])
  })
})

describe("factKey", () => {
  it("không phân biệt hoa thường/dấu", () => { expect(factKey({ vendor: "Billion Connect", type: "doi_gia", subject: "Thái Lan Daily" })).toBe(factKey({ vendor: "billion connect", type: "doi_gia", subject: "THAI LAN daily" })) })
  it("khác loại → khác khoá", () => { expect(factKey({ vendor: "a", type: "doi_gia", subject: "x" })).not.toBe(factKey({ vendor: "a", type: "khuyen_mai", subject: "x" })) })
})

describe("hạn và nhắc", () => {
  it("keyDate: đổi giá/ngừng bán lấy ngày hiệu lực, khuyến mãi lấy hạn", () => {
    expect(keyDate(F("1", { type: "doi_gia", effective_from: "2026-12-01", expires_at: null }))).toBe("2026-12-01")
    expect(keyDate(F("2", { type: "khuyen_mai", effective_from: "2026-10-01", expires_at: "2026-11-30" }))).toBe("2026-11-30")
  })
  it("expiredIds chỉ lấy sự việc đang hiệu lực đã qua hạn", () => {
    const rows = [F("a", { expires_at: "2026-10-21" }), F("b", { expires_at: "2026-10-22" }), F("c", { expires_at: "2026-10-01", status: "rejected" }), F("d")]
    expect(expiredIds(rows, TODAY)).toEqual(["a"])
  })
  it("dueReminders: trong remind_days, chưa nhắc, sắp theo ngày", () => {
    const rows = [F("a", { expires_at: "2026-10-25" }), F("b", { expires_at: "2026-10-26" }), F("c", { expires_at: "2026-10-23" }), F("d", { expires_at: "2026-10-24", reminded_at: "2026-10-21T00:00:00Z" }), F("e", { expires_at: "2026-10-21" })]
    expect(dueReminders(rows, TODAY).map(r => r.id)).toEqual(["c", "a"])
  })
  it("bucketFacts: sắp tới hạn / đang hiệu lực / đã qua", () => {
    const b = bucketFacts([F("s", { expires_at: "2026-11-01" }), F("l", { expires_at: "2026-12-30" }), F("p", { status: "expired" })], TODAY)
    expect([b.soon[0].id, b.active[0].id, b.past[0].id]).toEqual(["s", "l", "p"])
  })
})

describe("văn bản", () => {
  it("factLine có loại, vendor, đối tượng, ngày", () => { expect(factLine(F("1", { effective_from: "2026-12-01", expires_at: "2026-12-31" }))).toBe("[Khuyến mãi] BC · Thái Lan: Giảm 10% (từ 01/12/2026 đến 31/12/2026)") })
  it("factsBlock có id và nguồn", () => { const t = factsBlock([F("abc")], TODAY); expect(t).toContain("[abc]"); expect(t).toContain("nguồn: Mail BC"); expect(t).toContain(`hom_nay="${TODAY}"`) })
  it("nightlyMessage rỗng khi không có gì, có đủ mục khi có", () => {
    expect(nightlyMessage({ added: [], due: [], expired: 0, link: "L" })).toBe("")
    const t = nightlyMessage({ added: [F("1")], due: [F("2", { expires_at: "2026-10-24" })], expired: 2, link: "http://x" })
    expect(t).toContain("Sắp tới hạn (1)"); expect(t).toContain("vừa ghi vào sổ 1"); expect(t).toContain("2 sự việc vừa hết hạn"); expect(t).toContain("http://x")
  })
})

describe("parseDigestFull", () => {
  it("lấy cả sự việc, đã chuẩn hoá", () => {
    const r = parseDigestFull('{"docType":"Thông báo vendor","summary":"BC đổi giá","facts":[{"type":"doi_gia","vendor":"BC","subject":"TH","summary":"Lên 0.58","effectiveFrom":"2026-12-01"}]}')
    expect(r?.facts).toHaveLength(1)
    expect(r?.facts[0].effectiveFrom).toBe("2026-12-01")
  })
  it("thiếu facts → mảng rỗng", () => { expect(parseDigestFull('{"summary":"x"}')?.facts).toEqual([]) })
})
