import { turso } from "./index-db"
import { entityKey, matchEntity, mergeAliases, type EntityIn, type EntityKind, type EntityRow, type RelationIn } from "./graph-pure"

export * from "./graph-pure"

// Graph nhẹ của Kho nằm ở Turso riêng `argon-hub` (cùng chỉ mục tìm kiếm) — KHÔNG đặt ở Supabase vì Hobby gần đầy 500MB.
// Thực thể do Argon tự trích lúc tóm tắt nguồn (source-digest). Mỗi nguồn ghi đè phần của nó (mention + quan hệ), thực thể dùng chung.
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS argon_entities (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL, aliases TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL, UNIQUE (username, kind, key))",
  "CREATE TABLE IF NOT EXISTS argon_mentions (entity_id INTEGER NOT NULL, source_id TEXT NOT NULL, source_name TEXT NOT NULL, source_date TEXT, snippet TEXT NOT NULL DEFAULT '', PRIMARY KEY (entity_id, source_id))",
  "CREATE INDEX IF NOT EXISTS argon_mentions_source ON argon_mentions (source_id)",
  "CREATE TABLE IF NOT EXISTS argon_edges (from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, rel TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY (from_id, to_id, rel, source_id))",
  "CREATE INDEX IF NOT EXISTS argon_edges_source ON argon_edges (source_id)",
]
let ready: Promise<void> | null = null
const ensure = () => (ready ??= turso(SCHEMA.map(sql => ({ sql }))).then(() => {}, e => { ready = null; throw e }))

const parseAliases = (v: unknown): string[] => { try { const a = JSON.parse(String(v ?? "[]")); return Array.isArray(a) ? a.map(String) : [] } catch { return [] } }
const toRow = (r: Record<string, string | number | null>): EntityRow => ({ id: Number(r.id), username: String(r.username), kind: String(r.kind) as EntityKind, key: String(r.key), name: String(r.name), aliases: parseAliases(r.aliases) })

async function loadEntities(username: string): Promise<EntityRow[]> {
  const [rows] = await turso([{ sql: "SELECT * FROM argon_entities WHERE username = ?", args: [username] }])
  return rows.map(toRow)
}

/** Ghi graph của 1 nguồn: xoá phần cũ của nguồn đó, gắn/tạo thực thể, ghi mention (kèm câu tóm tắt) và quan hệ. Lỗi do nơi gọi bọc try (không được làm hỏng việc tóm tắt nguồn). */
export async function saveSourceGraph(username: string, src: { id: string; name: string; date?: string }, entities: EntityIn[], relations: RelationIn[], snippet: string): Promise<{ entities: number; relations: number }> {
  await ensure()
  await turso([{ sql: "DELETE FROM argon_mentions WHERE source_id = ?", args: [src.id] }, { sql: "DELETE FROM argon_edges WHERE source_id = ?", args: [src.id] }])
  if (!entities.length) return { entities: 0, relations: 0 }
  const existing = await loadEntities(username)
  const now = new Date().toISOString()
  const idByName = new Map<string, number>()
  for (const e of entities) {
    let id = matchEntity(existing, e)
    if (id == null) {
      await turso([{ sql: "INSERT OR IGNORE INTO argon_entities (username, kind, key, name, aliases, updated_at) VALUES (?, ?, ?, ?, ?, ?)", args: [username, e.kind, entityKey(e.name), e.name, JSON.stringify(e.aliases), now] }])
      const [r] = await turso([{ sql: "SELECT * FROM argon_entities WHERE username = ? AND kind = ? AND key = ?", args: [username, e.kind, entityKey(e.name)] }])
      const row = toRow(r[0]); existing.push(row); id = row.id
    } else {
      const cur = existing.find(x => x.id === id)!
      const aliases = mergeAliases(cur.name, cur.aliases, [e.name, ...e.aliases].filter(n => entityKey(n) !== cur.key))
      if (aliases.length !== cur.aliases.length) { cur.aliases = aliases; await turso([{ sql: "UPDATE argon_entities SET aliases = ?, updated_at = ? WHERE id = ?", args: [JSON.stringify(aliases), now, id] }]) }
    }
    idByName.set(entityKey(e.name), id)
    await turso([{ sql: "INSERT OR REPLACE INTO argon_mentions (entity_id, source_id, source_name, source_date, snippet) VALUES (?, ?, ?, ?, ?)", args: [id, src.id, src.name.slice(0, 160), src.date ?? null, snippet.slice(0, 200)] }])
  }
  let rels = 0
  for (const r of relations) {
    const a = idByName.get(entityKey(r.from)), b = idByName.get(entityKey(r.to))
    if (a == null || b == null) continue
    await turso([{ sql: "INSERT OR IGNORE INTO argon_edges (from_id, to_id, rel, source_id) VALUES (?, ?, ?, ?)", args: [a, b, r.rel, src.id] }]); rels++
  }
  return { entities: entities.length, relations: rels }
}

