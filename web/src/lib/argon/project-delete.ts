import { supabaseAdmin } from "@/lib/supabase"
import { ARGON_BUCKET } from "./server"
import { deleteRules } from "./mail-sync"
import { deleteThreadRules } from "./threads"
import { deleteAutorun } from "./autorun"
import { deleteBg, deleteToolLog } from "./bg"

/** Xoá dự án và mọi thứ gắn với nó (file trong kho, quy tắc mail/thread, tự chạy đêm, việc nền, nhật ký công cụ). Dùng cho dự án thường và dự án nền của sứ mệnh. */
export async function deleteProjectCascade(projectId: string): Promise<{ error?: string }> {
  const { data: files } = await supabaseAdmin.from("argon_sources").select("id,storage_path").eq("project_id", projectId)
  const ids = (files ?? []).map(f => f.id)
  const { data: vers } = ids.length ? await supabaseAdmin.from("argon_source_versions").select("storage_path").in("source_id", ids) : { data: [] as { storage_path: string | null }[] }
  const paths = [...(files ?? []).map(f => f.storage_path), ...(vers ?? []).map(v => v.storage_path)].filter((p): p is string => !!p)
  if (paths.length) await supabaseAdmin.storage.from(ARGON_BUCKET).remove(Array.from(new Set(paths)))
  await Promise.all([deleteRules(projectId), deleteThreadRules(projectId), deleteAutorun(projectId)])
  const { data: runRows } = await supabaseAdmin.from("argon_runs").select("id").eq("project_id", projectId)
  await Promise.all((runRows ?? []).flatMap(r => [deleteBg(r.id), deleteToolLog(r.id)]))
  const { error } = await supabaseAdmin.from("argon_projects").delete().eq("id", projectId)
  return error ? { error: error.message } : {}
}
