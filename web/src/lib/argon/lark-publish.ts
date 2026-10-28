import { appendMarkdown, docUrl } from "@/lib/agents/creator/tools/lark-docs"
import { listFacts } from "./facts"
import { getEntity, listEntities } from "./graph"
import { larkToken } from "./lark"
import { listMailThreads } from "./mail-status"
import { contentHash, factsFor, indexMarkdown, profileMarkdown, threadsFor, vendorTargets, type IndexEntry } from "./lark-publish-pure"
import { vnToday } from "./facts-pure"

export * from "./lark-publish-pure"
const sb = async () => (await import("@/lib/supabase")).supabaseAdmin
const L = "https://open.larksuite.com/open-apis"
const FOLDER_NAME = "GoHub · Hồ sơ Argon"
const MAX_PROFILES = 60

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

export interface PublishResult { profiles: number; created: number; updated: number; same: number; errors: string[]; folderUrl?: string; indexUrl?: string; stale?: { name: string; url: string }[] }

/** Dựng và cập nhật hồ sơ Lark cho các thực thể quan trọng (vendor + thực thể có sự việc đang hiệu lực), rồi mục lục. Dừng trước `deadline`. */
export async function publishProfiles(username: string, opts: { deadline?: number; force?: boolean } = {}): Promise<PublishResult> {
  const deadline = opts.deadline ?? Date.now() + 200_000
  const out: PublishResult = { profiles: 0, created: 0, updated: 0, same: 0, errors: [] }
  const token = await larkToken()
  const st = await loadPubState(username)
  const folder = await ensureFolder(token, st)
  await savePubState(username, st)   // lưu sớm token thư mục: lỗi giữa chừng không tạo thư mục trùng ở lần sau

  // Danh sách hồ sơ = vendor trong DB (ref_vendors); thực thể graph chỉ bổ sung bí danh/nơi được nhắc, không quyết định ai có hồ sơ.
  const [{ data: dbVendors, error: vErr }, entities, allFacts, threads] = await Promise.all([
    (await sb()).from("ref_vendors").select("vendor_code,name").limit(1000), listEntities(username, 400), listFacts(username, { status: ["active"], limit: 2000 }), listMailThreads(username),
  ])
  if (vErr) throw new Error(`ref_vendors: ${vErr.message}`)
  const targets = vendorTargets(dbVendors ?? [], entities).map(t => {
    const p = { name: t.name, kind: "vendor" as const, aliases: t.entity?.aliases ?? [] }
    return { ...t, p, facts: factsFor(p, allFacts) }
  }).sort((a, b) => b.facts.length - a.facts.length || (b.entity?.mentions ?? 0) - (a.entity?.mentions ?? 0) || a.name.localeCompare(b.name))
  const entries: IndexEntry[] = []

  for (const t of targets.slice(0, MAX_PROFILES)) {
    if (Date.now() > deadline) break
    try {
      const d = t.entity ? await getEntity(username, t.entity.id) : null
      const md = profileMarkdown({
        name: t.name, kind: "vendor", aliases: t.p.aliases, facts: t.facts, changes: t.facts.filter(f => f.change_note && Date.now() - Date.parse(f.recorded_at) < 14 * 86_400_000),
        related: (d?.related ?? []).map(r => ({ name: r.name, kind: r.kind, rels: r.rels })), mentions: d?.mentions ?? [], threads: threadsFor(t.p, threads),
      })
      const key = `vendor|${t.name}`
      const w = await writeDoc(token, folder, st.docs[key], `Hồ sơ: ${t.name}`, md, contentHash(md), !!opts.force)
      st.docs[key] = w.doc
      out[w.action]++; out.profiles++
      entries.push({ name: t.name, kind: "vendor", url: w.doc.url, facts: t.facts.length, mentions: t.entity?.mentions ?? 0 })
    } catch (err) { out.errors.push(`${t.name}: ${(err as Error).message}`.slice(0, 200)) }
  }
  const keep = new Set(targets.map(t => `vendor|${t.name}`))
  out.stale = Object.entries(st.docs).filter(([k]) => !keep.has(k)).map(([k, d]) => ({ name: k.split("|").slice(1).join("|"), url: d.url }))
  for (const [k] of Object.entries(st.docs)) if (!keep.has(k)) delete st.docs[k]   // không còn trong danh sách vendor: bỏ khỏi trạng thái (tài liệu cũ trên Lark giữ nguyên để người dùng tự xoá)

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
