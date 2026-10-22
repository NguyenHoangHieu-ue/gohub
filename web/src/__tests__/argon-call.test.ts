import { describe, it, expect } from "vitest"
import { appendChunk, extractNumbers, finalizeLast, highlightParts, normalizeSuggest, normalizeSummary, shouldSuggest, summaryMd, transcriptMd, type CallLine } from "@/lib/argon/call-pure"

describe("appendChunk / finalizeLast", () => {
  it("ghép mẩu lời gốc vào cùng dòng; bản dịch gắn vào dòng đó", () => {
    let l: CallLine[] = []
    l = appendChunk(l, "partner", "en", "We can offer ", 1000)
    l = appendChunk(l, "partner", "en", "three point five.", 1200)
    l = appendChunk(l, "partner", "vi", "Chúng tôi có thể chào ", 1500)
    l = appendChunk(l, "partner", "vi", "3,5.", 1600)
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ en: "We can offer three point five.", vi: "Chúng tôi có thể chào 3,5.", final: false })
  })
  it("lời gốc mới sau khi dòng trước đã có bản dịch → dòng mới", () => {
    let l = appendChunk([], "partner", "en", "Hello there.", 1)
    l = appendChunk(l, "partner", "vi", "Xin chào.", 2)
    l = appendChunk(l, "partner", "en", "About the price.", 3)
    expect(l.map(x => x.en)).toEqual(["Hello there.", "About the price."])
  })
  it("bản dịch tới sau khi chốt vẫn không mất; dòng đã chốt thì chữ mới mở dòng mới", () => {
    let l = appendChunk([], "partner", "en", "Okay.", 1)
    l = finalizeLast(l, "partner")
    expect(l[0].final).toBe(true)
    l = appendChunk(l, "partner", "en", "Next point.", 2)
    expect(l).toHaveLength(2)
    expect(l[1].id).toBe(2)
  })
  it("mic (me): im lặng quá 3,5s thì sang dòng mới; không sửa mảng cũ", () => {
    const l0 = appendChunk([], "me", "en", "Sounds good", 1000)
    const l1 = appendChunk(l0, "me", "en", " to us", 2000)
    const l2 = appendChunk(l1, "me", "en", "One more thing", 9000)
    expect(l1[0].en).toBe("Sounds good to us"); expect(l2).toHaveLength(2); expect(l0[0].en).toBe("Sounds good")
  })
  it("chuỗi rỗng không đổi gì", () => { const l = appendChunk([], "partner", "en", "x", 1); expect(appendChunk(l, "partner", "en", "", 2)).toBe(l) })
})

describe("gợi ý và số", () => {
  const L = (o: Partial<CallLine>): CallLine => ({ id: 1, who: "partner", en: "We can do 3.5 HKD per GB for Thailand", vi: "", final: true, at: 1, ...o })
  it("shouldSuggest: chỉ lời đối tác đã chốt, ≥4 từ", () => {
    expect(shouldSuggest(L({}))).toBe(true); expect(shouldSuggest(L({ final: false }))).toBe(false); expect(shouldSuggest(L({ who: "me" }))).toBe(false); expect(shouldSuggest(L({ en: "Okay sure" }))).toBe(false)
  })
  it("extractNumbers / highlightParts bắt tiền, dung lượng, thời hạn", () => {
    expect(extractNumbers("3.5 HKD per GB, 500TB monthly, valid 30 days, $0.65")).toEqual(expect.arrayContaining(["3.5 HKD", "500TB", "30 days", "$0.65"]))
    const p = highlightParts("price is 3.5 HKD now")
    expect(p.map(x => x.t).join("")).toBe("price is 3.5 HKD now"); expect(p.find(x => x.num)?.t).toContain("3.5")
  })
  it("normalizeSuggest: tối đa 2 câu, bỏ câu rỗng, null khi sai", () => {
    const r = normalizeSuggest('```json\n{"suggestions":[{"en":"We can accept 3.5 if MOQ is lower.","vi":"Ok 3.5 nếu MOQ thấp hơn","basis":["Mail 3HK 15/10"]},{"en":""},{"en":"Could you confirm validity?","vi":"Xác nhận hiệu lực?"},{"en":"third"}],"confirm":["3.5 HKD/GB"],"ask":["MOQ?"]}\n```')
    expect(r?.suggestions).toHaveLength(2); expect(r?.suggestions[0].basis).toEqual(["Mail 3HK 15/10"]); expect(r?.confirm).toEqual(["3.5 HKD/GB"])
    expect(normalizeSuggest("không json")).toBeNull(); expect(normalizeSuggest('{"suggestions":[]}')).toBeNull()
  })
})

describe("tổng hợp", () => {
  const raw = '{"title":"Gọi 3HK","summary":"Thống nhất 3.5 HKD/GB.","decisions":["Chốt 3.5"],"numbers":[{"what":"Giá Thái Lan","value":"3.5 HKD/GB","who":"3HK"},{"what":"","value":"x"}],"actions":[{"who":"Hiếu","what":"Gửi email xác nhận","due":"25/10"}],"open":["MOQ"],"email":"Hi, confirming..."}'
  it("normalizeSummary lọc mục rỗng; thiếu summary → null", () => {
    const s = normalizeSummary(raw)!
    expect(s.numbers).toHaveLength(1); expect(s.actions[0].due).toBe("25/10"); expect(normalizeSummary('{"title":"x"}')).toBeNull()
  })
  it("summaryMd + transcriptMd có đủ mục", () => {
    const md = summaryMd(normalizeSummary(raw)!, { vendor: "3HK", goal: "chốt giá", startedAt: Date.parse("2026-10-22T03:00:00Z"), minutes: 12 })
    for (const k of ["# Gọi 3HK", "## Tóm tắt", "## Quyết định", "## Con số đã nêu", "3.5 HKD/GB", "## Việc cần làm", "- [ ] Gửi email xác nhận", "## Email xác nhận"]) expect(md).toContain(k)
    expect(md).toContain("10:00")   // 03:00Z = 10:00 giờ VN
    const t = transcriptMd([{ id: 1, who: "partner", en: "Hello", vi: "Xin chào", final: true, at: Date.parse("2026-10-22T03:00:00Z") }, { id: 2, who: "me", en: "Hi", vi: "", final: true, at: Date.parse("2026-10-22T03:00:05Z") }])
    expect(t).toContain("**Đối tác**"); expect(t).toContain("*Xin chào*"); expect(t).toContain("**Anh**")
  })
})
