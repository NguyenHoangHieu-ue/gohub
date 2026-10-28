// Xuất hồ sơ vendor ra Lark (một chiều: Argon/Turso/Supabase là gốc, Lark chỉ để đọc): phần THUẦN — dựng markdown, chọn luồng mail liên quan, băm nội dung.
import { FACT_TYPES, fold, keyDate, type FactRow } from "./facts-pure"
import { ENTITY_KINDS, type EntityKind } from "./graph-pure"
import { STATUS_LABEL, waitingDays, type MailThreadRow } from "./mail-status-pure"

export interface ProfileInput {
  name: string; kind: EntityKind; aliases: string[]
  facts: FactRow[]                                   // sự việc đang hiệu lực liên quan
  changes: FactRow[]                                 // sự việc vừa thay tin cũ (có change_note)
  related: { name: string; kind: EntityKind; rels: string[] }[]
  mentions: { sourceName: string; sourceDate: string | null; snippet: string }[]
  threads: MailThreadRow[]                           // luồng mail đang chờ liên quan
  wiki?: { title: string; url: string; text: string }[]   // trang Wiki Lark của vendor (chính sách/điều khoản…): bản gốc ở Wiki, đây chỉ là trích
  policy?: { sheetUrl: string; cells: { header: string; text: string }[] }   // hàng của vendor trong bảng Policy_Vendor (Wiki)
  memories?: string[]                                // điều Creator đã dặn bot có nhắc vendor này
}

const dmy = (d: string | null) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "")
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim()

/** Markdown hồ sơ 1 thực thể. KHÔNG chứa ngày giờ cập nhật (để băm nội dung ổn định); ngày cập nhật do nơi gọi thêm riêng. */
export function profileMarkdown(p: ProfileInput, now = Date.now()): string {
  const out: string[] = [`> ${ENTITY_KINDS[p.kind]}${p.aliases.length ? ` · còn gọi: ${p.aliases.join(", ")}` : ""}. Tài liệu TỰ SINH từ Kho Argon — sửa tay ở đây sẽ bị ghi đè; muốn đổi thông tin hãy sửa ở Argon (Kho › Sổ sự việc).`]
  if (p.policy?.cells.length) {
    out.push("", "## Chính sách vendor", "", `Trích từ [bảng Policy_Vendor trên Wiki](${p.policy.sheetUrl}); đổi nội dung hãy sửa ở Wiki.`)
    for (const c of p.policy.cells) {
      const lines = c.text.split(/\n+/).map(s => s.trim()).filter(Boolean)
      out.push("", `**${cell(c.header)}**`, ...lines.map(l => `- ${l}`))
    }
  }
  if (p.wiki?.length) {
    out.push("", "## Thông tin vendor (trích từ Wiki)", "", "Bản gốc nằm ở Wiki Lark; phần dưới chỉ là trích, đổi nội dung hãy sửa ở Wiki.")
    for (const w of p.wiki) out.push("", `### [${cell(w.title)}](${w.url})`, "", w.text)
  }
  out.push("", "## Sự việc đang hiệu lực")
  if (!p.facts.length) out.push("", "Không có sự việc nào đang hiệu lực.")
  else {
    out.push("", "| Loại | Nội dung | Từ | Đến | Tin ngày | Nguồn |", "| --- | --- | --- | --- | --- | --- |")
    const sorted = [...p.facts].sort((a, b) => (keyDate(a) ?? "9999").localeCompare(keyDate(b) ?? "9999"))
    for (const f of sorted) out.push(`| ${FACT_TYPES[f.type] ?? "Khác"} | ${cell([f.subject, f.summary].filter(Boolean).join(": "))}${f.needs_review ? " (chờ xác nhận)" : ""} | ${dmy(f.effective_from)} | ${dmy(f.expires_at)} | ${dmy(f.source_date)} | ${cell(f.source_name).slice(0, 60)} |`)
  }
  if (p.changes.length) {
    out.push("", "## Thay đổi so với tin cũ", "")
    for (const f of p.changes.slice(0, 10)) out.push(`- ${cell(f.summary)} — ${cell(f.change_note)}${f.source_date ? ` (tin ngày ${dmy(f.source_date)})` : ""}`)
  }
  if (p.memories?.length) {
    out.push("", "## Điều đã dặn bot về vendor này", "")
    for (const m of p.memories.slice(0, 20)) out.push(`- ${m}`)
  }
  const open = p.threads.filter(t => t.status === "waiting_me" || t.status === "waiting_partner")
  if (open.length) {
    out.push("", "## Luồng mail đang mở", "")
    for (const t of open.slice(0, 10)) out.push(`- [${STATUS_LABEL[t.status]}] ${cell(t.subject || "(không tiêu đề)")} — ${waitingDays(t, now)} ngày${t.next_action ? ` · việc: ${cell(t.next_action)}` : ""}`)
  }
  if (p.related.length) {
    out.push("", "## Liên quan", "")
    for (const r of p.related.slice(0, 10)) out.push(`- ${r.name} (${ENTITY_KINDS[r.kind]})${r.rels.length ? ` — ${r.rels.join(", ")}` : ""}`)
  }
  if (p.mentions.length) {
    out.push("", "## Nằm ở đâu trong Kho", "")
    for (const m of p.mentions.slice(0, 15)) out.push(`- ${cell(m.sourceName)}${m.sourceDate ? ` (tin ngày ${dmy(m.sourceDate)})` : ""}${m.snippet ? ` — ${cell(m.snippet).slice(0, 140)}` : ""}`)
  }
  return out.join("\n")
}

