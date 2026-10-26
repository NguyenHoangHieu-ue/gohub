import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: { from: () => ({}) }, supabase: {} }))
import { mapKhoCall } from "@/lib/assistant/kho-lookup"
import { approvalReason, newTurnSafety, recordToolResult } from "@/lib/agents/creator/tool-policy"
import { buildFunctionDeclarations } from "@/lib/agents/creator-ai"

describe("mapKhoCall (Gấu Pro tra Kho chung với Argon)", () => {
  it("suViec/mail/thucThe ánh xạ sang công cụ Kho tương ứng", () => {
    expect(mapKhoCall({ loai: "suViec", tuKhoa: "3HK" })).toEqual({ tool: "traSuViec", args: { tuKhoa: "3HK" } })
    expect(mapKhoCall({ loai: "suViec", ten: "BC" })).toEqual({ tool: "traSuViec", args: { tuKhoa: "BC" } })
    expect(mapKhoCall({ loai: "mail" })).toEqual({ tool: "traMail", args: { trangThai: "cho_minh", tuKhoa: "" } })
    expect(mapKhoCall({ loai: "mail", trangThai: "cho_doi_tac", tuKhoa: "HTHK" })).toEqual({ tool: "traMail", args: { trangThai: "cho_doi_tac", tuKhoa: "HTHK" } })
    expect(mapKhoCall({ loai: "thucThe", ten: "Thái Lan" })).toEqual({ tool: "traThucThe", args: { ten: "Thái Lan" } })
  })
  it("timKiem dùng tuKhoa (hoặc ten); thiếu tham số bắt buộc / loai lạ → lỗi rõ", () => {
    expect(mapKhoCall({ loai: "timKiem", tuKhoa: "giá 3HK" })).toEqual({ search: "giá 3HK" })
    expect(mapKhoCall({ loai: "timKiem", ten: "x y" })).toEqual({ search: "x y" })
    expect(mapKhoCall({ loai: "thucThe" })).toHaveProperty("error")
    expect(mapKhoCall({ loai: "timKiem" })).toHaveProperty("error")
    expect(mapKhoCall({ loai: "xoa" })).toHaveProperty("error")
    expect(mapKhoCall({})).toHaveProperty("error")
  })
})

describe("traCuuKho trong cổng duyệt Gấu Pro", () => {
  it("là nguồn không tin cậy: sau khi tra Kho, hành động ghi/gửi cần duyệt (chống tiêm chỉ dẫn qua mail)", () => {
    const s = newTurnSafety("hỏi giá", false)
    expect(approvalReason({ name: "createLarkTask", args: { summary: "x" } }, s)).toBeNull()
    recordToolResult(s, { name: "traCuuKho", args: { loai: "mail" } }, { ketQua: "..." })
    expect(s.tainted).toBe(true)
    expect(approvalReason({ name: "createLarkTask", args: { summary: "x" } }, s)).toMatch(/cần duyệt/)
  })
  it("chỉ Creator thấy công cụ này", () => {
    expect(buildFunctionDeclarations(true).some(d => d.name === "traCuuKho")).toBe(true)
    expect(buildFunctionDeclarations(false).some(d => d.name === "traCuuKho")).toBe(false)
  })
})
