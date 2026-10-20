import { describe, expect, it } from "vitest"
import { changedWorkspace, isFileTool, stepLabel } from "@/app/(dashboard)/analytics/creator/argon/missions/use-mission-runner"

describe("Bàn làm việc — nhãn bước", () => {
  it("đặt nhãn dễ đọc theo từng công cụ", () => {
    expect(stepLabel({ name: "docFile", args: { path: "brief.md" } })).toEqual({ tag: "ĐỌC", text: "Đọc brief.md" })
    expect(stepLabel({ name: "ghiFile", args: { path: "decisions.md", append: true } })).toEqual({ tag: "GHI", text: "Ghi thêm vào decisions.md" })
    expect(stepLabel({ name: "ghiFile", args: { path: "notes/a.md" } }).text).toBe("Ghi notes/a.md")
    expect(stepLabel({ name: "lietKeFile", args: {} }).tag).toBe("FILE")
    expect(stepLabel({ name: "layDuLieuHeThong", args: { report: "channels", quarter: "Q4-2026" } }).text).toBe("Lấy số liệu channels Q4-2026")
    expect(stepLabel({ name: "layDuLieuHeThong", args: { report: "channels", startDate: "2026-10-01", endDate: "2026-10-19" } }).text).toContain("2026-10-01→2026-10-19")
    expect(stepLabel({ name: "xyz", args: {} })).toEqual({ tag: "TOOL", text: "xyz" })
  })
  it("chỉ ghiFile thành công mới báo workspace đã đổi", () => {
    expect(changedWorkspace({ name: "ghiFile", ok: true })).toBe(true)
    expect(changedWorkspace({ name: "ghiFile", ok: false })).toBe(false)
    expect(changedWorkspace({ name: "docFile", ok: true })).toBe(false)
    expect(isFileTool("docFile")).toBe(true)
    expect(isFileTool("layDuLieuHeThong")).toBe(false)
  })
})

import { linkSteps } from "@/app/(dashboard)/analytics/creator/argon/argon-markdown"
describe("nguồn gốc số liệu — chip [#N]", () => {
  it("[#3] và [#2,#5] thành liên kết nội bộ từng bước", () => {
    expect(linkSteps("Doanh thu 100 tỷ [#3].")).toBe("Doanh thu 100 tỷ [#3](#argon-step-3).")
    expect(linkSteps("Tổng [#2,#5]")).toBe("Tổng [#2](#argon-step-2)[#5](#argon-step-5)")
    expect(linkSteps("không đổi [ghi chú] và [#abc]")).toBe("không đổi [ghi chú] và [#abc]")
  })
  it("nhãn bước SQL rút gọn câu truy vấn và hiện nơi lưu", () => {
    const l = stepLabel({ name: "sql", args: { query: "SELECT  vendor,\n sum(rev) FROM t", saveAs: "data/rev.csv" } })
    expect(l.tag).toBe("SQL")
    expect(l.text).toBe("SQL: SELECT vendor, sum(rev) FROM t → data/rev.csv")
  })
})

import { MISSION_TEMPLATES, phaseIndex, relTime, tagStyle } from "@/app/(dashboard)/analytics/creator/argon/missions/mission-types"
describe("giao diện sứ mệnh: mẫu, thời gian, nhãn", () => {
  it("relTime: vừa xong / phút / giờ / ngày", () => {
    const now = Date.parse("2026-10-20T12:00:00Z")
    expect(relTime("2026-10-20T11:59:40Z", now)).toBe("vừa xong")
    expect(relTime("2026-10-20T11:30:00Z", now)).toBe("30 phút trước")
    expect(relTime("2026-10-20T09:00:00Z", now)).toBe("3 giờ trước")
    expect(relTime("2026-10-18T12:00:00Z", now)).toBe("2 ngày trước")
  })
  it("mẫu sứ mệnh: có thread + mail + chỉ số + trống; mẫu có sẵn mục tiêu (trừ mẫu trống)", () => {
    expect(MISSION_TEMPLATES.map(t => t.id)).toEqual(["thread", "mail", "chart", "blank"])
    for (const t of MISSION_TEMPLATES.filter(x => x.id !== "blank")) { expect(t.goal.length).toBeGreaterThan(60); expect(t.name.length).toBeGreaterThan(3) }
    expect(MISSION_TEMPLATES.find(t => t.id === "thread")!.goal).toContain("mọi trả lời")
  })
  it("chỉ số pha và nhãn màu (nhãn lạ vẫn có kiểu mặc định; nhãn nguồn riêng)", () => {
    expect(["clarify", "plan", "run", "paused", "done"].map(p => phaseIndex(p as never))).toEqual([0, 1, 2, 2, 2])
    expect(tagStyle("SQL")).toContain("sky"); expect(tagStyle("NGUỒN")).toContain("teal"); expect(tagStyle("LẠ")).toContain("gray")
    expect(stepLabel({ name: "timTrongNguon", args: { tuKhoa: "Momo" } })).toEqual({ tag: "NGUỒN", text: 'Tìm "Momo" trong các nguồn' })
  })
})
