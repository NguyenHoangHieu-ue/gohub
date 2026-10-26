import { describe, expect, it } from "vitest"
import { FAST_MAX_CHARS, FAST_TOOL_NAMES, routeRun } from "@/lib/argon/run-route"
import { PARALLEL_SAFE } from "@/lib/argon/parallel-tools"

const fast = (p: string, o = {}) => routeRun(p, { mission: true, ...o }).route

describe("routeRun (router đường nhanh / đầy đủ)", () => {
  it("câu tra cứu ngắn trong Kho đi đường nhanh", () => {
    for (const q of ["Mail nào đang chờ tôi trả lời?", "Hôm nay có gì cần anh quyết?", "Tài liệu nào sắp hết hạn?", "Hạn chốt báo giá Thái Lan là khi nào?", "Ai là người phụ trách vendor Elite?", "Vendor nào mới ngừng bán gần đây?", "3HK nằm ở những nguồn nào trong Kho?"]) expect(fast(q), q).toBe("fast")
  })
  it("câu cần số liệu / tính toán / phân tích / soạn thảo đi đầy đủ", () => {
    for (const q of ["Doanh thu Q4 so với kế hoạch thế nào?", "So sánh giá vốn Thái Lan giữa BC và WM", "Tại sao CM1 tuần này giảm?", "Tính %Datapool tháng 10", "Làm report doanh thu theo vendor", "Soạn mail trả lời Elite về báo giá", "Top 10 khách tháng này", "Kiểm tra số bán WM từ tháng 9", "Ghi vào sổ sự việc: Aurora giảm giá UK còn 2.0 USD/GB", "Lưu giúp anh bảng so sánh này vào Kho", "Cập nhật hạn chót báo giá Nimbus", "Nhớ giúp anh là anh thích báo cáo ngắn", "Xoá sự việc sai về Zephyr đi"]) expect(fast(q), q).toBe("full")
  })
  it("mặc định ĐẦY ĐỦ khi không rõ; câu dài/nhiều dòng/việc tự động/Sâu/tiếp tục/suy luận cao luôn đầy đủ", () => {
    expect(fast("Em nghĩ sao về chuyện này")).toBe("full")
    expect(fast("mail nào đang chờ tôi? " + "x".repeat(FAST_MAX_CHARS))).toBe("full")
    expect(fast("mail nào đang chờ tôi?\nvà hạn nào sắp tới")).toBe("full")
    expect(fast("🌙 Tuần tra đêm: mail nào đang chờ tôi")).toBe("full")
    expect(fast("mail nào đang chờ tôi?", { deep: true })).toBe("full")
    expect(fast("mail nào đang chờ tôi?", { resume: true })).toBe("full")
    expect(fast("mail nào đang chờ tôi?", { thinking: "high" })).toBe("full")
    expect(fast("mail nào đang chờ tôi?", { mission: false })).toBe("full")
  })
  it("đường nhanh chỉ gồm công cụ ĐỌC, không có sql/run_code/ghi/hỏi; và mọi công cụ nhanh đều chạy song song được", () => {
    for (const n of ["sql", "run_code", "ghiFile", "hoiHieu", "layDuLieuHeThong", "deXuatSuaCode", "ghiDuDoan"]) expect(FAST_TOOL_NAMES.includes(n)).toBe(false)
    for (const n of FAST_TOOL_NAMES) expect(PARALLEL_SAFE.has(n), n).toBe(true)
  })
})
