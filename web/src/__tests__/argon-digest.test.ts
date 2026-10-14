import { describe, expect, it } from "vitest"
import { digest, flatten, fmtNum } from "@/lib/argon/digest"
import { parseQuarter } from "@/lib/argon/data-packs"

describe("digest", () => {
  it("làm phẳng object lồng, bỏ mảng", () => {
    expect(flatten({ a: 1, b: { c: 2, d: { e: 3 } }, arr: [1, 2] })).toEqual({ a: 1, "b.c": 2, "b.d.e": 3 })
  })
  it("làm tròn số: nguyên giữ nguyên, lẻ lớn bỏ phần thập phân, lẻ nhỏ 2 chữ số", () => {
    expect([fmtNum(1234567.891), fmtNum(12.3456), fmtNum(7), fmtNum(0.1 + 0.2)]).toEqual(["1234568", "12.35", "7", "0.3"])
  })
  it("giá trị đơn → 'đường.dẫn: giá trị'; mảng object → bảng markdown", () => {
    const t = digest({ total: { revenue: 100, pct: 12.345 }, rows: [{ name: "A", v: 1 }, { name: "B|x", v: 2 }] }, "Thử")
    expect(t).toContain("## Thử")
    expect(t).toContain("total.revenue: 100")
    expect(t).toContain("total.pct: 12.35")
    expect(t).toContain("| name | v |")
    expect(t).toContain("| B/x | 2 |")
  })
  it("ít dòng nhiều cột → khối từng dòng đủ cột (không cắt cột)", () => {
    const row: Record<string, number | string> = { month: "2026-10" }
    for (let i = 0; i < 20; i++) row[`c${i}`] = i
    const t = digest({ summary: [row] }, "T")
    expect(t).toContain("#### 2026-10")
    expect(t).toContain("c19: 19")
    expect(t).not.toContain("đã cắt")
  })
  it("cắt bớt dòng khi quá giới hạn và ghi rõ", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i, v: i * 2 }))
    const t = digest({ rows }, "T", { maxRows: 3 })
    expect(t).toContain("còn 7 dòng, đã cắt")
  })
})

describe("parseQuarter", () => {
  const now = new Date("2026-10-14T03:00:00Z")   // 10:00 giờ VN
  it("quý đang chạy: kết thúc ở hôm qua", () => {
    expect(parseQuarter("Q4-2026", now)).toMatchObject({ q: 4, year: 2026, start: "2026-10-01", end: "2026-10-13" })
  })
  it("quý đã hết: kết thúc ở cuối quý", () => {
    expect(parseQuarter("Q3-2026", now)).toMatchObject({ start: "2026-07-01", end: "2026-09-30" })
  })
  it("quý chưa bắt đầu hoặc sai dạng → lỗi", () => {
    expect(() => parseQuarter("Q1-2027", now)).toThrow(/chưa có dữ liệu/)
    expect(() => parseQuarter("4-2026", now)).toThrow(/không hợp lệ/)
  })
})
