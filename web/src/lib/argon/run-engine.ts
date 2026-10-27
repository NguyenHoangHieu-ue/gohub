import { ThinkingLevel, type Content, type FunctionDeclaration, type Part } from "@google/genai"
import { genai } from "@/lib/agents/genai-stream"
import { GEMINI_MODEL_ARGON } from "@/lib/ai-models"
import type { RunContext } from "./context"
import { ARGON_TOOLS, MAX_TOOL_CALLS, execArgonTool, type ToolLogEntry } from "./tools"
import { MISSION_TOOL_NAMES, WS_TOOLS, execMissionAsk, execMissionCode, execMissionForecast, execMissionPatch, execMissionSourceTool, execMissionSql, execWsTool } from "./ws-tools"
import { LIST_NAME, READ_NAME, SEARCH_NAME, SOURCE_TOOLS } from "./source-tools"
import { PARALLEL_SAFE, groupCalls } from "./parallel-tools"
import { FAST_TOOL_NAMES, MAX_FAST_TOOL_CALLS } from "./run-route"
import { MEMBER_BLOCKED_TOOLS } from "./access-pure"
import { injectionHits, isTainted, levelOf, markerHits, noticeDetail, recordNotice, refusal, spotlight } from "./run-safety"
import { FORECAST_TOOL, FORECAST_TOOL_NAME, SCORE_TOOL, SCORE_TOOL_NAME } from "./forecast-tool"
import { PATCH_TOOL, PATCH_TOOL_NAME } from "./patch-tool"
import { ASK_TOOL, ASK_TOOL_NAME, askBlock } from "./ask-tool"
import { RUN_CODE_NAME, RUN_CODE_TOOL } from "./code-tool"
import { SQL_TOOL, SQL_TOOL_NAME } from "./sql-tool"
import { KHO_TOOLS, execKhoTool } from "./kho-tools"
import { EXT_TOOLS, EXT_TOOL_NAMES, execExtTool } from "./ext-tools"
import { ACT_NAME, ACT_TOOL, execActTool } from "./act-tool"
import { BROWSE_TOOLS, BROWSE_TOOL_NAMES, execBrowseTool, trustedUrlText } from "./browse-tools"
import { createRunTrace } from "@/lib/agent-events"
import { runAgentLoop } from "@/lib/agents/core/agent-loop"
import { flagValueOn } from "./core-loop-flag"

// Lõi chạy 1 ĐOẠN của Phòng Argon, dùng chung cho SSE (runs/route.ts) và worker việc nền (worker/route.ts).
// Hết ngân sách thời gian đoạn → status "partial" (câu trả lời dở được lưu, đoạn sau viết tiếp). Có công cụ → vòng gọi công cụ ngay trong đoạn.
export const LEVELS: Record<string, ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH }
const MAX_MISSION_TOOL_CALLS = 30
const TRANSIENT = /429|rate|quota|resource.?exhausted|500|503|overload|unavailable|deadline|ECONNRESET|fetch failed/i

