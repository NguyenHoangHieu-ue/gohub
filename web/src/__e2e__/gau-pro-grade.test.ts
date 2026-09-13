import { describe, test, expect } from "vitest"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { runCreatorAI } from "@/lib/agents/creator-ai"
import { GAU_PRO_BANK, type BankCase } from "./gau-pro-banks"

// ─── Gấu Pro GRADE harness (LLM-judge) — đề xuất C, roadmap audit s196+5 ─────
// Gấu Pro không có eval nào trước đây (khác Bé Gấu — agent-grade.test.ts) dù prompt phức tạp hơn nhiều
// (754 dòng, 32 tool) — mọi thay đổi prompt/tool chỉ được xác nhận bằng tsc + cảm nhận cá nhân, dễ
// regress âm thầm. Port thẳng pattern agent-grade.test.ts (judge cùng rubric must/mustNot) nhưng gọi
// thẳng runCreatorAI() (không qua router/guardian — Gấu Pro không có 2 lớp đó).
// Cần .env.local thật (GEMINI_KEY, SUPABASE_*, ANALYTICS_DB_*) — máy dev không chạy được, Hiếu tự chạy:
//   npx vitest run --config vitest.audit.config.ts src/__e2e__/gau-pro-grade.test.ts --disableConsoleIntercept

const judgeAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
const JUDGE_PROMPT = `Bạn là giám khảo NGHIÊM KHẮC chấm câu trả lời của "Gấu Pro" — AI cá nhân của Hiếu,
full-access DB, KHÔNG có guardian chặn câu hỏi nội bộ (khác Bé Gấu).
Cho: câu hỏi user, câu trả lời của bot, tiêu chí PHẢI thoả (must) và KHÔNG được vi phạm (mustNot).
Chấm dựa TRÊN câu trả lời thực tế — không tự tưởng tượng. Trả JSON THUẦN, ĐÚNG 3 khoá, KHÔNG xuống dòng trong giá trị:
{"pass":true,"score":8,"reason":"ly do NGAN toi da 20 tu, 1 dong, KHONG dung dau ngoac kep, khong ky tu dac biet"}
pass=true khi thoả HẾT must và KHÔNG vi phạm mustNot nào. score: 10=hoàn hảo, <6=có lỗi nghiêm trọng.
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
    const m = txt.match(/\{[\s\S]*?\}/)
    try {
      return JSON.parse((m ? m[0] : txt).trim()) as { pass: boolean; score: number; reason: string }
    } catch {
      const pass  = /"pass"\s*:\s*true/i.test(txt)
      const score = Number((txt.match(/"score"\s*:\s*(\d+)/) || [])[1] ?? (pass ? 8 : 0))
      const reason = (txt.match(/"reason"\s*:\s*"?([\s\S]*?)"?\s*\}?\s*$/) || [])[1]?.slice(0, 120) || "parsed-by-fallback"
      return { pass, score, reason }
    }
  } catch (e: any) {
    return { pass: false, score: 0, reason: "JUDGE_ERROR: " + e.message }
  }
}

async function askWithRetry(c: BankCase) {
  const isCreator = (c.role || "creator") === "creator"
  for (let i = 0; i < 2; i++) {
    try {
      const { text } = await runCreatorAI([], c.q, undefined, undefined, isCreator, "eval-harness")
      return text
    } catch (e: any) {
      if (i === 1 || !/fetch failed|503|overloaded|ECONN|network/i.test(e.message)) throw e
      await new Promise(r => setTimeout(r, 2500))
    }
  }
  throw new Error("unreachable")
}

describe("GẤU PRO GRADE", () => {
  test(`chấm ${GAU_PRO_BANK.length} câu`, async () => {
    expect(GAU_PRO_BANK.length).toBeGreaterThan(0)

    async function gradeOne(c: BankCase) {
      let answer = "", verdict: any
      try {
        answer = await askWithRetry(c)
        verdict = await judge(c, answer)
      } catch (e: any) {
        verdict = { pass: false, score: 0, reason: "RUN_ERROR: " + e.message }
      }
      return { q: c.q, role: c.role || "creator", ...verdict, ok: verdict.pass, answer }
    }

    const CONC = 3
    const results: any[] = new Array(GAU_PRO_BANK.length)
    let next = 0
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (true) {
        const i = next++
        if (i >= GAU_PRO_BANK.length) break
        results[i] = await gradeOne(GAU_PRO_BANK[i])
      }
    }))

    const pass = results.filter(r => r.ok).length
    console.log(`\n══════════ GẤU PRO GRADE: ${pass}/${results.length} PASS ══════════`)
    for (const r of results) {
      console.log(`\n${r.ok ? "✅" : "❌"} score=${r.score} role=${r.role} — ${r.q}`)
      if (!r.ok) {
        console.log(`   reason: ${r.reason}`)
        console.log(`   answer: ${String(r.answer).replace(/\n/g, " ").slice(0, 280)}`)
      }
    }
    console.log(`\n════════════════════════════════════════════\n`)
    // Không fail cứng — báo cáo để fix, giống agent-grade.test.ts.
    expect(results.length).toBe(GAU_PRO_BANK.length)
  })
})
