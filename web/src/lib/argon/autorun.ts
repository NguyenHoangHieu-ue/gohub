import { supabaseAdmin } from "@/lib/supabase"
import { GEMINI_MODEL_ARGON } from "@/lib/ai-models"
import { LEVELS } from "./run-engine"
import { setBg, triggerWorker } from "./bg"

// "Tự chạy hằng đêm": mỗi dự án có thể có 1 yêu cầu cố định (vd "Bản tin mail") do cron argon-sync giao cho worker chạy nền sau khi đã nạp mail/thread mới.
// Kết quả nằm trong dự án + DM Lark cho Creator (worker lo). Lưu ở app_settings `argon_autorun:<projectId>` (không cần migration).
export interface Autorun { enabled: boolean; prompt: string; thinking: string; lastRunDate?: string; lastRunId?: string }

const key = (projectId: string) => `argon_autorun:${projectId}`
export const vnDate = (d = new Date()) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10)

export async function getAutorun(projectId: string): Promise<Autorun | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key(projectId)).maybeSingle()
  try { return data?.value ? (JSON.parse(data.value) as Autorun) : null } catch { return null }
}

export async function saveAutorun(projectId: string, a: Autorun) {
  const clean: Autorun = { enabled: !!a.enabled, prompt: String(a.prompt ?? "").trim().slice(0, 2000), thinking: LEVELS[a.thinking] ? a.thinking : "medium", lastRunDate: a.lastRunDate, lastRunId: a.lastRunId }
  const { error } = await supabaseAdmin.from("app_settings").upsert({ key: key(projectId), value: JSON.stringify(clean), category: "argon", label: "Tự chạy hằng đêm Phòng Argon", updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (error) throw new Error(error.message)
  return clean
}

export const deleteAutorun = async (projectId: string) => { await supabaseAdmin.from("app_settings").delete().eq("key", key(projectId)) }

export async function projectIdsWithAutorun(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("key,value").like("key", "argon_autorun:%")
  return (data ?? []).filter(r => { try { return JSON.parse(r.value ?? "{}").enabled } catch { return false } }).map(r => String(r.key).slice("argon_autorun:".length))
}

/** Tạo 1 lượt chạy nền theo yêu cầu cố định của dự án và giao worker. `force` bỏ qua giới hạn 1 lần/ngày. Trả runId, hoặc null nếu hôm nay đã chạy / chưa cấu hình / dự án không có nguồn. */
export async function startAutorun(projectId: string, origin: string, force = false): Promise<string | null> {
  const a = await getAutorun(projectId)
  if (!a?.prompt.trim() || (!force && (!a.enabled || a.lastRunDate === vnDate()))) return null
  const { data: proj } = await supabaseAdmin.from("argon_projects").select("username").eq("id", projectId).maybeSingle()
  if (!proj) return null
  const { data: enabled } = await supabaseAdmin.from("argon_sources").select("id").eq("project_id", projectId).eq("enabled", true)
  if (!enabled?.length) return null
  const { data, error } = await supabaseAdmin.from("argon_runs").insert({
    project_id: projectId, username: proj.username, prompt: a.prompt, status: "queued", model: GEMINI_MODEL_ARGON, thinking: a.thinking, source_ids: enabled.map(s => s.id as string),
  }).select("id").single()
  if (error || !data) throw new Error(error?.message ?? "Không tạo được lượt chạy")
  const now = new Date().toISOString()
  await setBg(data.id, { username: proj.username, projectId, allowTools: false, thinking: a.thinking, startedAt: now, heartbeat: now })
  await saveAutorun(projectId, { ...a, lastRunDate: vnDate(), lastRunId: data.id })
  await triggerWorker(origin, data.id)
  return data.id
}
