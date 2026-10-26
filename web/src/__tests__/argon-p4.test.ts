import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: {} }))
import { MIN_CLUSTER, clusterPrompts, parseDraft, promptTokens, type RunLite } from "@/lib/argon/skill-suggest"
import { GATE_CASE_IDS, checkCase, dateRe, fill, gateSummary, gateVerdict, type EvalCaseDef, type GateSide } from "@/lib/argon/eval-checks"
import { gateWrite, levelOf } from "@/lib/argon/run-safety"
import { addCandidate, decideSkill, type Registry } from "@/lib/agents/creator/learned-skills"
import { lintSkill } from "@/lib/agents/creator/skill-lint"
import cases from "../../eval/argon-cases.json"

const run = (id: string, prompt: string): RunLite => ({ id, prompt, created_at: "2026-10-20T00:00:00Z" })

describe("đề xuất kỹ năng từ thao tác lặp", () => {
  it("chuẩn hoá: bỏ dấu, bỏ số/ngày (câu hỏi cùng kiểu khác ngày vẫn giống nhau), bỏ từ đệm", () => {
    expect([...promptTokens("Báo giá ngày 20/10 và 21/10")].sort()).toEqual(["bao", "gia", "ngay"])
    expect([...promptTokens("Doanh thu tuần này 20/10 so với tuần trước")].sort()).toEqual(["doanh", "so", "thu", "truoc", "tuan"])
  })
  it("gom cụm câu hỏi lặp (≥3), bỏ việc tự động và câu quá ngắn, không gom câu khác chủ đề", () => {
    const runs = [
      run("1", "So sánh giá vốn Thái Lan giữa BC Datapool và WM tuần này"), run("2", "So sánh giá vốn Thái Lan giữa BC Datapool và WM tháng này"), run("3", "so sánh giá vốn Thái Lan giữa BC Datapool và WM hôm nay"),
      run("4", "Mail nào đang chờ tôi trả lời hôm nay?"), run("5", "🌙 Tuần tra đêm 2026-10-20: cập nhật bối cảnh"), run("6", "🌙 Tuần tra đêm 2026-10-21: cập nhật bối cảnh"), run("7", "🌙 Tuần tra đêm 2026-10-22: cập nhật bối cảnh"), run("8", "ok"),
    ]
    const c = clusterPrompts(runs)
    expect(c).toHaveLength(1); expect(c[0].runs.map(r => r.id)).toEqual(["1", "2", "3"]); expect(c[0].runs.length).toBeGreaterThanOrEqual(MIN_CLUSTER)
    expect(clusterPrompts(runs.slice(0, 2))).toEqual([])
  })
  it("parseDraft: ép tên kebab-case không dấu, từ chối nháp thiếu/ngắn", () => {
    const ok = parseDraft(JSON.stringify({ name: "So sánh giá vốn Thái Lan!", description: "Dùng khi so giá vốn giữa các vendor cho một nước", instructions: "1. Tra sổ sự việc.\n2. Đọc báo giá mới nhất.\n3. Trình bày kết luận trước, có nguồn." }))
    expect(ok?.name).toBe("so-sanh-gia-von-thai-lan")
    expect(parseDraft(JSON.stringify({ name: "x", description: "ngắn", instructions: "ngắn" }))).toBeNull(); expect(parseDraft("không json")).toBeNull()
  })
})

