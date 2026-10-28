// Client Turso của Rollup. DB riêng `intel-rollup` (ROLLUP_TURSO_URL/ROLLUP_TURSO_AUTH_TOKEN); nếu chưa tạo thì dùng tạm DB config (TURSO_URL) — bảng có tiền tố ru_/dm_ nên không đụng bảng khác.
// Ghi theo GIAO DỊCH bằng request "batch" của Hrana: COMMIT chỉ chạy khi mọi bước trước thành công, ngược lại ROLLBACK (pipeline thường vẫn chạy tiếp sau lỗi nên không đủ an toàn).
type Arg = string | number | null
export interface Stmt { sql: string; args?: Arg[] }
export type Row = Record<string, string | number | null>

const toArg = (v: Arg) => (v === null ? { type: "null" } : typeof v === "number" ? (Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v }) : { type: "text", value: String(v) })

function cfg(): { url: string; token: string; dedicated: boolean } {
  const dedicated = !!(process.env.ROLLUP_TURSO_URL && process.env.ROLLUP_TURSO_AUTH_TOKEN)
  const url = (dedicated ? process.env.ROLLUP_TURSO_URL : process.env.TURSO_URL) || ""
  const token = (dedicated ? process.env.ROLLUP_TURSO_AUTH_TOKEN : process.env.TURSO_AUTH_TOKEN) || ""
  return { url: url.replace(/^libsql:\/\//, "https://"), token, dedicated }
}
export const rollupConfigured = () => { const c = cfg(); return !!(c.url && c.token) }
export const rollupDedicated = () => cfg().dedicated

async function post(requests: unknown[]): Promise<{ results: { type: string; response?: any; error?: unknown }[] }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { url, token } = cfg()
  if (!url || !token) throw new Error("Thiếu ROLLUP_TURSO_* hoặc TURSO_URL / TURSO_AUTH_TOKEN")
  const res = await fetch(`${url}/v2/pipeline`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requests: [...requests, { type: "close" }] }) })
  if (!res.ok) throw new Error(`Turso ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

const rowsOf = (result: { cols: { name: string }[]; rows: { type?: string; value?: string | number | null }[][] }): Row[] =>
  result.rows.map(r => Object.fromEntries(result.cols.map((c, j) => [c.name, r[j]?.type === "integer" && r[j].value != null ? Number(r[j].value) : r[j]?.type === "float" && r[j].value != null ? Number(r[j].value) : (r[j]?.value ?? null)])))

/** Chạy một câu đọc/ghi lẻ; trả rows. */
export async function rq(sql: string, args: Arg[] = []): Promise<Row[]> {
  const body = await post([{ type: "execute", stmt: { sql, args: args.map(toArg) } }])
  const r = body.results[0]
  if (r?.type !== "ok") throw new Error(`Turso lỗi: ${JSON.stringify(r?.error ?? r).slice(0, 300)}`)
  return rowsOf(r.response.result)
}

/** Nhiều câu độc lập (không giao dịch), trả rows từng câu. Dùng cho đọc hoặc DDL idempotent. */
export async function rqMany(stmts: Stmt[]): Promise<Row[][]> {
  const body = await post(stmts.map(s => ({ type: "execute", stmt: { sql: s.sql, args: (s.args ?? []).map(toArg) } })))
  return stmts.map((_, i) => {
    const r = body.results[i]
    if (r?.type !== "ok") throw new Error(`Turso lỗi ở câu ${i}: ${JSON.stringify(r?.error ?? r).slice(0, 300)}`)
    return rowsOf(r.response.result)
  })
}

/** Giao dịch: BEGIN → các câu → COMMIT, chỉ khi cả chuỗi thành công; lỗi thì ROLLBACK và ném lỗi. */
export async function rtx(stmts: Stmt[]): Promise<void> {
  const steps: unknown[] = [{ stmt: { sql: "BEGIN" } }]
  stmts.forEach((s, i) => steps.push({ stmt: { sql: s.sql, args: (s.args ?? []).map(toArg) }, condition: { type: "ok", step: i } }))
  const last = stmts.length
  steps.push({ stmt: { sql: "COMMIT" }, condition: { type: "ok", step: last } })
  steps.push({ stmt: { sql: "ROLLBACK" }, condition: { type: "not", cond: { type: "ok", step: last + 1 } } })
  const body = await post([{ type: "batch", batch: { steps } }])
  const r = body.results[0]
  if (r?.type !== "ok") throw new Error(`Turso lỗi (giao dịch): ${JSON.stringify(r?.error ?? r).slice(0, 300)}`)
  const errs = (r.response.result.step_errors ?? []) as ({ message?: string } | null)[]
  const results = (r.response.result.step_results ?? []) as (unknown | null)[]
  const commit = last + 1
  if (!results[commit] || errs[commit]) {
    const bad = errs.findIndex(e => !!e)
    throw new Error(`Giao dịch Turso thất bại ở bước ${bad}: ${errs[bad]?.message ?? "không rõ"}`.slice(0, 300))
  }
}
