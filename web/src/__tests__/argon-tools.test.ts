import { describe, expect, it } from "vitest"
import { validateToolArgs } from "@/lib/argon/tools"
import { youtubeId } from "@/lib/argon/video-url"

const NOW = new Date("2026-10-15T03:00:00Z")   // 10:00 giờ VN → hôm qua = 2026-10-14

describe("công cụ lấy số liệu của Argon — kiểm tham số", () => {
  it("chỉ nhận báo cáo trong danh mục", () => {
    expect(validateToolArgs({ report: "drop-table", quarter: "Q4-2026" }, NOW)).toHaveProperty("error")
    expect(validateToolArgs({ report: "wiki-business", quarter: "Q4-2026" }, NOW)).toHaveProperty("error")
  })
  it("báo cáo theo quý cần quarter đúng dạng", () => {
    expect(validateToolArgs({ report: "market" }, NOW)).toHaveProperty("error")
    expect(validateToolArgs({ report: "market", quarter: "4-2026" }, NOW)).toHaveProperty("error")
    expect(validateToolArgs({ report: "market", quarter: "Q4-2026" }, NOW)).toEqual({ report: "market", quarter: "Q4-2026" })
  })
  it("khoảng ngày chỉ cho báo cáo hỗ trợ, đủ cặp, ≤400 ngày, cắt tại hôm qua", () => {
    expect(validateToolArgs({ report: "market", startDate: "2026-10-01", endDate: "2026-10-10" }, NOW)).toHaveProperty("error")
    expect(validateToolArgs({ report: "channels", startDate: "2026-10-01" }, NOW)).toHaveProperty("error")
    expect(validateToolArgs({ report: "channels", startDate: "2026-10-10", endDate: "2026-10-01" }, NOW)).toHaveProperty("error")
    expect(validateToolArgs({ report: "channels", startDate: "2024-01-01", endDate: "2026-10-01" }, NOW)).toHaveProperty("error")
    expect(validateToolArgs({ report: "channels", startDate: "2026-10-01", endDate: "2026-12-31" }, NOW)).toEqual({ report: "channels", quarter: "", range: { start: "2026-10-01", end: "2026-10-14" } })
    expect(validateToolArgs({ report: "channels", startDate: "bậy", endDate: "2026-10-01" }, NOW)).toHaveProperty("error")
  })
})

describe("link YouTube", () => {
  it("nhận các dạng link phổ biến, bỏ link khác", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeId("https://www.youtube.com/watch?t=5&v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ")
    expect(youtubeId("https://www.youtube.com/shorts/abcDEF12345")).toBe("abcDEF12345")
    expect(youtubeId("https://larksuite.com/docx/abc")).toBeNull()
  })
})
