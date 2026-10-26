import { describe, expect, it } from "vitest"
import { matchesAll, routeQuestion } from "@/lib/assistant/route-pure"

describe("routeQuestion", () => {
  it("nhờ thao tác → Gấu Pro (tin cậy cao khi không hỏi kiến thức)", () => {
    expect(routeQuestion("Tạo task Lark nhắc tôi gọi lại HTHK sáng mai")).toMatchObject({ mode: "gau_pro" })
    expect(routeQuestion("gửi tin cho Romy hỏi tiến độ").mode).toBe("gau_pro")
    expect(routeQuestion("mở trang portal BC rồi tải file").mode).toBe("gau_pro")
  })
  it("hỏi Kho/số liệu → Argon", () => {
    expect(routeQuestion("3HK báo giá Thái Lan lần gần nhất là bao nhiêu?")).toMatchObject({ mode: "argon", confidence: "high" })
    expect(routeQuestion("Mail nào đang chờ tôi trả lời?").mode).toBe("argon")
    expect(routeQuestion("Vendor nào sắp hết hạn khuyến mãi").mode).toBe("argon")
  })
  it("vừa hỏi vừa nhờ làm → Gấu Pro nhưng tin cậy thấp (anh đổi được)", () => {
    const r = routeQuestion("so sánh giá 3HK với BC rồi gửi tin cho Hana")
    expect(r.mode).toBe("gau_pro"); expect(r.confidence).toBe("low")
  })
  it("không rõ → mặc định Argon (chỉ đọc, an toàn)", () => {
    expect(routeQuestion("xin chào")).toMatchObject({ mode: "argon", confidence: "low" })
  })
  it("không phân biệt dấu/hoa thường", () => {
    expect(routeQuestion("TAO TASK nhac toi").mode).toBe("gau_pro")
  })
})

describe("matchesAll", () => {
  it("mọi từ phải có, bỏ dấu, không phân biệt hoa thường", () => {
    expect(matchesAll("3hk thái lan", "Vendor 3HK — Thai Lan Daily 1GB")).toBe(true)
    expect(matchesAll("3hk nhật", "Vendor 3HK — Thai Lan")).toBe(false)
    expect(matchesAll("", "abc")).toBe(false)
  })
})
