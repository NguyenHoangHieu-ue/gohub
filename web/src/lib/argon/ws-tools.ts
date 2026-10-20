import { Type, type FunctionDeclaration } from "@google/genai"
import { canArgonWrite, cleanPath } from "./missions"
import { listFiles, missionById, readFile, readFileBuffer, writeBinaryFile, writeFile } from "./missions-db"
import type { ToolLogEntry } from "./tools"
import { SQL_TOOL_NAME, execSql } from "./sql-tool"
import { RUN_CODE_NAME, execRunCode } from "./code-tool"
import { ASK_TOOL_NAME, execAsk, setPendingAsk } from "./ask-tool"

// Công cụ workspace của Sứ mệnh: Argon đọc/ghi file TRONG workspace của đúng sứ mệnh đang chạy (không chạm file hay dữ liệu nơi khác).
// Quyền ghi theo pha (canArgonWrite): làm rõ chỉ brief.md; kế hoạch thêm notes/; chạy ghi mọi nơi; tạm dừng/xong không ghi.
export const WS_TOOL_NAMES = ["docFile", "ghiFile", "lietKeFile"] as const
export const MISSION_TOOL_NAMES: readonly string[] = [...WS_TOOL_NAMES, SQL_TOOL_NAME, RUN_CODE_NAME, ASK_TOOL_NAME]
export const MAX_WS_READ_CHARS = 60_000
const LOG_CONTENT_CHARS = 1_500

export const WS_TOOLS: FunctionDeclaration[] = [
  {
    name: "lietKeFile",
    description: "Liệt kê file trong workspace của sứ mệnh (đường dẫn, kích thước, ai ghi). Dùng trước khi đọc hoặc ghi để biết đã có gì.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "docFile",
    description: "Đọc nội dung 1 file chữ trong workspace của sứ mệnh (vd brief.md, decisions.md, notes/x.md, data/x.csv).",
    parameters: { type: Type.OBJECT, properties: { path: { type: Type.STRING, description: 'Đường dẫn, vd "notes/so-sanh.md"' } }, required: ["path"] },
  },
  {
    name: "ghiFile",
    description: "Tạo hoặc ghi file chữ trong workspace của sứ mệnh. File gốc: brief.md, decisions.md; hoặc trong data/, scripts/, reports/, notes/. Ghi đè toàn bộ trừ khi append=true (nối thêm vào cuối, hợp với decisions.md). Ghi quyết định đã chốt vào decisions.md với ngày và lý do. Quyền ghi phụ thuộc pha của sứ mệnh.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "Đường dẫn file" },
        content: { type: Type.STRING, description: "Nội dung chữ (tối đa 1MB)" },
        append: { type: Type.BOOLEAN, description: "true = nối vào cuối file có sẵn thay vì ghi đè" },
      },
      required: ["path", "content"],
    },
  },
]

/** Chạy 1 lần gọi công cụ workspace; không bao giờ ném lỗi (lỗi trả về dạng chữ cho model đọc). Nội dung ghi bị rút gọn trong nhật ký. */
export async function execWsTool(name: string, args: Record<string, unknown>, missionId: string): Promise<ToolLogEntry> {
  const at = new Date().toISOString()
  const logArgs = typeof args.content === "string" && args.content.length > LOG_CONTENT_CHARS ? { ...args, content: `${args.content.slice(0, LOG_CONTENT_CHARS)}…(${args.content.length} ký tự)` } : args
  const done = (ok: boolean, result: string): ToolLogEntry => ({ name, args: logArgs, ok, chars: result.length, result, at })
  try {
    const mission = await missionById(missionId)
    if (!mission) return done(false, "Sứ mệnh không còn tồn tại")
    if (name === "lietKeFile") {
      const files = await listFiles(missionId)
      return done(true, files.length ? files.map(f => `${f.path} · ${f.size_bytes} byte · ${f.author === "argon" ? "Argon" : "Hiếu"} ghi · ${f.updated_at.slice(0, 16)}`).join("\n") : "(workspace trống)")
    }
    const path = String(args.path ?? "")
    if (name === "docFile") {
      const f = await readFile(missionId, path)
      if (!f) return done(false, `Không có file "${path}" (hoặc đường dẫn không hợp lệ). Gọi lietKeFile để xem file hiện có.`)
      if (f.content == null) return done(false, `"${f.path}" là file nhị phân (${f.size_bytes} byte), không đọc được dạng chữ`)
      const c = f.content
      return done(true, c.length > MAX_WS_READ_CHARS ? `${c.slice(0, MAX_WS_READ_CHARS)}\n…(đã cắt ${c.length - MAX_WS_READ_CHARS} ký tự)` : c)
    }
    if (name === "ghiFile") {
      if (typeof args.content !== "string") return done(false, "Thiếu content (chữ)")
      const clean = cleanPath(path)
      if (!clean) return done(false, "Đường dẫn không hợp lệ (chỉ file gốc hoặc trong data/, scripts/, reports/, notes/; tối đa 5 cấp)")
      if (!canArgonWrite(mission.phase, clean)) {
        const hint = mission.phase === "clarify" ? "Pha làm rõ chỉ được ghi brief.md" : mission.phase === "plan" ? "Pha kế hoạch chỉ được ghi brief.md và notes/" : `Sứ mệnh đang ở pha "${mission.phase}", Argon không được ghi`
        return done(false, `Không được ghi "${clean}". ${hint}.`)
      }
      let content = args.content
      if (args.append === true) { const cur = await readFile(missionId, clean); if (cur?.content) content = `${cur.content.replace(/\s+$/, "")}\n${content}\n` }
      const r = await writeFile(missionId, clean, content, "argon")
      return r.error ? done(false, r.error) : done(true, `Đã ghi ${r.file!.path} (phiên bản ${r.file!.version}, ${r.file!.size_bytes} byte)`)
    }
    return done(false, `Công cụ không có: ${name}`)
  } catch (e) {
    return done(false, `Lỗi workspace: ${(e as Error).message}`)
  }
}

