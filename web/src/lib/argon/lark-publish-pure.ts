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
}

const dmy = (d: string | null) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "")
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim()

/** Markdown hồ sơ 1 thực thể. KHÔNG chứa ngày giờ cập nhật (để băm nội dung ổn định); ngày cập nhật do nơi gọi thêm riêng. */
export function profileMarkdown(p: ProfileInput, now = Date.now()): string {
  const out: string[] = [`> ${ENTITY_KINDS[p.kind]}${p.aliases.length ? ` · còn gọi: ${p.aliases.join(", ")}` : ""}. Tài liệu TỰ SINH từ Kho Argon — sửa tay ở đây sẽ bị ghi đè; muốn đổi thông tin hãy sửa ở Argon (Kho › Sổ sự việc).`]
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
