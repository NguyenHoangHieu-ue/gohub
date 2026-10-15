export interface Project { id: string; name: string; notes: string; instructions: string; updated_at: string }
export interface ProjectRow { id: string; name: string; updated_at: string; sources: number; tokens: number; hub?: boolean }
export interface Source {
  id: string; project_id: string; kind: "file" | "lark" | "mail" | "note"; name: string; mime: string | null; size_bytes: number | null
  send_binary: boolean; tokens: number; external_url: string | null; sync_mode: "snapshot" | "live" | null; synced_at: string | null
  enabled: boolean; pinned: boolean; version: number; meta: Record<string, unknown>; created_at: string; updated_at: string
}
export interface Run {
  id: string; prompt: string; answer: string; status: string; model: string | null; thinking: string | null; source_ids: string[]
  tokens_in: number; tokens_out: number; cached_in: number; cost_usd: number; duration_ms: number; segments: number; error: string | null; created_at: string
}

export interface MailRuleUi { id: string; name: string; folder: string; from?: string; keywords?: string; sinceDays: number; maxThreads: number; attachments: boolean }

export const CONTEXT_LIMIT = 1_000_000
export const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n))
export const fmtBytes = (n: number | null) => (n == null ? "" : n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
  return j as T
}
export const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
