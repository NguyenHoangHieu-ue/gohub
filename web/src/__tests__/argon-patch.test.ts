import { describe, expect, it } from "vitest"
import { MAX_PENDING_PATCHES, addProposal, decide, execPropose, normalizePatch, type PatchProposal } from "@/lib/argon/patch-tool"

const REQ = "Tab Channels hiện GP lệch 0,54% so với bod-summary cùng khoảng ngày: SQL thô 617.415.083 [#6] vs hệ thống 620.774.720 [#1]. Mong đợi: ghi chú rõ đơn nội bộ bị loại."
const p = (title: string) => ({ title, request: REQ, plan: "" })

describe("deXuatSuaCode", () => {
  it("chuẩn hoá: cần tiêu đề + yêu cầu đủ dài; cắt độ dài", () => {
    expect("error" in normalizePatch({ tieuDe: "", yeuCau: REQ })).toBe(true)
    expect("error" in normalizePatch({ tieuDe: "x", yeuCau: "ngắn quá" })).toBe(true)
    const n = normalizePatch({ tieuDe: "T".repeat(300), yeuCau: REQ + "x".repeat(9000), keHoach: "hướng" })
    expect("error" in n).toBe(false)
    if (!("error" in n)) { expect(n.title).toHaveLength(120); expect(n.request).toHaveLength(6000); expect(n.plan).toBe("hướng") }
  })

  it("tối đa 3 đề xuất đang chờ, chặn trùng tiêu đề; đã quyết thì không tính", () => {
    let list: PatchProposal[] = []
    for (const t of ["A", "B", "C"]) {
      const r = addProposal(list, p(t), `id${t}`, "now")
      expect("error" in r).toBe(false)
      if (!("error" in r)) list = r.list
    }
    expect("error" in addProposal(list, p("D"), "idD", "now")).toBe(true)
    const rej = decide(list, "idA", "rejected", "now")
    expect("error" in rej).toBe(false)
    if (!("error" in rej)) list = rej.list
    expect("error" in addProposal(list, p("b"), "idE", "now")).toBe(true)   // trùng B, không phân biệt hoa thường
    expect("error" in addProposal(list, p("D"), "idD", "now")).toBe(false)
    expect(MAX_PENDING_PATCHES).toBe(3)
  })

  it("decide: chỉ đổi đề xuất đang chờ; ghi phiếu hoặc lỗi", () => {
    const l: PatchProposal[] = [{ id: "p1", title: "A", request: REQ, plan: "", at: "t", status: "pending" }]
    const a = decide(l, "p1", "approved", "now", { ticketId: 7 })
    expect("error" in a).toBe(false)
    if (!("error" in a)) {
      expect(a.proposal).toMatchObject({ status: "approved", ticketId: 7 })
      expect("error" in decide(a.list, "p1", "rejected", "now")).toBe(true)
    }
    expect("error" in decide(l, "khong-co", "rejected", "now")).toBe(true)
  })

  const mk = () => {
    const s = { store: [] as PatchProposal[], msg: "" }
    const deps = {
      load: async () => s.store,
      save: async (_id: string, l: PatchProposal[]) => { s.store = l },
      notify: async (t: string) => { s.msg = t },
      newId: () => "p-test",
    }
    return { s, deps }
  }

  it("execPropose: chỉ pha chạy; lưu đề xuất chờ duyệt + nhắn Lark", async () => {
    const m = mk()
    const bad = await execPropose({ tieuDe: "A", yeuCau: REQ }, { missionId: "m", missionName: "S", phase: "plan", origin: "https://x" }, m.deps)
    expect(bad.ok).toBe(false)
    expect(m.s.store).toHaveLength(0)
    const ok = await execPropose({ tieuDe: "Sửa ghi chú GP", yeuCau: REQ }, { missionId: "m", missionName: "Giữ DP", phase: "run", origin: "https://x" }, m.deps)
    expect(ok.ok).toBe(true)
    expect(m.s.store).toMatchObject([{ id: "p-test", status: "pending", title: "Sửa ghi chú GP" }])
    expect(m.s.msg).toContain("Sửa ghi chú GP")
    expect(m.s.msg).toContain("PR vào staging")
  })

  it("execPropose: Lark lỗi vẫn lưu; lưu lỗi báo không ok", async () => {
    const m = mk()
    m.deps.notify = async () => { throw new Error("lark") }
    expect((await execPropose({ tieuDe: "A", yeuCau: REQ }, { missionId: "m", missionName: "S", phase: "run", origin: "o" }, m.deps)).ok).toBe(true)
    const m2 = mk()
    m2.deps.save = async () => { throw new Error("db") }
    expect((await execPropose({ tieuDe: "A", yeuCau: REQ }, { missionId: "m", missionName: "S", phase: "run", origin: "o" }, m2.deps)).ok).toBe(false)
  })
})
