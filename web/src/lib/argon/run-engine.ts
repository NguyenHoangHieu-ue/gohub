import { ThinkingLevel, type Content, type FunctionDeclaration, type Part } from "@google/genai"
import { genai } from "@/lib/agents/genai-stream"
import { GEMINI_MODEL_ARGON } from "@/lib/ai-models"
import type { RunContext } from "./context"
import { ARGON_TOOLS, MAX_TOOL_CALLS, execArgonTool, type ToolLogEntry } from "./tools"
import { MISSION_TOOL_NAMES, WS_TOOLS, execMissionSql, execWsTool } from "./ws-tools"
import { SQL_TOOL, SQL_TOOL_NAME } from "./sql-tool"

// Lõi chạy 1 ĐOẠN của Phòng Argon, dùng chung cho SSE (runs/route.ts) và worker việc nền (worker/route.ts).
// Hết ngân sách thời gian đoạn → status "partial" (câu trả lời dở được lưu, đoạn sau viết tiếp). Có công cụ → vòng gọi công cụ ngay trong đoạn.
export const LEVELS: Record<string, ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH }
const MAX_MISSION_TOOL_CALLS = 30
const TRANSIENT = /429|rate|quota|resource.?exhausted|500|503|overload|unavailable|deadline|ECONNRESET|fetch failed/i

export interface SegmentIn {
  ctx: RunContext
  thinking: string
  segmentMs: number
  maxOut: number
  signal?: AbortSignal                        // huỷ từ ngoài (client đóng / người dùng bấm Dừng)
  // dataTools=false: tắt layDuLieuHeThong (mặc định bật). missionId: bật thêm công cụ workspace của sứ mệnh đó (docFile/ghiFile/lietKeFile).
  tools?: { origin: string; log: ToolLogEntry[]; onTool: (e: ToolLogEntry) => void | Promise<void>; dataTools?: boolean; missionId?: string }
  onDelta: (text: string) => void
  onProgress?: () => void                     // gọi định kỳ (≥4s) để lưu câu trả lời dở / nhịp tim
}
export interface SegmentOut {
  added: string
  tokensIn: number
  tokensOut: number
  cachedIn: number
  status: "done" | "partial" | "error" | "stopped"
  error: string | null
}

export async function runSegment(i: SegmentIn): Promise<SegmentOut> {
  const ac = new AbortController()
  const onAbort = () => ac.abort()
  i.signal?.addEventListener("abort", onAbort)
  const timer = setTimeout(() => ac.abort(new Error("segment-timeout")), i.segmentMs)
  const out: SegmentOut = { added: "", tokensIn: 0, tokensOut: 0, cachedIn: 0, status: "done", error: null }
  const contents: Content[] = [...i.ctx.contents]
  const dataTools = i.tools?.dataTools !== false
  const missionId = i.tools?.missionId
  const decls: FunctionDeclaration[] = [...(dataTools ? ARGON_TOOLS : []), ...(missionId ? [...WS_TOOLS, SQL_TOOL] : [])]
  const maxCalls = missionId ? MAX_MISSION_TOOL_CALLS : MAX_TOOL_CALLS   // sứ mệnh còn đọc/ghi file nên cần nhiều lượt gọi hơn
  const isData = (n: string) => !MISSION_TOOL_NAMES.includes(n)
  let lastProgress = Date.now()
  try {
    for (let turn = 0; turn <= maxCalls; turn++) {
      const toolsOn = !!i.tools && decls.length > 0 && i.tools.log.length < maxCalls
      const modelParts: Part[] = []
      let finish = "", tIn = 0, tOut = 0, tCached = 0
      for (let attempt = 0; attempt < 3; attempt++) {
        let emitted = false
        try {
          const res = await genai().models.generateContentStream({
            model: GEMINI_MODEL_ARGON, contents,
            config: {
              systemInstruction: i.ctx.systemInstruction, thinkingConfig: { thinkingLevel: LEVELS[i.thinking] ?? LEVELS.medium }, maxOutputTokens: i.maxOut, abortSignal: ac.signal,
              ...(toolsOn ? { tools: [{ functionDeclarations: decls }] } : {}),
            },
          })
          for await (const chunk of res) {
            const parts: Part[] = chunk.candidates?.[0]?.content?.parts ?? []
            for (const p of parts) {
              modelParts.push(p)   // giữ nguyên part (kể cả thoughtSignature) để đẩy lại vòng công cụ sau
              if (typeof p.text === "string" && p.text && !p.thought) { emitted = true; out.added += p.text; i.onDelta(p.text) }
            }
            const u = chunk.usageMetadata
            if (u) { tIn = u.promptTokenCount ?? tIn; tOut = u.candidatesTokenCount ?? tOut; tCached = u.cachedContentTokenCount ?? tCached }
            finish = chunk.candidates?.[0]?.finishReason ?? finish
            if (i.onProgress && Date.now() - lastProgress > 4000) { lastProgress = Date.now(); i.onProgress() }
          }
          break
        } catch (e) {
          if (emitted || ac.signal.aborted || !TRANSIENT.test(String((e as Error)?.message)) || attempt === 2) throw e
          modelParts.length = 0
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        }
      }
      out.tokensIn += tIn; out.tokensOut += tOut; out.cachedIn += tCached

      const calls = modelParts.filter(p => p.functionCall)
      if (calls.length && toolsOn) {
        const responses: Part[] = []
        for (const c of calls) {
          const fc = c.functionCall!
          const fname = String(fc.name), fargs = (fc.args ?? {}) as Record<string, unknown>
          const dataCalls = i.tools!.log.filter(t => isData(t.name)).length
          const entry = fname === SQL_TOOL_NAME && missionId ? await execMissionSql(fargs, missionId, i.tools!.log.filter(t => t.name === SQL_TOOL_NAME).length)
            : !isData(fname) && missionId ? await execWsTool(fname, fargs, missionId)
            : isData(fname) && dataTools && dataCalls >= MAX_TOOL_CALLS ? { name: fname, args: fargs, ok: false, chars: 0, result: `Đã dùng hết ${MAX_TOOL_CALLS} lần lấy số liệu hệ thống trong lượt này`, at: new Date().toISOString() }
            : isData(fname) && !dataTools ? { name: fname, args: fargs, ok: false, chars: 0, result: "Công cụ lấy số liệu hệ thống đang tắt", at: new Date().toISOString() }
            : await execArgonTool(fname, fargs, i.tools!.origin)
          i.tools!.log.push(entry)
          await i.tools!.onTool(entry)
          responses.push({ functionResponse: { name: String(fc.name), response: entry.ok ? { buoc: i.tools!.log.length, ketQua: entry.result } : { buoc: i.tools!.log.length, loi: entry.result } } })
        }
        contents.push({ role: "model", parts: modelParts }, { role: "user", parts: responses })
        continue
      }
      if (/MAX_TOKENS/i.test(finish)) out.status = "partial"
      else if (finish && !/STOP/i.test(finish)) { out.status = "error"; out.error = `Model dừng với lý do ${finish}` }
      return out
    }
    return out
  } catch (e) {
    const timedOut = String(ac.signal.reason?.message ?? "").includes("segment-timeout")
    if (timedOut) out.status = "partial"
    else if (i.signal?.aborted) out.status = "stopped"
    else { out.status = "error"; out.error = (e as Error)?.message?.slice(0, 500) ?? "Lỗi không rõ" }
    return out
  } finally {
    clearTimeout(timer)
    i.signal?.removeEventListener("abort", onAbort)
  }
}
