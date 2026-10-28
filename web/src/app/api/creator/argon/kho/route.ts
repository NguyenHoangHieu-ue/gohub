import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { type ArgonSource } from "@/lib/argon/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { cleanFolderPath, deleteFolder, ensureFolderPath, ensureKhoProject, folderPathOf, khoSources, listFolders, moveFolder, moveSources, renameFolder, userProjectIds, type DigestMeta } from "@/lib/argon/kho"
import { ensureKhoMission } from "@/lib/argon/kho-mission"
import { digestAndFile } from "@/lib/argon/kho-digest"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// GET → toàn bộ Kho: dự án nhận file tải lên, sứ mệnh Thủ thư (chat), thư mục, nguồn (nhẹ, không nội dung).
export async function GET() {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const [projectId, mission, folders, sources] = await Promise.all([ensureKhoProject(username), ensureKhoMission(username), listFolders(username), khoSources(username)])
  return NextResponse.json({ projectId, missionId: mission.id, missionProjectId: mission.project_id, folders, sources })
}

// POST { action, ... }
//   folder-create {path} · folder-rename {id,name} · folder-move {id,parentId} · folder-delete {id}
//   move {ids, folderId|null} · tag {id, tags[]} · digest {ids (≤4), autoFile?} → tóm tắt nhanh nguồn vừa nạp và (tuỳ chọn) tự xếp thư mục
export async function POST(req: NextRequest) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const b = (await req.json().catch(() => ({}))) as { action?: string; path?: string; id?: string; name?: string; parentId?: string | null; ids?: string[]; folderId?: string | null; tags?: string[]; autoFile?: boolean }

  if (b.action === "folder-create") {
    const segs = cleanFolderPath(String(b.path ?? ""))
    if (!segs.length) return NextResponse.json({ error: "Tên thư mục trống" }, { status: 400 })
    const id = await ensureFolderPath(username, segs.join("/"))
    return NextResponse.json({ id, folders: await listFolders(username) })
  }
  if (b.action === "folder-rename") {
    const r = await renameFolder(username, String(b.id ?? ""), String(b.name ?? ""))
    return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ folders: await listFolders(username) })
  }
  if (b.action === "folder-move") {
    const r = await moveFolder(username, String(b.id ?? ""), b.parentId ?? null)
    return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json({ folders: await listFolders(username) })
  }
  if (b.action === "folder-delete") {
    const r = await deleteFolder(username, String(b.id ?? ""))
    return NextResponse.json({ ...r, folders: await listFolders(username) })
  }
  if (b.action === "move") {
    const r = await moveSources(username, b.ids ?? [], b.folderId ?? null)
    return r.error ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json(r)
  }
  if (b.action === "tag") {
    const pids = await userProjectIds(username)
    const { data: src } = pids.length ? await supabaseAdmin.from("argon_sources").select("id,meta").eq("id", String(b.id ?? "")).in("project_id", pids).maybeSingle() : { data: null }
    if (!src) return NextResponse.json({ error: "Không tìm thấy nguồn" }, { status: 404 })
    const tags = Array.from(new Set((b.tags ?? []).map(t => String(t).trim().slice(0, 40)).filter(Boolean))).slice(0, 8)
    await supabaseAdmin.from("argon_sources").update({ meta: { ...((src.meta ?? {}) as Record<string, unknown>), tags } }).eq("id", src.id)
    return NextResponse.json({ tags })
  }
  if (b.action === "digest") {
    const ids = (b.ids ?? []).map(String).slice(0, 4)
    const pids = await userProjectIds(username)
    if (!ids.length || !pids.length) return NextResponse.json({ results: [] })
    const { data } = await supabaseAdmin.from("argon_sources").select("*").in("id", ids).in("project_id", pids)
    const folders = await listFolders(username)
    const paths = Array.from(new Set(folders.map(f => folderPathOf(f.id, folders)))).filter(Boolean)
    const results: { id: string; digest?: DigestMeta; folder_id?: string | null; facts?: number; error?: string }[] = []
    await Promise.all(((data ?? []) as ArgonSource[]).map(async s => {
      try { const r = await digestAndFile(username, s, paths, !!b.autoFile); results.push({ id: s.id, digest: r.digest, folder_id: r.folder_id, facts: r.facts.length }) }
      catch (e) { results.push({ id: s.id, error: (e as Error).message }) }
    }))
    return NextResponse.json({ results, folders: await listFolders(username) })
  }
  return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 })
}