export interface EntityListItem { id: number; kind: EntityKind; name: string; aliases: string[]; mentions: number; lastDate: string | null }

export async function listEntities(username: string, limit = 300): Promise<EntityListItem[]> {
  await ensure()
  const [rows] = await turso([{ sql: "SELECT e.*, COUNT(m.source_id) AS n, MAX(m.source_date) AS last FROM argon_entities e LEFT JOIN argon_mentions m ON m.entity_id = e.id WHERE e.username = ? GROUP BY e.id HAVING n > 0 ORDER BY n DESC, e.name LIMIT ?", args: [username, limit] }])
  return rows.map(r => { const e = toRow(r); return { id: e.id, kind: e.kind, name: e.name, aliases: e.aliases, mentions: Number(r.n), lastDate: r.last == null ? null : String(r.last) } })
}

export interface EntityDetail {
  entity: EntityListItem
  mentions: { sourceId: string; sourceName: string; sourceDate: string | null; snippet: string }[]
  related: { id: number; kind: EntityKind; name: string; rels: string[]; shared: number }[]
}

/** Chi tiết 1 thực thể (theo id hoặc tên/bí danh): nó được nhắc ở nguồn nào (mới nhất trước) và liên quan tới thực thể nào (quan hệ rõ + cùng xuất hiện ở nhiều nguồn). */
export async function getEntity(username: string, ref: number | string): Promise<EntityDetail | null> {
  await ensure()
  const all = await loadEntities(username)
  const hit = typeof ref === "number" ? all.find(e => e.id === ref) : (() => {
    const k = entityKey(ref)
    return all.find(e => e.key === k) ?? all.find(e => e.aliases.some(a => entityKey(a) === k)) ?? (k.length >= 3 ? all.find(e => e.key.includes(k)) : undefined)
  })()
  if (!hit) return null
  const [men] = await turso([{ sql: "SELECT source_id, source_name, source_date, snippet FROM argon_mentions WHERE entity_id = ? ORDER BY COALESCE(source_date, '') DESC LIMIT 40", args: [hit.id] }])
  const [co] = await turso([{ sql: "SELECT m2.entity_id AS id, COUNT(*) AS shared FROM argon_mentions m1 JOIN argon_mentions m2 ON m1.source_id = m2.source_id AND m2.entity_id <> m1.entity_id WHERE m1.entity_id = ? GROUP BY m2.entity_id ORDER BY shared DESC LIMIT 12", args: [hit.id] }])
  const [edges] = await turso([{ sql: "SELECT from_id, to_id, rel FROM argon_edges WHERE from_id = ? OR to_id = ?", args: [hit.id, hit.id] }])
  const byId = new Map(all.map(e => [e.id, e]))
  const rel = new Map<number, { rels: Set<string>; shared: number }>()
  const slot = (id: number) => rel.get(id) ?? rel.set(id, { rels: new Set(), shared: 0 }).get(id)!
  for (const c of co) slot(Number(c.id)).shared = Number(c.shared)
  for (const e of edges) { const out = Number(e.from_id) === hit.id; slot(out ? Number(e.to_id) : Number(e.from_id)).rels.add(out ? String(e.rel) : `← ${e.rel}`) }
  const related = [...rel].filter(([id]) => byId.has(id)).map(([id, v]) => ({ id, kind: byId.get(id)!.kind, name: byId.get(id)!.name, rels: [...v.rels], shared: v.shared }))
    .sort((a, b) => b.rels.length - a.rels.length || b.shared - a.shared).slice(0, 10)
  return {
    entity: { id: hit.id, kind: hit.kind, name: hit.name, aliases: hit.aliases, mentions: men.length, lastDate: men.length ? String(men[0].source_date ?? "") || null : null },
    mentions: men.map(m => ({ sourceId: String(m.source_id), sourceName: String(m.source_name), sourceDate: m.source_date == null ? null : String(m.source_date), snippet: String(m.snippet ?? "") })),
    related,
  }
}

/** Dọn mention/quan hệ của nguồn đã xoá và thực thể không còn được nhắc ở đâu. */
export async function pruneGraph(validSourceIds: string[]): Promise<void> {
  await ensure()
  const valid = new Set(validSourceIds)
  const [ids] = await turso([{ sql: "SELECT DISTINCT source_id FROM argon_mentions" }])
  const gone = ids.map(r => String(r.source_id)).filter(id => !valid.has(id))
  for (let i = 0; i < gone.length; i += 50) {
    const part = gone.slice(i, i + 50), q = part.map(() => "?").join(",")
    await turso([{ sql: `DELETE FROM argon_mentions WHERE source_id IN (${q})`, args: part }, { sql: `DELETE FROM argon_edges WHERE source_id IN (${q})`, args: part }])
  }
  await turso([{ sql: "DELETE FROM argon_entities WHERE id NOT IN (SELECT DISTINCT entity_id FROM argon_mentions)" }])
}
