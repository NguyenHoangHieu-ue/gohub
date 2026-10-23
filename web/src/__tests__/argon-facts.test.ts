import { describe, it, expect } from "vitest"
import { bucketFacts, dateKey, daysUntil, dueReminders, expiredIds, factKey, factLine, factsBlock, isoDate, keyDate, nightlyMessage, normalizeFacts, vnToday, type FactRow } from "@/lib/argon/facts-pure"
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

describe("dateKey", () => {
  it("cùng vendor/loại/ngày → cùng khoá dù đối tượng khác chữ; không có ngày → null", () => {
    expect(dateKey({ vendor: "HTHK", type: "doi_mang", effectiveFrom: "2026-11-30", expiresAt: null })).toBe(dateKey({ vendor: "hthk", type: "doi_mang", effective_from: "2026-11-30", expires_at: null }))
    expect(dateKey({ vendor: "a", type: "khac" })).toBeNull()
  })
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

import { auditProposals, usesKhoScope, NIGHTLY_PROMPT, impactVnd } from "@/lib/argon/context-pure"
describe("auditProposals", () => {
  const ok = `## Tác động tới kế hoạch\n- Chuyển Thái Lan sang BC: giá BC đổi (nguồn: Mail BC) → xấu\n\n## Đề xuất hôm nay\n### 1. Chốt giá BC trước 30/11 — Chắc\n- Vì sao: giá tăng 0.52→0.58\n- Ảnh hưởng: 120 triệu VND/tháng (giá tăng × sản lượng 30 ngày)\n- Nguồn: Mail BC 22/10\n- Liên quan kế hoạch: Chuyển Thái Lan sang BC\n\n### 2. Hỏi VNPT báo giá — Có thể\n- Vì sao: chưa có phản hồi\n- Ảnh hưởng: chưa lượng hoá được\n- Nguồn: Thread VNPT\n- Liên quan kế hoạch: ngoài kế hoạch\n`
  it("đề xuất đủ nhãn/nguồn/kế hoạch → ok", () => { const r = auditProposals(ok); expect(r).toMatchObject({ total: 2, ok: 2, empty: false }); expect(r.issues).toEqual([]) })
  it("báo thiếu nhãn, thiếu nguồn, thiếu mục kế hoạch", () => {
    const r = auditProposals("## Đề xuất hôm nay\n### 1. Làm A\n- Vì sao: x\n- Nguồn:\n\n### 2. Làm B — Chắc\n- Nguồn: Mail\n")
    expect(r.total).toBe(2); expect(r.ok).toBe(0)
    expect(r.issues[0]).toContain("thiếu nhãn"); expect(r.issues[0]).toContain("thiếu nguồn"); expect(r.issues[1]).toContain("thiếu mục kế hoạch")
  })
  it("nhãn Chắc mà lý do có dự phóng → báo; Có thể thì được", () => {
    const md = (label: string) => `## Đề xuất hôm nay
### 1. Chuyển tuyến — ${label}
- Vì sao: nếu chuyển 100 triệu thì BC vượt Worldmove
- Ảnh hưởng: 100 triệu VND/tháng
- Nguồn: dim_sku
- Liên quan kế hoạch: top 3
`
    expect(auditProposals(md("Chắc")).issues[0]).toContain("dự phóng")
    expect(auditProposals(md("Có thể")).issues).toEqual([])
  })
  it("thiếu Ảnh hưởng, hoặc việc nhỏ đứng trên việc lớn → báo", () => {
    const one = (n: number, imp: string) => `### ${n}. Việc ${n} — Chắc
- Vì sao: đã đo
${imp}- Nguồn: sql
- Liên quan kế hoạch: x

`
    const imp = (t: string) => `- Ảnh hưởng: ${t}\n`
    const doc = (...items: string[]) => "## Đề xuất hôm nay\n" + items.join("")
    expect(auditProposals(doc(one(1, ""))).issues[0]).toContain("thiếu mức ảnh hưởng")
    const r = auditProposals(doc(one(1, imp("100 nghìn VND")), one(2, imp("200 triệu VND/tháng"))))
    expect(r.ok).toBe(1)
    expect(r.issues[0]).toContain("Đề xuất 2")
    expect(r.issues[0]).toContain("xếp theo mức ảnh hưởng")
    const good = auditProposals(doc(one(1, imp("200 triệu VND/tháng")), one(2, imp("chưa lượng hoá được")), one(3, imp("100 nghìn VND"))))
    expect(good.issues).toEqual([])
  })
  it("phân biệt bỏ hẳn mục Đề xuất với ghi 'Chưa có đề xuất'", () => {
    expect(auditProposals("## Tác động tới kế hoạch\n- A\n").missingSection).toBe(true)
    const none = auditProposals("## Đề xuất hôm nay\nChưa có đề xuất đủ căn cứ hôm nay.")
    expect(none.empty).toBe(true)
    expect(none.missingSection).toBe(false)
  })
  it("impactVnd đọc số tiền tiếng Việt", () => {
    expect(impactVnd("~100 triệu VND/tháng")).toBe(100_000_000)
    expect(impactVnd("1,5 tỷ")).toBe(1_500_000_000)
    expect(impactVnd("793.000 VND")).toBe(793_000)
    expect(impactVnd("120M")).toBe(120_000_000)
    expect(impactVnd("108.385 đồng")).toBe(108_385)
    expect(impactVnd("chưa lượng hoá được")).toBeNull()
  })
  it("không có đề xuất / không có mục → empty", () => { expect(auditProposals("## Đề xuất hôm nay\nChưa có đề xuất đủ căn cứ hôm nay.").empty).toBe(true); expect(auditProposals("").empty).toBe(true) })
  it("usesKhoScope và câu lệnh đêm", () => { expect(usesKhoScope("Thủ thư Kho")).toBe(true); expect(usesKhoScope("Tham mưu hằng ngày")).toBe(true); expect(usesKhoScope("Sứ mệnh khác")).toBe(false); expect(NIGHTLY_PROMPT).toContain("notes/tac-dong.md") })
})

import { sectionOf } from "@/lib/argon/context-pure"
describe("sectionOf", () => {
  const md = "# Tác động tới kế hoạch và đề xuất\n\n## Tác động tới kế hoạch\n- A\n- B\n\n## Đề xuất hôm nay\n### 1. Việc — Chắc\n- Nguồn: X\n\n## Khác\nz\n"
  it("lấy đúng mục, bỏ dòng tiêu đề, dừng ở ## kế tiếp (### nằm trong mục)", () => {
    expect(sectionOf(md, "Tác động")).toBe("- A\n- B")
    expect(sectionOf(md, "Đề xuất")).toBe("### 1. Việc — Chắc\n- Nguồn: X")
  })
  it("không thấy → rỗng", () => { expect(sectionOf(md, "Không có")).toBe(""); expect(sectionOf("", "Đề xuất")).toBe("") })
})
