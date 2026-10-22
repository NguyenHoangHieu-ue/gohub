// "Cuộc gọi": phiên dịch trực tiếp + gợi ý trả lời + tổng hợp cuối buổi cho các cuộc gọi vendor (Meet, WhatsApp…). Phần THUẦN (không I/O) dùng chung server + giao diện.
// Luồng: tiếng đối tác (tab/âm thanh hệ thống) → Gemini Live dịch ra phụ đề Anh/Việt; mic của anh chỉ được chép chữ (phục vụ gợi ý và tổng hợp).
export type CallWho = "partner" | "me"
export interface CallLine { id: number; who: CallWho; en: string; vi: string; final: boolean; at: number }

const NEW_LINE_GAP_MS = 3500

/** Ghép một mẩu chữ mới vào danh sách dòng. partner: `en` = lời gốc (inputTranscription), `vi` = bản dịch (outputTranscription); me: chỉ `en`.
 *  Dòng partner mới bắt đầu khi lời gốc mới tới mà dòng trước đã có bản dịch/đã chốt (nghĩa là câu trước xong rồi). Thuần: trả mảng mới. */
export function appendChunk(lines: CallLine[], who: CallWho, field: "en" | "vi", text: string, now: number): CallLine[] {
  if (!text) return lines
  const out = lines.map(l => ({ ...l }))
  let last: CallLine | undefined
  for (let i = out.length - 1; i >= 0; i--) if (out[i].who === who) { last = out[i]; break }
  const startNew = !last || last.final
    || (field === "en" && who === "partner" && !!last.vi)
    || (who === "me" && now - last.at > NEW_LINE_GAP_MS)
  if (startNew) {
    if (field === "vi" && last && !last.final) { last.vi += text; last.at = now; return out }   // bản dịch tới sau khi lời gốc đã chốt: gắn vào dòng gần nhất
    const id = (out.reduce((m, l) => Math.max(m, l.id), 0)) + 1
    out.push({ id, who, en: field === "en" ? text : "", vi: field === "vi" ? text : "", final: false, at: now })
    return out
  }
  last![field] += text
  last!.at = now
  return out
}

/** Chốt dòng đang mở của `who` (khi Live báo hết lượt nói). */
export function finalizeLast(lines: CallLine[], who: CallWho): CallLine[] {
  const idx = [...lines].reverse().findIndex(l => l.who === who && !l.final)
  if (idx < 0) return lines
  const i = lines.length - 1 - idx
  return lines.map((l, k) => (k === i ? { ...l, final: true } : l))
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

/** Có nên xin gợi ý trả lời cho dòng này không: lời đối tác đã chốt, từ 4 từ trở lên. */
export const shouldSuggest = (l: CallLine) => l.who === "partner" && l.final && wordCount(l.en) >= 4

// Con số / tiền / dung lượng / thời hạn: tô nổi ở phụ đề vì dễ nghe nhầm và là chỗ nên xác nhận lại trước khi chốt.
const NUM_RE = /(?:[$€£¥]\s?)?\d[\d.,]*(?:\s?(?:%|usd|hkd|cny|rmb|eur|jpy|thb|vnd|gb|tb|mb|mbps|sims?|esims?|days?|months?|weeks?|hours?|k\b|m\b))?/gi
export function highlightParts(text: string): { t: string; num: boolean }[] {
  const out: { t: string; num: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(NUM_RE)) {
    if (m.index === undefined) continue
    if (m.index > last) out.push({ t: text.slice(last, m.index), num: false })
    out.push({ t: m[0], num: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last), num: false })
  return out
}
export const extractNumbers = (text: string) => Array.from(text.matchAll(NUM_RE)).map(m => m[0].trim()).filter(s => /\d/.test(s))

// ── Gợi ý trả lời ────────────────────────────────────────────────────────────
export interface Suggestion { en: string; vi: string; basis: string[] }
export interface SuggestResult { suggestions: Suggestion[]; confirm: string[]; ask: string[] }

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "")
const strs = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v.map(x => str(x, len)).filter(Boolean).slice(0, n) : [])

