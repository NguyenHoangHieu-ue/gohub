import { describe, expect, it } from "vitest"
import { BRIEF_PATH, MAX_WORKSPACE_FILES, buildTree, canArgonWrite, canTransition, checkWrite, cleanPath, isProtectedPath, missionContextBlock, phaseInstruction, PHASES } from "@/lib/argon/missions"

describe("cleanPath", () => {
  it("chấp nhận file gốc và file trong thư mục chuẩn", () => {
    expect(cleanPath("brief.md")).toBe("brief.md")
    expect(cleanPath("scripts/so_gia.py")).toBe("scripts/so_gia.py")
    expect(cleanPath("reports\\q4\\a.html")).toBe("reports/q4/a.html")
    expect(cleanPath("./data//x.csv")).toBe("data/x.csv")
  })
  it("chặn đường tuyệt đối, '..', file ẩn, ký tự lạ, thư mục cấp 1 lạ, quá sâu/dài", () => {
    for (const bad of ["", "/etc/passwd", "../x", "data/../../x", "data/.env", "data/a:b", "lung-tung/x.md", "data/", "a/b/c/d/e/f/g.md", `data/${"a".repeat(220)}`]) {
      expect(cleanPath(bad), bad).toBeNull()
    }
  })
})

describe("canTransition", () => {
  it("không nhảy thẳng clarify→run, không tự chuyển sang chính nó", () => {
    expect(canTransition("clarify", "run")).toBe(false)
    expect(canTransition("plan", "plan")).toBe(false)
  })
  it("plan→run (Chốt), run→paused, paused→run đều được", () => {
    expect(canTransition("plan", "run")).toBe(true)
    expect(canTransition("run", "paused")).toBe(true)
    expect(canTransition("paused", "run")).toBe(true)
  })
  it("mọi pha đều có chỉ dẫn", () => { for (const p of PHASES) expect(phaseInstruction(p).length).toBeGreaterThan(10) })
})

describe("canArgonWrite", () => {
  it("làm rõ chỉ ghi brief.md; kế hoạch thêm notes/; chạy ghi mọi nơi; tạm dừng/xong không ghi", () => {
    expect(canArgonWrite("clarify", BRIEF_PATH)).toBe(true)
    expect(canArgonWrite("clarify", "scripts/a.py")).toBe(false)
    expect(canArgonWrite("plan", "notes/x.md")).toBe(true)
    expect(canArgonWrite("plan", "reports/x.html")).toBe(false)
    expect(canArgonWrite("run", "reports/x.html")).toBe(true)
    expect(canArgonWrite("paused", BRIEF_PATH)).toBe(false)
    expect(canArgonWrite("done", BRIEF_PATH)).toBe(false)
  })
})

describe("buildTree", () => {
  const f = (path: string) => ({ path, size_bytes: 10, author: "user", updated_at: "2026-10-20" })
  it("luôn hiện 4 thư mục chuẩn, thư mục trước file, lồng thư mục con", () => {
    const t = buildTree([f("brief.md"), f("scripts/b.py"), f("scripts/a.py"), f("reports/q4/x.html")])
    expect(t.map(n => n.name)).toEqual(["data", "notes", "reports", "scripts", "brief.md"])
    expect(t.find(n => n.name === "scripts")!.children!.map(n => n.name)).toEqual(["a.py", "b.py"])
    const q4 = t.find(n => n.name === "reports")!.children![0]
    expect(q4).toMatchObject({ name: "q4", type: "dir", path: "reports/q4" })
    expect(q4.children![0].path).toBe("reports/q4/x.html")
  })
})

describe("missionContextBlock", () => {
  it("có brief + decisions nguyên văn, liệt kê file khác (không lặp brief/decisions), thoát dấu ngoặc kép ở tên", () => {
    const s = missionContextBlock({ name: 'Giữ "DP" 75%', goal: "", phase: "run" }, "BRIEF-X", "DEC-Y", [
      { path: "brief.md", size_bytes: 5, author: "user", updated_at: "" }, { path: "data/a.csv", size_bytes: 99, author: "argon", updated_at: "" },
    ])
    expect(s).toContain("BRIEF-X"); expect(s).toContain("DEC-Y")
    expect(s).toContain("- data/a.csv (99 byte, Argon ghi)")
    expect(s).not.toContain("- brief.md")
    expect(s).toContain(`ten="Giữ 'DP' 75%"`)
    expect(s).toContain("(chưa ghi)")
  })
})

describe("checkWrite / isProtectedPath", () => {
  it("báo lỗi đường dẫn sai, file chữ >1MB, workspace đầy (file mới); ghi đè file có sẵn khi đầy vẫn được", () => {
    expect(checkWrite({ path: null, content: "x", exists: false, fileCount: 0 })).toMatch(/Đường dẫn/)
    expect(checkWrite({ path: "data/a.csv", content: "x".repeat(1024 * 1024 + 1), exists: false, fileCount: 0 })).toMatch(/1MB/)
    expect(checkWrite({ path: "data/a.csv", content: "x", exists: false, fileCount: MAX_WORKSPACE_FILES })).toMatch(/đủ/)
    expect(checkWrite({ path: "data/a.csv", content: "x", exists: true, fileCount: MAX_WORKSPACE_FILES })).toBeNull()
    expect(checkWrite({ path: "data/a.csv", content: "tiếng Việt", exists: false, fileCount: 3 })).toBeNull()
  })
  it("brief.md và decisions.md được bảo vệ khỏi xoá", () => {
    expect(isProtectedPath("brief.md")).toBe(true)
    expect(isProtectedPath("decisions.md")).toBe(true)
    expect(isProtectedPath("notes/brief.md")).toBe(false)
  })
})
