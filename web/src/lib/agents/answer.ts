import { GoogleGenerativeAI }   from "@google/generative-ai"
import { getRefCache }          from "./cache"
import { AGENTS }               from "./agents"
import { route }               from "./router"
import { buildToolContext }     from "./context"
import { runBIAnalyst }         from "./bi-analyst"
import { runDataExplorer }      from "./data-explorer"
import { guardCheck, canViewCogs } from "./guardian"
import { getChannelFromRole }   from "./tools"
import type { Message, UserRole } from "./types"

export interface AnswerResult {
  kind:      "guard" | "clarify" | "agent"
  agentId:   string
  agentName: string
  text:      string
}

// answerQuestion — pipeline TRẢ LỜI đầy đủ (non-streaming), dùng CHUNG cho:
//   · harness chấm điểm agent (agent-grade.test.ts)
//   · nơi cần câu trả lời hoàn chỉnh không stream (Lark-style)
// Mirror ĐÚNG thứ tự của /api/chat: route → guardian → clarify → context → agent.
// Đây là canonical dispatch để test bám sát code thật (cùng router/context/runner).
export async function answerQuestion(
  lastMsg:  string,
  history:  Message[],
  role:     UserRole,
  name:     string = "bạn",
  department: string = "all",
): Promise<AnswerResult> {
  const [refCache, routed, guard, isCost] = await Promise.all([
    getRefCache(),
    route(lastMsg, history, role),
    guardCheck(lastMsg, role, department),
    canViewCogs(role),
  ])
  const { agentId, agentName, params, needsClarification, clarificationQuestion } = routed
  const agent = AGENTS[agentId]

  if (!guard.allowed) {
    return { kind: "guard", agentId: "guardian", agentName: "Hạn chế quyền", text: guard.reason }
  }
  if (needsClarification && clarificationQuestion) {
    return { kind: "clarify", agentId: "clarify", agentName: "Làm Rõ", text: clarificationQuestion }
  }

  const channel = getChannelFromRole(role)
  const toolCtx = await buildToolContext(agentId, params, refCache, isCost, lastMsg, channel)

  const systemInstruction = [
    agent.systemPrompt,
    toolCtx ? `\n\n=== DỮ LIỆU TỪ HỆ THỐNG ===\n${toolCtx}` : "",
    `\nNgười dùng: ${name} (vai trò: ${role})`,
  ].join("")

  const geminiHistory = history.map((m: Message) => ({
    role:  m.role === "user" ? "user" as const : "model" as const,
    parts: [{ text: m.content }],
  }))

  if (agentId === "bi-analyst" || agentId === "data-explorer") {
    const text = agentId === "data-explorer"
      ? await runDataExplorer(systemInstruction, geminiHistory, lastMsg, role, isCost)
      : await runBIAnalyst(systemInstruction, geminiHistory, lastMsg, role)
    return { kind: "agent", agentId, agentName, text }
  }

  const genAI  = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model  = genAI.getGenerativeModel({ model: "gemini-3.5-flash", systemInstruction })
  const result = await model.startChat({ history: geminiHistory }).sendMessage(lastMsg)
  return { kind: "agent", agentId, agentName, text: result.response.text() }
}
