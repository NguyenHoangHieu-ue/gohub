import { chunkText } from "./chunker"

// (supabase/embedding nạp muộn để hàm thuần test được không cần env)
const sb = async () => (await import("@/lib/supabase")).supabaseAdmin
const embedKb = async (t: string[]) => (await import("@/lib/agents/creator/kb-recall")).embedKb(t)

// Chỉ mục tìm kiếm của Phòng Argon: đoạn chữ + vector 768 chiều nằm ở Turso RIÊNG (ARGON_TURSO_URL/ARGON_TURSO_AUTH_TOKEN),
// vì Supabase Hobby giới hạn DB 500MB (đã chạm trần). File gốc ở Supabase Storage, metadata nguồn ở Supabase.
// Tự lập chỉ mục khi cần (ensureIndexed trước mỗi lần tìm; cron argon-sync quét nốt): so `argon_index.src_updated_at` với `argon_sources.updated_at`.
const EMBED_BATCH = 64
const INSERT_BATCH = 40
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS argon_chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, idx INTEGER NOT NULL, text TEXT NOT NULL, embedding F32_BLOB(768))",
  "CREATE INDEX IF NOT EXISTS argon_chunks_source ON argon_chunks (source_id)",
  "CREATE TABLE IF NOT EXISTS argon_index (source_id TEXT PRIMARY KEY, src_updated_at TEXT NOT NULL, chunk_count INTEGER NOT NULL, indexed_at TEXT NOT NULL)",
]

type Arg = string | number | null
const toArg = (v: Arg) => (v === null ? { type: "null" } : typeof v === "number" ? (Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v }) : { type: "text", value: String(v) })

export function argonIndexConfigured() { return !!(process.env.ARGON_TURSO_URL && process.env.ARGON_TURSO_AUTH_TOKEN) }

