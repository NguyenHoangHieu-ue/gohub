// Phân tích thêm cho "Tasks Completed via Bé Gấu" (tab My Metrics): chủ đề hay được hỏi + heuristic
// chấm điểm chất lượng câu trả lời — KHÔNG dùng AI (rẻ, tức thời, tính trực tiếp trên dữ liệu đã có,
// không cần cache/async như 1 lời gọi Gemini riêng mỗi lần tải trang).
//
// ⚠️ Đây là HEURISTIC (đếm tần suất từ khoá + tín hiệu bề mặt câu trả lời: độ dài/có số liệu/có cấu
// trúc/có câu xin lỗi-không-biết) — KHÔNG phải đo lường chính xác "câu trả lời đúng hay sai". Muốn
// chuẩn hơn cần structured output/đánh giá thủ công ở be-gau.ts (ngoài scope — xem gotcha My Metrics).

const STOPWORDS = new Set([
  "là", "có", "không", "cho", "của", "và", "ở", "này", "đó", "với", "được", "để", "khi", "thì", "mà",
  "như", "sao", "ạ", "anh", "chị", "em", "ơi", "mình", "tôi", "bạn", "các", "những", "một", "hai",
  "ba", "rồi", "đã", "sẽ", "đang", "vậy", "nhé", "nha", "giúp", "cần", "muốn", "xin", "hỏi", "cái",
  "gì", "nào", "bao", "nhiêu", "hay", "hoặc", "nếu", "vì", "do", "bị", "làm", "ơn", "hộ", "dùm",
  "giùm", "về", "tại", "từ", "đến", "lúc", "ai", "đâu", "thế", "nay", "hôm", "ngày", "the", "a",
  "an", "is", "are", "to", "of", "for", "in", "on",
])

function tokenize(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
}

export interface TopicCount { phrase: string; count: number }

/** Top cụm từ/từ khoá xuất hiện nhiều nhất trong 1 tập câu hỏi. Bigram (cụm 2 từ) ưu tiên hơn unigram
 * khi xếp hạng (cụ thể hơn, vd "gói nước", "sku code") nhưng `count` trả về vẫn là số lần THẬT xuất
 * hiện — không bị thổi phồng — để hiển thị trung thực. */
export function extractTopKeywords(texts: string[], topN = 20): TopicCount[] {
  const uni = new Map<string, number>()
  const bi  = new Map<string, number>()
  for (const text of texts) {
    const words = tokenize(text)
    for (const w of words) uni.set(w, (uni.get(w) ?? 0) + 1)
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`
      bi.set(phrase, (bi.get(phrase) ?? 0) + 1)
    }
  }
  const scored: { phrase: string; count: number; score: number }[] = []
  uni.forEach((count, phrase) => { if (count >= 2) scored.push({ phrase, count, score: count }) })
  bi.forEach((count, phrase) => { if (count >= 2) scored.push({ phrase, count, score: count * 1.6 }) })
  return scored.sort((a, b) => b.score - a.score).slice(0, topN).map(({ phrase, count }) => ({ phrase, count }))
}

export type QualityBucket = "high" | "medium" | "low"
export interface QualityResult { score: number; bucket: QualityBucket; flags: string[] }

const APOLOGY_RE = /(xin lỗi|không có thông tin|chưa có thông tin|không rõ|không tìm thấy|liên hệ (trực tiếp|admin|hiếu)|em chưa|chưa hỗ trợ được|hãy hỏi (hiếu|anh bảo))/i
const STRUCTURE_RE = /(\n[-•*]\s|\n\d+\.\s|\|.*\|)/

/** Heuristic 0-100: có số liệu (+), có cấu trúc bảng/bullet (+), dài (+), quá ngắn (-), có dấu hiệu
 * "không biết/xin lỗi" (-) → bucket high/medium/low. */
export function scoreResponseQuality(response: string): QualityResult {
  const text = (response || "").trim()
  const len = text.length
  const hasNumbers   = /\d/.test(text)
  const hasApology   = APOLOGY_RE.test(text)
  const hasStructure = STRUCTURE_RE.test(text)

  let score = 60
  if (hasNumbers)   score += 15
  if (hasStructure) score += 10
  if (len > 200) score += 10
  else if (len < 40) score -= 20
  if (hasApology) score -= 35
  score = Math.max(0, Math.min(100, Math.round(score)))

  const flags: string[] = []
  if (hasApology) flags.push("apology_or_no_info")
  if (len < 40) flags.push("too_short")
  if (!hasNumbers && !hasStructure) flags.push("generic")

  const bucket: QualityBucket = score >= 70 ? "high" : score >= 40 ? "medium" : "low"
  return { score, bucket, flags }
}