describe("cổng eval kỹ năng", () => {
  const defs = (cases as unknown as { cases: EvalCaseDef[] }).cases
  const dates = { EFF: "2026-10-31", OLD_EXP: "2026-10-30", FRI: "2026-10-29", NIMBUS_EXP: "2026-12-25" }
  const base = { route: "full" as const, ms: 5000, newFacts: [], notices: 0, proposals: [], tools: [{ name: "docNguon", ok: true, chars: 1, args: "{}", result: "" }] }

  it("dateRe/fill: nhiều định dạng ngày; checkCase bắt thiếu/thừa/công cụ/trạng thái", () => {
    expect(new RegExp(dateRe("2026-10-31")).test("hiệu lực từ 31/10/2026")).toBe(true); expect(new RegExp(dateRe("2026-10-31")).test("1 tháng 5")).toBe(false)
    expect(fill("từ {EFF}", dates)).toBe("từ 2026-10-31")
    const a1 = defs.find(c => c.id === "A1")!
    expect(checkCase(a1, { ...base, text: "Aurora báo UK Daily 1GB 2.1 USD/GB từ 31/10/2026" }, dates)).toEqual([])
    expect(checkCase(a1, { ...base, text: "Giá khoảng 3 USD" }, dates).length).toBeGreaterThan(0)
    const c1 = defs.find(c => c.id === "C1")!
    expect(checkCase(c1, { ...base, text: "Giá Singapore là 2.4 USD/GB", notices: 0 }, dates).join(" ")).toContain("cảnh báo an toàn")
    expect(checkCase(c1, { ...base, text: "Singapore 2.4 USD/GB", notices: 1, newFacts: [{ summary: "Singapore còn 0.1 USD/GB", vendor: "", subject: "", needs_review: false, change_note: "", origin: "manual", status: "active" }] }, dates).join(" ")).toContain("KHÔNG chờ xác nhận")
  })
  it("4 ca cổng đều tồn tại và gồm ít nhất một ca an toàn", () => {
    for (const id of GATE_CASE_IDS) expect(defs.some(c => c.id === id), id).toBe(true)
    expect(GATE_CASE_IDS.some(id => defs.find(c => c.id === id)!.group.startsWith("C"))).toBe(true)
  })
  it("phán quyết: lùi nếu đạt ít ca hơn hoặc hỏng ca an toàn; bằng hoặc hơn thì ổn", () => {
    const s = (pass: number, safe: number): GateSide => ({ pass, total: 4, safetyPass: safe, safetyTotal: 1, ms: 0, fails: {} })
    expect(gateVerdict(s(4, 1), s(4, 1)).verdict).toBe("ok"); expect(gateVerdict(s(4, 1), s(3, 1)).verdict).toBe("ok")
    expect(gateVerdict(s(3, 1), s(4, 1)).verdict).toBe("regress")
    const g = gateVerdict(s(4, 0), s(4, 1)); expect(g.verdict).toBe("regress"); expect(g.reasons.join(" ")).toContain("an toàn"); expect(gateSummary(g)).toContain("LÀM KÉM ĐI")
  })
  it("kỹ năng bị đánh dấu 'lùi' KHÔNG duyệt được; không có cổng hoặc 'ok' thì duyệt bình thường", () => {
    const lint = lintSkill({ name: "viet-bao-cao", description: "Viết báo cáo ngắn", instructions: "1. Mở bằng kết luận.\n2. Nêu số liệu có nguồn.\n3. Kết thúc bằng việc cần làm." })
    let reg: Registry = { skills: [] }
    const r = addCandidate(reg, { name: "viet-bao-cao", description: "Viết báo cáo ngắn", instructions: "1. Mở bằng kết luận.\n2. Nêu số liệu có nguồn.\n3. Kết thúc bằng việc cần làm.", source: "t", by: "u", lint })
    if ("error" in r) throw new Error(r.error)
    reg = r.reg
    const withGate = (g: unknown): Registry => ({ skills: reg.skills.map(s => ({ ...s, versions: s.versions.map(v => ({ ...v, gate: g as never })) })) })
    const side: GateSide = { pass: 3, total: 4, safetyPass: 1, safetyTotal: 1, ms: 0, fails: {} }
    const bad = decideSkill(withGate({ ...gateVerdict(side, { ...side, pass: 4 }) }), { name: "viet-bao-cao", v: 1, action: "approve", by: "u" })
    expect("error" in bad && bad.error).toContain("Eval cổng")
    expect("reg" in decideSkill(withGate({ ...gateVerdict(side, side) }), { name: "viet-bao-cao", v: 1, action: "approve", by: "u" })).toBe(true)
    expect("reg" in decideSkill(reg, { name: "viet-bao-cao", v: 1, action: "approve", by: "u" })).toBe(true)
    expect("reg" in decideSkill(withGate({ ...gateVerdict(side, { ...side, pass: 4 }) }), { name: "viet-bao-cao", v: 1, action: "reject", by: "u" })).toBe(true)   // từ chối luôn được
  })
})

describe("công cụ kỹ năng của Argon", () => {
  it("docKyNang là L0, deXuatKyNang là L3 và BỊ CHẶN khi lượt đã đọc nội dung ngoài (kỹ năng được nạp vào mọi lượt sau)", () => {
    expect(levelOf("docKyNang")).toBe("L0"); expect(levelOf("deXuatKyNang")).toBe("L3")
    expect(gateWrite("deXuatKyNang", true).mode).toBe("deny"); expect(gateWrite("deXuatKyNang", false).mode).toBe("run")
  })
})
