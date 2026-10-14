import { describe, expect, it } from "vitest"
import { collapseDiff, diffLines, diffStats } from "@/lib/argon/diff"

describe("diffLines", () => {
  it("giống nhau → toàn eq", () => {
    expect(diffStats(diffLines("a\nb", "a\nb"))).toEqual({ added: 0, removed: 0 })
  })
  it("thêm / xoá / sửa 1 dòng giữa", () => {
    const ops = diffLines("a\nb\nc\nd", "a\nB\nc\nd\ne")
    expect(ops.filter(o => o.t === "del").map(o => o.line)).toEqual(["b"])
    expect(ops.filter(o => o.t === "add").map(o => o.line)).toEqual(["B", "e"])
    expect(ops.filter(o => o.t === "eq").map(o => o.line)).toEqual(["a", "c", "d"])
  })
  it("ghép lại bản mới đúng từ các dòng eq+add", () => {
    const a = "1\n2\n3\n4\n5\n6", b = "1\n3\n4\nx\ny\n6"
    const rebuilt = diffLines(a, b).filter(o => o.t !== "del").map(o => o.line).join("\n")
    expect(rebuilt).toBe(b)
    const original = diffLines(a, b).filter(o => o.t !== "add").map(o => o.line).join("\n")
    expect(original).toBe(a)
  })
  it("rỗng ↔ có nội dung", () => {
    expect(diffStats(diffLines("", "x\ny"))).toEqual({ added: 2, removed: 1 })   // "" tách thành 1 dòng rỗng
  })
})

describe("collapseDiff", () => {
  it("giữ ngữ cảnh quanh chỗ đổi, gộp đoạn giống dài", () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n")
    const b = a.replace("l10", "LL")
    const out = collapseDiff(diffLines(a, b), 2)
    expect(out.some(o => o.t === "skip")).toBe(true)
    expect(out.filter(o => o.t === "del" || o.t === "add")).toHaveLength(2)
    expect(out.length).toBeLessThan(12)
  })
})
