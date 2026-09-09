import "./replay-setup"
import { describe, test, expect } from "vitest"
import { answerQuestion } from "@/lib/agents/answer"

// E2E THỰC TẾ câu multi-agent — chạy answerQuestion() (mirror /api/chat: route→guardian→
// multi→synthesize) với Gemini + gohub_dw + Supabase THẬT. In output tổng hợp để soi mắt.
// Chạy: npx vitest run --config vitest.audit.config.ts src/__e2e__/chatbot-multi.test.ts --disableConsoleIntercept

const CASES = [
  "đi Nhật có gói eSIM nào và doanh thu tháng này bao nhiêu?",
  "KYC là gì và doanh thu tháng này ra sao?",
  "WorldMove có gói nào cho Nhật và doanh thu vendor 3HK datapool trong tháng gần nhất?",
]

describe("Chatbot multi-agent — output thực tế", () => {
  test("chạy answerQuestion() + in kết quả tổng hợp", async () => {
    for (const q of CASES) {
      let r
      try {
        r = await answerQuestion(q, [], "admin", "Hiếu", "all")
      } catch (e) {
        console.log(`\n════════\n❓ ${q}\n💥 ERROR: ${(e as Error).message}`)
        throw e
      }
      console.log(`\n════════════════════════════════════════════════════════`)
      console.log(`❓ ${q}`)
      console.log(`🧭 kind=${r.kind} · agent=${r.agentName} (${r.agentId})`)
      console.log(`💬 ${r.text}`)
      expect(r.text.trim().length).toBeGreaterThan(0)
    }
  }, 900_000)
})
