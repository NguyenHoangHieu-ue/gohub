import { describe, expect, it } from "vitest"
import { allocateOrgTargets, orgSizes, orgTargetKey } from "@/lib/analytics-engine/org-targets"

const T = (rev: number, cm1 = 0, thk = 0, hk3rev = 0) => ({ rev, cm1, thk, hk3rev })
const members = [
  { code: "A1", orgKey: "ShopeePay", revenue: 600 }, { code: "A2", orgKey: "ShopeePay", revenue: 300 }, { code: "A3", orgKey: "ShopeePay", revenue: 100 },
  { code: "S1", orgKey: "S1", revenue: 50 },
]

describe("target theo Organization", () => {
  it("chia xuống mã con theo doanh thu, tổng đúng bằng target Organization", () => {
    const out = allocateOrgTargets({ [orgTargetKey("ShopeePay")]: T(1000, 100, 70, 700) }, members)
    expect(out.A1).toEqual(T(600, 60, 70, 420)); expect(out.A2).toEqual(T(300, 30, 70, 210)); expect(out.A3).toEqual(T(100, 10, 70, 70))
    expect(Object.keys(out).some(k => k.startsWith("ORG::"))).toBe(false)
  })
  it("số lẻ: tổng vẫn khớp tuyệt đối", () => {
    const out = allocateOrgTargets({ [orgTargetKey("ShopeePay")]: T(1000) }, [{ code: "A1", orgKey: "O", revenue: 1 }, { code: "A2", orgKey: "O", revenue: 1 }, { code: "A3", orgKey: "O", revenue: 1 }].map(m => ({ ...m, orgKey: "ShopeePay" })))
    expect(out.A1.rev + out.A2.rev + out.A3.rev).toBe(1000)
  })
  it("target tay ở mã con của Organization đã có target Organization bị bỏ qua (không tính trùng)", () => {
    const out = allocateOrgTargets({ [orgTargetKey("ShopeePay")]: T(1000), A1: T(999) }, members)
    expect(out.A1.rev).toBe(600)
  })
  it("Organization chưa có target riêng: giữ target từng mã (tương thích số liệu cũ); mã đơn lẻ giữ nguyên", () => {
    const out = allocateOrgTargets({ A1: T(10), S1: T(5) }, members)
    expect(out.A1).toEqual(T(10)); expect(out.S1).toEqual(T(5))
  })
  it("doanh thu toàn 0: chia đều; org 1 mã bỏ qua khoá ORG::", () => {
    const out = allocateOrgTargets({ [orgTargetKey("O")]: T(10), [orgTargetKey("S1")]: T(77) }, [{ code: "X", orgKey: "O", revenue: 0 }, { code: "Y", orgKey: "O", revenue: 0 }, ...members.slice(3)])
    expect(out.X.rev + out.Y.rev).toBe(10); expect(out.X.rev).toBe(5); expect(out.S1).toBeUndefined()
  })
  it("orgSizes đếm số mã", () => { expect(orgSizes(members).get("ShopeePay")).toBe(3); expect(orgSizes(members).get("S1")).toBe(1) })
})
