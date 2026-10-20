import { describe, expect, it } from "vitest"
import { PATROL_PRESETS, patrolDue, patrolPrompt, vnDate } from "@/lib/argon/patrol"

describe("tuần tra đêm", () => {
  it("vnDate theo giờ VN (UTC+7)", () => {
    expect(vnDate(new Date("2026-10-20T20:00:00Z"))).toBe("2026-10-21")
    expect(vnDate(new Date("2026-10-20T05:00:00Z"))).toBe("2026-10-20")
  })
  it("chỉ tuần tra khi bật + có yêu cầu + đang ở pha chạy + hôm nay chưa chạy", () => {
    const on = { enabled: true, prompt: "đo lại" }
    expect(patrolDue(on, "run", "2026-10-21")).toBe(true)
    expect(patrolDue({ ...on, lastRunDate: "2026-10-21" }, "run", "2026-10-21")).toBe(false)
    expect(patrolDue({ ...on, lastRunDate: "2026-10-20" }, "run", "2026-10-21")).toBe(true)
    expect(patrolDue({ ...on, enabled: false }, "run", "2026-10-21")).toBe(false)
    expect(patrolDue({ enabled: true, prompt: "  " }, "run", "2026-10-21")).toBe(false)
    for (const phase of ["clarify", "plan", "paused", "done"] as const) expect(patrolDue(on, phase, "2026-10-21")).toBe(false)
    expect(patrolDue(null, "run", "2026-10-21")).toBe(false)
  })
  it("câu lệnh đêm: nêu ngày, cấm hỏi lại, đích ghi báo cáo, bắt ghi nguồn số", () => {
    const p = patrolPrompt("  So số liệu  ", "2026-10-21")
    expect(p).toContain("🌙 Tuần tra đêm 2026-10-21: So số liệu")
    expect(p).toContain("KHÔNG gọi hoiHieu")
    expect(p).toContain("notes/tuan-tra-2026-10-21.md")
    expect(p).toContain("[#N]")
  })
  it("có mẫu gợi ý dùng được (kiểm toán chéo + đo thước đo)", () => {
    expect(PATROL_PRESETS.map(x => x.id)).toEqual(["audit", "brief"])
    for (const x of PATROL_PRESETS) expect(x.prompt.length).toBeGreaterThan(50)
  })
})
