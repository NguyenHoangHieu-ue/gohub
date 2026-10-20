import { supabaseAdmin } from "@/lib/supabase"
import { ARGON_BUCKET, ownSource, type ArgonSource } from "./server"
import { BRIEF_PATH, DECISIONS_PATH, briefTemplate, canTransition, checkWrite, cleanPath, decisionsTemplate, isProtectedPath, type MissionPhase, type WsFileRow } from "./missions"
import { deleteProjectCascade } from "./project-delete"

export interface ArgonMission {
  id: string; username: string; project_id: string; name: string; goal: string; phase: MissionPhase
  committed_at: string | null; archived: boolean; created_at: string; updated_at: string
}
export interface MissionRow extends ArgonMission { spent_usd: number; runs: number; files: number; sources: number }

export async function ownMission(id: string, username: string): Promise<ArgonMission | null> {
  const { data } = await supabaseAdmin.from("argon_missions").select("*").eq("id", id).eq("username", username).maybeSingle()
  return (data as ArgonMission | null) ?? null
}

/** Danh sách sứ mệnh (chưa lưu trữ trừ khi includeArchived), kèm chi tiêu/lượt chạy/file/nguồn — gom theo lô, không truy vấn từng dòng. */
export async function listMissions(username: string, includeArchived = false): Promise<MissionRow[]> {
  let q = supabaseAdmin.from("argon_missions").select("*").eq("username", username).order("updated_at", { ascending: false })
  if (!includeArchived) q = q.eq("archived", false)
  const { data } = await q
  const ms = (data ?? []) as ArgonMission[]
  if (!ms.length) return []
  const mids = ms.map(m => m.id), pids = ms.map(m => m.project_id)
  const [runs, files, srcs] = await Promise.all([
    supabaseAdmin.from("argon_runs").select("project_id,cost_usd").in("project_id", pids),
    supabaseAdmin.from("argon_workspace_files").select("mission_id").in("mission_id", mids),
    supabaseAdmin.from("argon_mission_sources").select("mission_id").in("mission_id", mids),
  ])
  const spent = new Map<string, { usd: number; n: number }>()
  for (const r of runs.data ?? []) { const s = spent.get(r.project_id) ?? { usd: 0, n: 0 }; s.usd += Number(r.cost_usd) || 0; s.n++; spent.set(r.project_id, s) }
  const count = (rows: { mission_id: string }[] | null) => { const m = new Map<string, number>(); for (const r of rows ?? []) m.set(r.mission_id, (m.get(r.mission_id) ?? 0) + 1); return m }
  const fc = count(files.data), sc = count(srcs.data)
  return ms.map(m => ({ ...m, spent_usd: Math.round((spent.get(m.project_id)?.usd ?? 0) * 10_000) / 10_000, runs: spent.get(m.project_id)?.n ?? 0, files: fc.get(m.id) ?? 0, sources: sc.get(m.id) ?? 0 }))
}

/** Tạo sứ mệnh: dự án nền + sứ mệnh + brief.md/decisions.md mẫu. Lỗi giữa chừng thì dọn dự án nền vừa tạo. */
export async function createMission(username: string, name: string, goal: string): Promise<ArgonMission> {
  const { data: proj, error: pe } = await supabaseAdmin.from("argon_projects").insert({ username, name, kind: "mission" }).select("id").single()
  if (pe || !proj) throw new Error(pe?.message ?? "Không tạo được dự án nền")
  const { data: m, error: me } = await supabaseAdmin.from("argon_missions").insert({ username, project_id: proj.id, name, goal }).select("*").single()
  if (me || !m) { await supabaseAdmin.from("argon_projects").delete().eq("id", proj.id); throw new Error(me?.message ?? "Không tạo được sứ mệnh") }
  const { error: fe } = await supabaseAdmin.from("argon_workspace_files").insert([
    { mission_id: m.id, path: BRIEF_PATH, mime: "text/markdown", content: briefTemplate(name, goal), size_bytes: Buffer.byteLength(briefTemplate(name, goal)), author: "user" },
    { mission_id: m.id, path: DECISIONS_PATH, mime: "text/markdown", content: decisionsTemplate(), size_bytes: Buffer.byteLength(decisionsTemplate()), author: "user" },
  ])
  if (fe) { await supabaseAdmin.from("argon_projects").delete().eq("id", proj.id); throw new Error(fe.message) }
  return m as ArgonMission
}

export async function updateMission(id: string, patch: { name?: string; goal?: string; archived?: boolean }): Promise<ArgonMission> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name) row.name = patch.name
  if (typeof patch.goal === "string") row.goal = patch.goal
  if (typeof patch.archived === "boolean") row.archived = patch.archived
  const { data, error } = await supabaseAdmin.from("argon_missions").update(row).eq("id", id).select("*").single()
  if (error || !data) throw new Error(error?.message ?? "Không cập nhật được sứ mệnh")
  if (patch.name) await supabaseAdmin.from("argon_projects").update({ name: patch.name }).eq("id", (data as ArgonMission).project_id)
  return data as ArgonMission
}

/** Đổi pha. "run" lần đầu = bấm Chốt → ghi committed_at. Trả lỗi tiếng Việt nếu chuyển không hợp lệ. */
export async function setPhase(m: ArgonMission, to: MissionPhase): Promise<{ mission?: ArgonMission; error?: string }> {
  if (!canTransition(m.phase, to)) return { error: `Không chuyển được từ pha "${m.phase}" sang "${to}"` }
  const patch: Record<string, unknown> = { phase: to, updated_at: new Date().toISOString() }
  if (to === "run" && !m.committed_at) patch.committed_at = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from("argon_missions").update(patch).eq("id", m.id).select("*").single()
  return error || !data ? { error: error?.message ?? "Không đổi được pha" } : { mission: data as ArgonMission }
}

