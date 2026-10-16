import { beforeEach, describe, expect, it, vi } from "vitest"

const settings = new Map<string, string>()
const files = new Map<string, Buffer>()
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: (_c: string, k: string) => ({ maybeSingle: async () => ({ data: settings.has(k) ? { value: settings.get(k) } : null }) }) }),
      upsert: async (row: { key: string; value: string }) => { settings.set(row.key, row.value); return { error: null } },
    }),
    storage: { from: () => ({
      upload: async (p: string, b: Buffer) => { files.set(p, b); return { error: null } },
      download: async (p: string) => (files.has(p) ? { data: { text: async () => files.get(p)!.toString("utf8") }, error: null } : { data: null, error: { message: "x" } }),
      remove: async (ps: string[]) => { ps.forEach(p => files.delete(p)); return { error: null } },
    }) },
  },
}))
vi.mock("@/lib/argon/server", () => ({ ARGON_BUCKET: "argon-room", ensureArgonBucket: async () => {} }))

import { MAX_REPORTS, autoSaveReports, deleteReport, getReportHtml, loadReportIndex, saveReport, templateSuffix, updateReport } from "@/lib/argon/report-store"

const page = (t: string) => `<!doctype html><html><head><title>${t}</title></head><body><div>${t}</div></body></html>`
beforeEach(() => { settings.clear(); files.clear() })

describe("report-store", () => {
  it("lưu, đọc lại đúng nội dung; cùng nội dung cùng dự án không lưu trùng", async () => {
    const a = await saveReport("hieu", { title: "Q3", html: page("Q3"), projectId: "p1" })
    const again = await saveReport("hieu", { title: "Q3", html: page("Q3"), projectId: "p1" })
    expect(again.id).toBe(a.id)
    expect((await loadReportIndex("hieu"))).toHaveLength(1)
    expect((await getReportHtml("hieu", a.id))?.html).toBe(page("Q3"))
    await saveReport("hieu", { title: "Q3", html: page("Q3"), projectId: "p2" })   // khác dự án → lưu riêng
    expect(await loadReportIndex("hieu")).toHaveLength(2)
  })
  it("đánh dấu mẫu, đổi tên, xoá (xoá cả file)", async () => {
    const a = await saveReport("hieu", { title: "A", html: page("A") })
    expect((await updateReport("hieu", a.id, { template: true, title: "  Mẫu A  " }))).toMatchObject({ template: true, title: "Mẫu A" })
    expect(await deleteReport("hieu", a.id)).toBe(true)
    expect(files.size).toBe(0)
    expect(await deleteReport("hieu", a.id)).toBe(false)
    expect(await getReportHtml("hieu", a.id)).toBeNull()
  })
  it("tự lưu chỉ các report hoàn chỉnh trong câu trả lời, không ném lỗi", async () => {
    const answer = ["Tóm tắt.", "```html", page("R1"), "```", "ví dụ mã:", "```html", "<div>không phải report</div>", "```"].join("\n")
    expect(await autoSaveReports("hieu", "p1", "run1", answer)).toBe(1)
    expect((await loadReportIndex("hieu"))[0]).toMatchObject({ title: "R1", projectId: "p1", runId: "run1" })
  })
  it(`quá ${MAX_REPORTS} report thì xoá cái cũ nhất không phải mẫu`, async () => {
    const first = await saveReport("hieu", { title: "Mẫu giữ", html: page("keep") })
    await updateReport("hieu", first.id, { template: true })
    for (let i = 0; i < MAX_REPORTS; i++) await saveReport("hieu", { title: `R${i}`, html: page(`R${i}`) })
    const idx = await loadReportIndex("hieu")
    expect(idx).toHaveLength(MAX_REPORTS)
    expect(idx.some(r => r.id === first.id)).toBe(true)
    expect(idx.some(r => r.title === "R0")).toBe(false)
  })
  it("phần nối yêu cầu dựng lại theo mẫu nhúng HTML mẫu và dặn lấy số liệu mới", () => {
    const s = templateSuffix('Báo "Q3"', page("Q3"))
    expect(s).toContain("<report_mau ten=\"Báo 'Q3'\">")
    expect(s).toContain(page("Q3"))
    expect(s).toContain("MỚI NHẤT")
  })
})