/** Luồng mail nhắc tới thực thể (tên/bí danh ≥3 ký tự trong tiêu đề, đối tác hoặc tóm tắt). */
export function threadsFor(p: { name: string; aliases: string[] }, rows: MailThreadRow[]): MailThreadRow[] {
  const keys = [p.name, ...p.aliases].map(fold).filter(k => k.length >= 3)
  return rows.filter(r => { const hay = fold(`${r.subject} ${r.counterparty} ${r.summary}`); return keys.some(k => hay.includes(k)) })
}

/** Sự việc liên quan thực thể: vendor trùng tên/bí danh, hoặc đối tượng chứa tên (thực thể không phải vendor). */
export function factsFor(p: { name: string; kind: EntityKind; aliases: string[] }, facts: FactRow[]): FactRow[] {
  const keys = [p.name, ...p.aliases].map(fold).filter(k => k.length >= 2)
  return facts.filter(f => f.status === "active" && (keys.includes(fold(f.vendor)) || (p.kind !== "vendor" && keys.some(k => k.length >= 3 && fold(f.subject).includes(k)))))
}

/** Băm nội dung để chỉ cập nhật tài liệu Lark khi nội dung thật sự đổi (FNV-1a 32-bit, đủ cho mục đích này). */
export function contentHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16)
}

export interface IndexEntry { name: string; kind: EntityKind; url: string; facts: number; mentions: number }
/** Mục lục các hồ sơ: bảng vendor/thực thể → link tài liệu, số sự việc, số nguồn. */
export function indexMarkdown(entries: IndexEntry[]): string {
  const out = [`> Tài liệu TỰ SINH từ Kho Argon (một chiều) — sửa tay sẽ bị ghi đè.`, "", "| Tên | Loại | Sự việc đang hiệu lực | Số nguồn |", "| --- | --- | --- | --- |"]
  for (const e of [...entries].sort((a, b) => b.facts - a.facts || b.mentions - a.mentions || a.name.localeCompare(b.name))) out.push(`| [${cell(e.name)}](${e.url}) | ${ENTITY_KINDS[e.kind]} | ${e.facts} | ${e.mentions} |`)
  return out.join("\n")
}

export interface VendorTarget { name: string; codes: string[]; entity: { id: number; aliases: string[]; mentions: number } | null }
/** Danh sách hồ sơ = vendor trong DB (ref_vendors), KHÔNG phải thực thể do AI đoán từ văn bản. Trùng tên (vd Simstore SI/SS) gộp một hồ sơ; ghép với thực thể graph theo tên/bí danh khớp CHÍNH XÁC để lấy bí danh và nơi được nhắc. */
export function vendorTargets(db: { vendor_code: string; name: string }[], entities: { id: number; name: string; aliases: string[]; mentions: number }[]): VendorTarget[] {
  const byName = new Map<string, VendorTarget>()
  for (const v of db) {
    const name = String(v.name ?? "").trim()
    if (!name) continue
    const k = fold(name)
    const hit = byName.get(k)
    if (hit) { hit.codes.push(v.vendor_code); continue }
    const e = entities.find(x => fold(x.name) === k || x.aliases.some(a => fold(a) === k))
    byName.set(k, { name, codes: [v.vendor_code], entity: e ? { id: e.id, aliases: e.aliases, mentions: e.mentions } : null })
  }
  return [...byName.values()]
}

