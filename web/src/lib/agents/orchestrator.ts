import { GoogleGenerativeAI }      from "@google/generative-ai"
import { AGENTS }                   from "./agents"
import { buildToolContext }         from "./context"
import { runBIAnalyst }             from "./bi-analyst"
import { runDataExplorer }          from "./data-explorer"
import { NOTICE_MULTI, isFailureText, guidanceFor, ensureAnswer, AGENT_EXAMPLES } from "./graph"
import type { ExtractedParams }     from "./router"
import type { AgentId, UserRole }   from "./types"

// Re-export helper thuần (định nghĩa ở graph.ts — leaf, không đụng supabase) để
// các importer cũ (chat/lark/answer) vẫn lấy được từ orchestrator.
export { NOTICE_MULTI, isFailureText, guidanceFor, ensureAnswer }

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR — lớp điều phối bọc ngoài 7 agent worker.
//   · runOneAgent   : chạy đúng 1 agent (bi/data = function-calling; còn lại = Gemini)
//   · runMulti      : chạy N agent song song rồi TỔNG HỢP thành 1 câu trả lời
//   · ensureAnswer  : đảm bảo LUÔN có câu trả lời — câu rỗng/lỗi → gợi ý cách hỏi
// Mục tiêu: mọi câu hỏi đều được trả lời; nếu không phù hợp → hướng dẫn user hỏi lại.
// ─────────────────────────────────────────────────────────────────────────────

// Ghép system instruction cho 1 agent (giống hệt cách /api/chat dựng)
export function assembleInstruction(
  agentId: AgentId,
  toolCtx: string,
  name: string,
  role: string,
  userSuffix = "",
  tempRule = "",
): string {
  const agent = AGENTS[agentId]
  return [
    agent.systemPrompt,
    toolCtx ? `\n\n=== SYSTEM DATA ===\n${toolCtx}` : "",
    `\nUser: ${name} (role: ${role}${userSuffix})`,
    tempRule,
  ].join("")
}

// Chạy đúng 1 agent (non-streaming), trả text.
export async function runOneAgent(
  agentId: AgentId,
  systemInstruction: string,
  geminiHistory: any[],
  lastMsg: string,
  role: string,
  isCost: boolean,
): Promise<string> {
  if (agentId === "data-explorer")
    return runDataExplorer(systemInstruction, geminiHistory, lastMsg, role, isCost)
  if (agentId === "bi-analyst")
    return runBIAnalyst(systemInstruction, geminiHistory, lastMsg, role)

  const genAI  = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model  = genAI.getGenerativeModel({ model: "gemini-3.6-flash", systemInstruction })
  const result = await model.startChat({ history: geminiHistory }).sendMessage(lastMsg)
  return result.response.text()
}

// ─── Tổng hợp nhiều câu trả lời agent thành 1 ───────────────────────────────────
const SYNTH_SYSTEM = `You are a synthesis engine for GoHub's internal chatbot (Sim/eSim management).
You receive the USER'S QUESTION and multiple partial answers from different specialist agents.
Task: merge into ONE coherent, friendly answer in Vietnamese.
RULES:
- Keep all numbers, tables, and product codes from the parts exactly as-is (NO fabrication, NO editing numbers).
- Organize by the question's flow; use bold headings if covering multiple aspects.
- Drop empty/duplicate/"not found" parts if another part already answered.
- If ALL parts have no useful information → honestly say no data is available and suggest how to rephrase.
- Keep it concise and direct — do not repeat the question.`

export async function synthesize(
  question: string,
  segments: { agentName: string; text: string }[],
): Promise<string> {
  const usable = segments.filter(s => !isFailureText(s.text))
  if (usable.length === 0) return ""          // để ensureAnswer xử lý
  if (usable.length === 1) return usable[0].text   // 1 phần dùng được → khỏi tổng hợp

  const body = usable.map(s => `### Phần từ ${s.agentName}\n${s.text}`).join("\n\n")
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash", systemInstruction: SYNTH_SYSTEM })
  const prompt = `CÂU HỎI CỦA USER:\n${question}\n\nCÁC PHẦN TRẢ LỜI:\n${body}\n\n→ Hãy tổng hợp thành 1 câu trả lời hoàn chỉnh.`
  const result = await model.startChat({ history: [] }).sendMessage(prompt)
  return result.response.text()
}

// ─── Chạy đa-agent + tổng hợp ───────────────────────────────────────────────────
export interface MultiCtx {
  agentIds:      AgentId[]
  params:        ExtractedParams
  refCache:      Awaited<ReturnType<typeof import("./cache").getRefCache>>
  isCost:        boolean
  role:          UserRole
  name:          string
  lastMsg:       string
  geminiHistory: any[]
  channel:       "B2C" | "B2B" | null
  userSuffix?:   string
  tempRule?:     string
}

// Chạy tất cả agent trong plan (song song) rồi tổng hợp về 1 câu.
export async function runMulti(c: MultiCtx): Promise<string> {
  const primary = c.agentIds[0]

  const segments = await Promise.all(
    c.agentIds.map(async (agentId): Promise<{ agentName: string; text: string }> => {
      const agentName = AGENTS[agentId].name
      try {
        const toolCtx = await buildToolContext(agentId, c.params, c.refCache, c.isCost, c.lastMsg, c.channel)
        // FOCUS: câu ghép được nhiều agent xử lý → mỗi agent CHỈ lo phần chuyên môn của mình,
        // tránh bị phân tâm bởi phần của agent khác (vd bi bị kéo sang catalog WM → hụt doanh thu).
        const role = AGENT_EXAMPLES[agentId]?.role ?? "phần thuộc chuyên môn của bạn"
        const focus = `\n\n━━━ MULTI-AGENT NOTE ━━━\nThe user's question has MULTIPLE parts handled by different specialist agents. YOU focus ONLY on your domain: ${role}. Other parts are handled by other agents — IGNORE them completely, do NOT respond to them and do NOT say "no information" for topics outside your specialty.`
        const instr   = assembleInstruction(agentId, toolCtx, c.name, c.role, c.userSuffix ?? "", (c.tempRule ?? "") + focus)
        const text    = await runOneAgent(agentId, instr, c.geminiHistory, c.lastMsg, c.role, c.isCost)
        return { agentName, text }
      } catch {
        return { agentName, text: "" }   // agent lỗi → coi như rỗng, phần khác vẫn tổng hợp
      }
    }),
  )

  const merged = await synthesize(c.lastMsg, segments)
  return ensureAnswer(merged, primary)
}
