import cases from "../../../eval/argon-cases.json"
import { GATE_CASE_IDS, checkCase, fill, gateVerdict, type EvalCaseDef, type GateSide, type SkillGate } from "./eval-checks"
import { evalReset, evalRun, evalSeed, type EvalRunOut } from "./eval-run"
import { readRegistry, writeRegistry } from "@/lib/agents/creator/learned-skills"

// CỔNG EVAL của kỹ năng ứng viên (ARGON-X P4, cổng 4): chạy Argon trên dữ liệu mẫu hư cấu với 4 câu đại diện (đọc Kho, đường nhanh, không bịa, an toàn khi bị gài chỉ dẫn)
// HAI LẦN — không có và có kỹ năng trong ngữ cảnh — rồi so số ca đạt bằng kiểm tra CODE. Kỹ năng làm đạt ít ca hơn, hoặc làm hỏng một ca an toàn, bị đánh dấu "lùi" và KHÔNG duyệt được.
// Đồng bộ ~2–4 phút (route skills có maxDuration 300). Ca không dùng trạng thái chạy song song; ca an toàn (C*) chạy tuần tự vì kiểm tra tác dụng phụ trong DB.
const DEFS = (cases as unknown as EvalCaseDef[])
const isSafety = (c: EvalCaseDef) => c.group.startsWith("C")
const needsState = (c: EvalCaseDef) => !!c.state

export async function runSkillGate(name: string, v: number, origin: string): Promise<{ error?: string; gate?: SkillGate }> {
  const reg = await readRegistry()
  const ver = reg.skills.find(s => s.name === name)?.versions.find(x => x.v === v)
  if (!ver) return { error: `Không có skill "${name}" phiên bản ${v}.` }
  const picked = GATE_CASE_IDS.map(id => DEFS.find(c => c.id === id)).filter((c): c is EvalCaseDef => !!c)
  if (picked.length !== GATE_CASE_IDS.length) return { error: "Bộ câu hỏi eval thiếu ca cổng." }
  try {
    const { dates } = await evalSeed()
    const skill = { name, instructions: ver.instructions }
    const results = new Map<string, EvalRunOut>()   // key = `${caseId}|${side}`
    const one = async (c: EvalCaseDef, side: "base" | "skill") => { results.set(`${c.id}|${side}`, await evalRun({ prompt: fill(c.question, dates), model: "fast", ...(side === "skill" ? { skill } : {}) }, origin).catch(e => ({ error: (e as Error).message }) as unknown as EvalRunOut)) }
    // ca không đụng trạng thái: 2 phía song song; ca có trạng thái (an toàn): tuần tự để không xoá nhầm tác dụng phụ của nhau
    await Promise.all(picked.filter(c => !needsState(c)).flatMap(c => [one(c, "base"), one(c, "skill")]))
    for (const c of picked.filter(needsState)) { await one(c, "base"); await one(c, "skill") }
    const side = (s: "base" | "skill"): GateSide => {
      const out: GateSide = { pass: 0, total: picked.length, safetyPass: 0, safetyTotal: picked.filter(isSafety).length, ms: 0, fails: {} }
      for (const c of picked) {
        const r = results.get(`${c.id}|${s}`)
        const fails = !r || (r as { error?: string }).error ? [`lỗi chạy: ${(r as { error?: string } | undefined)?.error ?? "không có kết quả"}`] : checkCase(c, r, dates)
        if (!fails.length) { out.pass++; if (isSafety(c)) out.safetyPass++ } else out.fails[c.id] = fails
        out.ms += r?.ms ?? 0
      }
      return out
    }
    const gate = gateVerdict(side("skill"), side("base"))
    const fresh = await readRegistry()   // đọc lại ngay trước khi ghi: trong lúc chạy anh có thể vừa duyệt/từ chối
    await writeRegistry({ skills: fresh.skills.map(s => (s.name === name ? { ...s, versions: s.versions.map(x => (x.v === v ? { ...x, gate } : x)) } : s)) })
    return { gate }
  } catch (e) {
    return { error: `Cổng eval lỗi: ${(e as Error).message}` }
  } finally {
    await evalReset().catch(() => undefined)
  }
}
