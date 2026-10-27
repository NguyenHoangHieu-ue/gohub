import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))   // chỉ kiểm hàm thuần
import { excerptAround, foldText, matchScore } from "@/lib/argon/chat-history"

describe("tìm hội thoại cũ — phần thuần", () => {
  it("bỏ dấu tiếng Việt và hoa thường", () => {
    expect(foldText("Báo Giá Đài Loan")).toBe("bao gia dai loan")
  })
  it("điểm = số từ khoá xuất hiện (không phân biệt dấu)", () => {
    expect(matchScore(["bao", "gia", "thai"], "Báo giá Thái Lan của Aurora")).toBe(3)
    expect(matchScore(["bao", "gia", "nhat"], "Báo giá Thái Lan")).toBe(2)
    expect(matchScore(["xyz"], "Báo giá")).toBe(0)
  })
  it("đoạn trích nằm quanh từ khớp, không dài quá giới hạn", () => {
    const text = "a".repeat(300) + " báo giá Thái Lan " + "b".repeat(300)
    const ex = excerptAround(text, ["bao", "gia"])
    expect(ex).toContain("báo giá")
    expect(ex.length).toBeLessThanOrEqual(240)
  })
  it("không có từ khớp → lấy đầu văn bản", () => {
    expect(excerptAround("Xin chào các bạn", ["zzz"])).toBe("Xin chào các bạn")
  })
})
