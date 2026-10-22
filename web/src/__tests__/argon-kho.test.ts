import { describe, it, expect } from "vitest"
import { cleanFolderPath, descendantIds, findFolderByPath, folderPathOf, khoIndexText, type FolderRow, type KhoSource } from "@/lib/argon/kho-pure"
import { parseDigest } from "@/lib/argon/source-digest"

const F = (id: string, name: string, parent: string | null = null): FolderRow => ({ id, username: "u", parent_id: parent, name })
const S = (id: string, over: Partial<KhoSource> = {}): KhoSource => ({ id, project_id: "p", kind: "file", name: `file-${id}`, mime: null, size_bytes: 1, tokens: 1200, pinned: false, enabled: true, folder_id: null, digest: null, tags: [], created_at: `2026-10-0${id}T00:00:00Z`, updated_at: "2026-10-01T00:00:00Z", ...over })

describe("cleanFolderPath", () => {
  it("tách theo /, bỏ rỗng và khoảng trắng thừa", () => { expect(cleanFolderPath(" Vendor / 3HK //Bảng  giá ")).toEqual(["Vendor", "3HK", "Bảng giá"]) })
  it("tối đa 3 cấp, mỗi cấp ≤ 60 ký tự", () => {
    expect(cleanFolderPath("a/b/c/d/e")).toHaveLength(3)
    expect(cleanFolderPath("x".repeat(100))[0]).toHaveLength(60)
  })
  it("rỗng / ký tự điều khiển", () => { expect(cleanFolderPath("")).toEqual([]); expect(cleanFolderPath("a\u0000b")).toEqual(["a b"]) })
})

describe("cây thư mục", () => {
  const fs = [F("1", "Vendor"), F("2", "3HK", "1"), F("3", "Giá", "2"), F("4", "Khách")]
  it("folderPathOf nối từ gốc", () => { expect(folderPathOf("3", fs)).toBe("Vendor/3HK/Giá"); expect(folderPathOf(null, fs)).toBe("") })
  it("findFolderByPath không phân biệt hoa thường", () => { expect(findFolderByPath(["vendor", "3hk"], fs)).toBe("2"); expect(findFolderByPath(["Vendor", "X"], fs)).toBeNull() })
  it("descendantIds lấy cả cháu", () => { expect([...descendantIds("1", fs)].sort()).toEqual(["2", "3"]) })
})

describe("khoIndexText", () => {
  it("liệt kê thư mục có số nguồn, nguồn chưa phân loại và nguồn mới kèm tóm tắt", () => {
    const t = khoIndexText([F("1", "Vendor")], [S("1", { folder_id: "1", digest: { summary: "Báo giá 3HK tháng 10" } }), S("2")], Date.parse("2026-10-22T00:00:00Z"))
    expect(t).toContain("- Vendor/ (1 nguồn)")
    expect(t).toContain("Chưa phân loại: 1 nguồn")
    expect(t).toContain("[1] file-1")
    expect(t).toContain("Báo giá 3HK tháng 10")
    expect(t).toContain('tong_nguon="2"')
  })
  it("Kho trống không lỗi", () => { expect(khoIndexText([], [])).toContain("(chưa có thư mục)") })
})

describe("parseDigest", () => {
  it("đọc JSON trong rào ```json và chuẩn hoá", () => {
    const d = parseDigest('```json\n{"docType":"Bảng giá / báo giá","summary":"Báo giá 3HK","tags":["3HK","Thái Lan","a","b","c","d"],"folder":"Vendor/3HK","suggestions":["Đặt nhắc 30/11"]}\n```')
    expect(d?.docType).toBe("Bảng giá / báo giá")
    expect(d?.tags).toHaveLength(5)
    expect(d?.folder).toBe("Vendor/3HK")
  })
  it("loại tài liệu lạ → Khác; thiếu summary hoặc không phải JSON → null", () => {
    expect(parseDigest('{"docType":"Lạ","summary":"x"}')?.docType).toBe("Khác")
    expect(parseDigest('{"docType":"Khác"}')).toBeNull()
    expect(parseDigest("không phải json")).toBeNull()
  })
})
