import { describe, it, expect, vi } from "vitest"
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))
import { SKILLS, preloadSkills, skillCatalog, SKILL_TOOLS } from "@/lib/agents/creator/skills"
import { activeDeclarations, buildFunctionDeclarations } from "@/lib/agents/creator-ai"

describe("Gấu Pro skills (G1)", () => {
  it("mọi tool của skill đều có khai báo thật, không trùng giữa các skill", () => {
    const declared = new Set(buildFunctionDeclarations(true).map(d => d.name))
    const seen = new Set<string>()
    for (const k of SKILLS) for (const t of k.tools) {
      expect(declared.has(t)).toBe(true)
      expect(seen.has(t)).toBe(false)
      seen.add(t)
    }
  })

  it("chưa nạp skill → chỉ còn tool lõi (có loadSkill + tool đọc dữ liệu), không có tool của skill", () => {
    const names = activeDeclarations(true, new Set()).map(d => d.name)
    expect(names).toContain("loadSkill")
    expect(names).toContain("executeSQL")
    expect(names).toContain("assistantMemory")
    for (const t of SKILL_TOOLS) expect(names).not.toContain(t)
  })

  it("nạp skill → bật đúng tool của skill, vẫn lọc tool chỉ-creator cho user khác", () => {
    expect(activeDeclarations(true, new Set(["workspace"])).map(d => d.name)).toContain("sendLarkMessage")
    const member = activeDeclarations(false, new Set(["workspace", "browser-files"])).map(d => d.name)
    expect(member).toContain("createLarkTask")
    expect(member).not.toContain("sendLarkMessage")
    expect(member).not.toContain("localFiles")
  })

  it("đoán skill từ tin nhắn", () => {
    expect(preloadSkills("tạo task gọi NCC mai 10h")).toEqual(expect.arrayContaining(["workspace", "product-ncc"]))
    expect(preloadSkills("viết kịch bản TikTok eSIM Nhật")).toContain("content-creative")
    expect(preloadSkills("đọc giúp https://example.com/price")).toContain("browser-files")
    expect(preloadSkills("[Đã DUYỆT và đã chạy hành động #abc123 (controlMyBrowser)]")).toContain("browser-files")
    expect(preloadSkills("doanh thu tháng 9 theo kênh")).toEqual([])
    expect(preloadSkills("xem bảng table doanh thu")).not.toContain("browser-files")
  })

  it("catalog trong prompt lõi liệt kê đủ skill", () => {
    const c = skillCatalog()
    for (const k of SKILLS) expect(c).toContain(k.name)
  })
})
