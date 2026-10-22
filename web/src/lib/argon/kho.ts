import { cleanFolderPath, descendantIds, folderPathOf, khoIndexText, KHO_PROJECT_NAME, MAX_FOLDER_DEPTH, type DigestMeta, type FolderRow, type KhoSource } from "./kho-pure"

export * from "./kho-pure"
const db = async () => (await import("@/lib/supabase")).supabaseAdmin   // nạp muộn: phần thuần test được không cần env Supabase

// ── DB ───────────────────────────────────────────────────────────────────────

export async function userProjectIds(username: string): Promise<string[]> {
  const { data } = await (await db()).from("argon_projects").select("id").eq("username", username).eq("kind", "project")
  return (data ?? []).map(p => p.id as string)
}

export async function ensureKhoProject(username: string): Promise<string> {
  const { data } = await (await db()).from("argon_projects").select("id").eq("username", username).eq("kind", "project").eq("name", KHO_PROJECT_NAME).maybeSingle()
  if (data?.id) return data.id as string
  const { data: made, error } = await (await db()).from("argon_projects").insert({ username, name: KHO_PROJECT_NAME, notes: "Nguồn nạp trực tiếp ở Kho. Thư mục và nhãn xem ở trang Kho." }).select("id").single()
  if (error || !made) throw new Error(error?.message ?? "Không tạo được dự án Kho")
  return made.id as string
}

export async function listFolders(username: string): Promise<FolderRow[]> {
  const { data } = await (await db()).from("argon_folders").select("*").eq("username", username).order("name")
  return (data ?? []) as FolderRow[]
}

/** Nguồn của MỌI dự án thường của người dùng, dạng nhẹ (không có nội dung). */
export async function khoSources(username: string, opts: { onlyEnabled?: boolean } = {}): Promise<KhoSource[]> {
  const pids = await userProjectIds(username)
  if (!pids.length) return []
  const out: KhoSource[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    let q = (await db()).from("argon_sources").select("id,project_id,kind,name,mime,size_bytes,tokens,pinned,enabled,folder_id,meta,created_at,updated_at").in("project_id", pids).order("created_at", { ascending: false }).range(from, from + 999)
    if (opts.onlyEnabled) q = q.eq("enabled", true)
    const { data } = await q
    for (const r of data ?? []) {
      const meta = (r.meta ?? {}) as { digest?: DigestMeta; tags?: string[] }
      out.push({ ...(r as unknown as KhoSource), digest: meta.digest ?? null, tags: Array.isArray(meta.tags) ? meta.tags : meta.digest?.tags ?? [] })
    }
    if ((data?.length ?? 0) < 1000) break
  }
  return out.map(({ ...s }) => { delete (s as { meta?: unknown }).meta; return s })
}

/** Tạo (nếu thiếu) cả đường dẫn thư mục, trả id thư mục cuối. Đường dẫn rỗng → null (Chưa phân loại). */
export async function ensureFolderPath(username: string, raw: string): Promise<string | null> {
  const segs = cleanFolderPath(raw)
  let parent: string | null = null
  for (const name of segs) {
    let q = (await db()).from("argon_folders").select("id").eq("username", username).ilike("name", name.replace(/[\\%_]/g, c => `\\${c}`))
    q = parent ? q.eq("parent_id", parent) : q.is("parent_id", null)
    const { data: hit } = await q.limit(1).maybeSingle()
    if (hit?.id) { parent = hit.id as string; continue }
    const { data: made, error } = await (await db()).from("argon_folders").insert({ username, parent_id: parent, name }).select("id").single()
    if (error || !made) {   // đua tạo cùng lúc → đọc lại
      let q2 = (await db()).from("argon_folders").select("id").eq("username", username).ilike("name", name.replace(/[\\%_]/g, c => `\\${c}`))
      q2 = parent ? q2.eq("parent_id", parent) : q2.is("parent_id", null)
      const { data: again } = await q2.limit(1).maybeSingle()
      if (!again?.id) throw new Error(error?.message ?? "Không tạo được thư mục")
      parent = again.id as string
    } else parent = made.id as string
  }
  return parent
}

export async function renameFolder(username: string, id: string, name: string): Promise<{ error?: string }> {
  const clean = cleanFolderPath(name)[0]
  if (!clean) return { error: "Tên thư mục trống" }
  const { error } = await (await db()).from("argon_folders").update({ name: clean }).eq("id", id).eq("username", username)
  return error ? { error: error.code === "23505" ? "Đã có thư mục cùng tên ở chỗ này" : error.message } : {}
}

export async function moveFolder(username: string, id: string, parentId: string | null): Promise<{ error?: string }> {
  const all = await listFolders(username)
  if (!all.some(f => f.id === id)) return { error: "Không tìm thấy thư mục" }
  if (parentId && (parentId === id || descendantIds(id, all).has(parentId))) return { error: "Không thể chuyển thư mục vào chính nó" }
  if (parentId && !all.some(f => f.id === parentId)) return { error: "Không tìm thấy thư mục đích" }
  const depth = parentId ? folderPathOf(parentId, all).split("/").length : 0
  if (depth >= MAX_FOLDER_DEPTH) return { error: `Tối đa ${MAX_FOLDER_DEPTH} cấp thư mục` }
  const { error } = await (await db()).from("argon_folders").update({ parent_id: parentId }).eq("id", id).eq("username", username)
  return error ? { error: error.code === "23505" ? "Đã có thư mục cùng tên ở chỗ này" : error.message } : {}
}

export async function deleteFolder(username: string, id: string): Promise<{ moved: number }> {
  const all = await listFolders(username)
  const ids = [id, ...descendantIds(id, all)]
  const { count } = await (await db()).from("argon_sources").select("id", { count: "exact", head: true }).in("folder_id", ids)
  await (await db()).from("argon_folders").delete().eq("id", id).eq("username", username)   // nguồn bên trong tự về Chưa phân loại (ON DELETE SET NULL)
  return { moved: count ?? 0 }
}

/** Chuyển nguồn vào thư mục (null = Chưa phân loại). Chỉ nguồn của dự án thường thuộc người dùng; trả số nguồn đã chuyển. */
export async function moveSources(username: string, ids: string[], folderId: string | null): Promise<{ moved: number; error?: string }> {
  const list = Array.from(new Set(ids.filter(i => typeof i === "string"))).slice(0, 500)
  if (!list.length) return { moved: 0 }
  if (folderId) {
    const { data: f } = await (await db()).from("argon_folders").select("id").eq("id", folderId).eq("username", username).maybeSingle()
    if (!f) return { moved: 0, error: "Không tìm thấy thư mục đích" }
  }
  const pids = await userProjectIds(username)
  if (!pids.length) return { moved: 0 }
  const { data, error } = await (await db()).from("argon_sources").update({ folder_id: folderId }).in("id", list).in("project_id", pids).select("id")
  return error ? { moved: 0, error: error.message } : { moved: data?.length ?? 0 }
}

export async function khoIndexBlock(username: string): Promise<string> {
  const [folders, sources] = await Promise.all([listFolders(username), khoSources(username)])
  return khoIndexText(folders, sources)
}
