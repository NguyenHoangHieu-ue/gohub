import { describe, it, expect } from "vitest"
import { chunkText, CHUNK_MAX } from "@/lib/argon/chunker"
import { rrfMerge, vecLiteral } from "@/lib/argon/index-db"

describe("chunkText", () => {
  it("rỗng → không đoạn", () => { expect(chunkText("  \n\n ")).toEqual([]) })
  it("văn bản ngắn → 1 đoạn nguyên văn", () => {
    const c = chunkText("Xin chào\n\nThế giới")
    expect(c).toHaveLength(1)
    expect(c[0].text).toBe("Xin chào\n\nThế giới")
  })
  it("văn bản dài → nhiều đoạn, không đoạn nào vượt trần (cộng phần nối)", () => {
    const para = "Câu thử nghiệm số một. ".repeat(40)
    const c = chunkText(Array.from({ length: 30 }, () => para).join("\n\n"))
    expect(c.length).toBeGreaterThan(5)
    c.forEach((x, i) => { expect(x.idx).toBe(i); expect(x.text.length).toBeLessThanOrEqual(CHUNK_MAX + 300) })
  })
  it("một đoạn khổng lồ không có xuống dòng vẫn bị cắt", () => {
    const c = chunkText("a".repeat(10_000))
    expect(c.length).toBeGreaterThanOrEqual(3)
    expect(c.every(x => x.text.length <= CHUNK_MAX + 300)).toBe(true)
  })
  it("đoạn sau mang đuôi đoạn trước (…)", () => {
    const c = chunkText(Array.from({ length: 12 }, (_, i) => `Mục ${i} ${"nội dung dài ".repeat(60)}`).join("\n\n"))
    expect(c.length).toBeGreaterThan(1)
    expect(c[1].text.startsWith("…")).toBe(true)
  })
  it("không mất nội dung: mọi từ khoá đều còn ở đâu đó", () => {
    const text = Array.from({ length: 20 }, (_, i) => `KEY${i} ${"lorem ipsum ".repeat(120)}`).join("\n\n")
    const joined = chunkText(text).map(x => x.text).join("\n")
    for (let i = 0; i < 20; i++) expect(joined).toContain(`KEY${i}`)
  })
})

describe("rrfMerge / vecLiteral", () => {
  it("mục xuất hiện ở cả 2 danh sách lên đầu", () => {
    const m = rrfMerge([[{ key: "a" }, { key: "b" }, { key: "c" }], [{ key: "c" }, { key: "d" }]])
    expect(m[0].key).toBe("c")
    expect(m.map(x => x.key).sort()).toEqual(["a", "b", "c", "d"])
  })
  it("vecLiteral gọn và đúng định dạng", () => { expect(vecLiteral([0.1234567891, 1, -2])).toBe("[0.123457,1,-2]") })
})
