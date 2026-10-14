import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getDbRole } from "@/lib/db-role"
import { supabaseAdmin } from "@/lib/supabase"

// Phòng Argon — CHỈ Creator (kho chứa tài liệu/mail riêng của Hiếu, không cấp cho người khác).
export const ARGON_BUCKET = "argon-room"
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** Trả username nếu là Creator, null nếu không. */
export async function requireArgonUser(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  if (!username) return null
  return (await getDbRole(username, session?.user?.role)) === "creator" ? username : null
}

export async function ensureArgonBucket() {
  const { data } = await supabaseAdmin.storage.getBucket(ARGON_BUCKET)
  if (!data) await supabaseAdmin.storage.createBucket(ARGON_BUCKET, { public: false, fileSizeLimit: MAX_UPLOAD_BYTES })
}

/** Dự án thuộc đúng người dùng? (Creator chỉ thấy dự án của chính mình) */
export async function ownProject(id: string, username: string) {
  const { data } = await supabaseAdmin.from("argon_projects").select("*").eq("id", id).eq("username", username).maybeSingle()
  return data as ArgonProject | null
}

export async function ownSource(id: string, username: string) {
  const { data } = await supabaseAdmin.from("argon_sources").select("*, argon_projects!inner(username)").eq("id", id).eq("argon_projects.username", username).maybeSingle()
  if (!data) return null
  const { argon_projects: _p, ...src } = data as Record<string, unknown>
  void _p
  return src as unknown as ArgonSource
}

export interface ArgonProject { id: string; username: string; name: string; notes: string; instructions: string; created_at: string; updated_at: string }
export interface ArgonSource {
  id: string; project_id: string; kind: "file" | "lark" | "mail" | "note"; name: string; mime: string | null; size_bytes: number | null
  storage_path: string | null; extracted_text: string | null; send_binary: boolean; tokens: number; content_hash: string | null
  external_url: string | null; external_id: string | null; sync_mode: "snapshot" | "live" | null; synced_at: string | null
  enabled: boolean; pinned: boolean; version: number; meta: Record<string, unknown>; created_at: string; updated_at: string
}
export interface ArgonRun {
  id: string; project_id: string; username: string; prompt: string; answer: string; status: string; model: string | null; thinking: string | null
  source_ids: string[]; tokens_in: number; tokens_out: number; cached_in: number; cost_usd: number; duration_ms: number; segments: number
  error: string | null; created_at: string; finished_at: string | null
}
