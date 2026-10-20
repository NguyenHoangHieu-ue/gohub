import { Type, type FunctionDeclaration } from "@google/genai"
import { cleanPath, TOP_FOLDERS, MAX_TEXT_FILE_BYTES, type MissionPhase } from "./missions"
import type { CodeFile, RunResult } from "./sandbox"
import type { ToolLogEntry } from "./tools"

// Công cụ `run_code`: Argon viết Python, chạy trong Vercel Sandbox (mạng đóng), đọc file đầu vào từ workspace, ghi kết quả (xlsx, csv, html, ảnh…) về workspace.
// Chỉ ở pha "run" (sau khi Hiếu Chốt). Quy ước: script đọc file ở đường dẫn y như trong workspace (vd data/rev.csv) và ghi mọi thứ cần giữ vào thư mục out/.
export const RUN_CODE_NAME = "run_code"
export const MAX_RUN_CODE_CALLS = 12
export const MAX_INPUT_FILES = 20
export const MAX_INPUT_BYTES = 25 * 1024 * 1024
const STD_CAP = 6_000

export const RUN_CODE_TOOL: FunctionDeclaration = {
  name: RUN_CODE_NAME,
  description:
    "Chạy một đoạn Python (3.14, có sẵn pandas, numpy, openpyxl, xlsxwriter, matplotlib) trong sandbox CÔ LẬP, KHÔNG có mạng, tối đa ~2 phút. " +
    "inputs = danh sách file workspace cần dùng (vd data/rev.csv); script đọc chúng ở ĐÚNG đường dẫn đó (tương đối với thư mục chạy). " +
    "Ghi MỌI kết quả cần giữ vào thư mục out/ (vd out/so_sanh.xlsx, out/data/ket_qua.csv, out/bieu_do.png): file trong out/ tự lưu vào workspace (out/x → reports/x; out/data/x giữ nguyên data/x). " +
    "In kết quả quan trọng ra stdout để thấy ngay. Chỉ dùng được ở pha chạy (sau khi Hiếu Chốt).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      code: { type: Type.STRING, description: "Mã Python hoàn chỉnh (chạy như main.py)" },
      inputs: { type: Type.ARRAY, items: { type: Type.STRING }, description: "File workspace cần nạp vào sandbox, vd [\"data/rev7.csv\"]" },
    },
    required: ["code"],
  },
}

