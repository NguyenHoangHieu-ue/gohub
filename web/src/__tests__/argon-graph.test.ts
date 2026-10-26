import { describe, expect, it } from "vitest"
import { mergeAliases, matchEntity, normalizeEntities, normalizeRelations } from "@/lib/argon/graph-pure"
import { parseDigestFull } from "@/lib/argon/source-digest"

describe("normalizeEntities", () => {
  it("bỏ mục thiếu/ngắn tên, loại lạ → other, gộp trùng cùng loại, bỏ bí danh trùng tên chính", () => {
    const r = normalizeEntities([
      { kind: "vendor", name: "3HK", aliases: ["3 HK", "3hk", "Three HK"] },
      { kind: "vendor", name: "3hk" },                 // trùng cùng loại (không phân biệt hoa thường)
      { kind: "lạ", name: "Thái Lan" },
      { kind: "market", name: "x" }, { name: "" }, null, "chuỗi",
    ])
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ kind: "vendor", name: "3HK", aliases: ["3 HK", "Three HK"] })
    expect(r[1]).toMatchObject({ kind: "other", name: "Thái Lan" })
  })
  it("tối đa 10; không phải mảng → rỗng", () => {
    expect(normalizeEntities(Array.from({ length: 30 }, (_, i) => ({ kind: "vendor", name: `Vendor ${i}` })))).toHaveLength(10)
    expect(normalizeEntities("x")).toEqual([])
  })
})

describe("normalizeRelations", () => {
  const ents = normalizeEntities([{ kind: "vendor", name: "3HK", aliases: ["Three HK"] }, { kind: "market", name: "Thái Lan" }])
  it("chỉ giữ quan hệ có đủ hai đầu là thực thể của nguồn (tên hoặc bí danh), trả tên chuẩn", () => {
    const r = normalizeRelations([
      { from: "three hk", rel: "bán ở", to: "THÁI LAN" },
      { from: "3HK", rel: "bán ở", to: "Thái Lan" },       // trùng sau chuẩn hoá
      { from: "3HK", rel: "cung cấp", to: "Nhật" },        // đầu kia không có
      { from: "3HK", rel: "", to: "Thái Lan" }, { from: "3HK", rel: "tự", to: "3HK" },
    ], ents)
    expect(r).toEqual([{ from: "3HK", rel: "bán ở", to: "Thái Lan" }])
  })
})

describe("matchEntity / mergeAliases", () => {
  const ex = [{ id: 1, kind: "vendor" as const, key: "3hk", aliases: ["Three HK"] }, { id: 2, kind: "market" as const, key: "thai lan", aliases: [] }]
  it("khớp theo tên hoặc bí danh, cùng loại; khác loại không khớp", () => {
    expect(matchEntity(ex, { kind: "vendor", name: "3HK", aliases: [] })).toBe(1)
    expect(matchEntity(ex, { kind: "vendor", name: "Three Hong Kong", aliases: ["three hk"] })).toBe(1)
    expect(matchEntity(ex, { kind: "product", name: "3HK", aliases: [] })).toBeNull()
    expect(matchEntity(ex, { kind: "market", name: "Nhật", aliases: [] })).toBeNull()
  })
  it("mergeAliases không trùng tên chính, tối đa 8", () => {
    expect(mergeAliases("3HK", ["Three HK"], ["3hk", "three hk", "HTHK"])).toEqual(["Three HK", "HTHK"])
    expect(mergeAliases("A", [], Array.from({ length: 20 }, (_, i) => `alias ${i}`))).toHaveLength(8)
  })
})

describe("parseDigestFull có thực thể", () => {
  it("đọc entities + relations cùng digest và facts", () => {
    const raw = JSON.stringify({ docType: "Thông báo vendor", summary: "3HK báo giá Thái Lan", tags: [], folder: "", suggestions: [], facts: [],
      entities: [{ kind: "vendor", name: "3HK" }, { kind: "market", name: "Thái Lan" }], relations: [{ from: "3HK", rel: "bán ở", to: "Thái Lan" }] })
    const d = parseDigestFull(raw)!
    expect(d.entities.map(e => e.name)).toEqual(["3HK", "Thái Lan"]); expect(d.relations).toHaveLength(1)
  })
  it("không có entities → mảng rỗng (nguồn cũ vẫn đọc được)", () => {
    const d = parseDigestFull('{"summary":"x","docType":"Khác"}')!
    expect(d.entities).toEqual([]); expect(d.relations).toEqual([])
  })
})
