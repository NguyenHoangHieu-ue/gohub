import { describe, expect, it } from "vitest"
import { tidyAnswer } from "@/lib/argon/answer-format"

const LONG = "Doanh thu 7 ngày gần nhất đạt **1.860,13 triệu VND** (+8,0% so với kỳ trước) với GP 35,04%, lũy kế Q4 đạt 6.157,59 triệu VND (thiếu 3,6% so với mục tiêu 40%) và BCDatapool gộp đạt 361,13 triệu VND."

describe("tidyAnswer — tách nhãn trong đoạn dài", () => {
  it("tách **Bất thường:** và **Việc cần anh:** thành đoạn riêng, giữ nhãn đầu đoạn tại chỗ", () => {
    const t = `**Kết luận:** ${LONG} **Bất thường:** 30 ngày qua Worldmove vẫn chiếm 86,4% doanh thu Đài Loan do chưa chuyển routing sang BC Singtel Pool và có 6 đơn âm. **Việc cần anh:** Chỉ đạo kỹ thuật chuyển luồng đơn Đài Loan sang BC Singtel Pool trước 30/11.`
    const out = tidyAnswer(t)
    const parts = out.split(/\n{2,}/)
    expect(parts).toHaveLength(3)
    expect(parts[0].startsWith("**Kết luận:**")).toBe(true)
    expect(parts[1].startsWith("**Bất thường:**")).toBe(true)
    expect(parts[2].startsWith("**Việc cần anh:**")).toBe(true)
  })
  it("không đụng đoạn ngắn, danh sách, bảng, tiêu đề, khối mã", () => {
    const short = "**Kết luận:** ngắn. **Lưu ý:** cũng ngắn."
    expect(tidyAnswer(short)).toBe(short)
    const list = `- ${LONG} **Lưu ý:** x\n- hai`
    expect(tidyAnswer(list)).toBe(list)
    const table = `| a | b |\n|---|---|\n| ${LONG} **Lưu ý:** x | 2 |`
    expect(tidyAnswer(table)).toBe(table)
    const code = "```\n" + LONG + " **Lưu ý:** x\n```"
    expect(tidyAnswer(code)).toBe(code)
    expect(tidyAnswer(`## ${LONG} **Lưu ý:** x`)).toBe(`## ${LONG} **Lưu ý:** x`)
  })
  it("idempotent và giữ nguyên chữ (chỉ thêm ngắt đoạn)", () => {
    const t = `${LONG} **Lưu ý:** xem kỹ số liệu tuần trước ${"x".repeat(60)}`
    const once = tidyAnswer(t)
    expect(tidyAnswer(once)).toBe(once)
    expect(once.replace(/\s+/g, " ")).toBe(t.replace(/\s+/g, " "))
  })
})