export interface WikiNodeLite { title: string; nodeToken: string; objType: string; parent: string | null }
const hasWord = (hay: string, key: string) => ` ${hay} `.includes(` ${key} `)
const nameKeys = (p: { name: string; aliases: string[] }) => [...new Set([p.name, p.name.replace(/\(.*?\)/g, ""), ...p.aliases].map(fold))].filter(k => k.length >= 3)

/** Trí nhớ bot liên quan vendor: chỉ loại quyết định/dự án/người/khác (bỏ hồ sơ + sở thích cá nhân), và phải nhắc đúng tên/bí danh vendor (theo từ). */
export const MEMORY_KINDS_PUBLISHED = ["decision", "project", "person", "other"] as const
export function memoriesFor(p: { name: string; aliases: string[] }, mems: { kind: string; content: string }[]): string[] {
  const keys = nameKeys(p)
  const hit = (s: string) => keys.some(k => hasWord(fold(s), k))
  const out: string[] = []
  for (const m of mems) {
    if (!(MEMORY_KINDS_PUBLISHED as readonly string[]).includes(m.kind) || !hit(m.content)) continue
    // Trí nhớ dài liệt kê nhiều vendor ("Telco Update…: - A…; - B…"): chỉ giữ tiêu đề + đoạn nhắc tới vendor này, không đổ cả bản tin vào mọi hồ sơ.
    const segs = m.content.split(/\n+|\s+-\s+|;\s+/).map(s => s.trim()).filter(Boolean)
    const text = segs.length <= 1 || hit(segs[0]) ? m.content : `${segs[0].replace(/:$/, "")}: ${segs.slice(1).filter(hit).join("; ")}`
    out.push(text.replace(/\s+/g, " ").trim().slice(0, 500))
  }
  return out
}

export interface PolicyCell { header: string; text: string }
const CREDENTIAL_TITLE = /account|password|mat khau|tai khoan|credential/
/** Trang Wiki (docx) của một vendor: khớp cả hai chiều (tiêu đề chứa tên vendor, hoặc tên vendor chứa cả cụm tiêu đề — "Viettech" ↔ "VN Viettech (Viettel)"), bỏ phần trong ngoặc của tên vendor, loại trang tài khoản/mật khẩu. */
export function wikiNodesFor(p: { name: string; aliases: string[] }, nodes: WikiNodeLite[]): WikiNodeLite[] {
  const keys = [...new Set([...nameKeys(p), fold(p.name.replace(/\(.*?\)/g, ""))].filter(k => k.length >= 3))]
  const core = (t: string) => fold(t).replace(/^about /, "")
  const ok = (n: WikiNodeLite) => !CREDENTIAL_TITLE.test(fold(n.title))
  const direct = nodes.filter(n => ok(n) && keys.some(k => hasWord(fold(n.title), k) || (core(n.title).length >= 3 && hasWord(k, core(n.title)))))
  const picked = new Map<string, WikiNodeLite>(direct.map(n => [n.nodeToken, n]))
  let grew = true
  while (grew) { grew = false; for (const n of nodes) if (ok(n) && !picked.has(n.nodeToken) && n.parent && picked.has(n.parent)) { picked.set(n.nodeToken, n); grew = true } }
  return [...picked.values()].filter(n => n.objType === "docx")
}

/** Hàng của bảng chính sách thuộc vendor: nhãn hàng (tách theo "/"; "DTac / TrueMove" là hai vendor) trùng MÃ vendor, trùng tên, hoặc tên vendor chứa cả cụm nhãn (nhãn ≥3 ký tự: "China Unicom" ↔ "China Unicom Hong Kong"). Chỉ khớp phần ĐẦU tên vendor (không khớp "VN Viettech (MobiFone)" với nhãn Mobifone). Nhãn ngắn (BC, WM) chỉ khớp mã. */
export function policyRowFor(p: { name: string; codes: string[] }, table: { headers: string[]; rows: string[][] }): PolicyCell[] | null {
  const nameKey = fold(p.name), codes = p.codes.map(fold)
  const row = table.rows.find(r => (r[0] ?? "").split("/").map(fold).filter(Boolean).some(k => k === nameKey || codes.includes(k) || (k.length >= 3 && nameKey.startsWith(`${k} `))))
  if (!row) return null
  const cells = table.headers.slice(1).map((h, i) => ({ header: h, text: (row[i + 1] ?? "").trim() })).filter(c => c.header && c.text)
  return cells.length ? cells : null
}
