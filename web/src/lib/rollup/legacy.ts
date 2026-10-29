import { rollupDedicated } from "./client"

// Dọn bảng ru_*/dm_* tạm còn ở DB config (TURSO_URL) từ lúc chưa có DB intel-rollup riêng. Chỉ chạy khi DB riêng đang dùng và khác DB config; mặc định chỉ LIỆT KÊ, xoá cần confirm.
async function pipe(sqls: string[]) {
  const url = (process.env.TURSO_URL || "").replace(/^libsql:\/\//, "https://")
  const res = await fetch(`${url}/v2/pipeline`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TURSO_AUTH_TOKEN}` }, body: JSON.stringify({ requests: [...sqls.map(sql => ({ type: "execute", stmt: { sql } })), { type: "close" }] }) })
  if (!res.ok) throw new Error(`Turso ${res.status}`)
  return (await res.json()).results as { type: string; response?: { result: { rows: { value: string }[][] } } }[]
}

export async function legacyTables(drop: boolean): Promise<{ tables: { name: string; rows: number }[]; dropped: number }> {
  if (!rollupDedicated() || !process.env.TURSO_URL || process.env.TURSO_URL === process.env.ROLLUP_TURSO_URL) throw new Error("Chỉ dọn khi DB intel-rollup riêng đang dùng và khác DB config")
  const names = (await pipe(["SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'ru!_%' ESCAPE '!' OR name LIKE 'dm!_%' ESCAPE '!')"]))[0].response!.result.rows.map(r => r[0].value).filter(n => /^(ru|dm)_[a-z_]+$/.test(n))
  const counts = names.length ? await pipe(names.map(n => `SELECT COUNT(*) FROM ${n}`)) : []
  const tables = names.map((name, i) => ({ name, rows: Number(counts[i].response?.result.rows[0][0].value ?? 0) }))
  let dropped = 0
  if (drop && names.length) dropped = (await pipe(names.map(n => `DROP TABLE ${n}`))).filter(r => r.type === "ok").length
  return { tables, dropped }
}
