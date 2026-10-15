import { describe, expect, it } from "vitest"
import { hubNotes, pickHubSources } from "@/lib/argon/hub"
import type { ArgonProject, ArgonRun, ArgonSource } from "@/lib/argon/server"

const src = (id: string, tokens: number, o: Partial<ArgonSource> & { projectName?: string } = {}) => ({ id, project_id: "p", kind: "file", name: `f${id}`, tokens, pinned: false, updated_at: `2026-10-0${id}`, projectName: "A", ...o }) as ArgonSource & { projectName: string }

describe("dự án Tổng hợp", () => {
  it("trong ngân sách thì lấy hết, gắn tên dự án vào tên nguồn", () => {
    const r = pickHubSources([src("1", 100), src("2", 100)], 1000)
    expect(r.sources.map(s => s.name).sort()).toEqual(["[Dự án: A] f1", "[Dự án: A] f2"])
    expect(r.dropped).toEqual([])
  })
  it("vượt ngân sách: ghim trước, rồi mới cập nhật gần nhất; báo nguồn bị bỏ theo dự án", () => {
    const r = pickHubSources([src("1", 600, { pinned: true, projectName: "B" }), src("2", 600), src("3", 300, { updated_at: "2026-10-09" })], 1000)
    expect(r.sources.map(s => s.id)).toEqual(["1", "3"])
    expect(r.dropped).toEqual(["A: 1 nguồn"])
  })
  it("sổ ghép gồm sổ + chỉ dẫn + kết quả gần đây (chỉ lượt xong), cắt dài", () => {
    const p = { id: "p1", name: "Deal giá", notes: "Ghi chú X", instructions: "Văn phong ngắn", updated_at: "2026-10-10T00:00:00Z" } as ArgonProject
    const runs = new Map<string, ArgonRun[]>([["p1", [
      { id: "1", status: "error", prompt: "lỗi", answer: "bỏ" }, { id: "2", status: "done", prompt: "hỏi A", answer: "đáp ".repeat(1000) },
    ] as ArgonRun[]]])
    const t = hubNotes({ notes: "Sổ hub" }, [p], runs)
    expect(t).toContain("Sổ hub"); expect(t).toContain("### Dự án: Deal giá"); expect(t).toContain("Ghi chú X"); expect(t).toContain("Văn phong ngắn")
    expect(t).toContain("hỏi A"); expect(t).not.toContain("bỏ"); expect(t).toContain("…")
  })
})
