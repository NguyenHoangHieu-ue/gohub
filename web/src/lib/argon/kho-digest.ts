import { cleanFolderPath, ensureFolderPath, folderPathOf, listFolders, userProjectIds, type DigestMeta } from "./kho"
import { saveSourceFacts, type FactRow } from "./facts"
import { digestSource } from "./source-digest"
import type { ArgonSource } from "./server"

const db = async () => (await import("@/lib/supabase")).supabaseAdmin

export interface DigestResult { id: string; digest: DigestMeta; folder_id: string | null; facts: FactRow[] }

/** Tóm tắt 1 nguồn, (tuỳ chọn) tự xếp thư mục theo gợi ý, trích sự việc có hạn vào sổ. Lưu kết quả vào meta.digest / meta.tags. */
export async function digestAndFile(username: string, s: ArgonSource & { folder_id?: string | null }, folderPaths: string[], autoFile: boolean): Promise<DigestResult> {
  const { digest: d, facts } = await digestSource(s, folderPaths)
  let folderId = s.folder_id ?? null
  if (autoFile && !folderId && d.folder) {
    const segs = cleanFolderPath(d.folder)
    if (segs.length) { folderId = await ensureFolderPath(username, segs.join("/")); d.autoFiled = segs.join("/") }
  }
  const hasTags = Array.isArray(s.meta?.tags) && (s.meta.tags as unknown[]).length > 0
  const meta = { ...(s.meta ?? {}), digest: d, factsAt: d.at, ...(hasTags ? {} : { tags: d.tags ?? [] }) }
  await (await db()).from("argon_sources").update({ meta, folder_id: folderId }).eq("id", s.id)
  const saved = await saveSourceFacts(username, { id: s.id, name: s.name }, facts)
  return { id: s.id, digest: d, folder_id: folderId, facts: saved }
}

/** Việc đêm: tóm tắt + trích sự việc cho các nguồn chưa từng xử lý (mail/thread/file mới nạp), mới nhất trước, tối đa `max` nguồn hoặc tới `deadline`. */
export async function digestPending(username: string, max: number, deadline: number): Promise<{ done: number; errors: string[]; remaining: number }> {
  const pids = await userProjectIds(username)
  const out = { done: 0, errors: [] as string[], remaining: 0 }
  if (!pids.length) return out
  const sb = await db()
  const rows: ArgonSource[] = []
  for (let from = 0; from < 5000; from += 500) {
    const { data } = await sb.from("argon_sources").select("*").in("project_id", pids).eq("enabled", true).order("created_at", { ascending: false }).range(from, from + 499)
    rows.push(...((data ?? []) as ArgonSource[]))
    if ((data?.length ?? 0) < 500) break
  }
  const todo = rows.filter(s => !s.meta?.factsAt && ((s.extracted_text ?? "").trim() || s.send_binary))
  const folders = await listFolders(username)
  const paths = Array.from(new Set(folders.map(f => folderPathOf(f.id, folders)))).filter(Boolean)
  for (const s of todo) {
    if (out.done >= max || Date.now() > deadline) { out.remaining++; continue }
    try { await digestAndFile(username, s, paths, false); out.done++ } catch (e) { out.errors.push(`${s.name}: ${(e as Error).message}`.slice(0, 160)); await sb.from("argon_sources").update({ meta: { ...(s.meta ?? {}), factsAt: new Date().toISOString(), factsError: true } }).eq("id", s.id) }
  }
  return out
}