export async function deleteMission(m: ArgonMission): Promise<{ error?: string }> {
  const { data: files } = await supabaseAdmin.from("argon_workspace_files").select("storage_path").eq("mission_id", m.id)
  const paths = (files ?? []).map(f => f.storage_path).filter((p): p is string => !!p)
  if (paths.length) await supabaseAdmin.storage.from(ARGON_BUCKET).remove(paths)
  return deleteProjectCascade(m.project_id)   // xoá dự án nền kéo theo sứ mệnh, file, nguồn gắn (ON DELETE CASCADE)
}

// ---- Workspace ----
export async function listFiles(missionId: string): Promise<(WsFileRow & { id: string; version: number })[]> {
  const { data } = await supabaseAdmin.from("argon_workspace_files").select("id,path,size_bytes,author,version,updated_at").eq("mission_id", missionId).order("path")
  return (data ?? []) as (WsFileRow & { id: string; version: number })[]
}

export async function readFile(missionId: string, rawPath: string) {
  const path = cleanPath(rawPath)
  if (!path) return null
  const { data } = await supabaseAdmin.from("argon_workspace_files").select("*").eq("mission_id", missionId).eq("path", path).maybeSingle()
  return data as { id: string; path: string; mime: string | null; content: string | null; storage_path: string | null; size_bytes: number; author: "user" | "argon"; version: number; updated_at: string } | null
}

/** Ghi (tạo hoặc thay) file chữ. Trả lỗi tiếng Việt hoặc file mới. */
export async function writeFile(missionId: string, rawPath: string, content: string, author: "user" | "argon"): Promise<{ file?: { path: string; version: number; size_bytes: number }; error?: string }> {
  const path = cleanPath(rawPath)
  const { data: cur } = path ? await supabaseAdmin.from("argon_workspace_files").select("id,version").eq("mission_id", missionId).eq("path", path).maybeSingle() : { data: null }
  const { count } = await supabaseAdmin.from("argon_workspace_files").select("id", { count: "exact", head: true }).eq("mission_id", missionId)
  const bad = checkWrite({ path, content, exists: !!cur, fileCount: count ?? 0 })
  if (bad || !path) return { error: bad ?? "Đường dẫn không hợp lệ" }
  const size = Buffer.byteLength(content, "utf8")
  const mime = path.endsWith(".md") ? "text/markdown" : path.endsWith(".json") ? "application/json" : path.endsWith(".csv") ? "text/csv" : path.endsWith(".html") ? "text/html" : "text/plain"
  const now = new Date().toISOString()
  const { error } = cur
    ? await supabaseAdmin.from("argon_workspace_files").update({ content, mime, size_bytes: size, author, version: cur.version + 1, updated_at: now }).eq("id", cur.id)
    : await supabaseAdmin.from("argon_workspace_files").insert({ mission_id: missionId, path, mime, content, size_bytes: size, author })
  if (error) return { error: error.message }
  await supabaseAdmin.from("argon_missions").update({ updated_at: now }).eq("id", missionId)
  return { file: { path, version: (cur?.version ?? 0) + 1, size_bytes: size } }
}

export async function removeFile(missionId: string, rawPath: string): Promise<{ ok?: boolean; error?: string }> {
  const path = cleanPath(rawPath)
  if (!path) return { error: "Đường dẫn không hợp lệ" }
  if (isProtectedPath(path)) return { error: "brief.md và decisions.md không xoá được (chỉ sửa)" }
  const cur = await readFile(missionId, path)
  if (!cur) return { error: "Không tìm thấy file" }
  if (cur.storage_path) await supabaseAdmin.storage.from(ARGON_BUCKET).remove([cur.storage_path])
  const { error } = await supabaseAdmin.from("argon_workspace_files").delete().eq("id", cur.id)
  return error ? { error: error.message } : { ok: true }
}

// ---- Nguồn gắn từ Kho nguồn ----
export async function linkedSources(missionId: string): Promise<Omit<ArgonSource, "extracted_text">[]> {
  const { data: links } = await supabaseAdmin.from("argon_mission_sources").select("source_id").eq("mission_id", missionId)
  const ids = (links ?? []).map(l => l.source_id)
  if (!ids.length) return []
  const { data } = await supabaseAdmin.from("argon_sources")
    .select("id,project_id,kind,name,mime,size_bytes,send_binary,tokens,content_hash,external_url,external_id,sync_mode,synced_at,enabled,pinned,version,meta,storage_path,created_at,updated_at")
    .in("id", ids).order("created_at")
  return (data ?? []) as Omit<ArgonSource, "extracted_text">[]
}

/** Gắn nguồn: nguồn phải thuộc dự án của chính người dùng và không phải dự án nền của sứ mệnh khác. */
export async function linkSource(m: ArgonMission, sourceId: string): Promise<{ error?: string }> {
  const src = await ownSource(sourceId, m.username)
  if (!src) return { error: "Không tìm thấy nguồn" }
  const { data: proj } = await supabaseAdmin.from("argon_projects").select("kind").eq("id", src.project_id).maybeSingle()
  if (proj?.kind === "mission") return { error: "Chỉ gắn nguồn từ Kho nguồn (dự án thường)" }
  const { error } = await supabaseAdmin.from("argon_mission_sources").upsert({ mission_id: m.id, source_id: sourceId }, { onConflict: "mission_id,source_id" })
  return error ? { error: error.message } : {}
}

export async function unlinkSource(missionId: string, sourceId: string) {
  await supabaseAdmin.from("argon_mission_sources").delete().eq("mission_id", missionId).eq("source_id", sourceId)
}

