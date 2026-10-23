import { describe, it, expect } from "vitest"
import { NIGHTLY_PROMPT, isNightlyPatrolPrompt } from "@/lib/argon/context-pure"

describe("tuần tra đêm: chống trả lời chay", () => {
  it("câu lệnh đêm được nhận diện và có luật bắt buộc ghi file, không chép số từ bản cũ", () => {
    expect(isNightlyPatrolPrompt(NIGHTLY_PROMPT)).toBe(true)
    expect(NIGHTLY_PROMPT).toContain("LUẬT BẮT BUỘC")
    expect(NIGHTLY_PROMPT).toContain("notes/boi-canh.md, notes/tac-dong.md, notes/tin-hom-nay.md")
  })
  it("lượt khác (chỉ chấm dự đoán) không bị kiểm ghi file", () => {
    expect(isNightlyPatrolPrompt("Chỉ chấm các dự đoán đến hạn trong sổ (không cần việc khác).")).toBe(false)
  })
})

import { buildRepairPrompt, isRepairPrompt } from "@/lib/argon/context-pure"
describe("lượt sửa đề xuất", () => {
  it("nêu đúng danh sách lỗi, được nhận ra là lượt sửa, và KHÔNG bị coi là lượt đêm (tránh lặp vô hạn)", () => {
    const p = buildRepairPrompt(["Đề xuất 1: thiếu mức ảnh hưởng", "Đề xuất 2: chưa xếp theo mức ảnh hưởng"], "2026-10-23")
    expect(p).toContain("- Đề xuất 1: thiếu mức ảnh hưởng")
    expect(p).toContain("- Đề xuất 2: chưa xếp theo mức ảnh hưởng")
    expect(isRepairPrompt(p)).toBe(true)
    expect(isNightlyPatrolPrompt(p)).toBe(false)
    expect(p).toContain("Ảnh hưởng")
  })
})
