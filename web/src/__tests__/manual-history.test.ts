import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/turso", () => ({ tursoConfigured: () => false, tursoQuery: async () => [] }))
import { COALESCE_MS, MAX_CHANGES_CHARS, MAX_VALUE_CHARS, actionOf, capChanges, describeChange, diffRecords, mergeChanges, sameValue, shouldCoalesce } from "@/lib/manual-history/pure"
import { flatten, recordEdit } from "@/lib/manual-history/store"
import { TABLES, canRestore } from "@/lib/manual-history/registry"

describe("sameValue — chỉ tính là đổi khi giá trị thật sự khác", () => {
  it("rỗng/null/undefined như nhau; số và chuỗi số như nhau; khoảng trắng bị bỏ qua", () => {
    expect(sameValue(null, "")).toBe(true); expect(sameValue(undefined, null)).toBe(true); expect(sameValue("  ", null)).toBe(true)
    expect(sameValue(5, "5")).toBe(true); expect(sameValue(1000000, "1000000.0")).toBe(true); expect(sameValue(5, 6)).toBe(false)
    expect(sameValue(" abc ", "abc")).toBe(true); expect(sameValue(0, null)).toBe(false)
  })
  it("đối tượng/JSON-chuỗi so theo nội dung, không phụ thuộc thứ tự khoá", () => {
    expect(sameValue('{"a":1,"b":2}', '{"b":2,"a":1}')).toBe(true)
    expect(sameValue('[{"label":"x","value":1}]', [{ value: 1, label: "x" }])).toBe(true)
    expect(sameValue('[{"label":"x","value":1}]', '[{"label":"x","value":2}]')).toBe(false)
  })
})

describe("diffRecords", () => {
  it("chỉ trả trường đổi, bỏ trường kỹ thuật (updated_at, updated_by…)", () => {
    const d = diffRecords({ target_cm1: 100, target_rev: 5, updated_at: "a", updated_by: "x" }, { target_cm1: 150, target_rev: "5", updated_at: "b", updated_by: "y" })
    expect(d).toEqual({ target_cm1: [100, 150] })
  })
  it("lưu lại y nguyên → không có thay đổi; thêm mới/xoá → mọi trường", () => {
    expect(diffRecords({ a: 1 }, { a: 1, updated_at: "z" })).toEqual({})
    expect(diffRecords(null, { a: 1, b: "x" })).toEqual({ a: [null, 1], b: [null, "x"] })
    expect(diffRecords({ a: 1 }, null)).toEqual({ a: [1, null] })
    expect(actionOf(null, {})).toBe("create"); expect(actionOf({}, null)).toBe("delete"); expect(actionOf({}, {})).toBe("update")
  })
  it("tham số ignore thêm trường bỏ qua", () => { expect(diffRecords({ a: 1, b: 1 }, { a: 2, b: 2 }, ["b"])).toEqual({ a: [1, 2] }) })
})

describe("chống phình: capChanges", () => {
  it("cắt giá trị dài (>500 ký tự) và đánh dấu truncated", () => {
    const long = "x".repeat(2000)
    const r = capChanges({ note: [long, "ngắn"] })
    expect(r.truncated).toBe(true)
    expect(String(r.changes.note[0]).length).toBeLessThanOrEqual(MAX_VALUE_CHARS + 1)
  })
  it("tổng không vượt trần; giá trị nhỏ giữ nguyên", () => {
    const many: Record<string, [unknown, unknown]> = {}
    for (let i = 0; i < 200; i++) many[`field_${i}`] = ["a".repeat(100), "b".repeat(100)]
    const r = capChanges(many)
    expect(JSON.stringify(r.changes).length).toBeLessThanOrEqual(MAX_CHANGES_CHARS + 200)
    expect(r.truncated).toBe(true)
    expect(capChanges({ a: [1, 2] })).toEqual({ changes: { a: [1, 2] }, truncated: false })
  })
})