/** Công cụ `sql` của sứ mệnh: chỉ đọc gohub_dw; saveAs lưu CSV vào workspace theo quyền ghi của pha hiện tại. */
export async function execMissionSql(args: Record<string, unknown>, missionId: string, callsSoFar: number): Promise<ToolLogEntry> {
  const at = new Date().toISOString()
  try {
    const mission = await missionById(missionId)
    if (!mission) return { name: SQL_TOOL_NAME, args, ok: false, chars: 0, result: "Sứ mệnh không còn tồn tại", at }
    const { getAnalyticsPool } = await import("@/lib/analytics-db")
    if (!process.env.ANALYTICS_DB_PASSWORD) return { name: SQL_TOOL_NAME, args, ok: false, chars: 0, result: "Chưa cấu hình kết nối gohub_dw (ANALYTICS_DB_PASSWORD)", at }
    return await execSql(args, { missionId, phase: mission.phase, callsSoFar }, {
      pool: () => getAnalyticsPool() as never,
      write: async (id, path, content) => { const r = await writeFile(id, path, content, "argon"); return r.error ? { error: r.error } : {} },
    })
  } catch (e) {
    return { name: SQL_TOOL_NAME, args, ok: false, chars: 0, result: `Lỗi sql: ${(e as Error).message}`, at }
  }
}

/** Công cụ `run_code` của sứ mệnh: Python trong Vercel Sandbox, chỉ ở pha chạy; đọc/ghi file qua workspace của đúng sứ mệnh này. */
export async function execMissionCode(args: Record<string, unknown>, missionId: string, callsSoFar: number): Promise<ToolLogEntry> {
  try {
    const mission = await missionById(missionId)
    if (!mission) return { name: RUN_CODE_NAME, args, ok: false, chars: 0, result: "Sứ mệnh không còn tồn tại", at: new Date().toISOString() }
    const sb = await import("./sandbox")
    const backend = await sb.realBackend()
    return await execRunCode(args, { phase: mission.phase, callsSoFar }, {
      readInput: async p => { const f = await readFileBuffer(missionId, p); return f ? { path: p, content: f.data } : null },
      saveText: async (path, content) => { const r = await writeFile(missionId, path, content, "argon"); return r.error ? { error: r.error } : {} },
      saveBinary: async (path, data) => { const r = await writeBinaryFile(missionId, path, data, "argon"); return r.error ? { error: r.error } : {} },
      usage: sb.getUsage,
      addUsage: async ms => { await sb.addUsage(ms) },
      quota: used => sb.quotaState(used),
      run: (code, files) => sb.runPython(backend, code, files),
    })
  } catch (e) {
    return { name: RUN_CODE_NAME, args, ok: false, chars: 0, result: `Lỗi run_code: ${(e as Error).message}`, at: new Date().toISOString() }
  }
}

/** Công cụ `hoiHieu`: lưu câu hỏi chờ trả lời + nhắn Lark cho Hiếu (chỉ nhắn chính Hiếu). */
export async function execMissionAsk(args: Record<string, unknown>, missionId: string, origin: string): Promise<ToolLogEntry> {
  try {
    const mission = await missionById(missionId)
    if (!mission) return { name: ASK_TOOL_NAME, args, ok: false, chars: 0, result: "Sứ mệnh không còn tồn tại", at: new Date().toISOString() }
    const { getCreatorLarkOpenId, sendLarkDM } = await import("@/lib/lark")
    return await execAsk(args, { missionId, missionName: mission.name, phase: mission.phase, origin }, {
      save: setPendingAsk,
      notify: async text => { const id = await getCreatorLarkOpenId(); if (id) await sendLarkDM(id, text) },
    })
  } catch (e) {
    return { name: ASK_TOOL_NAME, args, ok: false, chars: 0, result: `Lỗi hoiHieu: ${(e as Error).message}`, at: new Date().toISOString() }
  }
}
