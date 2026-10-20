import { Type, type FunctionDeclaration } from "@google/genai"
import { canArgonWrite, cleanPath } from "./missions"
import { listFiles, missionById, readFile, writeFile } from "./missions-db"
import type { ToolLogEntry } from "./tools"

// Công cụ workspace của Sứ mệnh: Argon đọc/ghi file TRONG workspace của đúng sứ mệnh đang chạy (không chạm file hay dữ liệu nơi khác).
// Quyền ghi theo pha (canArgonWrite): làm rõ chỉ brief.md; kế hoạch thêm notes/; chạy ghi mọi nơi; tạm dừng/xong không ghi.
export const WS_TOOL_NAMES = ["docFile", "ghiFile", "lietKeFile"] as const
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