const TEXT_EXT = /\.(csv|md|txt|json|html?|py|sql|tsv)$/i
/** out/x.xlsx → reports/x.xlsx; out/data/x.csv → data/x.csv (giữ thư mục chuẩn). Trả null nếu đường dẫn không hợp lệ. */
export function mapOutputPath(rel: string): string | null {
  const r = String(rel).replace(/\\/g, "/").replace(/^\.?\/?out\//, "")
  const first = r.split("/")[0]
  const target = r.includes("/") && (TOP_FOLDERS as readonly string[]).includes(first) ? r : `reports/${r}`
  return cleanPath(target)
}
export const isTextOutput = (path: string, size: number) => TEXT_EXT.test(path) && size <= MAX_TEXT_FILE_BYTES

const cap = (s: string) => (s.length > STD_CAP ? `…(cắt đầu)\n${s.slice(-STD_CAP)}` : s)
const fmtKB = (n: number) => `${Math.max(1, Math.round(n / 1024))}KB`

export interface CodeDeps {
  readInput: (path: string) => Promise<CodeFile | null>
  saveText: (path: string, content: string) => Promise<{ error?: string }>
  saveBinary: (path: string, data: Buffer) => Promise<{ error?: string }>
  usage: () => Promise<{ cpuMs: number }>
  addUsage: (cpuMs: number) => Promise<void>
  quota: (usedMs: number) => { ok: boolean; message: string }
  run: (code: string, files: CodeFile[]) => Promise<RunResult>
}

/** Thực thi 1 lần `run_code`; không bao giờ ném lỗi (lỗi trả về dạng chữ cho model sửa code). */
export async function execRunCode(args: Record<string, unknown>, ctx: { phase: MissionPhase; callsSoFar: number }, deps: CodeDeps): Promise<ToolLogEntry> {
  const at = new Date().toISOString()
  const logArgs = typeof args.code === "string" && args.code.length > 1_500 ? { ...args, code: `${args.code.slice(0, 1_500)}…(${args.code.length} ký tự)` } : args
  const done = (ok: boolean, result: string): ToolLogEntry => ({ name: RUN_CODE_NAME, args: logArgs, ok, chars: result.length, result, at })
  if (ctx.phase !== "run") return done(false, `Chạy code chỉ dùng được ở pha chạy (sau khi Hiếu bấm Chốt). Sứ mệnh đang ở pha "${ctx.phase}".`)
  if (ctx.callsSoFar >= MAX_RUN_CODE_CALLS) return done(false, `Đã chạy code ${MAX_RUN_CODE_CALLS} lần trong lượt này. Gộp bước hoặc để lượt sau.`)
  const code = typeof args.code === "string" ? args.code : ""
  if (!code.trim()) return done(false, "Thiếu code")
  if (code.length > 60_000) return done(false, "Code quá dài (tối đa 60.000 ký tự)")
  const inputs = Array.isArray(args.inputs) ? args.inputs.map(String) : []
  if (inputs.length > MAX_INPUT_FILES) return done(false, `Tối đa ${MAX_INPUT_FILES} file đầu vào`)
  try {
    const q = deps.quota((await deps.usage()).cpuMs)
    if (!q.ok) return done(false, q.message)
    const files: CodeFile[] = []
    let bytes = 0
    for (const p of inputs) {
      const clean = cleanPath(p)
      const f = clean ? await deps.readInput(clean) : null
      if (!f || !clean) return done(false, `Không đọc được file đầu vào "${p}" (sai đường dẫn hoặc chưa có). Gọi lietKeFile để xem file hiện có.`)
      bytes += typeof f.content === "string" ? Buffer.byteLength(f.content) : f.content.length
      if (bytes > MAX_INPUT_BYTES) return done(false, `File đầu vào vượt ${MAX_INPUT_BYTES / 1024 / 1024}MB`)
      files.push({ path: clean, content: f.content })
    }
    const r = await deps.run(code, files)
    await deps.addUsage(r.cpuMs)
    const saved: string[] = [], failed: string[] = []
    for (const o of r.outputs) {
      const path = mapOutputPath(o.path)
      if (!path) { failed.push(`${o.path}: đường dẫn không hợp lệ`); continue }
      const text = isTextOutput(path, o.content.length)
      const w = text ? await deps.saveText(path, o.content.toString("utf8")) : await deps.saveBinary(path, o.content)
      if (w.error) failed.push(`${path}: ${w.error}`); else saved.push(`${path} (${fmtKB(o.content.length)})`)
    }
    const head = `${r.exitCode === 0 ? "Python chạy xong" : `Python LỖI (exit ${r.exitCode})`} · ${(r.cpuMs / 1000).toFixed(1)}s CPU`
    const out = [
      head,
      saved.length ? `Đã lưu vào workspace: ${saved.join(", ")}` : "Không có file nào trong out/ (nếu cần giữ kết quả, ghi vào out/).",
      ...(failed.length ? [`Không lưu được: ${failed.join("; ")}`] : []),
      ...r.skipped,
      r.stdout.trim() ? `--- stdout ---\n${cap(r.stdout.trim())}` : "",
      r.stderr.trim() ? `--- stderr ---\n${cap(r.stderr.trim())}` : "",
    ].filter(Boolean).join("\n")
    return done(r.exitCode === 0, out)
  } catch (e) {
    return done(false, e instanceof Error && e.name === "NoSnapshotError" ? e.message : `Lỗi Sandbox: ${(e as Error).message.slice(0, 500)}`)
  }
}
