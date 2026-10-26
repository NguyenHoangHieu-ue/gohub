import { supabaseAdmin } from "@/lib/supabase"
import { getLarkToken, getLarkUserInfo } from "@/lib/lark"
import { parseLarkContent } from "@/lib/lark-thread-scan"
import { countTokens, sourceParts } from "./context"
import { sha256 } from "./extract"
import { ingestBuffer } from "./ingest"
import { ATTACH_EXT, MAX_ATTACH_BYTES } from "./mail"
import type { ArgonSource } from "./server"

// Đọc thread trong group Lark bằng token của BOT (bot phải ở trong group). CHỈ ĐỌC. Mỗi thread = 1 nguồn (tin gốc + mọi trả lời + người nói),
// file/ảnh đính kèm trong thread = nguồn riêng. Quy tắc lưu ở app_settings `argon_thread_rules:<projectId>` (không cần migration).
const L = "https://open.larksuite.com/open-apis"
const PAGE = 50
const MAX_ATTACH_PER_RUN = 15
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export interface ThreadRule {
  id: string
  name: string
  chatId: string
  chatName: string
  sinceDays: number      // chỉ lấy thread có hoạt động (tin gốc hoặc trả lời) trong N ngày gần nhất
  maxThreads: number     // giữ tối đa N thread hoạt động gần nhất
  minReplies: number     // bỏ thread có ít trả lời hơn mức này (0 = lấy cả tin lẻ không ai trả lời)
  files: boolean         // tải file đính kèm (pdf/docx/xlsx/pptx/csv/txt/md ≤15MB) thành nguồn riêng
  images: boolean        // tải cả ảnh (≤8MB)
}

export interface ThreadMsg { id: string; senderId: string; senderType: string; ms: number; type: string; text: string; files: { key: string; name: string; kind: "file" | "image" }[]; mentions?: { id: string; name: string }[] }
export interface ThreadData { rootId: string; threadId: string; messages: ThreadMsg[] }

const rulesKey = (projectId: string) => `argon_thread_rules:${projectId}`

