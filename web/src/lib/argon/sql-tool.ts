import { Type, type FunctionDeclaration } from "@google/genai"
import { canArgonWrite, cleanPath, MAX_TEXT_FILE_BYTES, type MissionPhase } from "./missions"
import { validateSql } from "./sql-guard"
import type { ToolLogEntry } from "./tools"

// Công cụ `sql` của Argon: truy vấn CHỈ ĐỌC gohub_dw. Ba lớp chặn: validateSql (1 câu SELECT/WITH) → transaction READ ONLY + statement_timeout → tài khoản DB chỉ đọc.
// gohub_dw dùng chung với các tab (pool max=3/instance, gần như tuần tự) nên: trần 5.000 dòng, 20 giây, mỗi lượt tối đa 25 câu.
export const SQL_TOOL_NAME = "sql"
export const MAX_SQL_ROWS = 5_000
export const SQL_TIMEOUT_MS = 20_000
export const MAX_SQL_CALLS_PER_RUN = 25
const PREVIEW_ROWS = 25
const CELL_CHARS = 80

export const SQL_TOOL: FunctionDeclaration = {
  name: SQL_TOOL_NAME,
  description: `Truy vấn CHỈ ĐỌC dữ liệu GoHub (PostgreSQL gohub_dw). Một câu SELECT hoặc WITH…SELECT, tối đa ${MAX_SQL_ROWS} dòng và ${SQL_TIMEOUT_MS / 1000} giây. ` +
    `Trả về tên cột, số dòng và ${PREVIEW_ROWS} dòng đầu. Muốn xử lý tiếp bằng code, đặt saveAs (vd "data/doanh_thu_vendor.csv") để lưu TOÀN BỘ kết quả thành CSV trong workspace. ` +
    `Không dùng SELECT *: chọn cột cần, lọc ngày, GROUP BY phía SQL cho nhẹ.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "Một câu SELECT/WITH, không dấu ; giữa chừng" },
      saveAs: { type: Type.STRING, description: 'Tuỳ chọn: đường dẫn CSV trong workspace, phải nằm trong data/ (vd "data/rev.csv")' },
    },
    required: ["query"],
  },
}

export interface SqlRunResult { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; types: number[] }
/** Chạy câu SQL đã kiểm. Tách riêng để test bằng pool giả. */
export async function runReadOnly(sql: string, pool: { connect: () => Promise<{ query: (q: unknown) => Promise<{ rows: Record<string, unknown>[]; fields?: { name: string; dataTypeID: number }[] }>; release: () => void }> }): Promise<SqlRunResult> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN READ ONLY")
    await client.query(`SET LOCAL statement_timeout = ${SQL_TIMEOUT_MS}`)
    const r = await client.query(`SELECT * FROM (${sql}) AS _argon LIMIT ${MAX_SQL_ROWS + 1}`)
    await client.query("ROLLBACK")
    const truncated = r.rows.length > MAX_SQL_ROWS
    return { columns: (r.fields ?? []).map(f => f.name), types: (r.fields ?? []).map(f => f.dataTypeID), rows: truncated ? r.rows.slice(0, MAX_SQL_ROWS) : r.rows, truncated }
  } catch (e) {
    try { await client.query("ROLLBACK") } catch { /* kết nối có thể đã hỏng */ }
    throw e
  } finally { client.release() }
}

const DATE_OID = 1082
const pad = (n: number) => String(n).padStart(2, "0")
export function cellText(v: unknown, oid?: number): string {
  if (v == null) return ""
  // pg đọc kiểu date thành Date lúc 0h GIỜ ĐỊA PHƯƠNG: lấy thành phần địa phương, không dùng toISOString (lệch ngày theo múi giờ).
  if (v instanceof Date) return oid === DATE_OID ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : v.toISOString()
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}
const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
/** CSV (có BOM để Excel đọc đúng tiếng Việt). Cắt bớt dòng nếu vượt MAX_TEXT_FILE_BYTES; trả số dòng thực ghi. */
export function toCsv(columns: string[], rows: Record<string, unknown>[], types: number[] = []): { csv: string; rowsWritten: number } {
  const lines = [columns.map(csvCell).join(",")]
  let size = Buffer.byteLength(lines[0], "utf8") + 3, written = 0
  for (const r of rows) {
    const line = columns.map((c, i) => csvCell(cellText(r[c], types[i]))).join(",")
    size += Buffer.byteLength(line, "utf8") + 1
    if (size > MAX_TEXT_FILE_BYTES) break
    lines.push(line); written++
  }
  return { csv: `﻿${lines.join("\n")}\n`, rowsWritten: written }
}
export function previewTable(columns: string[], rows: Record<string, unknown>[], types: number[] = []): string {
  const cut = (s: string) => (s.length > CELL_CHARS ? `${s.slice(0, CELL_CHARS)}…` : s).replace(/\|/g, "/").replace(/\s+/g, " ")
  const head = `| ${columns.join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |`
  const body = rows.slice(0, PREVIEW_ROWS).map(r => `| ${columns.map((c, i) => cut(cellText(r[c], types[i]))).join(" | ")} |`).join("\n")
  return `${head}\n${body}`
}

/** Thực thi 1 lần gọi `sql`; không bao giờ ném lỗi (lỗi trả về dạng chữ cho model đọc/sửa câu). `deps` để test. */
export async function execSql(
  args: Record<string, unknown>,
  ctx: { missionId: string; phase: MissionPhase; callsSoFar: number },
  deps: { pool: () => Parameters<typeof runReadOnly>[1]; write: (missionId: string, path: string, content: string) => Promise<{ error?: string }> },
): Promise<ToolLogEntry> {
  const at = new Date().toISOString()
  const done = (ok: boolean, result: string): ToolLogEntry => ({ name: SQL_TOOL_NAME, args, ok, chars: result.length, result, at })
  if (ctx.callsSoFar >= MAX_SQL_CALLS_PER_RUN) return done(false, `Đã dùng hết ${MAX_SQL_CALLS_PER_RUN} câu SQL trong lượt này. Dùng dữ liệu đã lấy, hoặc gộp truy vấn.`)
  const v = validateSql(String(args.query ?? ""))
  if (!v.ok) return done(false, `SQL không hợp lệ: ${v.error}`)
  let savePath: string | null = null
  if (args.saveAs != null && String(args.saveAs).trim()) {
    savePath = cleanPath(String(args.saveAs))
    if (!savePath || !savePath.startsWith("data/") || !/\.csv$/i.test(savePath)) return done(false, 'saveAs phải là file .csv trong data/ (vd "data/rev.csv")')
    if (!canArgonWrite(ctx.phase, savePath)) return done(false, `Sứ mệnh đang ở pha "${ctx.phase}", chưa được lưu file vào ${savePath}. Có thể xem kết quả mà không lưu, hoặc chờ Hiếu Chốt.`)
  }
  let res: SqlRunResult
  try { res = await runReadOnly(v.sql, deps.pool()) } catch (e) {
    const m = String((e as Error).message ?? e)
    return done(false, /statement timeout|canceling statement/i.test(m) ? `Truy vấn quá ${SQL_TIMEOUT_MS / 1000} giây và bị huỷ. Thu hẹp khoảng ngày, bỏ JOIN thừa hoặc GROUP BY sớm hơn.` : `Lỗi SQL: ${m.slice(0, 400)}`)
  }
  const head = `${res.rows.length}${res.truncated ? "+" : ""} dòng · ${res.columns.length} cột (${res.columns.join(", ")})${res.truncated ? ` — bị cắt ở ${MAX_SQL_ROWS} dòng, hãy gom/lọc thêm` : ""}`
  let saved = ""
  if (savePath) {
    const { csv, rowsWritten } = toCsv(res.columns, res.rows, res.types)
    const w = await deps.write(ctx.missionId, savePath, csv)
    saved = w.error ? `\nKHÔNG lưu được ${savePath}: ${w.error}` : `\nĐã lưu ${savePath} (${rowsWritten}/${res.rows.length} dòng${rowsWritten < res.rows.length ? ", cắt vì quá 1MB" : ""}).`
  }
  return done(true, res.rows.length ? `${head}${saved}\n\n${previewTable(res.columns, res.rows, res.types)}${res.rows.length > PREVIEW_ROWS ? `\n(hiện ${PREVIEW_ROWS}/${res.rows.length} dòng)` : ""}` : `${head}${saved}\n(không có dòng nào)`)
}
