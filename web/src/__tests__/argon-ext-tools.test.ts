import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {}, supabase: {} }))   // gate bảng nhạy cảm chạy trước mọi truy vấn nên không cần DB thật
import { EXT_LIMITS, EXT_TOOLS, EXT_TOOL_NAMES, execExtTool } from "@/lib/argon/ext-tools"
import { TOOL_LEVELS } from "@/lib/argon/run-safety"
import { MEMBER_BLOCKED_TOOLS } from "@/lib/argon/access-pure"
import { PARALLEL_SAFE } from "@/lib/argon/parallel-tools"
import { FAST_TOOL_NAMES, routeRun } from "@/lib/argon/run-route"

// L1 = nội dung do bên ngoài viết (web, Lark Doc/Base, task); L0 = dữ liệu nội bộ; L2 = có chi phí (video).
const EXPECT: Record<string, string> = { timTrenWeb: "L1", docLark: "L1", docLarkBase: "L1", docViecLark: "L1", traBangSupabase: "L0", docGA4: "L0", docGSC: "L0", kiemTraVideo: "L0", timHoiThoaiCu: "L0", taoVideo: "L2", docGoogle: "L1" }
const MEMBER_OK = new Set(["timHoiThoaiCu", "docLark", "docLarkBase", "docViecLark"])
describe("công cụ ngoài Kho của Argon (web, Lark)", () => {
  it("khai báo đủ, bậc L1 (nội dung ngoài → bọc + đánh dấu nhiễm), chỉ Creator, đọc song song được", () => {
    expect(EXT_TOOLS.map(t => t.name).sort()).toEqual([...EXT_TOOL_NAMES].sort())
    for (const n of EXT_TOOL_NAMES) {
      expect(TOOL_LEVELS[n], n).toBe(EXPECT[n])
      if (MEMBER_OK.has(n)) expect(MEMBER_BLOCKED_TOOLS, n).not.toContain(n)   // chỉ dữ liệu CỦA CHÍNH người hỏi (hội thoại của họ; Lark bằng token của họ)
      else expect(MEMBER_BLOCKED_TOOLS, n).toContain(n)
      expect(PARALLEL_SAFE.has(n), n).toBe(n !== "taoVideo")
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
  it("traBangSupabase không đọc được bảng nhạy cảm / lạ (gate ở runQuerySupabase)", async () => {
    expect(TOOL_LEVELS.traBangSupabase).toBe("L0")
    expect((await execExtTool("traBangSupabase", { action: "doc", table: "app_settings" }, 0)).ok).toBe(false)
    expect((await execExtTool("traBangSupabase", { action: "doc", table: "users" }, 0)).result).toMatch(/nhạy cảm/)
    expect((await execExtTool("traBangSupabase", { action: "doc", table: "khong_co" }, 0)).ok).toBe(false)
  }, 30_000)
  it("task Lark chỉ đọc, GA4/GSC cần ngày, video bị từ chối khi lượt đã đọc nội dung ngoài, tìm lịch sử cần từ khoá + người dùng", async () => {
    expect((await execExtTool("docViecLark", { action: "create" }, 0)).result).toMatch(/lists.*list.*get/)
    expect((await execExtTool("docViecLark", { action: "get" }, 0)).result).toMatch(/task_guid/)
    expect((await execExtTool("docGA4", { metrics: ["sessions"] }, 0)).result).toMatch(/startDate/)
    const v = await execExtTool("taoVideo", { prompt: "clip eSIM" }, 0, { tainted: true })
    expect(v.ok).toBe(false); expect(v.result).toMatch(/nội dung ngoài/)
    expect((await execExtTool("timHoiThoaiCu", { tuKhoa: "a" }, 0, { username: "u" })).ok).toBe(false)
    expect((await execExtTool("timHoiThoaiCu", { tuKhoa: "báo giá" }, 0)).result).toMatch(/người dùng/)
  }, 30_000)
  it("thiếu tham số bắt buộc → lỗi rõ ràng, không gọi mạng", async () => {
    expect((await execExtTool("timTrenWeb", { query: "ab" }, 0)).ok).toBe(false)
    expect((await execExtTool("docLarkBase", {}, 0)).ok).toBe(false)
  })
})
