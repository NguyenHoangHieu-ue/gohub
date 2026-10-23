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