export interface SegmentIn {
  ctx: RunContext
  thinking: string
  model?: string                              // id model (mặc định Gemini 4 Argon); xem lib/argon/models.ts
  segmentMs: number
  maxOut: number
  signal?: AbortSignal                        // huỷ từ ngoài (client đóng / người dùng bấm Dừng)
  // dataTools=false: tắt layDuLieuHeThong (mặc định bật). missionId: bật thêm công cụ workspace của sứ mệnh đó (docFile/ghiFile/lietKeFile).
  tools?: { origin: string; log: ToolLogEntry[]; onTool: (e: ToolLogEntry) => void | Promise<void>; dataTools?: boolean; missionId?: string; khoUser?: string; khoMode?: "full" | "facts"; fast?: boolean; member?: boolean }   // member = người được cấp (không phải Creator): bỏ công cụ MEMBER_BLOCKED_TOOLS · fast = đường nhanh: chỉ công cụ đọc Kho (FAST_TOOL_NAMES), ít vòng gọi
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

interface Prepared {
  decls: FunctionDeclaration[]
  maxCalls: number
  isData: (n: string) => boolean
  khoUser: string | undefined
  dataTools: boolean
  /** Chạy MỘT lời gọi công cụ (đủ mọi nhánh: Kho, nguồn, dự đoán, đề xuất sửa code, hỏi, run_code, sql, workspace, số liệu hệ thống). `dataCalls` = số lần lấy số liệu hệ thống đã dùng. */
  dispatch: (fname: string, fargs: Record<string, unknown>, dataCalls: number) => Promise<ToolLogEntry>
}

/** Công cụ + hạn mức của một đoạn — dùng chung cho vòng lặp riêng cũ và vòng lặp lõi chung (core/agent-loop). */
function prepare(i: SegmentIn): Prepared {
  const dataTools = i.tools?.dataTools !== false
  const missionId = i.tools?.missionId
  const khoUser = i.tools?.khoUser   // sứ mệnh đọc toàn Kho: "full" (Thủ thư Kho) thêm công cụ xếp thư mục + sổ sự việc; "facts" (Tham mưu hằng ngày) chỉ tra sổ sự việc (kho-tools.ts)
  const khoDecls = khoUser ? (i.tools?.khoMode === "full" ? KHO_TOOLS : KHO_TOOLS.filter(t => t.name === "traSuViec" || t.name === "traMail" || t.name === "traThucThe" || t.name === "deXuatGhiNho" || t.name === "docKyNang" || t.name === "deXuatKyNang")) : []
  const khoNames = new Set(khoDecls.map(t => t.name))
  const fast = !!i.tools?.fast && !!missionId
  const allDecls: FunctionDeclaration[] = [...(dataTools ? ARGON_TOOLS : []), ...(missionId ? [...WS_TOOLS, SQL_TOOL, RUN_CODE_TOOL, ASK_TOOL, PATCH_TOOL, FORECAST_TOOL, SCORE_TOOL, ...SOURCE_TOOLS, ...khoDecls, ...EXT_TOOLS, ...BROWSE_TOOLS, ...(khoUser ? [ACT_TOOL] : [])] : [])]
  const member = !!i.tools?.member
  const decls = (fast ? allDecls.filter(t => FAST_TOOL_NAMES.includes(String(t.name))) : allDecls).filter(t => !member || !MEMBER_BLOCKED_TOOLS.includes(String(t.name)))
  const maxCalls = fast ? MAX_FAST_TOOL_CALLS : missionId ? MAX_MISSION_TOOL_CALLS : MAX_TOOL_CALLS   // sứ mệnh còn đọc/ghi file nên cần nhiều lượt gọi hơn
  const isData = (n: string) => !MISSION_TOOL_NAMES.includes(n)
  const rawDispatch = async (fname: string, fargs: Record<string, unknown>, dataCalls: number, tainted: boolean): Promise<ToolLogEntry> => (
    member && MEMBER_BLOCKED_TOOLS.includes(String(fname)) ? { name: fname, args: fargs, ok: false, chars: 0, result: "Công cụ này chỉ dành cho Creator", at: new Date().toISOString() }
    : fast && !FAST_TOOL_NAMES.includes(String(fname)) ? { name: fname, args: fargs, ok: false, chars: 0, result: "Đường nhanh chỉ tra cứu Kho; câu này cần công cụ khác — nói với Hiếu bấm Sâu hoặc hỏi lại kèm yêu cầu phân tích", at: new Date().toISOString() }
    : fname === ACT_NAME && khoUser ? await execActTool(fargs, { username: khoUser, used: i.tools!.log.filter(t => t.name === ACT_NAME && t.ok).length, tainted })
    : missionId && BROWSE_TOOL_NAMES.includes(String(fname)) ? await execBrowseTool(fname, fargs, { used: i.tools!.log.filter(t => t.name === fname).length, tainted, trusted: trustedUrlText(i.ctx.contents, i.tools!.log) })
    : missionId && EXT_TOOL_NAMES.includes(String(fname)) ? await execExtTool(fname, fargs, i.tools!.log.filter(t => t.name === fname).length, { tainted, username: khoUser, member })
    : khoUser && khoNames.has(String(fname)) ? await execKhoTool(fname, fargs, khoUser, { tainted })
    : (fname === LIST_NAME || fname === READ_NAME || fname === SEARCH_NAME) && missionId ? await execMissionSourceTool(fname, fargs, missionId)
    : (fname === FORECAST_TOOL_NAME || fname === SCORE_TOOL_NAME) && missionId ? await execMissionForecast(fname, fargs, missionId)
    : fname === PATCH_TOOL_NAME && missionId ? await execMissionPatch(fargs, missionId, i.tools!.origin)
    : fname === ASK_TOOL_NAME && missionId ? await execMissionAsk(fargs, missionId, i.tools!.origin)
    : fname === RUN_CODE_NAME && missionId ? await execMissionCode(fargs, missionId, i.tools!.log.filter(t => t.name === RUN_CODE_NAME).length)
    : fname === SQL_TOOL_NAME && missionId ? await execMissionSql(fargs, missionId, i.tools!.log.filter(t => t.name === SQL_TOOL_NAME).length)
    : !isData(fname) && missionId ? await execWsTool(fname, fargs, missionId)
    : isData(fname) && dataTools && dataCalls >= MAX_TOOL_CALLS ? { name: fname, args: fargs, ok: false, chars: 0, result: `Đã dùng hết ${MAX_TOOL_CALLS} lần lấy số liệu hệ thống trong lượt này`, at: new Date().toISOString() }
    : isData(fname) && !dataTools ? { name: fname, args: fargs, ok: false, chars: 0, result: "Công cụ lấy số liệu hệ thống đang tắt", at: new Date().toISOString() }
    : await execArgonTool(fname, fargs, i.tools!.origin))
  // P3 an toàn: công cụ chưa khai báo bậc quyền thì từ chối; kết quả đọc nội dung ngoài (L1) được bọc + quét chỉ dẫn lạ; lượt đã nhiễm thì công cụ ghi bị siết (run-safety.ts).
  const dispatch = async (fname: string, fargs: Record<string, unknown>, dataCalls: number): Promise<ToolLogEntry> => {
    const lvl = levelOf(String(fname))
    if (!lvl) return refusal(fname, fargs, `Công cụ "${fname}" chưa khai báo bậc quyền (run-safety.ts) nên bị từ chối`)
    const tainted = isTainted(i.tools?.log ?? [])
    const e = await rawDispatch(fname, fargs, dataCalls, tainted)
    if (lvl !== "L1" || !e.ok) return e
    const hits = Array.from(new Set([...injectionHits(e.result), ...markerHits(e.result)]))
    if (hits.length && khoUser) void recordNotice(khoUser, { tool: String(fname), detail: noticeDetail(String(fname), fargs), hits })
    return { ...e, result: spotlight(String(fname), e.result, hits), chars: e.result.length }
  }
  return { decls, maxCalls, isData, khoUser, dataTools, dispatch }
}

async function runSegmentLegacy(i: SegmentIn): Promise<SegmentOut> {
  const ac = new AbortController()
  const onAbort = () => ac.abort()
  i.signal?.addEventListener("abort", onAbort)
  const timer = setTimeout(() => ac.abort(new Error("segment-timeout")), i.segmentMs)
  const out: SegmentOut = { added: "", tokensIn: 0, tokensOut: 0, cachedIn: 0, status: "done", error: null }
  const contents: Content[] = [...i.ctx.contents]
  const { decls, maxCalls, isData, dispatch, khoUser, dataTools } = prepare(i)
  let lastProgress = Date.now()
  const evTrace = createRunTrace("argon")   // sự kiện cho Bản đồ vận hành (chỉ tên công cụ + thời gian)
  evTrace.emit("start")
  try {
    for (let turn = 0; turn <= maxCalls; turn++) {
      const turnStart = Date.now()
      const toolsOn = !!i.tools && decls.length > 0 && i.tools.log.length < maxCalls
      const modelParts: Part[] = []
      let finish = "", tIn = 0, tOut = 0, tCached = 0
      for (let attempt = 0; attempt < 3; attempt++) {
        let emitted = false
        try {
          const res = await genai().models.generateContentStream({
            model: i.model ?? GEMINI_MODEL_ARGON, contents,
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
      evTrace.emit("model", undefined, { ms: Date.now() - turnStart })

      const calls = modelParts.filter(p => p.functionCall)
      if (calls.length && toolsOn) {
        const responses: Part[] = []
        for (const group of groupCalls(calls.map(c => c.functionCall!))) {
          const dataCalls = i.tools!.log.filter(t => isData(t.name)).length
          const entries = await Promise.all(group.map(async fc => {
            const fname = String(fc.name), fargs = (fc.args ?? {}) as Record<string, unknown>
            const toolStart = Date.now()
            evTrace.emit("tool-start", fname)
            const entry = await dispatch(fname, fargs, dataCalls)
            evTrace.emit("tool", fname, { ms: Date.now() - toolStart, ok: entry.ok })
            return entry
          }))
          for (let k = 0; k < group.length; k++) {   // ghi nhật ký theo đúng thứ tự model gọi, số bước ổn định
            const entry = entries[k]
            const n = i.tools!.log.push(entry)
            await i.tools!.onTool(entry)
            responses.push({ functionResponse: { name: String(group[k].name), response: entry.ok ? { buoc: n, ketQua: entry.result } : { buoc: n, loi: entry.result } } })
          }
        }
        // Argon vừa hỏi Hiếu (hoiHieu thành công) → kết thúc lượt NGAY, hiện câu hỏi trong chat; không để model làm tiếp khi chưa có câu trả lời.
        const asked = i.tools!.log.slice(-calls.length).find(t => t.name === ASK_TOOL_NAME && t.ok)
        if (asked) { const blk = askBlock(asked.args); if (blk) { out.added += blk; i.onDelta(blk) } return out }
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
    evTrace.emit("end")
    await evTrace.flush()
    clearTimeout(timer)
    i.signal?.removeEventListener("abort", onAbort)
  }
}

// ── Vòng lặp lõi chung (P3c): Argon chạy trên CÙNG `runAgentLoop` với Bé Gấu/Gấu Pro (retry lỗi tạm thời, theo dõi token, sự kiện Bản đồ, dừng giữa chừng).
// Công cụ vẫn chạy TUẦN TỰ qua hàng đợi (các hạn mức run_code/sql/số liệu tính theo log nên không được chạy song song). Bật bằng app_settings `argon_core_loop` = "1" (mọi nơi) hoặc "preview" (chỉ staging).
let flagMemo: { v: boolean; at: number } | null = null
export async function coreLoopOn(): Promise<boolean> {
  if (flagMemo && Date.now() - flagMemo.at < 30_000) return flagMemo.v
  let v = false
  try { const { data } = await (await import("@/lib/supabase")).supabaseAdmin.from("app_settings").select("value").eq("key", "argon_core_loop").maybeSingle(); v = flagValueOn(data?.value) } catch { /* mặc định tắt */ }
  flagMemo = { v, at: Date.now() }
  return v
}

async function runSegmentCore(i: SegmentIn): Promise<SegmentOut> {
  const ac = new AbortController()
  const onAbort = () => ac.abort()
  i.signal?.addEventListener("abort", onAbort)
  const timer = setTimeout(() => ac.abort(new Error("segment-timeout")), i.segmentMs)
  const out: SegmentOut = { added: "", tokensIn: 0, tokensOut: 0, cachedIn: 0, status: "done", error: null }
  const contents: Content[] = [...i.ctx.contents]
  const P = prepare(i)
  const evTrace = createRunTrace("argon")
  let lastProgress = Date.now()
  let asked: ToolLogEntry | null = null
  let queue: Promise<unknown> = Promise.resolve()
  const toolsOn = () => !!i.tools && P.decls.length > 0 && i.tools.log.length < P.maxCalls

  const execOne = async (fc: { name?: string; args?: Record<string, unknown> }) => {
    const fname = String(fc.name), fargs = (fc.args ?? {}) as Record<string, unknown>
    const dataCalls = i.tools!.log.filter(t => P.isData(t.name)).length
    const entry = await P.dispatch(fname, fargs, dataCalls)
    const n = i.tools!.log.push(entry)   // số bước lấy ngay lúc push (công cụ đọc chạy song song nên không dùng log.length sau await)
    await i.tools!.onTool(entry)
    if (fname === ASK_TOOL_NAME && entry.ok) asked = entry
    return { functionResponse: { name: fname, response: entry.ok ? { buoc: n, ketQua: entry.result } : { buoc: n, loi: entry.result } } }
  }
  const inflight = new Set<Promise<unknown>>()   // công cụ đọc đang chạy song song: công cụ GHI phải chờ chúng xong để thấy đúng trạng thái "nhiễm" (đọc nội dung ngoài)
  const runTool = (fc: { name?: string; args?: Record<string, unknown> }) => {
    if (PARALLEL_SAFE.has(String(fc.name))) { const p = execOne(fc); inflight.add(p); const rm = () => { inflight.delete(p) }; p.then(rm, rm); return p }   // công cụ đọc: không xếp hàng
    const p = queue.then(async () => { await Promise.allSettled([...inflight]); return execOne(fc) }); queue = p.catch(() => undefined); return p
  }

  try {
    const loop = await runAgentLoop({
      model: i.model ?? GEMINI_MODEL_ARGON, contents, maxRounds: P.maxCalls + 2, signal: ac.signal, trace: evTrace,
      configFor: () => ({
        systemInstruction: i.ctx.systemInstruction, thinkingConfig: { thinkingLevel: LEVELS[i.thinking] ?? LEVELS.medium }, maxOutputTokens: i.maxOut, abortSignal: ac.signal,
        ...(toolsOn() ? { tools: [{ functionDeclarations: P.decls }] } : {}),
      }),
      runTool,
      stopWhen: () => !!asked,   // Argon vừa hỏi Hiếu (hoiHieu) → kết thúc lượt NGAY, hiện câu hỏi trong chat
      onChunk: text => {
        out.added += text; i.onDelta(text)
        if (i.onProgress && Date.now() - lastProgress > 4000) { lastProgress = Date.now(); i.onProgress() }
      },
      onRound: r => { out.tokensIn += r.tin; out.tokensOut += r.tout },
    })
    out.cachedIn = loop.cachedIn
    if (asked) { const blk = askBlock((asked as ToolLogEntry).args); if (blk) { out.added += blk; i.onDelta(blk) } return out }
    if (loop.stopped) { out.status = String(ac.signal.reason?.message ?? "").includes("segment-timeout") ? "partial" : "stopped"; return out }
    const finish = loop.last.finishReason ?? ""
    if (/MAX_TOKENS/i.test(finish)) out.status = "partial"
    else if (finish && !/STOP/i.test(finish)) { out.status = "error"; out.error = `Model dừng với lý do ${finish}` }
    return out
  } catch (e) {
    const timedOut = String(ac.signal.reason?.message ?? "").includes("segment-timeout")
    if (timedOut) out.status = "partial"
    else if (i.signal?.aborted) out.status = "stopped"
    else { out.status = "error"; out.error = (e as Error)?.message?.slice(0, 500) ?? "Lỗi không rõ" }
    return out
  } finally {
    await evTrace.flush()
    clearTimeout(timer)
    i.signal?.removeEventListener("abort", onAbort)
  }
}

export async function runSegment(i: SegmentIn): Promise<SegmentOut> {
  return (await coreLoopOn()) ? runSegmentCore(i) : runSegmentLegacy(i)
}