/** Chạy nhiều câu lệnh một request (batch tuần tự). Trả rows của câu cuối có kết quả. */
async function turso(stmts: { sql: string; args?: Arg[] }[]): Promise<Record<string, string | number | null>[][]> {
  const url = (process.env.ARGON_TURSO_URL || "").replace(/^libsql:\/\//, "https://")
  const token = process.env.ARGON_TURSO_AUTH_TOKEN || ""
  if (!url || !token) throw new Error("Thiếu ARGON_TURSO_URL / ARGON_TURSO_AUTH_TOKEN")
  const res = await fetch(`${url}/v2/pipeline`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ requests: [...stmts.map(s => ({ type: "execute", stmt: { sql: s.sql, args: (s.args ?? []).map(toArg) } })), { type: "close" }] }),
  })
  if (!res.ok) throw new Error(`Turso ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  return stmts.map((_, i) => {
    const r = body.results?.[i]
    if (r?.type !== "ok") throw new Error(`Turso lỗi: ${JSON.stringify(r?.error ?? r).slice(0, 300)}`)
    const cols: string[] = r.response.result.cols.map((c: { name: string }) => c.name)
    return r.response.result.rows.map((row: { value?: string | number | null }[]) => Object.fromEntries(cols.map((c, j) => {
      const cell = row[j] as { type?: string; value?: string | number | null }
      const v = cell?.value ?? null
      return [c, cell?.type === "integer" && v !== null ? Number(v) : v]
    })))
  })
}

let schemaReady: Promise<void> | null = null
export function ensureSchema(): Promise<void> {
  schemaReady ??= turso(SCHEMA.map(sql => ({ sql }))).then(() => {}, e => { schemaReady = null; throw e })
  return schemaReady
}

export const vecLiteral = (v: number[]) => `[${v.map(x => Number(x.toFixed(6))).join(",")}]`

/** Hợp nhất 2 danh sách xếp hạng (vector + từ khoá) bằng Reciprocal Rank Fusion. Thuần. */
export function rrfMerge<T extends { key: string }>(lists: T[][], k = 60): (T & { score: number })[] {
  const score = new Map<string, number>(), item = new Map<string, T>()
  for (const l of lists) l.forEach((x, rank) => { score.set(x.key, (score.get(x.key) ?? 0) + 1 / (k + rank + 1)); if (!item.has(x.key)) item.set(x.key, x) })
  return [...item.values()].map(x => ({ ...x, score: score.get(x.key)! })).sort((a, b) => b.score - a.score)
}

async function embedAll(texts: string[]): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const part = texts.slice(i, i + EMBED_BATCH)
    let vecs: number[][] = []
    for (let a = 0; a < 3; a++) {
      try { vecs = await embedKb(part); break } catch (e) { if (a === 2) throw e; await new Promise(r => setTimeout(r, 1500 * (a + 1))) }
    }
    if (vecs.length !== part.length) throw new Error("Embedding trả thiếu vector")
    out.push(...vecs)
  }
  return out
}

export interface IndexableSource { id: string; name: string; updated_at: string; extracted_text: string | null }

/** Lập (lại) chỉ mục cho 1 nguồn: xoá đoạn cũ, cắt đoạn, nhúng vector, ghi. Nguồn không có chữ → chỉ ghi dấu đã xử lý. */
export async function indexSource(s: IndexableSource): Promise<number> {
  await ensureSchema()
  const chunks = chunkText(s.extracted_text ?? "")
  const vecs = chunks.length ? await embedAll(chunks.map(c => `${s.name}\n${c.text}`)) : []
  await turso([{ sql: "DELETE FROM argon_chunks WHERE source_id = ?", args: [s.id] }])
  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const rows = chunks.slice(i, i + INSERT_BATCH)
    await turso(rows.map((c, j) => ({ sql: "INSERT INTO argon_chunks (source_id, idx, text, embedding) VALUES (?, ?, ?, vector32(?))", args: [s.id, c.idx, c.text, vecLiteral(vecs[i + j])] })))
  }
  await turso([{ sql: "INSERT INTO argon_index (source_id, src_updated_at, chunk_count, indexed_at) VALUES (?, ?, ?, ?) ON CONFLICT(source_id) DO UPDATE SET src_updated_at=excluded.src_updated_at, chunk_count=excluded.chunk_count, indexed_at=excluded.indexed_at", args: [s.id, s.updated_at, chunks.length, new Date().toISOString()] }])
  return chunks.length
}

/** Nguồn nào trong `rows` chưa có chỉ mục hoặc chỉ mục cũ hơn bản hiện tại. */
export async function staleSources<T extends { id: string; updated_at: string }>(rows: T[]): Promise<T[]> {
  if (!rows.length) return []
  await ensureSchema()
  const done = new Map<string, string>()
  for (let i = 0; i < rows.length; i += 400) {
    const part = rows.slice(i, i + 400)
    const r = (await turso([{ sql: `SELECT source_id, src_updated_at FROM argon_index WHERE source_id IN (${part.map(() => "?").join(",")})`, args: part.map(x => x.id) }]))[0]
    for (const x of r) done.set(String(x.source_id), String(x.src_updated_at))
  }
  return rows.filter(x => done.get(x.id) !== x.updated_at)
}

/** Lập chỉ mục các nguồn còn thiếu/cũ, dừng khi hết `deadlineMs` hoặc chạm `max` nguồn. Trả số đã làm và số còn chờ. */
export async function ensureIndexed(ids: string[], opt: { deadlineMs?: number; max?: number } = {}): Promise<{ indexed: number; pending: number; errors: string[] }> {
  const out = { indexed: 0, pending: 0, errors: [] as string[] }
  if (!ids.length || !argonIndexConfigured()) return out
  const rows: { id: string; updated_at: string }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await (await sb()).from("argon_sources").select("id,updated_at").in("id", ids.slice(i, i + 200))
    rows.push(...((data ?? []) as { id: string; updated_at: string }[]))
  }
  const stale = (await staleSources(rows)).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const until = Date.now() + (opt.deadlineMs ?? 20_000), max = opt.max ?? 40
  for (const st of stale) {
    if (out.indexed >= max || Date.now() > until) { out.pending++; continue }
    try {
      const { data } = await (await sb()).from("argon_sources").select("id,name,updated_at,extracted_text").eq("id", st.id).maybeSingle()
      if (data) { await indexSource(data as IndexableSource); out.indexed++ }
    } catch (e) { out.errors.push(`${st.id}: ${(e as Error).message}`.slice(0, 200)); out.pending++ }
  }
  return out
}

export interface ChunkHit { key: string; source_id: string; idx: number; text: string }

/** Tìm đoạn liên quan trong tập nguồn: vector (ý nghĩa) + từ khoá, hợp nhất bằng RRF. */
export async function searchChunks(sourceIds: string[], query: string, limit = 12): Promise<ChunkHit[]> {
  if (!sourceIds.length || !query.trim() || !argonIndexConfigured()) return []
  await ensureSchema()
  const q = query.trim().slice(0, 500)
  const ph = sourceIds.slice(0, 900).map(() => "?").join(",")
  const ids = sourceIds.slice(0, 900)
  const [qv] = await embedAll([q])
  const like = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`
  const [byVec, byKw] = await Promise.all([
    turso([{ sql: `SELECT source_id, idx, text FROM argon_chunks WHERE source_id IN (${ph}) ORDER BY vector_distance_cos(embedding, vector32(?)) LIMIT ?`, args: [...ids, vecLiteral(qv), limit * 2] }]),
    turso([{ sql: `SELECT source_id, idx, text FROM argon_chunks WHERE source_id IN (${ph}) AND text LIKE ? ESCAPE '\\' LIMIT ?`, args: [...ids, like, limit] }]),
  ])
  const map = (rows: Record<string, string | number | null>[]): ChunkHit[] => rows.map(r => ({ key: `${r.source_id}#${r.idx}`, source_id: String(r.source_id), idx: Number(r.idx), text: String(r.text) }))
  return rrfMerge([map(byVec[0]), map(byKw[0])]).slice(0, limit)
}

/** Xoá chỉ mục của nguồn không còn tồn tại ở Supabase. */
export async function pruneOrphans(): Promise<number> {
  if (!argonIndexConfigured()) return 0
  await ensureSchema()
  const idx = (await turso([{ sql: "SELECT source_id FROM argon_index" }]))[0].map(r => String(r.source_id))
  let gone = 0
  for (let i = 0; i < idx.length; i += 400) {
    const part = idx.slice(i, i + 400)
    const { data } = await (await sb()).from("argon_sources").select("id").in("id", part)
    const live = new Set((data ?? []).map(d => d.id as string))
    for (const id of part.filter(x => !live.has(x))) {
      await turso([{ sql: "DELETE FROM argon_chunks WHERE source_id = ?", args: [id] }, { sql: "DELETE FROM argon_index WHERE source_id = ?", args: [id] }])
      gone++
    }
  }
  return gone
}

export async function indexStats(): Promise<{ sources: number; chunks: number }> {
  if (!argonIndexConfigured()) return { sources: 0, chunks: 0 }
  await ensureSchema()
  const [a, b] = await turso([{ sql: "SELECT COUNT(*) AS n FROM argon_index" }, { sql: "SELECT COUNT(*) AS n FROM argon_chunks" }])
  return { sources: Number(a[0]?.n ?? 0), chunks: Number(b[0]?.n ?? 0) }
}
