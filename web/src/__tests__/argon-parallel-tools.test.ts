import { describe, expect, it } from "vitest"
import { PARALLEL_SAFE, groupCalls } from "@/lib/argon/parallel-tools"

const c = (name: string) => ({ name })

describe("groupCalls (công cụ đọc chạy song song)", () => {
  it("gom các công cụ đọc LIỀN NHAU thành một nhóm, công cụ khác đứng riêng và giữ nguyên thứ tự", () => {
    const g = groupCalls([c("docNguon"), c("docNguon"), c("timTrongNguon"), c("sql"), c("traMail"), c("traThucThe"), c("ghiFile")])
    expect(g.map(x => x.map(y => y.name))).toEqual([["docNguon", "docNguon", "timTrongNguon"], ["sql"], ["traMail", "traThucThe"], ["ghiFile"]])
  })
  it("sql, run_code, ghi, hỏi và số liệu hệ thống KHÔNG nằm trong tập song song (có hạn mức theo log / dùng chung pool)", () => {
    for (const n of ["sql", "run_code", "ghiFile", "hoiHieu", "layDuLieuHeThong", "deXuatSuaCode", "ghiDuDoan"]) expect(PARALLEL_SAFE.has(n)).toBe(false)
    for (const n of ["docNguon", "timTrongNguon", "lietKeNguon", "docFile", "lietKeFile", "traSuViec", "traMail", "traThucThe"]) expect(PARALLEL_SAFE.has(n)).toBe(true)
  })
  it("hai lời gọi sql liền nhau vẫn là hai nhóm riêng (tuần tự); danh sách rỗng ra rỗng", () => {
    expect(groupCalls([c("sql"), c("sql")]).length).toBe(2)
    expect(groupCalls([])).toEqual([])
  })
})
