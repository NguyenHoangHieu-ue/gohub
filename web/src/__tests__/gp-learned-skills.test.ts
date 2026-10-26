import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))
import { validateLearnedSkill, learnedCatalog } from "@/lib/agents/creator/learned-skills"
import { approvalReason, newTurnSafety } from "@/lib/agents/creator/tool-policy"

const ok = { name: "viet-email-ncc", description: "Viết email hỏi báo giá nhà cung cấp", instructions: "Bước 1: chào, nêu mã gói. Bước 2: hỏi giá theo dung lượng. Bước 3: chốt hạn trả lời." }

describe("skill tự học", () => {
  it("validate: hợp lệ / sai tên / trùng skill có sẵn / thiếu nội dung", () => {
    expect(validateLearnedSkill(ok)).toBeNull()
    expect(validateLearnedSkill({ ...ok, name: "Viet Email" })).toMatch(/name/)
    expect(validateLearnedSkill({ ...ok, name: "workspace" })).toMatch(/trùng/)
    expect(validateLearnedSkill({ ...ok, instructions: "ngắn" })).toMatch(/instructions/)
    expect(validateLearnedSkill({ ...ok, description: "x" })).toMatch(/description/)
  })

  it("danh mục: rỗng → không thêm gì; có skill → liệt kê tên + mô tả", () => {
    expect(learnedCatalog([])).toBe("")
    const c = learnedCatalog([{ ...ok, source: "", created_at: "", created_by: "" }])
    expect(c).toContain("viet-email-ncc: Viết email hỏi báo giá nhà cung cấp")
  })

  it("delete LUÔN cần duyệt (kể cả đã tự-duyệt hôm nay); create chỉ tạo ứng viên nên chạy luôn; list chạy luôn", () => {
    const s = newTurnSafety("học cách viết email", false)
    expect(approvalReason({ name: "learnSkill", args: { action: "create", ...ok } }, s)).toBeNull()
    expect(approvalReason({ name: "learnSkill", args: { action: "delete", name: "viet-email-ncc" } }, s, { dailyAuto: true })).not.toBeNull()
    expect(approvalReason({ name: "learnSkill", args: { action: "list" } }, s)).toBeNull()
  })
})