describe("chống phình: gộp lần sửa liên tiếp", () => {
  it("mergeChanges giữ số cũ ĐẦU TIÊN và số mới CUỐI CÙNG; quay về như cũ thì bỏ", () => {
    expect(mergeChanges({ cm1: [100, 150] }, { cm1: [150, 200] })).toEqual({ cm1: [100, 200] })
    expect(mergeChanges({ cm1: [100, 150] }, { cm1: [150, 100] })).toEqual({})
    expect(mergeChanges({ a: [1, 2] }, { b: [5, 6] })).toEqual({ a: [1, 2], b: [5, 6] })
  })
  it("shouldCoalesce: cùng người, cùng là update, trong 10 phút", () => {
    const now = Date.parse("2026-10-26T10:00:00Z")
    const last = (msAgo: number, by = "hieu", action = "update") => ({ by, action, at: new Date(now - msAgo).toISOString() })
    expect(shouldCoalesce(last(60_000), "hieu", "update", now)).toBe(true)
    expect(shouldCoalesce(last(COALESCE_MS + 1000), "hieu", "update", now)).toBe(false)
    expect(shouldCoalesce(last(60_000, "an"), "hieu", "update", now)).toBe(false)
    expect(shouldCoalesce(last(60_000, "hieu", "create"), "hieu", "update", now)).toBe(false)
    expect(shouldCoalesce(null, "hieu", "update", now)).toBe(false)
  })
})

describe("flatten (target lưu dạng JSON một cục)", () => {
  it("làm phẳng đối tượng lồng nhau, mảng giữ nguyên là một giá trị", () => {
    expect(flatten({ ALL: { rev: [1, 2, 3], gp: [4, 5, 6] }, B2B: { rev: [7, 8, 9] } })).toEqual({ "ALL.rev": [1, 2, 3], "ALL.gp": [4, 5, 6], "B2B.rev": [7, 8, 9] })
    expect(flatten(null)).toEqual({})
  })
  it("diff của hai cục JSON chỉ ra đúng ô đổi", () => {
    const a = flatten({ "Squad 1": { rev: 100, cm1: 10 } }), b = flatten({ "Squad 1": { rev: 100, cm1: 12 } })
    expect(diffRecords(a, b)).toEqual({ "Squad 1.cm1": [10, 12] })
  })
})

describe("recordEdit không làm hỏng việc lưu", () => {
  it("Turso chưa cấu hình / không có thay đổi → trả false, không ném lỗi", async () => {
    expect(await recordEdit({ table: "x", key: "k", before: { a: 1 }, after: { a: 2 }, user: "u", source: "t" })).toBe(false)
    expect(await recordEdit({ table: "x", key: "k", before: { a: 1 }, after: { a: 1 }, user: "u", source: "t" })).toBe(false)
  })
})

describe("danh mục và khôi phục", () => {
  it("mọi bảng có nhãn; bảng kiểu supabase/turso khai báo khoá chính", () => {
    for (const [id, d] of Object.entries(TABLES)) {
      expect(d.label, id).toBeTruthy()
      if (d.store === "supabase" || d.store === "turso") { expect(d.table, id).toBeTruthy(); expect(d.pk?.length, id).toBeGreaterThan(0) }
      if (d.store === "json-setting") expect(d.settingKey, id).toBeTruthy()
    }
  })
  it("canRestore: mục tạo mới/bị cắt/bảng lạ không khôi phục tự động; sửa & xoá thì được", () => {
    expect(canRestore({ tbl: "b2b_customer_targets", action: "update", truncated: false })).toBeNull()
    expect(canRestore({ tbl: "b2b_customer_targets", action: "delete", truncated: false })).toBeNull()
    expect(canRestore({ tbl: "b2b_customer_targets", action: "create", truncated: false })).toMatch(/tạo mới/)
    expect(canRestore({ tbl: "b2b_customer_targets", action: "update", truncated: true })).toMatch(/cắt/)
    expect(canRestore({ tbl: "bang_la", action: "update", truncated: false })).toMatch(/chưa hỗ trợ/)
  })
  it("describeChange định dạng số theo vi-VN và (trống)", () => {
    expect(describeChange("target_cm1", [null, 1500000])).toBe(`target_cm1: (trống) → ${(1500000).toLocaleString("vi-VN")}`)
  })
})
