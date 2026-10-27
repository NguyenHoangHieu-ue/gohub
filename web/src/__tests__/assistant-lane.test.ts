import { describe, expect, it } from "vitest"
import { routeLane } from "@/lib/assistant/route-pure"

// Bộ câu → làn mong đợi (ARGON-X mục 15.1). Thêm ca mới khi phát hiện router chọn sai.
const CASES: [string, string, "fast" | "deep"][] = [
  ["Mail nào đang chờ tôi trả lời?", "hoi_kho", "fast"],
  ["3HK báo giá Thái Lan lần gần nhất là bao nhiêu?", "hoi_kho", "fast"],
  ["Doanh thu B2B tháng này so với tháng trước thế nào?", "so_lieu", "fast"],
  ["CM1 theo kênh quý này", "so_lieu", "fast"],
  ["Phân tích tại sao GP tháng 10 giảm", "so_lieu", "deep"],
  ["Làm báo cáo HTML doanh thu tháng 10", "soan_tao", "deep"],
  ["Xuất excel danh sách vendor sắp hết hạn", "soan_tao", "deep"],
  ["Tạo task Lark nhắc tôi gọi lại HTHK sáng mai", "hanh_dong", "fast"],
  ["Gửi tin cho Romy hỏi tiến độ", "hanh_dong", "fast"],
  ["Mở trang portal BC rồi tải file", "trinh_duyet", "fast"],
  ["Đăng nhập portal 3HK lấy bảng giá", "trinh_duyet", "fast"],
]

describe("routeLane", () => {
  it.each(CASES)("%s → %s", (q, lane, tier) => {
    const r = routeLane(q)
    expect(r.lane).toBe(lane)
    expect(r.tier).toBe(tier)
  })
  it("thao tác làm qua thẻ duyệt (here + approval); tải file về máy chưa hỗ trợ (here=false); còn lại làm ngay", () => {
    expect(routeLane("Gửi tin cho Romy")).toMatchObject({ here: true, approval: true })
    expect(routeLane("bấm nút Gửi trên trình duyệt")).toMatchObject({ here: true, approval: false })   // Bridge
    expect(routeLane("tải file báo giá về máy")).toMatchObject({ here: false })
    expect(routeLane("Doanh thu hôm qua")).toMatchObject({ here: true, approval: false })
  })
  it("ghi/gửi luôn lên làn thao tác dù câu có từ hỏi Kho", () => {
    const r = routeLane("So sánh giá 3HK với BC rồi gửi tin cho Hana")
    expect(r.lane).toBe("hanh_dong")
    expect(r.confidence).toBe("low")
  })
  it("không rõ → hỏi Kho, tin cậy thấp", () => {
    expect(routeLane("xin chào")).toMatchObject({ lane: "hoi_kho", confidence: "low", tier: "fast" })
  })
  it("câu rất dài → Sâu", () => {
    expect(routeLane(`Đây là ghi chú ${"dài ".repeat(90)}`).tier).toBe("deep")
  })
})
