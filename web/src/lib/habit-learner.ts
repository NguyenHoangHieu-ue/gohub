// Học thói quen ngầm (plan personal-agent — đề xuất 2026-10-11, bước H0 = CHỈ CHẠY THỬ, KHÔNG LƯU).
// Nguyên tắc: SỐ LIỆU tính bằng code (tất định, có ngưỡng bằng chứng), model chỉ diễn đạt lại thành câu ngắn.
// Chỉ dùng câu NGƯỜI DÙNG gõ + tool đã gọi + 👍/👎; không đọc kết quả tool/nội dung web; không giữ nguyên văn tin nhắn.
import { tokenize } from "@/lib/begau-insights"

export interface HabitEvent { created_at: string; user_message?: string | null; tools_used?: string[] | null; agent_id?: string | null; user_email?: string | null }
export interface HabitFeedback { rating: number; answer?: string | null; created_at: string }

export const MIN_COUNT = 4      // số lần tối thiểu để coi là thói quen
export const MIN_WEEKS = 3      // ... trải trên ít nhất bấy nhiêu tuần khác nhau
const WEEKDAY = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]

// Không bao giờ học/nhắc tới: sức khoẻ, tôn giáo, chính trị, lương/tài chính cá nhân, quan hệ riêng.
const SENSITIVE_RE = /(lương|thưởng|vay|nợ|bệnh|ốm|thai|sức khoẻ|sức khỏe|tôn giáo|chính trị|bầu cử|đảng|ly hôn|người yêu|tình cảm|mật khẩu|password|token|cmnd|cccd|tài khoản ngân hàng)/i

export interface HabitCandidate {
  kind: "topic" | "weekday_topic" | "tool" | "time_of_day" | "channel" | "style" | "format" | "feedback"
  key: string
  detail: string
  count: number
  weeks: number
}

export interface HabitStats {
  events: number
  activeDays: number
  weeks: number
  from: string | null
  to: string | null
  avgLen: number
  shortShare: number
  channels: Record<string, number>
  hours: Record<string, number>
  tools: Record<string, number>
  feedback: { up: number; down: number; upWithTable: number; upLong: number }
}

const vn = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000)          // giờ Việt Nam (UTC+7)
const dayKey = (iso: string) => Math.floor(vn(iso).getTime() / 86_400_000)
const weekKey = (iso: string) => Math.floor((dayKey(iso) + 3) / 7)                       // tuần bắt đầu thứ Hai (epoch ngày 0 = thứ Năm)
const hourBucket = (iso: string) => { const h = vn(iso).getUTCHours(); return h < 6 ? "khuya" : h < 12 ? "sáng" : h < 18 ? "chiều" : "tối" }

/** Mỗi tin → tập từ khoá (từ đơn + cụm 2 từ) để đếm "mấy tin có từ này" (không đếm trùng trong 1 tin). */
function termSet(text: string): Set<string> {
  const w = tokenize(text)
  const s = new Set<string>(w)
  for (let i = 0; i < w.length - 1; i++) s.add(`${w[i]} ${w[i + 1]}`)
  return s
}

const NO_DIACRITIC_HINT = /\b(khong|duoc|bao nhieu|doanh thu|cho minh|nhu the|giup|xem|thang|tuan|khach)\b/i
const HAS_VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

const FORMAT_ASKS: { key: string; re: RegExp; label: string }[] = [
  { key: "excel", re: /(excel|xlsx|file excel|bảng tính)/i, label: "hay xin file Excel" },
  { key: "table", re: /(dạng bảng|bảng so sánh|lập bảng|\btable\b)/i, label: "hay yêu cầu trình bày dạng bảng" },
  { key: "chart", re: /(biểu đồ|chart|vẽ đồ thị)/i, label: "hay yêu cầu biểu đồ" },
  { key: "short", re: /(ngắn gọn|tóm tắt|ngắn thôi|một dòng|1 dòng)/i, label: "hay yêu cầu trả lời ngắn gọn/tóm tắt" },
  { key: "report", re: /(báo cáo|report|biên bản)/i, label: "hay nhờ làm báo cáo" },
]

