import { describe, expect, it } from "vitest"
import fs from "fs"
import path from "path"
import { DEFAULT_LIMITS, MEMBER_BLOCKED_TOOLS, MEMBER_INBOX_KINDS, levelFor, limitCheck, vnDayStartIso } from "@/lib/argon/access-pure"
import { TOOL_LEVELS } from "@/lib/argon/run-safety"
import { KIND_LABEL } from "@/lib/assistant/inbox-pure"

describe("mức truy cập Trợ lý (owner / member)", () => {
  it("Creator = owner; người trong danh sách cấp = member; còn lại không vào được", () => {
    expect(levelFor("creator", "a", [])).toBe("owner")
    expect(levelFor("staff", "lan", ["lan"])).toBe("member")
    expect(levelFor("admin", "lan", ["lan"])).toBe("member")   // vai trò khác Creator vẫn chỉ là member nếu được cấp
    expect(levelFor("staff", "binh", ["lan"])).toBeNull()
    expect(levelFor("staff", undefined, ["lan"])).toBeNull()
  })
  it("hạn mức mỗi ngày: hết lượt hoặc hết chi phí thì chặn kèm lý do; còn thì cho", () => {
    expect(limitCheck({ runs: 3, usd: 0.2 }, DEFAULT_LIMITS)).toEqual({ ok: true })
    const a = limitCheck({ runs: DEFAULT_LIMITS.runs, usd: 0 }, DEFAULT_LIMITS); expect(a.ok).toBe(false)
    const b = limitCheck({ runs: 1, usd: DEFAULT_LIMITS.usd }, DEFAULT_LIMITS); expect(b.ok).toBe(false); expect(!b.ok && b.reason).toContain("hạn mức")
  })
  it("mốc đầu ngày theo giờ Việt Nam (UTC+7)", () => {
    expect(vnDayStartIso(new Date("2026-10-26T20:00:00Z"))).toBe("2026-10-26T17:00:00.000Z")   // 03:00 ngày 27 giờ VN → ngày 27 bắt đầu 17:00Z ngày 26
    expect(vnDayStartIso(new Date("2026-10-26T05:00:00Z"))).toBe("2026-10-25T17:00:00.000Z")   // 12:00 ngày 26 giờ VN
  })
})

describe("member bị giới hạn công cụ và hộp việc", () => {
  it("mọi công cụ bị chặn đều là công cụ có thật; sql/run_code/số liệu hệ thống/sửa code/kỹ năng nằm trong danh sách", () => {
    for (const n of MEMBER_BLOCKED_TOOLS) expect(TOOL_LEVELS[n], n).toBeDefined()
    for (const n of ["sql", "run_code", "layDuLieuHeThong", "deXuatSuaCode", "deXuatKyNang"]) expect(MEMBER_BLOCKED_TOOLS).toContain(n)
    for (const n of ["docNguon", "timTrongNguon", "traMail", "traSuViec", "ghiSuViec", "deXuatGhiNho"]) expect(MEMBER_BLOCKED_TOOLS, n).not.toContain(n)   // đọc/ghi Kho của chính họ vẫn dùng được
  })
  it("member không thấy việc của toàn hệ thống: hành động Gấu Pro, đề xuất sửa code, phiếu dev, kỹ năng, KPI công ty", () => {
    for (const k of MEMBER_INBOX_KINDS) expect(Object.keys(KIND_LABEL), k).toContain(k)
    for (const k of ["gp_action", "argon_patch", "dev_ticket", "skill_candidate", "kpi_alert"]) expect(MEMBER_INBOX_KINDS, k).not.toContain(k)
  })
})

describe("danh sách route mở cho member (chống mở nhầm)", () => {
  // Route nào dùng requireArgonMember/requireArgonMemberName thì PHẢI nằm ở đây — mọi route khác của Trợ lý chỉ Creator. Thêm vào đây = đã rà soát: dữ liệu khoá theo username, không lộ số liệu công ty.
  const OPEN = [
    "argon/context", "argon/conversations", "argon/conversations/[id]", "argon/facts", "argon/graph", "argon/index", "argon/kho", "argon/mail-status", "argon/missions/[id]", "argon/projects", "argon/projects/[id]",
    "argon/projects/[id]/runs", "argon/projects/[id]/sources", "argon/sources/[id]", "assistant/alerts", "assistant/inbox", "assistant/memory", "assistant/memory-proposals", "assistant/search",
  ].sort()
  const root = path.join(process.cwd(), "src/app/api/creator")
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "route.ts" ? [path.join(d, e.name)] : []))
  const routes = [...walk(path.join(root, "argon")), ...walk(path.join(root, "assistant"))].map(f => ({ rel: path.relative(root, path.dirname(f)).replace(/\\/g, "/"), src: fs.readFileSync(f, "utf8") }))

  it("đúng những route đã rà soát dùng requireArgonMember*; mọi route khác không", () => {
    const open = routes.filter(r => /requireArgonMember(Name)?\(/.test(r.src)).map(r => r.rel).sort()
    expect(open).toEqual(OPEN)
  })
  it("route nhạy cảm (số liệu, SQL, code, kỹ năng, Lark, việc nền, cuộc gọi, xuất bản) KHÔNG mở cho member", () => {
    const sensitive = ["argon/data-packs", "argon/sandbox", "argon/publish", "argon/worker", "argon/call/token", "argon/missions/[id]/patches", "argon/missions/[id]/files", "argon/missions/[id]/phase", "argon/projects/[id]/mail", "argon/projects/[id]/threads", "argon/projects/[id]/autorun", "assistant/skills", "argon/reports"]
    for (const s of sensitive) { const r = routes.find(x => x.rel === s); expect(r, s).toBeDefined(); expect(/requireArgonMember(Name)?\(/.test(r!.src), s).toBe(false) }
  })
  it("trong route chạy (runs) member bị chặn việc nền và có kiểm hạn mức", () => {
    const src = routes.find(r => r.rel === "argon/projects/[id]/runs")!.src
    expect(src).toContain("checkMemberLimit"); expect(src).toMatch(/if \(b\.background\) return NextResponse\.json\(\{ error: "Chạy nền chỉ dành cho Creator"/); expect(src).toContain("b.allowTools = false")
  })
})
