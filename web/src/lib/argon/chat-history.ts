import { supabaseAdmin } from "@/lib/supabase"
import { CHAT_PREFIX } from "./missions"
import { DAILY_MISSION_NAME } from "./context-pure"

// Tìm trong lịch sử trò chuyện CŨ của chính người dùng — công cụ timHoiThoaiCu. Hai nguồn:
//  (1) các cuộc trò chuyện của Gấu Prime (Argon): khớp từ khoá KHÔNG phân biệt hoa thường/dấu, nhiều từ (một lượt khớp đủ phần lớn các từ mới được giữ), xếp theo số từ khớp rồi mới nhất;
//  (2) hội thoại Gấu Pro / Bé Gấu: tìm THEO Ý NGHĨA qua tóm tắt đã có (searchPastConversations; cần bảng trí nhớ hội thoại v66 — thiếu thì bỏ qua nguồn này).
const SNIP = 240
const MAX_HITS = 8
const SCAN_RUNS = 400
const MIN_WORD_SHARE = 0.6

export const foldText = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()
const queryWords = (q: string): string[] => Array.from(new Set(foldText(q).split(/[^a-z0-9]+/).filter(w => w.length >= 2)))

/** Điểm khớp: số từ của câu tìm xuất hiện trong văn bản (đã bỏ dấu). Thuần. */
export function matchScore(words: string[], text: string): number {
  const h = foldText(text)
  return words.filter(w => h.includes(w)).length
}

/** Đoạn trích quanh từ khớp đầu tiên của câu trả lời. Thuần. */
export function excerptAround(text: string, words: string[]): string {
  const h = foldText(text)
  const at = words.map(w => h.indexOf(w)).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? -1
  if (at < 0) return text.slice(0, SNIP).replace(/\s+/g, " ")
  // foldText giữ nguyên độ dài ký tự trong tiếng Việt thường gặp (NFD rồi bỏ dấu có thể ngắn đi) nên chỉ dùng làm vị trí gần đúng.
  return text.slice(Math.max(0, at - 80), at + SNIP - 80).replace(/\s+/g, " ")
}

export interface HistoryHit { cuoc: string; ngay: string; hoi: string; tra_loi_trich: string }
export async function searchChatHistory(username: string, q: string): Promise<{ hits: HistoryHit[]; hoi_thoai_gau_pro_be_gau?: unknown; ghi_chu?: string }> {
  const words = queryWords(q)
  if (!words.length) return { hits: [], ghi_chu: "Từ khoá quá ngắn." }
  const { data: ms } = await supabaseAdmin.from("argon_missions").select("name,project_id").eq("username", username).or(`name.eq.${DAILY_MISSION_NAME},name.like.${CHAT_PREFIX}*`).limit(200)
  const byProject = new Map((ms ?? []).map(m => [m.project_id as string, String(m.name).startsWith(CHAT_PREFIX) ? String(m.name).slice(CHAT_PREFIX.length) : String(m.name)]))
  let hits: HistoryHit[] = []
  let note: string | undefined
  if (byProject.size) {
    const { data: runs, error } = await supabaseAdmin.from("argon_runs").select("project_id,prompt,answer,created_at").in("project_id", [...byProject.keys()]).order("created_at", { ascending: false }).limit(SCAN_RUNS)
    if (error) note = `Lỗi tìm trong Gấu Prime: ${error.message}`
    const need = Math.max(1, Math.ceil(words.length * MIN_WORD_SHARE))
    hits = (runs ?? [])
      .map(r => ({ r, score: matchScore(words, `${r.prompt ?? ""} ${r.answer ?? ""}`) }))
      .filter(x => x.score >= need)
      .sort((a, b) => b.score - a.score || String(b.r.created_at).localeCompare(String(a.r.created_at)))
      .slice(0, MAX_HITS)
      .map(({ r }) => ({ cuoc: byProject.get(r.project_id as string) ?? "?", ngay: String(r.created_at).slice(0, 10), hoi: String(r.prompt ?? "").replace(/\s+/g, " ").slice(0, 200), tra_loi_trich: excerptAround(String(r.answer ?? ""), words) }))
  }
  let gauPro: unknown
  try {
    const { searchPastConversations } = await import("@/lib/assistant-memory-auto")
    const r = await searchPastConversations(username, q)
    if (Array.isArray(r?.results) && r.results.length) gauPro = r.results
  } catch { /* nguồn Gấu Pro/Bé Gấu chưa sẵn sàng: bỏ qua */ }
  if (!hits.length && !gauPro) note ??= `Không thấy cuộc trò chuyện nào liên quan đến "${q}".`
  return { hits, ...(gauPro ? { hoi_thoai_gau_pro_be_gau: gauPro } : {}), ...(note ? { ghi_chu: note } : {}) }
}
