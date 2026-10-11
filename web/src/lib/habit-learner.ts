// Học thói quen ngầm (plan personal-agent — đề xuất 2026-10-11; H0 = chạy thử không lưu, H0.5 = sửa chất lượng trích xuất).
// Nguyên tắc: SỐ LIỆU tính bằng code (tất định, có ngưỡng bằng chứng), model chỉ diễn đạt lại thành câu ngắn.
// Chỉ dùng câu NGƯỜI DÙNG gõ + tool đã gọi + 👍/👎; không đọc kết quả tool/nội dung web; không giữ nguyên văn tin nhắn.
// H0.5: "thói quen" phải ĐẶC TRƯNG cho người đó so với phần còn lại của công ty (lift theo baseline) — không phải điều ai cũng làm.
import { tokenize } from "@/lib/begau-insights"

export interface HabitEvent { created_at: string; user_message?: string | null; tools_used?: string[] | null; agent_id?: string | null; user_email?: string | null }
export interface HabitFeedback { rating: number; answer?: string | null; created_at: string }

export const MIN_COUNT = 4      // số lần tối thiểu để coi là thói quen
export const MIN_WEEKS = 3      // ... trải trên ít nhất bấy nhiêu tuần khác nhau
export const MIN_LIFT = 3       // chủ đề: tỉ lệ ở người này phải gấp ≥ bấy nhiêu lần tỉ lệ ở phần còn lại của công ty
const WEEKDAY = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]

// Không bao giờ học/nhắc tới: sức khoẻ, tôn giáo, chính trị, lương/tài chính cá nhân, quan hệ riêng.
const SENSITIVE_RE = /(lương|thưởng|vay|nợ|bệnh|ốm|thai|sức khoẻ|sức khỏe|tôn giáo|chính trị|bầu cử|đảng|ly hôn|người yêu|tình cảm|mật khẩu|password|token|cmnd|cccd|tài khoản ngân hàng)/i

// Tool lõi mà ai cũng gọi — dùng nhiều không nói lên thói quen riêng.
const CORE_TOOLS = new Set(["executeSQL", "querySupabase", "listSupabaseTables", "queryProduct", "searchKnowledgeBase", "readKnowledgeBase", "loadSkill", "assistantMemory", "searchPastConversations", "updatePlan"])

// Âm tiết tiếng Việt quá chung: tokenize tách theo âm tiết nên "thông tin" thành "thông"/"tin"; chỉ cho đứng trong cụm ≥2 âm tiết.
const GENERIC_SYLLABLES = new Set(["gửi", "lại", "thông", "tin", "phẩm", "sản", "giá", "gói", "xem", "lấy", "tìm", "tra", "cứu", "làm", "thêm", "sửa", "đổi", "nhờ", "tên", "số", "bảng", "file", "trang", "mới", "cũ", "nào", "đây", "đấy", "thôi", "luôn", "check", "list", "cho", "biết", "lên", "xuống", "ra", "vào", "tháng", "tuần", "năm", "quý", "hôm", "qua", "trước", "sau", "nữa", "thử", "xong", "tiếp", "tất", "cả"])

export interface HabitCandidate {
  kind: "topic" | "weekday_topic" | "tool" | "time_of_day" | "channel" | "style" | "format" | "feedback"
  key: string
  detail: string
  count: number
  weeks: number
  lift?: number
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

/** Số liệu toàn công ty (mọi người) để so sánh: tần suất từ khoá/tool/định dạng, tỉ lệ kênh, độ dài. */
export interface HabitBaseline {
  n: number
  termDf: Map<string, number>
  toolDf: Map<string, number>
  formatDf: Record<string, number>
  lark: number
  shortShare: number
  avgLen: number
}

const vn = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000)          // giờ Việt Nam (UTC+7)
const dayKey = (iso: string) => Math.floor(vn(iso).getTime() / 86_400_000)
const weekKey = (iso: string) => Math.floor((dayKey(iso) + 3) / 7)                       // tuần bắt đầu thứ Hai (epoch ngày 0 = thứ Năm)
const hourBucket = (iso: string) => { const h = vn(iso).getUTCHours(); return h < 6 ? "khuya" : h < 12 ? "sáng" : h < 18 ? "chiều" : "tối" }