/** Chuẩn hoá JSON gợi ý do model trả: tối đa 2 câu, bỏ câu rỗng. Không hợp lệ → null. */
export function normalizeSuggest(raw: string): SuggestResult | null {
  const m = /\{[\s\S]*\}/.exec(raw)
  if (!m) return null
  let o: Record<string, unknown>
  try { o = JSON.parse(m[0]) } catch { return null }
  const sug = (Array.isArray(o.suggestions) ? o.suggestions : []).map(s => {
    const r = (s ?? {}) as Record<string, unknown>
    return { en: str(r.en, 400), vi: str(r.vi, 400), basis: strs(r.basis, 4, 160) }
  }).filter(s => s.en).slice(0, 2)
  if (!sug.length) return null
  return { suggestions: sug, confirm: strs(o.confirm, 4, 160), ask: strs(o.ask, 3, 200) }
}

// ── Tổng hợp cuối buổi ───────────────────────────────────────────────────────
export interface CallSummary {
  title: string; summary: string; decisions: string[]; numbers: { what: string; value: string; who: string }[]
  actions: { who: string; what: string; due: string }[]; open: string[]; email: string
}
export function normalizeSummary(raw: string): CallSummary | null {
  const m = /\{[\s\S]*\}/.exec(raw)
  if (!m) return null
  let o: Record<string, unknown>
  try { o = JSON.parse(m[0]) } catch { return null }
  const summary = str(o.summary, 1500)
  if (!summary) return null
  const objs = (v: unknown) => (Array.isArray(v) ? v.filter(x => x && typeof x === "object") as Record<string, unknown>[] : [])
  return {
    title: str(o.title, 120) || "Cuộc gọi", summary, decisions: strs(o.decisions, 12, 300),
    numbers: objs(o.numbers).map(r => ({ what: str(r.what, 160), value: str(r.value, 80), who: str(r.who, 40) })).filter(r => r.what && r.value).slice(0, 20),
    actions: objs(o.actions).map(r => ({ who: str(r.who, 40), what: str(r.what, 240), due: str(r.due, 40) })).filter(r => r.what).slice(0, 15),
    open: strs(o.open, 10, 240), email: typeof o.email === "string" ? o.email.trim().slice(0, 3000) : "",
  }
}

const hm = (t: number) => new Date(t + 7 * 3_600_000).toISOString().slice(11, 16)
/** Bản transcript song ngữ (Markdown) lưu cùng bản tổng hợp để tìm lại được sau này. */
export function transcriptMd(lines: CallLine[]): string {
  return lines.filter(l => l.en.trim() || l.vi.trim()).map(l => `**${l.who === "partner" ? "Đối tác" : "Anh"}** (${hm(l.at)}): ${l.en.trim()}${l.who === "partner" && l.vi.trim() ? `  \n*${l.vi.trim()}*` : ""}`).join("\n\n")
}

export function summaryMd(s: CallSummary, meta: { vendor: string; goal: string; startedAt: number; minutes: number }): string {
  const list = (xs: string[]) => (xs.length ? xs.map(x => `- ${x}`).join("\n") : "- (không có)")
  return [
    `# ${s.title}`,
    `*${meta.vendor ? `Đối tác: ${meta.vendor} · ` : ""}${new Date(meta.startedAt + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ")} · ${meta.minutes} phút${meta.goal ? ` · Mục tiêu: ${meta.goal}` : ""}*`,
    `## Tóm tắt\n${s.summary}`,
    `## Quyết định\n${list(s.decisions)}`,
    `## Con số đã nêu\n${s.numbers.length ? s.numbers.map(n => `- ${n.what}: **${n.value}**${n.who ? ` (${n.who})` : ""}`).join("\n") : "- (không có)"}`,
    `## Việc cần làm\n${s.actions.length ? s.actions.map(a => `- [ ] ${a.what}${a.who ? ` — ${a.who}` : ""}${a.due ? ` — hạn ${a.due}` : ""}`).join("\n") : "- (không có)"}`,
    `## Còn mở\n${list(s.open)}`,
    ...(s.email ? [`## Email xác nhận (nháp)\n${s.email}`] : []),
  ].join("\n\n")
}
