import { describe, expect, it } from "vitest"
import { changedWorkspace, isFileTool, stepLabel } from "@/app/(dashboard)/analytics/creator/argon/missions/use-mission-runner"

describe("Bàn làm việc — nhãn bước", () => {
  it("đặt nhãn dễ đọc theo từng công cụ", () => {
    expect(stepLabel({ name: "docFile", args: { path: "brief.md" } })).toEqual({ tag: "ĐỌC", text: "Đọc brief.md" })
    expect(stepLabel({ name: "ghiFile", args: { path: "decisions.md", append: true } })).toEqual({ tag: "GHI", text: "Ghi thêm vào decisions.md" })
    expect(stepLabel({ name: "ghiFile", args: { path: "notes/a.md" } }).text).toBe("Ghi notes/a.md")
    expect(stepLabel({ name: "lietKeFile", args: {} }).tag).toBe("FILE")
    expect(stepLabel({ name: "layDuLieuHeThong", args: { report: "channels", quarter: "Q4-2026" } }).text).toBe("Lấy số liệu channels Q4-2026")
    expect(stepLabel({ name: "layDuLieuHeThong", args: { report: "channels", startDate: "2026-10-01", endDate: "2026-10-19" } }).text).toContain("2026-10-01→2026-10-19")
    expect(stepLabel({ name: "xyz", args: {} })).toEqual({ tag: "TOOL", text: "xyz" })
  })
  it("chỉ ghiFile thành công mới báo workspace đã đổi", () => {
    expect(changedWorkspace({ name: "ghiFile", ok: true })).toBe(true)
    expect(changedWorkspace({ name: "ghiFile", ok: false })).toBe(false)
    expect(changedWorkspace({ name: "docFile", ok: true })).toBe(false)
    expect(isFileTool("docFile")).toBe(true)
    expect(isFileTool("layDuLieuHeThong")).toBe(false)
  })
})
