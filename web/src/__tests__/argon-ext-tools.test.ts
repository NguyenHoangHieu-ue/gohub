import { describe, expect, it } from "vitest"
import { EXT_LIMITS, EXT_TOOLS, EXT_TOOL_NAMES, execExtTool } from "@/lib/argon/ext-tools"
import { TOOL_LEVELS } from "@/lib/argon/run-safety"
import { MEMBER_BLOCKED_TOOLS } from "@/lib/argon/access-pure"
import { PARALLEL_SAFE } from "@/lib/argon/parallel-tools"
import { FAST_TOOL_NAMES, routeRun } from "@/lib/argon/run-route"

describe("công cụ ngoài Kho của Argon (web, Lark)", () => {
  it("khai báo đủ, bậc L1 (nội dung ngoài → bọc + đánh dấu nhiễm), chỉ Creator, đọc song song được", () => {
    expect(EXT_TOOLS.map(t => t.name).sort()).toEqual([...EXT_TOOL_NAMES].sort())
    for (const n of EXT_TOOL_NAMES) {
      expect(TOOL_LEVELS[n], n).toBe("L1")
      expect(MEMBER_BLOCKED_TOOLS, n).toContain(n)
      expect(PARALLEL_SAFE.has(n), n).toBe(true)
      expect(FAST_TOOL_NAMES, n).not.toContain(n)
      expect(EXT_LIMITS[n], n).toBeGreaterThan(0)
    }
  })
  it("câu cần web/Lark không đi đường nhanh (đường nhanh không có công cụ này)", () => {
    for (const q of ["Tìm trên web quy định eSIM Nhật", "Đọc giúp link https://x.larksuite.com/docx/abc", "Lark Base ticket CS tuần này"]) {
      expect(routeRun(q, { mission: true }).route, q).toBe("full")
    }
  })
  it("docLark chỉ search/read — không tạo/sửa tài liệu", async () => {
    const r = await execExtTool("docLark", { action: "create_doc", title: "x", content: "y" }, 0)
    expect(r.ok).toBe(false)
    expect(r.result).toMatch(/search.*read/)
  })
  it("áp hạn mức số lần mỗi công cụ trong một lượt", async () => {
    const r = await execExtTool("timTrenWeb", { query: "abc def" }, EXT_LIMITS.timTrenWeb)
    expect(r.ok).toBe(false)
    expect(r.result).toMatch(/hết/)
  })
  it("thiếu tham số bắt buộc → lỗi rõ ràng, không gọi mạng", async () => {
    expect((await execExtTool("timTrenWeb", { query: "ab" }, 0)).ok).toBe(false)
    expect((await execExtTool("docLarkBase", {}, 0)).ok).toBe(false)
  })
})
