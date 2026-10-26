import { appendMarkdown, docUrl } from "@/lib/agents/creator/tools/lark-docs"
import { listFacts } from "./facts"
import { getEntity, listEntities, type EntityListItem } from "./graph"
import { larkToken } from "./lark"
import { listMailThreads } from "./mail-status"
import { contentHash, factsFor, indexMarkdown, profileMarkdown, threadsFor, type IndexEntry } from "./lark-publish-pure"
import { vnToday } from "./facts-pure"

export * from "./lark-publish-pure"
const sb = async () => (await import("@/lib/supabase")).supabaseAdmin
const L = "https://open.larksuite.com/open-apis"
const FOLDER_NAME = "GoHub · Hồ sơ Argon"
const MAX_PROFILES = 30

// Xuất MỘT CHIỀU: Argon (Supabase/Turso) là gốc, Lark chỉ để đọc. Mỗi vendor/thực thể quan trọng một tài liệu Lark trong thư mục "GoHub · Hồ sơ Argon",
// cập nhật khi nội dung đổi (so hash) + một tài liệu mục lục. Trạng thái (token tài liệu, hash) lưu app_settings — không cần migration.
export interface PubDoc { token: string; url: string; hash: string; title: string }
export interface PubState { enabled: boolean; folderToken?: string; folderUrl?: string; index?: PubDoc; docs: Record<string, PubDoc>; lastRunAt?: string }
const stateKey = (username: string) => `argon_lark_pub:${username}`

export async function loadPubState(username: string): Promise<PubState> {
  const { data } = await (await sb()).from("app_settings").select("value").eq("key", stateKey(username)).maybeSingle()
  try { const v = JSON.parse(data?.value ?? "{}"); return { enabled: !!v.enabled, docs: {}, ...v } } catch { return { enabled: false, docs: {} } }
}
export async function savePubState(username: string, s: PubState): Promise<void> {
  const { error } = await (await sb()).from("app_settings").upsert({ key: stateKey(username), value: JSON.stringify(s), category: "argon", label: "Xuất hồ sơ Argon ra Lark", updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (error) throw new Error(error.message)
}

async function lk(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${L}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8", ...(init.headers ?? {}) } })
  const d = await res.json().catch(() => ({ code: res.status, msg: res.statusText }))
  if (d.code && d.code !== 0) throw new Error(d.code === 99991679 ? `Token Lark thiếu quyền (${d.msg ?? ""}) — bấm "Kết nối Lark" lại ở Creator Settings` : `Lark ${d.code}: ${d.msg}`)
  return d.data ?? d
}

/** Xoá hết nội dung tài liệu (giữ tài liệu + link) để ghi bản mới. */
async function clearDoc(token: string, docId: string): Promise<void> {
  const root = await lk(token, `/docx/v1/documents/${docId}/blocks/${docId}?document_revision_id=-1`)
  const n = (root.block?.children ?? []).length
  if (n > 0) await lk(token, `/docx/v1/documents/${docId}/blocks/${docId}/children/batch_delete?document_revision_id=-1`, { method: "DELETE", body: JSON.stringify({ start_index: 0, end_index: n }) })
}

async function ensureFolder(token: string, st: PubState): Promise<string> {
  if (st.folderToken) return st.folderToken
  const d = await lk(token, "/drive/v1/files/create_folder", { method: "POST", body: JSON.stringify({ name: FOLDER_NAME, folder_token: "" }) })
  st.folderToken = d.token; st.folderUrl = d.url
  return d.token
}

async function writeDoc(token: string, folder: string, existing: PubDoc | undefined, title: string, markdown: string, hashOf: string, force: boolean): Promise<{ doc: PubDoc; action: "created" | "updated" | "same" }> {
  const body = `Cập nhật ${vnToday().split("-").reverse().join("/")}\n\n${markdown}`
  if (existing && existing.hash === hashOf && !force) return { doc: existing, action: "same" }
  if (existing) {
    await clearDoc(token, existing.token)
    await appendMarkdown(token, existing.token, body)
    return { doc: { ...existing, hash: hashOf, title }, action: "updated" }
  }
  const d = await lk(token, "/docx/v1/documents", { method: "POST", body: JSON.stringify({ title, folder_token: folder }) })
  const id = d.document?.document_id as string
  await appendMarkdown(token, id, body)
  return { doc: { token: id, url: (await docUrl(token, id, "docx")) ?? `https://www.larksuite.com/docx/${id}`, hash: hashOf, title }, action: "created" }
}

export interface PublishResult { profiles: number; created: number; updated: number; same: number; errors: string[]; folderUrl?: string; indexUrl?: string }

/** Dựng và cập nhật hồ sơ Lark cho các thực thể quan trọng (vendor + thực thể có sự việc đang hiệu lực), rồi mục lục. Dừng trước `deadline`. */
export async function publishProfiles(username: string, opts: { deadline?: number; force?: boolean } = {}): Promise<PublishResult> {
  const deadline = opts.deadline ?? Date.now() + 200_000
  const out: PublishResult = { profiles: 0, created: 0, updated: 0, same: 0, errors: [] }
  const token = await larkToken()
  const st = await loadPubState(username)
  const folder = await ensureFolder(token, st)
  await savePubState(username, st)   // lưu sớm token thư mục: lỗi giữa chừng không tạo thư mục trùng ở lần sau

  const [entities, allFacts, threads] = await Promise.all([listEntities(username, 400), listFacts(username, { status: ["active"], limit: 2000 }), listMailThreads(username)])
  const withFacts = (e: EntityListItem) => factsFor(e, allFacts).length
  const picked = entities.filter(e => e.kind === "vendor" || withFacts(e) > 0).sort((a, b) => withFacts(b) - withFacts(a) || b.mentions - a.mentions).slice(0, MAX_PROFILES)
  const entries: IndexEntry[] = []

  for (const e of picked) {
    if (Date.now() > deadline) break
    try {
      const d = await getEntity(username, e.id)
      if (!d) continue
      const facts = factsFor(e, allFacts)
      const md = profileMarkdown({
        name: e.name, kind: e.kind, aliases: e.aliases, facts, changes: facts.filter(f => f.change_note && Date.now() - Date.parse(f.recorded_at) < 14 * 86_400_000),
        related: d.related.map(r => ({ name: r.name, kind: r.kind, rels: r.rels })), mentions: d.mentions, threads: threadsFor(e, threads),
      })
      const key = `${e.kind}|${e.name}`
      const w = await writeDoc(token, folder, st.docs[key], `Hồ sơ: ${e.name}`, md, contentHash(md), !!opts.force)
      st.docs[key] = w.doc
      out[w.action]++; out.profiles++
      entries.push({ name: e.name, kind: e.kind, url: w.doc.url, facts: facts.length, mentions: e.mentions })
    } catch (err) { out.errors.push(`${e.name}: ${(err as Error).message}`.slice(0, 200)) }
  }

  if (entries.length) {
    try {
      const md = indexMarkdown(entries)
      const w = await writeDoc(token, folder, st.index, "Mục lục hồ sơ vendor (Argon)", md, contentHash(md), !!opts.force)
      st.index = w.doc; out.indexUrl = w.doc.url
    } catch (err) { out.errors.push(`mục lục: ${(err as Error).message}`.slice(0, 200)) }
  }
  st.lastRunAt = new Date().toISOString()
  await savePubState(username, st)
  out.folderUrl = st.folderUrl
  return out
}