export function computeHabits(events: HabitEvent[], feedback: HabitFeedback[] = []): { stats: HabitStats; candidates: HabitCandidate[] } {
  const msgs = events.filter(e => (e.user_message ?? "").trim().length >= 6 && !(e.user_message ?? "").startsWith("[Đã "))
  const weeksSet = new Set(msgs.map(e => weekKey(e.created_at)))
  const daysSet = new Set(msgs.map(e => dayKey(e.created_at)))
  const sorted = [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const lens = msgs.map(e => (e.user_message ?? "").trim().length)

  const channels: Record<string, number> = {}, hours: Record<string, number> = {}, tools: Record<string, number> = {}
  for (const e of msgs) {
    const ch = (e.user_email ?? "").startsWith("lark:") ? "Lark" : "Web"
    channels[ch] = (channels[ch] ?? 0) + 1
    const hb = hourBucket(e.created_at); hours[hb] = (hours[hb] ?? 0) + 1
    for (const t of new Set(e.tools_used ?? [])) tools[t] = (tools[t] ?? 0) + 1
  }
  const fbUp = feedback.filter(f => f.rating === 1), fbDown = feedback.filter(f => f.rating === -1)
  const stats: HabitStats = {
    events: msgs.length, activeDays: daysSet.size, weeks: weeksSet.size,
    from: sorted[0]?.created_at ?? null, to: sorted.at(-1)?.created_at ?? null,
    avgLen: lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0,
    shortShare: lens.length ? +(lens.filter(l => l < 40).length / lens.length).toFixed(2) : 0,
    channels, hours, tools,
    feedback: {
      up: fbUp.length, down: fbDown.length,
      upWithTable: fbUp.filter(f => /\|.*\|/.test(f.answer ?? "")).length,
      upLong: fbUp.filter(f => (f.answer ?? "").length > 600).length,
    },
  }

  const candidates: HabitCandidate[] = []
  const weeksOf = (idx: number[]) => new Set(idx.map(i => weekKey(msgs[i].created_at))).size

  // 1) Chủ đề lặp + nhịp theo thứ trong tuần — mỗi từ khoá: bao nhiêu tin, trải bao nhiêu tuần, có dồn vào 1 thứ không.
  const termIdx = new Map<string, number[]>()
  msgs.forEach((e, i) => { for (const t of termSet(e.user_message ?? "")) { const a = termIdx.get(t); a ? a.push(i) : termIdx.set(t, [i]) } })
  const topicCands: { term: string; idx: number[] }[] = []
  termIdx.forEach((idx, term) => { if (idx.length >= MIN_COUNT && weeksOf(idx) >= MIN_WEEKS && !SENSITIVE_RE.test(term)) topicCands.push({ term, idx }) })
  topicCands.sort((a, b) => b.idx.length - a.idx.length || b.term.length - a.term.length)
  const taken: { term: string; n: number }[] = []
  for (const c of topicCands) {
    // bỏ từ đơn nằm trong cụm 2 từ đã chọn có số lần gần bằng (tránh lặp "doanh" / "doanh thu")
    if (taken.some(t => t.term.includes(c.term) && t.n >= c.idx.length * 0.8)) continue
    taken.push({ term: c.term, n: c.idx.length })
    if (taken.length > 8) break
    const byDay = new Array(7).fill(0)
    for (const i of c.idx) byDay[vn(msgs[i].created_at).getUTCDay()]++
    const top = byDay.indexOf(Math.max(...byDay))
    const share = byDay[top] / c.idx.length
    if (share >= 0.6 && c.idx.length >= MIN_COUNT)
      candidates.push({ kind: "weekday_topic", key: c.term, detail: `hỏi về "${c.term}" chủ yếu vào ${WEEKDAY[top]} (${byDay[top]}/${c.idx.length} lần)`, count: c.idx.length, weeks: weeksOf(c.idx) })
    else
      candidates.push({ kind: "topic", key: c.term, detail: `hay hỏi về "${c.term}" (${c.idx.length} lần)`, count: c.idx.length, weeks: weeksOf(c.idx) })
  }

  // 2) Tool hay dùng (≥ MIN_COUNT lần, ≥ MIN_WEEKS tuần).
  const toolIdx = new Map<string, number[]>()
  msgs.forEach((e, i) => { for (const t of new Set(e.tools_used ?? [])) { const a = toolIdx.get(t); a ? a.push(i) : toolIdx.set(t, [i]) } })
  toolIdx.forEach((idx, t) => {
    if (idx.length >= MIN_COUNT && weeksOf(idx) >= MIN_WEEKS)
      candidates.push({ kind: "tool", key: t, detail: `hay dùng công cụ ${t} (${idx.length} lần)`, count: idx.length, weeks: weeksOf(idx) })
  })

  // 3) Khung giờ, kênh.
  const n = msgs.length
  if (n >= 10 && weeksSet.size >= MIN_WEEKS) {
    const [hb, hc] = Object.entries(hours).sort((a, b) => b[1] - a[1])[0] ?? []
    if (hb && hc / n >= 0.6) candidates.push({ kind: "time_of_day", key: hb, detail: `thường nhắn vào buổi ${hb} (${hc}/${n} tin)`, count: hc, weeks: weeksSet.size })
  }
  if (n >= 8 && weeksSet.size >= MIN_WEEKS) {
    const [ch, cc] = Object.entries(channels).sort((a, b) => b[1] - a[1])[0] ?? []
    if (ch && cc / n >= 0.7) candidates.push({ kind: "channel", key: ch, detail: `chủ yếu dùng kênh ${ch} (${cc}/${n} tin)`, count: cc, weeks: weeksSet.size })
  }

  // 4) Văn phong.
  if (n >= 8 && weeksSet.size >= MIN_WEEKS) {
    if (stats.shortShare >= 0.6) candidates.push({ kind: "style", key: "short", detail: `hay nhắn ngắn (${Math.round(stats.shortShare * 100)}% tin dưới 40 ký tự, TB ${stats.avgLen})`, count: Math.round(stats.shortShare * n), weeks: weeksSet.size })
    else if (stats.avgLen >= 140) candidates.push({ kind: "style", key: "long", detail: `hay nhắn dài, nhiều chi tiết (TB ${stats.avgLen} ký tự)`, count: n, weeks: weeksSet.size })
    const noDia = msgs.filter(e => { const t = e.user_message ?? ""; return t.length >= 15 && !HAS_VI_DIACRITIC.test(t) && NO_DIACRITIC_HINT.test(t) }).length
    if (noDia >= MIN_COUNT && noDia / n >= 0.3) candidates.push({ kind: "style", key: "no_diacritics", detail: `hay gõ tiếng Việt không dấu (${noDia}/${n} tin)`, count: noDia, weeks: weeksSet.size })
  }
  for (const f of FORMAT_ASKS) {
    const idx = msgs.map((e, i) => (f.re.test(e.user_message ?? "") ? i : -1)).filter(i => i >= 0)
    if (idx.length >= MIN_COUNT && weeksOf(idx) >= MIN_WEEKS) candidates.push({ kind: "format", key: f.key, detail: `${f.label} (${idx.length} lần)`, count: idx.length, weeks: weeksOf(idx) })
  }

  // 5) Phản hồi 👍/👎 — kiểu câu trả lời được đánh giá tốt.
  const fb = stats.feedback
  if (fb.up >= MIN_COUNT) {
    if (fb.upWithTable / fb.up >= 0.6) candidates.push({ kind: "feedback", key: "table", detail: `hay 👍 câu trả lời có bảng (${fb.upWithTable}/${fb.up})`, count: fb.upWithTable, weeks: 0 })
    if (fb.upLong / fb.up <= 0.2) candidates.push({ kind: "feedback", key: "concise", detail: `hay 👍 câu trả lời ngắn (${fb.up - fb.upLong}/${fb.up} dưới 600 ký tự)`, count: fb.up - fb.upLong, weeks: 0 })
  }
  if (fb.down >= MIN_COUNT) candidates.push({ kind: "feedback", key: "down", detail: `đã 👎 ${fb.down} câu trả lời (cần xem nguyên nhân)`, count: fb.down, weeks: 0 })

  return { stats, candidates: candidates.filter(c => !SENSITIVE_RE.test(c.detail)) }
}

export const isSensitiveHabit = (s: string) => SENSITIVE_RE.test(s)