export async function loadThreadRules(projectId: string): Promise<ThreadRule[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", rulesKey(projectId)).maybeSingle()
  try { const v = JSON.parse(data?.value ?? "[]"); return Array.isArray(v) ? v : [] } catch { return [] }
}
export async function saveThreadRules(projectId: string, rules: ThreadRule[]) {
  const { error } = await supabaseAdmin.from("app_settings").upsert({ key: rulesKey(projectId), value: JSON.stringify(rules), category: "argon", label: "Quy tắc nạp thread Lark Phòng Argon", updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (error) throw new Error(error.message)
}
export const deleteThreadRules = async (projectId: string) => { await supabaseAdmin.from("app_settings").delete().eq("key", rulesKey(projectId)) }
export async function allProjectIdsWithThreadRules(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("key").like("key", "argon_thread_rules:%")
  return (data ?? []).map(r => String(r.key).slice("argon_thread_rules:".length))
}

export function sanitizeThreadRule(raw: Partial<ThreadRule>): ThreadRule {
  const chatName = String(raw.chatName || "").slice(0, 80)
  return {
    id: raw.id || crypto.randomUUID().slice(0, 8),
    name: String(raw.name || chatName || "Thread Lark").slice(0, 80),
    chatId: String(raw.chatId || "").trim(),
    chatName,
    sinceDays: Math.min(180, Math.max(1, Number(raw.sinceDays) || 14)),
    maxThreads: Math.min(80, Math.max(1, Number(raw.maxThreads) || 30)),
    minReplies: Math.min(20, Math.max(0, raw.minReplies == null ? 1 : Number(raw.minReplies) || 0)),
    files: raw.files !== false,
    images: !!raw.images,
  }
}

async function lk(path: string, token: string): Promise<any> {
  const res = await fetch(`${L}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  const d = await res.json().catch(() => ({ code: res.status, msg: res.statusText }))
  if (d.code && d.code !== 0) {
    if (d.code === 230002 || d.code === 232011) throw new Error("Bot Bé Gấu chưa ở trong group này — thêm bot vào group rồi nạp lại")
    if (d.code === 99991672 || d.code === 99991663) throw new Error(`App Lark thiếu quyền đọc tin nhắn group (${d.msg ?? d.code}) — bật scope im:message.group_msg hoặc im:message:readonly rồi publish lại`)
    throw new Error(`Lark ${d.code}: ${d.msg}`)
  }
  return d.data ?? d
}

/** Các group bot đang ở (để chọn trong giao diện). */
export async function listBotChats(): Promise<{ id: string; name: string }[]> {
  const token = await getLarkToken()
  const out: { id: string; name: string }[] = []
  let pageToken = ""
  for (let i = 0; i < 10; i++) {
    const d = await lk(`/im/v1/chats?page_size=100${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`, token)
    for (const c of (d.items ?? []) as { chat_id: string; name?: string }[]) out.push({ id: c.chat_id, name: c.name || c.chat_id })
    if (!d.has_more || !d.page_token) break
    pageToken = d.page_token
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "vi"))
}

type PostEl = { tag?: string; text?: string; href?: string; user_name?: string; user_id?: string; image_key?: string; file_key?: string; emoji_type?: string; language?: string }

/** Rich-text (post): mỗi hàng 1 dòng (parseLarkContent của Cà Thread nối hết thành 1 dòng — mất cấu trúc danh sách); ảnh trong bài đi vào files. */
function parsePost(body: any): { text: string; files: ThreadMsg["files"] } {
  const post = body?.content ? body : body?.zh_cn ?? body?.en_us ?? body
  const files: ThreadMsg["files"] = []
  const rows: PostEl[][] = Array.isArray(post?.content) ? post.content : []
  const lines = rows.map(row => (Array.isArray(row) ? row : []).map(el => {
    switch (el.tag) {
      case "text": case "md": return el.text ?? ""
      case "a": return el.href && el.text && el.text !== el.href ? `${el.text} (${el.href})` : el.href ?? el.text ?? ""
      case "at": return `@${el.user_name ?? el.user_id ?? ""}`
      case "img": if (el.image_key) files.push({ key: el.image_key, name: "ảnh", kind: "image" }); return "[ảnh]"
      case "media": return "[video]"
      case "emotion": return `:${el.emoji_type ?? ""}:`
      case "code_block": return `\n${el.text ?? ""}\n`
      default: return ""
    }
  }).join("").trimEnd()).filter(l => l.trim())
  return { text: [post?.title, ...lines].filter(Boolean).join("\n"), files }
}

/** Nội dung 1 tin Lark → chữ (mention đã thay bằng tên) + file/ảnh đính kèm. */
function parseMsg(m: any): { text: string; files: ThreadMsg["files"] } {
  let body: any = {}
  try { body = JSON.parse(m.body?.content ?? "{}") } catch { /* nội dung không phải JSON */ }
  let text = "", files: ThreadMsg["files"] = []
  switch (m.msg_type) {
    case "text": text = String(body.text ?? ""); break
    case "post": ({ text, files } = parsePost(body)); break
    case "file": text = `[file ${body.file_name ?? ""}]`.trim(); if (body.file_key) files = [{ key: String(body.file_key), name: String(body.file_name ?? "file"), kind: "file" }]; break
    case "image": text = "[ảnh]"; if (body.image_key) files = [{ key: String(body.image_key), name: "ảnh", kind: "image" }]; break
    case "media": text = "[video]"; break
    case "sticker": text = "[sticker]"; break
    case "interactive": text = "[thẻ tương tác]"; break
    case "merge_forward": text = "[tin chuyển tiếp]"; break
    default: text = parseLarkContent(m)
  }
  for (const mn of (m.mentions ?? []) as { key?: string; name?: string }[]) if (mn.key) text = text.split(mn.key).join(`@${mn.name ?? ""}`)
  return { text: text.trim(), files }
}

const toMsg = (m: any): ThreadMsg => {
  const { text, files } = parseMsg(m)
  return { id: m.message_id, senderId: m.sender?.id ?? "", senderType: m.sender?.sender_type ?? "", ms: Number(m.create_time) || 0, type: m.msg_type ?? "", text, files, mentions: ((m.mentions ?? []) as { id?: string; name?: string }[]).filter(x => x.id && x.name).map(x => ({ id: x.id!, name: x.name! })) }
}

async function pageAll(basePath: string, token: string, opts: { stopBefore?: number; maxPages: number }): Promise<any[]> {
  const out: any[] = []
  let pageToken = ""
  for (let p = 0; p < opts.maxPages; p++) {
    const d = await lk(`${basePath}${basePath.includes("?") ? "&" : "?"}page_size=${PAGE}${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`, token)
    const items: any[] = d.items ?? []
    out.push(...items)
    if (opts.stopBefore && items.length && items.every(m => Number(m.create_time) < opts.stopBefore!)) break
    if (!d.has_more || !d.page_token) break
    pageToken = d.page_token
  }
  return out
}

/** Thread có hoạt động trong `sinceDays` ngày của 1 group: tin gốc + MỌI trả lời (đọc cả thread, không chỉ phần trong cửa sổ). Sắp xếp thread hoạt động gần nhất trước. */
export async function fetchGroupThreads(rule: Pick<ThreadRule, "chatId" | "sinceDays" | "maxThreads" | "minReplies">, token?: string): Promise<ThreadData[]> {
  const t = token ?? (await getLarkToken())
  const since = Date.now() - rule.sinceDays * 86_400_000
  const maxPages = Math.min(120, Math.max(10, rule.sinceDays * 4))
  const listed = (await pageAll(`/im/v1/messages?container_id=${encodeURIComponent(rule.chatId)}&container_id_type=chat&sort_type=ByCreateTimeDesc`, t, { stopBefore: since, maxPages }))
    .filter(m => Number(m.create_time) >= since)

  const byRoot = new Map<string, { root?: any; replies: any[]; threadId?: string }>()
  const slot = (id: string) => byRoot.get(id) ?? byRoot.set(id, { replies: [] }).get(id)!
  for (const m of listed) {
    const rootId: string = m.root_id || m.message_id
    const s = slot(rootId)
    if (m.root_id) s.replies.push(m); else s.root = m
    if (m.thread_id) s.threadId = m.thread_id
  }

  // Nhóm kiểu "chủ đề" (topic): danh sách group CHỈ trả các trả lời (đều có root_id + thread_id), tin gốc không nằm trong danh sách — đã đo trên group thật.
  // Nên: sắp theo hoạt động gần nhất, rồi với từng thread đọc cả container thread (có kèm tin gốc); thread không có thread_id thì lấy tin gốc theo id.
  const ordered = Array.from(byRoot.entries()).map(([id, s]) => ({ id, ...s, last: Math.max(...[s.root, ...s.replies].filter(Boolean).map(m => Number(m.create_time) || 0)) })).sort((a, b) => b.last - a.last)
  const build = async (s: (typeof ordered)[number]): Promise<ThreadData | null> => {
    let all: any[] = [s.root, ...s.replies]
    if (s.threadId) {
      try { all = [s.root, ...s.replies, ...(await pageAll(`/im/v1/messages?container_id=${encodeURIComponent(s.threadId)}&container_id_type=thread&sort_type=ByCreateTimeAsc`, t, { maxPages: 40 }))] } catch { /* giữ phần đã có từ danh sách group */ }
    }
    if (!all.some(m => m && !m.root_id)) {
      try { const d = await lk(`/im/v1/messages/${encodeURIComponent(s.id)}`, t); if (d.items?.[0]) all.push(d.items[0]) } catch { /* tin gốc đã xoá */ }
    }
    const seen = new Set<string>()
    const msgs = all.filter(m => m && !seen.has(m.message_id) && seen.add(m.message_id)).filter(m => m.msg_type !== "system").map(toMsg).sort((a, b) => a.ms - b.ms)
    if (!msgs.length || msgs.length - 1 < rule.minReplies) return null
    return { rootId: s.id, threadId: s.threadId ?? s.id, messages: msgs }
  }
  const out: ThreadData[] = []
  const BATCH = 5
  for (let i = 0; i < ordered.length && out.length < rule.maxThreads && i < rule.maxThreads * 4; i += BATCH) {
    for (const th of await Promise.all(ordered.slice(i, i + BATCH).map(build))) if (th && out.length < rule.maxThreads) out.push(th)
  }
  return out
}

// Giờ Việt Nam tính tay (UTC+7, không có giờ mùa hè) để kết quả không phụ thuộc ICU/locale của máy chạy.
const p2 = (n: number) => String(n).padStart(2, "0")
const vnParts = (ms: number) => { const d = new Date(ms + 7 * 3600_000); return { dd: p2(d.getUTCDate()), mm: p2(d.getUTCMonth() + 1), yy: d.getUTCFullYear(), hh: p2(d.getUTCHours()), mi: p2(d.getUTCMinutes()) } }
const vn = (ms: number) => { const x = vnParts(ms); return `${x.dd}/${x.mm} ${x.hh}:${x.mi}` }
const vnFull = (ms: number) => { const x = vnParts(ms); return `${x.dd}/${x.mm}/${x.yy} ${x.hh}:${x.mi}` }

/** Văn bản của 1 thread (thuần, có test). `names`: open_id → tên; `fileSources`: file_key → tên nguồn đính kèm (đã/ sẽ có). */
export function threadToText(chatName: string, data: ThreadData, names: Record<string, string>, fileSources: Record<string, string> = {}): string {
  const m = data.messages
  const first = m[0], last = m[m.length - 1]
  const who = (x: ThreadMsg) => `${names[x.senderId] || (x.senderType === "app" ? "Bot" : x.senderId || "?")}${x.senderType === "app" ? " (bot)" : ""}`
  const people = Array.from(new Set(m.map(who)))
  const head = `Thread trong nhóm "${chatName}"\nBắt đầu: ${vnFull(first.ms)} bởi ${who(first)} · ${m.length - 1} trả lời · hoạt động cuối: ${vnFull(last.ms)}\nNgười tham gia: ${people.join(", ")}`
  const lines = m.map((x, i) => {
    const attach = x.files.map(f => (fileSources[f.key] ? `[đính kèm: ${f.name} → nguồn "${fileSources[f.key]}"]` : `[đính kèm: ${f.name}]`)).join(" ")
    const text = x.type === "file" || x.type === "image" ? "" : x.text.replace(/\n/g, "\n    ")
    const body = [text, attach || (x.type === "file" || x.type === "image" ? x.text : "")].filter(Boolean).join(" ")
    return `[${vn(x.ms)}] ${who(x)}${i === 0 ? " (tin gốc)" : ""}: ${body || `[${x.type}]`}`
  })
  return `${head}\n\n${lines.join("\n")}`
}

export const threadTitle = (data: ThreadData) => {
  const t = (data.messages[0]?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 70)
  return `${t || "(thread không có chữ)"}`
}

async function upsertThreadSource(projectId: string, externalId: string, name: string, text: string, meta: Record<string, unknown>): Promise<"created" | "updated" | "same"> {
  const hash = sha256(text)
  const { data: cur } = await supabaseAdmin.from("argon_sources").select("*").eq("project_id", projectId).eq("external_id", externalId).maybeSingle()
  const row = cur as ArgonSource | null
  if (!row) {
    const { data: src, error } = await supabaseAdmin.from("argon_sources").insert({
      project_id: projectId, kind: "note", name: name.slice(0, 160), mime: "text/plain", size_bytes: Buffer.byteLength(text), extracted_text: text,
      send_binary: false, content_hash: hash, tokens: 0, external_id: externalId, sync_mode: "snapshot", synced_at: new Date().toISOString(), meta,
    }).select("*").single()
    if (error || !src) throw new Error(error?.message ?? "lưu thread lỗi")
    const tokens = await countTokens(await sourceParts(src as ArgonSource, { left: 0 }, []))
    await supabaseAdmin.from("argon_sources").update({ tokens }).eq("id", src.id)
    await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: text, note: "Nạp từ thread Lark", author: "lark-thread" })
    return "created"
  }
  if (row.content_hash === hash || row.meta?.edited) return "same"
  const version = row.version + 1
  const tokens = await countTokens(await sourceParts({ ...row, extracted_text: text }, { left: 0 }, []))
  await supabaseAdmin.from("argon_source_versions").insert({ source_id: row.id, version, extracted_text: text, note: "Thread có tin mới", author: "lark-thread" })
  await supabaseAdmin.from("argon_sources").update({ extracted_text: text, content_hash: hash, version, tokens, size_bytes: Buffer.byteLength(text), synced_at: new Date().toISOString(), updated_at: new Date().toISOString(), name: name.slice(0, 160), meta: { ...row.meta, ...meta, factsAt: undefined } }).eq("id", row.id)
  return "updated"
}

async function downloadResource(token: string, messageId: string, key: string, type: "file" | "image"): Promise<Buffer> {
  const res = await fetch(`${L}/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(key)}?type=${type}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(`tải ${type} lỗi (${(j as { msg?: string }).msg ?? res.status})`)
  }
  return Buffer.from(await res.arrayBuffer())
}

const sniffImage = (b: Buffer) => (b[0] === 0x89 && b[1] === 0x50 ? { ext: "png", mime: "image/png" } : b[0] === 0x47 ? { ext: "gif", mime: "image/gif" } : b[0] === 0x52 && b[1] === 0x49 ? { ext: "webp", mime: "image/webp" } : { ext: "jpg", mime: "image/jpeg" })

export interface ThreadSyncResult { rule: string; threads: number; created: number; updated: number; attachments: number; skipped: number; errors: string[] }

/** Đọc thread theo quy tắc → tạo/cập nhật nguồn (chỉ phiên bản mới khi nội dung đổi). `deadlineMs`: hết giờ thì dừng, phần còn lại nạp ở lần sau. */
export async function syncThreadRule(projectId: string, username: string, rule: ThreadRule, deadlineMs = Date.now() + 100_000, token?: string): Promise<ThreadSyncResult> {
  const res: ThreadSyncResult = { rule: rule.name, threads: 0, created: 0, updated: 0, attachments: 0, skipped: 0, errors: [] }
  const t = token ?? (await getLarkToken())
  const threads = await fetchGroupThreads(rule, t)
  res.threads = threads.length

  const names: Record<string, string> = {}
  try {
    const d = await lk(`/im/v1/chats/${encodeURIComponent(rule.chatId)}/members?member_id_type=open_id&page_size=100`, t)
    for (const m of (d.items ?? []) as { member_id?: string; name?: string }[]) if (m.member_id) names[m.member_id] = m.name ?? m.member_id
  } catch { /* tra danh bạ từng người bên dưới */ }
  for (const th of threads) for (const m of th.messages) for (const mn of m.mentions ?? []) if (!names[mn.id]) names[mn.id] = mn.name
  const unknown = Array.from(new Set(threads.flatMap(th => th.messages.filter(m => m.senderType !== "app").map(m => m.senderId)).filter(id => id && !names[id])))
  for (let i = 0; i < unknown.length; i += 10) await Promise.all(unknown.slice(i, i + 10).map(async id => { const u = await getLarkUserInfo(id); if (u?.name) names[id] = u.name }))

  let budget = MAX_ATTACH_PER_RUN
  for (let ti = 0; ti < threads.length; ti++) {
    const th = threads[ti]
    if (Date.now() > deadlineMs) { res.skipped = threads.length - ti; res.errors.push("Hết thời gian — bấm nạp lại để lấy phần còn lại"); break }
    try {
      const title = threadTitle(th)
      const fileSources: Record<string, string> = {}
      if (rule.files || rule.images) {
        for (const m of th.messages) for (const f of m.files) {
          if (f.kind === "file" ? !rule.files || !ATTACH_EXT.test(f.name) : !rule.images) continue
          const extId = `lthreadfile:${m.id}:${f.key}`
          const label = f.kind === "image" ? `ảnh ${vn(m.ms)}` : f.name
          const { data: dup } = await supabaseAdmin.from("argon_sources").select("id,name").eq("project_id", projectId).eq("external_id", extId).maybeSingle()
          if (dup) { fileSources[f.key] = dup.name; continue }
          if (budget <= 0) continue
          try {
            const buf = await downloadResource(t, m.id, f.key, f.kind)
            if (buf.length > (f.kind === "image" ? MAX_IMAGE_BYTES : MAX_ATTACH_BYTES)) { res.errors.push(`${label}: quá lớn (${(buf.length / 1048576).toFixed(1)}MB)`); continue }
            const img = f.kind === "image" ? sniffImage(buf) : null
            const fname = img ? `anh-thread-${m.id.slice(-8)}.${img.ext}` : f.name
            const src = await ingestBuffer(projectId, username, fname, img?.mime ?? "", buf, { external_id: extId, meta: { larkThread: th.threadId, threadTitle: title, chatId: rule.chatId, ruleId: rule.id } })
            const display = `📎 ${f.kind === "image" ? `Ảnh ${vn(m.ms)}` : f.name} — thread "${title.slice(0, 40)}"`
            await supabaseAdmin.from("argon_sources").update({ name: display.slice(0, 160) }).eq("id", src.id)
            fileSources[f.key] = display
            budget--; res.attachments++
          } catch (e) { res.errors.push(`${label}: ${(e as Error).message}`) }
        }
      }
      const text = threadToText(rule.chatName || rule.name, th, names, fileSources)
      const last = th.messages[th.messages.length - 1]
      const out = await upsertThreadSource(projectId, `lthread:${th.rootId}`, `🧵 ${title}`, text, {
        larkThread: th.threadId, rootId: th.rootId, chatId: rule.chatId, chatName: rule.chatName, ruleId: rule.id, replies: th.messages.length - 1, lastDate: new Date(last.ms).toISOString(), startedBy: names[th.messages[0].senderId] ?? "",
      })
      if (out === "created") res.created++; else if (out === "updated") res.updated++
    } catch (e) { res.errors.push(`${threadTitle(th)}: ${(e as Error).message}`) }
  }
  await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId)
  return res
}

export async function syncAllThreadRules(projectId: string, username: string, deadlineMs?: number): Promise<ThreadSyncResult[]> {
  const rules = await loadThreadRules(projectId)
  if (!rules.length) return []
  const token = await getLarkToken()
  const out: ThreadSyncResult[] = []
  for (const r of rules) out.push(await syncThreadRule(projectId, username, r, deadlineMs, token))
  return out
}