/** Mỗi tin → tập từ khoá: cụm 2–3 âm tiết + từ đơn "đặc trưng" (mã/viết hoa/dài, không nằm trong danh sách âm tiết chung). */
function termSet(text: string): Set<string> {
  const w = tokenize(text)
  const s = new Set<string>()
  for (let i = 0; i < w.length - 1; i++) {
    s.add(`${w[i]} ${w[i + 1]}`)
    if (i < w.length - 2) s.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`)
  }
  for (const t of w) if (t.length >= 4 && !GENERIC_SYLLABLES.has(t) && !/^\d+$/.test(t)) s.add(t)
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

const validMsgs = (events: HabitEvent[]) => events.filter(e => (e.user_message ?? "").trim().length >= 6 && !(e.user_message ?? "").startsWith("[Đã "))

/** Baseline từ TẤT CẢ tin trong cửa sổ (mọi người). Tính 1 lần, dùng lại cho từng người. */
export function buildBaseline(events: HabitEvent[]): HabitBaseline {
  const msgs = validMsgs(events)
  const termDf = new Map<string, number>(), toolDf = new Map<string, number>(), formatDf: Record<string, number> = {}
  let lark = 0, short = 0, len = 0
  for (const e of msgs) {
    const text = e.user_message ?? ""
    for (const t of termSet(text)) termDf.set(t, (termDf.get(t) ?? 0) + 1)
    for (const t of new Set(e.tools_used ?? [])) toolDf.set(t, (toolDf.get(t) ?? 0) + 1)
    for (const f of FORMAT_ASKS) if (f.re.test(text)) formatDf[f.key] = (formatDf[f.key] ?? 0) + 1
    if ((e.user_email ?? "").startsWith("lark:")) lark++
    const l = text.trim().length; len += l; if (l < 40) short++
  }
  return { n: msgs.length, termDf, toolDf, formatDf, lark, shortShare: msgs.length ? short / msgs.length : 0, avgLen: msgs.length ? len / msgs.length : 0 }
}

export function computeHabits(events: HabitEvent[], feedback: HabitFeedback[] = [], baseline?: HabitBaseline): { stats: HabitStats; candidates: HabitCandidate[] } {
  const msgs = validMsgs(events)
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
  const n = msgs.length
  const stats: HabitStats = {
    events: n, activeDays: daysSet.size, weeks: weeksSet.size,
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

  // "Phần còn lại của công ty" = baseline trừ chính người này. Không có baseline → không so sánh (hành vi H0).
  const otherN = baseline ? Math.max(1, baseline.n - n) : 0
  const lift = (own: number, ownN: number, allDf: number | undefined): number => {
    if (!baseline) return Infinity
    const otherRate = Math.max(0, (allDf ?? 0) - own) / otherN
    return (own / Math.max(1, ownN)) / Math.max(otherRate, 0.005)
  }

  const candidates: HabitCandidate[] = []
  const weeksOf = (idx: number[]) => new Set(idx.map(i => weekKey(msgs[i].created_at))).size

  // 1) Chủ đề ĐẶC TRƯNG (lift ≥ MIN_LIFT so với công ty) + nhịp theo thứ trong tuần.
  const termIdx = new Map<string, number[]>()
  msgs.forEach((e, i) => { for (const t of termSet(e.user_message ?? "")) { const a = termIdx.get(t); a ? a.push(i) : termIdx.set(t, [i]) } })
  const topicCands: { term: string; idx: number[]; lift: number }[] = []
  termIdx.forEach((idx, term) => {
    if (idx.length < MIN_COUNT || weeksOf(idx) < MIN_WEEKS || SENSITIVE_RE.test(term)) return
    const l = lift(idx.length, n, baseline?.termDf.get(term))
    if (l >= MIN_LIFT) topicCands.push({ term, idx, lift: l })
  })
  // Cụm dài trước (cụ thể hơn), rồi nhiều lần hơn; bỏ cụm con nằm trong cụm đã chọn có số lần gần bằng.
  topicCands.sort((a, b) => b.term.split(" ").length - a.term.split(" ").length || b.idx.length - a.idx.length)
  const taken: { term: string; n: number }[] = []
  for (const c of topicCands) {
    if (taken.some(t => t.term.includes(c.term) && t.n >= c.idx.length * 0.7)) continue
    taken.push({ term: c.term, n: c.idx.length })
    const byDay = new Array(7).fill(0)
    for (const i of c.idx) byDay[vn(msgs[i].created_at).getUTCDay()]++
    const top = byDay.indexOf(Math.max(...byDay))
    const share = byDay[top] / c.idx.length
    const liftInfo = Number.isFinite(c.lift) ? ` — nhiều gấp ${c.lift.toFixed(1)} lần mức chung` : ""
    if (share >= 0.6)
      candidates.push({ kind: "weekday_topic", key: c.term, detail: `hỏi về "${c.term}" chủ yếu vào ${WEEKDAY[top]} (${byDay[top]}/${c.idx.length} lần)${liftInfo}`, count: c.idx.length, weeks: weeksOf(c.idx), lift: c.lift })
    else
      candidates.push({ kind: "topic", key: c.term, detail: `hay hỏi về "${c.term}" (${c.idx.length} lần)${liftInfo}`, count: c.idx.length, weeks: weeksOf(c.idx), lift: c.lift })
  }
  candidates.sort((a, b) => (b.lift ?? 0) * b.count - (a.lift ?? 0) * a.count)
  const topics = candidates.filter(c => c.kind === "topic" || c.kind === "weekday_topic").slice(0, 6)
  candidates.length = 0
  candidates.push(...topics)

  // 2) Tool: bỏ tool lõi; có baseline thì phải dùng nhiều hơn mức chung ≥2 lần.
  const toolIdx = new Map<string, number[]>()
  msgs.forEach((e, i) => { for (const t of new Set(e.tools_used ?? [])) { const a = toolIdx.get(t); a ? a.push(i) : toolIdx.set(t, [i]) } })
  toolIdx.forEach((idx, t) => {
    if (CORE_TOOLS.has(t) || idx.length < MIN_COUNT || weeksOf(idx) < MIN_WEEKS) return
    const l = lift(idx.length, n, baseline?.toolDf.get(t))
    if (l >= 2) candidates.push({ kind: "tool", key: t, detail: `hay dùng công cụ ${t} (${idx.length} lần)`, count: idx.length, weeks: weeksOf(idx), lift: l })
  })

  // 3) Khung giờ; kênh (chỉ khi KHÁC số đông: người này dùng Lark nhiều hơn công ty ≥20 điểm %).
  if (n >= 10 && weeksSet.size >= MIN_WEEKS) {
    const [hb, hc] = Object.entries(hours).sort((a, b) => b[1] - a[1])[0] ?? []
    if (hb && hc / n >= 0.6) candidates.push({ kind: "time_of_day", key: hb, detail: `thường nhắn vào buổi ${hb} (${hc}/${n} tin)`, count: hc, weeks: weeksSet.size })
  }
  if (n >= 8 && weeksSet.size >= MIN_WEEKS) {
    const larkShare = (channels.Lark ?? 0) / n
    const otherLark = baseline ? Math.max(0, baseline.lark - (channels.Lark ?? 0)) / otherN : 0
    if (larkShare >= 0.5 && larkShare >= otherLark + 0.2) candidates.push({ kind: "channel", key: "Lark", detail: `hay dùng Bé Gấu qua Lark (${channels.Lark}/${n} tin, công ty ${Math.round(otherLark * 100)}%)`, count: channels.Lark ?? 0, weeks: weeksSet.size })
  }

  // 4) Văn phong — so với mức chung.
  if (n >= 8 && weeksSet.size >= MIN_WEEKS) {
    const otherShort = baseline ? Math.max(0, baseline.shortShare * baseline.n - stats.shortShare * n) / otherN : 0
    if (stats.shortShare >= 0.6 && stats.shortShare >= otherShort + 0.2) candidates.push({ kind: "style", key: "short", detail: `hay nhắn ngắn (${Math.round(stats.shortShare * 100)}% tin dưới 40 ký tự, TB ${stats.avgLen}; công ty ${Math.round(otherShort * 100)}%)`, count: Math.round(stats.shortShare * n), weeks: weeksSet.size })
    const otherAvg = baseline ? Math.max(1, (baseline.avgLen * baseline.n - stats.avgLen * n) / otherN) : 0
    if (stats.avgLen >= 140 && (!baseline || stats.avgLen >= otherAvg * 1.5)) candidates.push({ kind: "style", key: "long", detail: `hay nhắn dài, nhiều chi tiết (TB ${stats.avgLen} ký tự; công ty ${Math.round(otherAvg)})`, count: n, weeks: weeksSet.size })
    const noDia = msgs.filter(e => { const t = e.user_message ?? ""; return t.length >= 15 && !HAS_VI_DIACRITIC.test(t) && NO_DIACRITIC_HINT.test(t) }).length
    if (noDia >= MIN_COUNT && noDia / n >= 0.3) candidates.push({ kind: "style", key: "no_diacritics", detail: `hay gõ tiếng Việt không dấu (${noDia}/${n} tin)`, count: noDia, weeks: weeksSet.size })
  }
  for (const f of FORMAT_ASKS) {
    const idx = msgs.map((e, i) => (f.re.test(e.user_message ?? "") ? i : -1)).filter(i => i >= 0)
    if (idx.length < MIN_COUNT || weeksOf(idx) < MIN_WEEKS) continue
    const l = lift(idx.length, n, baseline?.formatDf[f.key])
    if (l >= 2) candidates.push({ kind: "format", key: f.key, detail: `${f.label} (${idx.length} lần${Number.isFinite(l) ? `, gấp ${l.toFixed(1)} lần mức chung` : ""})`, count: idx.length, weeks: weeksOf(idx), lift: l })
  }

  // 5) Phản hồi 👍/👎.
  const fb = stats.feedback
  if (fb.up >= MIN_COUNT) {
    if (fb.upWithTable / fb.up >= 0.6) candidates.push({ kind: "feedback", key: "table", detail: `hay 👍 câu trả lời có bảng (${fb.upWithTable}/${fb.up})`, count: fb.upWithTable, weeks: 0 })
    if (fb.upLong / fb.up <= 0.2) candidates.push({ kind: "feedback", key: "concise", detail: `hay 👍 câu trả lời ngắn (${fb.up - fb.upLong}/${fb.up} dưới 600 ký tự)`, count: fb.up - fb.upLong, weeks: 0 })
  }
  if (fb.down >= MIN_COUNT) candidates.push({ kind: "feedback", key: "down", detail: `đã 👎 ${fb.down} câu trả lời (cần xem nguyên nhân)`, count: fb.down, weeks: 0 })

  return { stats, candidates: candidates.filter(c => !SENSITIVE_RE.test(c.detail)) }
}

export const isSensitiveHabit = (s: string) => SENSITIVE_RE.test(s)
