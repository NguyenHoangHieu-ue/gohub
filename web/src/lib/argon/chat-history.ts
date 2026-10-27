import { supabaseAdmin } from "@/lib/supabase"
import { CHAT_PREFIX } from "./missions"
import { DAILY_MISSION_NAME } from "./context-pure"

// Tìm trong lịch sử các cuộc trò chuyện của Trợ lý (mọi cuộc: "Tham mưu hằng ngày" + cuộc có tên) — công cụ timHoiThoaiCu. Chỉ của CHÍNH người dùng. Khớp từ khoá (không phân biệt hoa thường), chưa tìm theo ý nghĩa.
const SNIP = 240
const MAX_HITS = 8

const around = (text: string, q: string): string => {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text.slice(0, SNIP).replace(/\s+/g, " ")
  return text.slice(Math.max(0, i - 80), i + SNIP - 80).replace(/\s+/g, " ")
}

export async function searchChatHistory(username: string, q: string): Promise<{ hits: { cuoc: string; ngay: string; hoi: string; tra_loi_trich: string }[]; ghi_chu?: string }> {
  const { data: ms } = await supabaseAdmin.from("argon_missions").select("name,project_id").eq("username", username).or(`name.eq.${DAILY_MISSION_NAME},name.like.${CHAT_PREFIX}*`).limit(200)
  const byProject = new Map((ms ?? []).map(m => [m.project_id as string, String(m.name).startsWith(CHAT_PREFIX) ? String(m.name).slice(CHAT_PREFIX.length) : String(m.name)]))
  if (!byProject.size) return { hits: [], ghi_chu: "Chưa có cuộc trò chuyện nào." }
  const like = `%${q}%`
  const { data: runs, error } = await supabaseAdmin.from("argon_runs").select("project_id,prompt,answer,created_at")
    .in("project_id", [...byProject.keys()]).or(`prompt.ilike.${like},answer.ilike.${like}`).order("created_at", { ascending: false }).limit(MAX_HITS)
  if (error) return { hits: [], ghi_chu: `Lỗi tìm: ${error.message}` }
  return {
    hits: (runs ?? []).map(r => ({ cuoc: byProject.get(r.project_id as string) ?? "?", ngay: String(r.created_at).slice(0, 10), hoi: String(r.prompt).replace(/\s+/g, " ").slice(0, 200), tra_loi_trich: around(String(r.answer ?? ""), q) })),
    ...(runs?.length ? {} : { ghi_chu: `Không thấy lượt nào chứa "${q}".` }),
  }
}
