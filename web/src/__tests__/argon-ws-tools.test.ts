import { beforeEach, describe, expect, it, vi } from "vitest"

type M = { id: string; phase: string }
let mission: M | null
const files = new Map<string, { content: string; author: string; version: number }>()

vi.mock("@/lib/argon/missions-db", () => ({
  missionById: async () => mission,
  listFiles: async () => [...files.entries()].map(([path, f]) => ({ path, size_bytes: f.content.length, author: f.author, updated_at: "2026-10-20T10:00:00Z", version: f.version, id: path })),
  readFile: async (_m: string, path: string) => (files.has(path) ? { path, content: files.get(path)!.content, size_bytes: files.get(path)!.content.length } : null),
  writeFile: async (_m: string, path: string, content: string, author: string) => {
    const v = (files.get(path)?.version ?? 0) + 1
    files.set(path, { content, author, version: v })
    return { file: { path, version: v, size_bytes: content.length } }
  },
}))

import { execWsTool, MAX_WS_READ_CHARS, WS_TOOLS } from "@/lib/argon/ws-tools"

beforeEach(() => { mission = { id: "m1", phase: "clarify" }; files.clear(); files.set("brief.md", { content: "# Brief\n", author: "user", version: 1 }) })

describe("công cụ workspace của Argon", () => {
  it("khai báo đủ 3 công cụ", () => { expect(WS_TOOLS.map(t => t.name)).toEqual(["lietKeFile", "docFile", "ghiFile"]) })

  it("liệt kê và đọc file", async () => {
    expect((await execWsTool("lietKeFile", {}, "m1")).result).toContain("brief.md")
    expect((await execWsTool("docFile", { path: "brief.md" }, "m1")).result).toBe("# Brief\n")
    const miss = await execWsTool("docFile", { path: "khong-co.md" }, "m1")
    expect(miss.ok).toBe(false)
  })

  it("cắt file đọc quá dài", async () => {
    files.set("data/lon.csv", { content: "x".repeat(MAX_WS_READ_CHARS + 500), author: "argon", version: 1 })
    const r = await execWsTool("docFile", { path: "data/lon.csv" }, "m1")
    expect(r.result).toContain("đã cắt 500 ký tự")
  })

  it("pha làm rõ chỉ cho ghi brief.md", async () => {
    expect((await execWsTool("ghiFile", { path: "brief.md", content: "# Mới" }, "m1")).ok).toBe(true)
    const bad = await execWsTool("ghiFile", { path: "scripts/a.py", content: "print(1)" }, "m1")
    expect(bad.ok).toBe(false)
    expect(bad.result).toContain("Pha làm rõ")
    expect(files.has("scripts/a.py")).toBe(false)
  })

  it("pha kế hoạch cho thêm notes/ nhưng không cho reports/", async () => {
    mission = { id: "m1", phase: "plan" }
    expect((await execWsTool("ghiFile", { path: "notes/x.md", content: "n" }, "m1")).ok).toBe(true)
    expect((await execWsTool("ghiFile", { path: "reports/x.html", content: "<p>" }, "m1")).ok).toBe(false)
  })

  it("pha chạy ghi mọi nơi, append nối vào cuối decisions.md; tạm dừng/xong không ghi", async () => {
    mission = { id: "m1", phase: "run" }
    files.set("decisions.md", { content: "# Quyết định\n", author: "user", version: 1 })
    const r = await execWsTool("ghiFile", { path: "decisions.md", content: "- 20/10: chốt A", append: true }, "m1")
    expect(r.ok).toBe(true)
    expect(files.get("decisions.md")!.content).toBe("# Quyết định\n- 20/10: chốt A\n")
    expect((await execWsTool("ghiFile", { path: "../hack", content: "x" }, "m1")).ok).toBe(false)
    for (const phase of ["paused", "done"]) { mission = { id: "m1", phase }; expect((await execWsTool("ghiFile", { path: "brief.md", content: "x" }, "m1")).ok).toBe(false) }
  })

  it("nhật ký rút gọn nội dung dài; công cụ lạ và sứ mệnh đã xoá trả lỗi chữ, không ném", async () => {
    mission = { id: "m1", phase: "run" }
    const r = await execWsTool("ghiFile", { path: "notes/dai.md", content: "y".repeat(5000) }, "m1")
    expect(String(r.args.content).length).toBeLessThan(1700)
    expect((await execWsTool("xoaTatCa", {}, "m1")).ok).toBe(false)
    mission = null
    expect((await execWsTool("lietKeFile", {}, "m1")).result).toContain("không còn tồn tại")
  })
})
