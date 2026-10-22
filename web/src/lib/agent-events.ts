import { argonIndexConfigured, turso } from "./argon/index-db"

// Sự kiện chạy của 3 trợ lý (Bé Gấu, Gấu Pro, Phòng Argon) cho "Bản đồ vận hành": chỉ TÊN bước + thời gian + thành công/lỗi, KHÔNG có nội dung câu hỏi/kết quả.
// Lưu ở Turso `argon-hub` (Supabase Hobby đã sát trần 500MB), giữ 3 ngày. Ghi theo lô, không chặn vòng lặp agent; lỗi ghi sự kiện không bao giờ làm hỏng lượt chạy.
export type AgentId = "be-gau" | "gau-pro" | "argon"
export type AgentEventKind = "start" | "model" | "tool-start" | "tool" | "end"
export interface AgentEvent { id?: number; at: number; agent: AgentId; run: string; kind: AgentEventKind; name?: string; ms?: number; ok?: boolean }
export const EVENT_TTL_MS = 3 * 24 * 3600_000
const FLUSH_MS = 1200

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS agent_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, agent TEXT NOT NULL, run TEXT NOT NULL, kind TEXT NOT NULL, name TEXT, ms INTEGER, ok INTEGER)",
  "CREATE INDEX IF NOT EXISTS agent_events_at ON agent_events (at)",
  "CREATE INDEX IF NOT EXISTS agent_events_run ON agent_events (run)",
]
let schemaReady: Promise<void> | null = null
const ensureSchema = () => (schemaReady ??= turso(SCHEMA.map(sql => ({ sql }))).then(() => {}, e => { schemaReady = null; throw e }))

async function insert(events: AgentEvent[]) {
  if (!events.length || !argonIndexConfigured()) return
  await ensureSchema()
  for (let i = 0; i < events.length; i += 40) {
    await turso(events.slice(i, i + 40).map(e => ({ sql: "INSERT INTO agent_events (at, agent, run, kind, name, ms, ok) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [e.at, e.agent, e.run, e.kind, e.name ?? null, e.ms ?? null, e.ok == null ? null : e.ok ? 1 : 0] })))
  }
}

export interface RunTrace { run: string; emit: (kind: AgentEventKind, name?: string, extra?: { ms?: number; ok?: boolean }) => void; flush: () => Promise<void> }

/** Bộ ghi sự kiện của MỘT lượt chạy. emit() không chờ; flush() đợi ghi nốt (gọi ở cuối lượt, nuốt lỗi). */
export function createRunTrace(agent: AgentId, run: string = crypto.randomUUID()): RunTrace {
  let buf: AgentEvent[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Promise<void> = Promise.resolve()
  const drain = () => {
    timer = null
    const batch = buf; buf = []
    if (batch.length) pending = pending.then(() => insert(batch)).catch(() => undefined)
  }
  return {
    run,
    emit(kind, name, extra) {
      if (!argonIndexConfigured()) return
      buf.push({ at: Date.now(), agent, run, kind, name, ms: extra?.ms, ok: extra?.ok })
      if (!timer) timer = setTimeout(drain, FLUSH_MS)
    },
    async flush() { if (timer) clearTimeout(timer); drain(); await pending },
  }
}

/** Sự kiện từ mốc `since` (ms epoch), tối đa `limit` dòng, cũ → mới. */
export async function readEvents(since: number, limit = 400): Promise<AgentEvent[]> {
  if (!argonIndexConfigured()) return []
  await ensureSchema()
  const rows = (await turso([{ sql: "SELECT id, at, agent, run, kind, name, ms, ok FROM agent_events WHERE at > ? ORDER BY at ASC, id ASC LIMIT ?", args: [since, limit] }]))[0]
  return rows.map(toEvent)
}

export async function readRun(run: string): Promise<AgentEvent[]> {
  if (!argonIndexConfigured()) return []
  await ensureSchema()
  return (await turso([{ sql: "SELECT id, at, agent, run, kind, name, ms, ok FROM agent_events WHERE run = ? ORDER BY at ASC, id ASC LIMIT 600", args: [run] }]))[0].map(toEvent)
}

/** Các lượt gần đây (mới nhất trước) kèm số tool, thời lượng, trạng thái — để chọn phát lại. */
export async function recentRuns(limit = 25): Promise<{ run: string; agent: AgentId; startedAt: number; endedAt: number | null; tools: number; errors: number }[]> {
  if (!argonIndexConfigured()) return []
  await ensureSchema()
  const rows = (await turso([{ sql: `SELECT run, agent, MIN(at) AS started, MAX(CASE WHEN kind = 'end' THEN at END) AS ended, SUM(CASE WHEN kind = 'tool' THEN 1 ELSE 0 END) AS tools, SUM(CASE WHEN kind = 'tool' AND ok = 0 THEN 1 ELSE 0 END) AS errors FROM agent_events GROUP BY run, agent ORDER BY started DESC LIMIT ?`, args: [limit] }]))[0]
  return rows.map(r => ({ run: String(r.run), agent: String(r.agent) as AgentId, startedAt: Number(r.started), endedAt: r.ended == null ? null : Number(r.ended), tools: Number(r.tools ?? 0), errors: Number(r.errors ?? 0) }))
}

export async function pruneEvents(now = Date.now()): Promise<void> {
  if (!argonIndexConfigured()) return
  await ensureSchema()
  await turso([{ sql: "DELETE FROM agent_events WHERE at < ?", args: [now - EVENT_TTL_MS] }])
}

function toEvent(r: Record<string, string | number | null>): AgentEvent {
  return { id: Number(r.id), at: Number(r.at), agent: String(r.agent) as AgentId, run: String(r.run), kind: String(r.kind) as AgentEventKind, name: r.name == null ? undefined : String(r.name), ms: r.ms == null ? undefined : Number(r.ms), ok: r.ok == null ? undefined : Number(r.ok) === 1 }
}
