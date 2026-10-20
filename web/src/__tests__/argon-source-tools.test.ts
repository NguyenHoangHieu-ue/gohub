import { describe, expect, it } from "vitest"
import { MAX_HITS, MAX_READ_CHARS, SOURCE_TOKEN_BUDGET, droppedWarning, execSourceTool, pickByBudget, snippet, type SourceDeps, type SrcRow } from "@/lib/argon/source-tools"

const src = (id: string, tokens: number, over: Partial<{ pinned: boolean; updated_at: string }> = {}) => ({ id, name: `nguồn ${id}`, tokens, pinned: false, updated_at: "2026-10-10T00:00:00Z", ...over })

describe("pickByBudget", () => {
  it("ghim trước, rồi mới cập nhật gần nhất; vừa ngân sách thì giữ hết", () => {
    const r = pickByBudget([src("a", 100, { updated_at: "2026-10-01T00:00:00Z" }), src("b", 100, { pinned: true, updated_at: "2026-09-01T00:00:00Z" }), src("c", 100, { updated_at: "2026-10-15T00:00:00Z" })], 1000)
    expect(r.keep.map(s => s.id)).toEqual(["b", "c", "a"])
    expect(r.dropped).toHaveLength(0)
  })
  it("vượt ngân sách: bỏ nguồn cũ không ghim, nguồn nhỏ phía sau vẫn vào được", () => {
    const r = pickByBudget([src("pin", 500, { pinned: true }), src("moi", 400, { updated_at: "2026-10-15T00:00:00Z" }), src("to", 300, { updated_at: "2026-10-12T00:00:00Z" }), src("nho", 50, { updated_at: "2026-10-01T00:00:00Z" })], 1000)
    expect(r.keep.map(s => s.id)).toEqual(["pin", "moi", "nho"])
    expect(r.dropped.map(s => s.id)).toEqual(["to"])
    expect(r.usedTokens).toBe(950)
  })
  it("cảnh báo nêu số nguồn bị bỏ và cách đọc tiếp; không bỏ gì thì không cảnh báo", () => {
    expect(droppedWarning([])).toBeNull()
    const w = droppedWarning([src("x", 300_000), src("y", 200_000)])
    expect(w).toContain("2 nguồn"); expect(w).toContain("timTrongNguon"); expect(w).toContain(`${SOURCE_TOKEN_BUDGET / 1000}k`)
  })
})

describe("snippet", () => {
  it("lấy đoạn quanh từ khoá, không phân biệt hoa thường, có dấu … khi cắt", () => {
    const t = "a".repeat(400) + " Shopeepay ID chốt giá mới 2,5 USD " + "b".repeat(400)
    const s = snippet(t, "shopeepay")
    expect(s).toContain("Shopeepay ID chốt giá mới"); expect(s.startsWith("…")).toBe(true); expect(s.endsWith("…")).toBe(true); expect(s.length).toBeLessThan(330)
    expect(snippet("không có", "xyz")).toBe("không có")
  })
})

const row = (id: string, text: string, extra: Partial<SrcRow> = {}): SrcRow => ({ id, name: `Thread ${id}`, kind: "note", tokens: 10, updated_at: "2026-10-18T10:00:00Z", extracted_text: text, ...extra })
const deps = (rows: SrcRow[]): SourceDeps => ({
  list: async () => rows.map((r, i) => ({ ...r, inContext: i < 2 })),
  search: async kw => rows.filter(r => (r.extracted_text ?? "").toLowerCase().includes(kw.toLowerCase())),
  read: async id => rows.find(r => r.id === id) ?? null,
})

describe("công cụ nguồn", () => {
  const rows = [row("t1", "Hiếu: chốt giá Momo 2,4 USD. Lan trả lời: OK, gửi hợp đồng thứ 6."), row("t2", "Khách Shopeepay hỏi lại SKU THA"), row("t3", "mail cũ về Momo")]
  it("lietKeNguon: id, loại, token, trạng thái trong/ngoài ngữ cảnh", async () => {
    const r = await execSourceTool("lietKeNguon", {}, deps(rows))
    expect(r.ok).toBe(true)
    expect(r.result).toContain("t1 · note · 10 token · 2026-10-18 · trong ngữ cảnh · Thread t1")
    expect(r.result).toContain("NGOÀI ngữ cảnh")
    expect((await execSourceTool("lietKeNguon", {}, deps([]))).result).toContain("chưa có nguồn")
  })
  it("timTrongNguon: trích đoạn quanh từ khoá qua nhiều thread; từ khoá ngắn bị chặn; không khớp thì báo", async () => {
    const r = await execSourceTool("timTrongNguon", { tuKhoa: "momo" }, deps(rows))
    expect(r.result).toContain("2 nguồn chứa"); expect(r.result).toContain("t1"); expect(r.result).toContain("t3"); expect(r.result).toContain("chốt giá Momo")
    expect((await execSourceTool("timTrongNguon", { tuKhoa: "m" }, deps(rows))).ok).toBe(false)
    expect((await execSourceTool("timTrongNguon", { tuKhoa: "không-có-đâu" }, deps(rows))).result).toContain("Không nguồn nào")
    const many = Array.from({ length: 40 }, (_, i) => row(`m${i}`, "Momo"))
    expect((await execSourceTool("timTrongNguon", { tuKhoa: "Momo" }, deps(many))).result.startsWith(`${MAX_HITS} nguồn`)).toBe(true)
  })
  it("docNguon: đọc toàn văn theo id, cắt khi quá dài, báo khi không thuộc sứ mệnh hoặc không có chữ", async () => {
    expect((await execSourceTool("docNguon", { id: "t1" }, deps(rows))).result).toContain("Lan trả lời: OK")
    const long = await execSourceTool("docNguon", { id: "L" }, deps([row("L", "x".repeat(MAX_READ_CHARS + 100))]))
    expect(long.result).toContain("đã cắt 100 ký tự")
    expect((await execSourceTool("docNguon", { id: "lạ" }, deps(rows))).ok).toBe(false)
    expect((await execSourceTool("docNguon", { id: "e" }, deps([row("e", "")]))).ok).toBe(false)
  })
  it("lỗi hạ tầng không ném; công cụ lạ báo lỗi chữ", async () => {
    const bad: SourceDeps = { list: async () => { throw new Error("db") }, search: async () => [], read: async () => null }
    expect((await execSourceTool("lietKeNguon", {}, bad)).ok).toBe(false)
    expect((await execSourceTool("xoaNguon", {}, deps(rows))).ok).toBe(false)
  })
})
