// Lõi agent dùng chung Bé Gấu + Gấu Pro (plan be-gau-upgrade.md U1b): gọi model → chạy tool song song → lặp, dừng khi hết
// tool / người dùng bấm Dừng / hết ngân sách thời gian. Mỗi trợ lý chỉ cấp phần riêng: cấu hình từng lượt (prompt, tool theo
// vai trò, mức suy nghĩ) và cách chạy 1 tool (cổng duyệt, kế hoạch, kỹ năng, chặn giá vốn…). Sửa vòng lặp ở đây là cả hai cùng có.
import type { Content, FunctionCall, GenerateContentConfig, Part } from "@google/genai"
import { streamTurn, type TurnResult } from "../genai-stream"

export interface LoopRound { r: number; ms: number; tin: number; tout: number; calls: string[] }
export interface LoopToolRun { r: number; name: string; ms: number; chars: number }

export interface AgentLoopOptions {
  model: string
  /** Lịch sử + tin người dùng. Vòng lặp nối thêm lượt model và kết quả tool vào đây. */
  contents: Content[]
  /** Cấu hình cho lượt model thứ `round` (0 = lượt đầu) — gọi lại MỖI lượt nên đổi được tool/kỹ năng/mức suy nghĩ giữa chừng. */
  configFor: (round: number) => GenerateContentConfig
  /** Chạy 1 lời gọi tool → part functionResponse (persona tự lo lỗi, duyệt, kế hoạch…). */
  runTool: (call: FunctionCall, round: number) => Promise<Part>
  maxRounds: number
  onChunk?: (text: string) => void
  signal?: AbortSignal
  /** Việc nền: quá ngân sách (tính từ startedAt) thì dừng TRƯỚC lượt model kế tiếp, trả unfinished để chạy chặng sau. */
  timeBudgetMs?: number
  startedAt?: number
  onRound?: (round: LoopRound) => void
}

export interface AgentLoop {
  /** Lượt model cuối cùng (không còn gọi tool, hoặc lượt trước khi dừng). */
  last: TurnResult
  toolsUsed: Set<string>
  tokensIn: number
  tokensOut: number
  stopped: boolean
  unfinished: boolean
  rounds: LoopRound[]
  tools: LoopToolRun[]
  /** Gọi thêm 1 lượt model trên cùng contents (bước bổ sung của persona, vd ép gọi 1 tool, viết lại câu trả lời rỗng). */
  next: (config?: GenerateContentConfig, onChunk?: (text: string) => void) => Promise<TurnResult>
}

export async function runAgentLoop(o: AgentLoopOptions): Promise<AgentLoop> {
  const startedAt = o.startedAt ?? Date.now()
  const rounds: LoopRound[] = []
  const tools: LoopToolRun[] = []
  const toolsUsed = new Set<string>()
  let tokensIn = 0, tokensOut = 0

  const next = async (config?: GenerateContentConfig, onChunk = o.onChunk): Promise<TurnResult> => {
    const r0 = rounds.length
    const ts = Date.now()
    const r = await streamTurn(o.model, o.contents, config ?? o.configFor(r0), onChunk)
    const round = { r: r0, ms: Date.now() - ts, tin: r.tokensIn, tout: r.tokensOut, calls: r.functionCalls.map(c => c.name ?? "") }
    rounds.push(round)
    o.onRound?.(round)
    tokensIn += r.tokensIn; tokensOut += r.tokensOut
    if (r.content.parts?.length) o.contents.push(r.content)
    return r
  }

  let last = await next()
  let stopped = false, unfinished = false
  for (let i = 0; i < o.maxRounds; i++) {
    if (o.signal?.aborted) { stopped = true; break }
    const calls = last.functionCalls
    if (!calls.length) break
    calls.forEach(c => toolsUsed.add(c.name ?? ""))
    const round = rounds.length - 1
    const parts = await Promise.all(calls.map(async call => {
      const ts = Date.now()
      const part = await o.runTool(call, round)
      tools.push({ r: round, name: call.name ?? "", ms: Date.now() - ts, chars: JSON.stringify(part).length })
      return part
    }))
    // Kết quả tool gửi lại với role "user" (định dạng Gemini API cho functionResponse).
    o.contents.push({ role: "user", parts })
    if (o.timeBudgetMs && Date.now() - startedAt > o.timeBudgetMs) { unfinished = true; break }
    last = await next()
  }

  return {
    last, toolsUsed, stopped, unfinished, rounds, tools, next,
    get tokensIn() { return tokensIn },
    get tokensOut() { return tokensOut },
  }
}
