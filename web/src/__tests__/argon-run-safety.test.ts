import { describe, expect, it } from "vitest"
import fs from "fs"
import path from "path"
import { MAX_NOTICES, TOOL_LEVELS, addNotice, gateWrite, injectionHits, isTainted, levelOf, noticeDetail, spotlight } from "@/lib/argon/run-safety"
import { FAST_TOOL_NAMES } from "@/lib/argon/run-route"
import { PARALLEL_SAFE } from "@/lib/argon/parallel-tools"
import { ARGON_TOOLS } from "@/lib/argon/tools"
import { SOURCE_TOOLS } from "@/lib/argon/source-tools"
import { KHO_TOOLS } from "@/lib/argon/kho-tools"
import { SQL_TOOL } from "@/lib/argon/sql-tool"
import { RUN_CODE_TOOL } from "@/lib/argon/code-tool"
import { ASK_TOOL } from "@/lib/argon/ask-tool"
import { PATCH_TOOL } from "@/lib/argon/patch-tool"
import { FORECAST_TOOL, SCORE_TOOL } from "@/lib/argon/forecast-tool"
import { execKhoTool } from "@/lib/argon/kho-tools"

const cases = JSON.parse(fs.readFileSync(path.join(process.cwd(), "eval/redteam/argon-injection-cases.json"), "utf8")) as { attacks: string[]; benign: string[] }

describe("bậc quyền gắn vào công cụ", () => {
  it("MỌI công cụ Argon đang khai báo đều có bậc (công cụ mới phải khai báo, nếu không bị từ chối khi chạy)", () => {
    const declared = [...ARGON_TOOLS, ...SOURCE_TOOLS, ...KHO_TOOLS, SQL_TOOL, RUN_CODE_TOOL, ASK_TOOL, PATCH_TOOL, FORECAST_TOOL, SCORE_TOOL].map(t => String(t.name))
    declared.push("lietKeFile", "docFile", "ghiFile")   // công cụ workspace (ws-tools.ts, nạp supabase nên không import ở đây)
    for (const n of declared) expect(levelOf(n), n).not.toBeNull()
    expect(levelOf("guiTinLark")).toBeNull()   // không có công cụ gửi ra ngoài; tên lạ = chưa khai báo
  })
  it("đường nhanh và nhóm chạy song song chỉ gồm công cụ ĐỌC (L0/L1); không công cụ nào L4", () => {
    for (const n of [...FAST_TOOL_NAMES, ...PARALLEL_SAFE]) expect(["L0", "L1"], n).toContain(TOOL_LEVELS[n])
    expect(Object.values(TOOL_LEVELS)).not.toContain("L4")
  })
  it("công cụ đọc nội dung ngoài (L1) đánh dấu lượt là nhiễm; lỗi thì không", () => {
    expect(isTainted([{ name: "sql", ok: true }])).toBe(false)
    expect(isTainted([{ name: "docNguon", ok: false }])).toBe(false)
    expect(isTainted([{ name: "sql", ok: true }, { name: "traMail", ok: true }])).toBe(true)
  })
  it("lượt nhiễm: ghi sự việc phải chờ xác nhận, KHÔNG tự sửa/bỏ sự việc cũ; lượt sạch chạy bình thường", () => {
    expect(gateWrite("ghiSuViec", false).mode).toBe("run"); expect(gateWrite("capNhatSuViec", false).mode).toBe("run")
    expect(gateWrite("ghiSuViec", true).mode).toBe("review"); expect(gateWrite("capNhatSuViec", true).mode).toBe("deny")
    expect(gateWrite("taoThuMuc", true).mode).toBe("run")   // thao tác sắp xếp hoàn tác được
  })
  it("execKhoTool: capNhatSuViec bị chặn NGAY (chưa chạm DB) khi lượt nhiễm", async () => {
    const r = await execKhoTool("capNhatSuViec", { id: "x", trangThai: "bo" }, "u", { tainted: true })
    expect(r.ok).toBe(false); expect(r.result).toContain("đã đọc nội dung ngoài")
  })
})

describe("quét chỉ dẫn lạ trong nội dung ngoài (bộ red-team)", () => {
  it("MỌI ca tấn công đều bị đánh dấu", () => {
    for (const a of cases.attacks) expect(injectionHits(a).length, a).toBeGreaterThan(0)
  })
  it("KHÔNG báo nhầm thư công việc bình thường", () => {
    for (const b of cases.benign) expect(injectionHits(b), b).toEqual([])
  })
  it("spotlight bọc kết quả, thêm cảnh báo khi có dấu hiệu; sổ cảnh báo bỏ trùng trong ngày và giữ tối đa MAX_NOTICES", () => {
    const s = spotlight("docNguon", "nội dung thư", [])
    expect(s).toContain("<noi_dung_ngoai cong_cu=\"docNguon\">"); expect(s).toContain("nội dung thư"); expect(s).not.toContain("CẢNH BÁO AN TOÀN")
    expect(spotlight("traMail", "x", ["ignore previous instructions"])).toContain("CẢNH BÁO AN TOÀN")
    const now = new Date("2026-10-26T00:00:00Z")
    const a = addNotice([], { tool: "docNguon", detail: noticeDetail("docNguon", { id: "abc" }), hits: ["x"] }, now, "1")
    expect(addNotice(a, { tool: "docNguon", detail: noticeDetail("docNguon", { id: "abc" }), hits: ["x"] }, now, "2")).toHaveLength(1)
    let list = a
    for (let i = 0; i < MAX_NOTICES + 5; i++) list = addNotice(list, { tool: "t", detail: `d${i}`, hits: [] }, now, `n${i}`)
    expect(list).toHaveLength(MAX_NOTICES)
  })
})
