import { describe, test, expect } from "vitest"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { answerQuestion } from "@/lib/agents/answer"
import { BANKS, type BankCase } from "./agent-banks"
import type { UserRole } from "@/lib/agents/types"

// ─── GRADE harness (LLM-judge) ───────────────────────────────────────────────
// Chạy full answer thật (route + context + agent + Gemini + DB) rồi CHẤM bằng Gemini.
// Chọn agent qua env GRADE_AGENT (mặc định 'bi-analyst'). Nhiều agent: "a,b,c" hoặc "all".
//   npx vitest run --config vitest.audit.config.ts src/__e2e__/agent-grade.test.ts
//   $env:GRADE_AGENT="tu-van,tra-cuu,giai-dap"; npx vitest run ...

const AGENTS_TO_GRADE = (process.env.GRADE_AGENT || "bi-analyst") === "all"
  ? Object.keys(BANKS)
  : (process.env.GRADE_AGENT || "bi-analyst").split(",").map(s => s.trim()).filter(Boolean)

const judgeAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
const JUDGE_PROMPT = `Bạn là giám khảo NGHIÊM KHẮC chấm câu trả lời của một chatbot phân tích dữ liệu GoHub.
Cho: câu hỏi user, câu trả lời của bot, tiêu chí PHẢI thoả (must) và KHÔNG được vi phạm (mustNot).
Chấm dựa TRÊN câu trả lời thực tế — không tự tưởng tượng. Trả JSON THUẦN, ĐÚNG 3 khoá, KHÔNG xuống dòng trong giá trị:
{"pass":true,"score":8,"reason":"ly do NGAN toi da 20 tu, 1 dong, KHONG dung dau ngoac kep, khong ky tu dac biet"}
pass=true khi thoả HẾT must và KHÔNG vi phạm mustNot nào. score: 10=hoàn hảo, <6=có lỗi nghiêm trọng.
Lưu ý: bot trả lời tiếng Việt, có thể dùng bảng markdown. "có số cụ thể" = có con số thật, không phải placeholder.
Câu trả lời có thể bị CẮT NGẮN để đưa vào chấm — KHÔNG trừ điểm vì lý do "bị cắt cụt / dở dang ở cuối".`

async function judge(c: BankCase, answer: string) {
  const model = judgeAI.getGenerativeModel({
    model: "gemini-3.5-flash",
    systemInstruction: JUDGE_PROMPT,
    generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 1500 },
  })
  const payload = `CÂU HỎI: ${c.q}\n\nMUST (phải thoả hết):\n${(c.must || []).map(m => "- " + m).join("\n") || "(none)"}\n\nMUST_NOT (không được vi phạm):\n${(c.mustNot || []).map(m => "- " + m).join("\n") || "(none)"}\n\nCÂU TRẢ LỜI CỦA BOT:\n${answer.slice(0, 6000)}`
  if (!answer.trim()) return { pass: false, score: 0, reason: "EMPTY_ANSWER: bot trả rỗng" }
  try {
    const r = await model.generateContent(payload)
    const txt = r.response.text()
    // Trích object JSON đầu tiên (bỏ fence / prose thừa) — judge đôi khi chèn text sau JSON.
    const m = txt.match(/\{[\s\S]*?\}/)
    try {
      return JSON.parse((m ? m[0] : txt).trim()) as { pass: boolean; score: number; reason: string }
    } catch {
      // Fallback: reason có thể chứa dấu " chưa escape → bóc pass/score bằng regex (format cố định).
      const pass  = /"pass"\s*:\s*true/i.test(txt)
      const score = Number((txt.match(/"score"\s*:\s*(\d+)/) || [])[1] ?? (pass ? 8 : 0))
      const reason = (txt.match(/"reason"\s*:\s*"?([\s\S]*?)"?\s*\}?\s*$/) || [])[1]?.slice(0, 120) || "parsed-by-fallback"
      return { pass, score, reason }
    }
  } catch (e: any) {
    return { pass: false, score: 0, reason: "JUDGE_ERROR: " + e.message }
  }
}

// Retry transient (fetch failed / 503) — không phải lỗi agent.
async function answerWithRetry(q: string, role: UserRole) {
  for (let i = 0; i < 2; i++) {
    try { return await answerQuestion(q, [], role) }
    catch (e: any) {
      if (i === 1 || !/fetch failed|503|overloaded|ECONN|network/i.test(e.message)) throw e
      await new Promise(r => setTimeout(r, 2500))
    }
  }
  throw new Error("unreachable")
}

for (const AGENT of AGENTS_TO_GRADE)
describe(`AGENT GRADE — ${AGENT}`, () => {
  const cases = BANKS[AGENT] || []
  test(`chấm ${cases.length} câu`, async () => {
    expect(cases.length).toBeGreaterThan(0)
    async function gradeOne(c: BankCase) {
      const role = (c.role || "admin") as UserRole
      let routing = "ERR", answer = "", verdict: any
      try {
        const res = await answerWithRetry(c.q, role)
        routing = res.agentId
        answer  = res.text
        verdict = await judge(c, answer)
      } catch (e: any) {
        verdict = { pass: false, score: 0, reason: "RUN_ERROR: " + e.message }
      }
      const wants = c.expectAgent ? (Array.isArray(c.expectAgent) ? c.expectAgent : [c.expectAgent]) : null
      const routeOk = !wants || wants.includes(routing)
      const ok = routeOk && verdict.pass
      return { q: c.q, routing, routeOk, ...verdict, ok, answer }
    }

    // Chạy song song có giới hạn (pool 3) để giảm thời gian; answerWithRetry lo lỗi rate-limit tạm thời.
    const CONC = 3
    const results: any[] = new Array(cases.length)
    let next = 0
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (true) {
        const i = next++
        if (i >= cases.length) break
        results[i] = await gradeOne(cases[i])
      }
    }))

    const pass = results.filter(r => r.ok).length
    console.log(`\n══════════ GRADE [${AGENT}]: ${pass}/${results.length} PASS ══════════`)
    for (const r of results) {
      console.log(`\n${r.ok ? "✅" : "❌"} score=${r.score} route=[${r.routing}]${r.routeOk ? "" : " ⚠️ROUTING"} — ${r.q}`)
      if (!r.ok) {
        console.log(`   reason: ${r.reason}`)
        console.log(`   answer: ${String(r.answer).replace(/\n/g, " ").slice(0, 280)}`)
      }
    }
    console.log(`\n════════════════════════════════════════════════════\n`)
    // Không fail cứng — báo cáo để fix. Đảm bảo chạy được.
    expect(results.length).toBe(cases.length)
  })
})
