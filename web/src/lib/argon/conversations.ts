import { supabaseAdmin } from "@/lib/supabase"
import { DAILY_MISSION_NAME } from "./context-pure"
import { CHAT_DEFAULT_NAME, CHAT_MARK } from "./missions"
import { createMission, setPhase, updateMission, type ArgonMission } from "./missions-db"

// Cuộc trò chuyện của Trợ lý (Gấu Prime) = một sứ mệnh có dấu CHAT_MARK ở `goal`: mỗi cuộc có dự án nền + lượt chạy + ngữ cảnh riêng,
// nên "cuộc mới" thật sự tách ngữ cảnh. Cuộc mặc định là sứ mệnh "Tham mưu hằng ngày" (không xoá được: đêm tuần tra và bản tin dùng nó).
export { CHAT_DEFAULT_NAME, CHAT_MARK }

export interface ArgonConv { id: string; title: string; updated_at: string; daily: boolean }

export const isChatMission = (m: Pick<ArgonMission, "name" | "goal">) => m.goal === CHAT_MARK
export const isDailyMission = (m: Pick<ArgonMission, "name">) => m.name === DAILY_MISSION_NAME

export async function listConversations(username: string): Promise<ArgonConv[]> {
  const { data } = await supabaseAdmin.from("argon_missions").select("id,name,goal,project_id,updated_at")
    .eq("username", username).eq("archived", false).or(`name.eq.${DAILY_MISSION_NAME},goal.eq.${CHAT_MARK}`).order("updated_at", { ascending: false }).limit(100)
  const ms = (data ?? []) as Pick<ArgonMission, "id" | "name" | "goal" | "project_id" | "updated_at">[]
  if (!ms.length) return []
  // Mới nhất theo lượt chạy cuối (một truy vấn cho cả danh sách, không lặp từng cuộc).
  const { data: runs } = await supabaseAdmin.from("argon_runs").select("project_id,created_at").in("project_id", ms.map(m => m.project_id)).order("created_at", { ascending: false }).limit(1000)
  const last = new Map<string, string>()
  for (const r of runs ?? []) if (!last.has(r.project_id as string)) last.set(r.project_id as string, r.created_at as string)
  return ms
    .map(m => {
      const lr = last.get(m.project_id)
      return { id: m.id, title: m.name, daily: isDailyMission(m), updated_at: lr && lr > m.updated_at ? lr : m.updated_at }
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export async function createConversation(username: string): Promise<ArgonConv> {
  let m = await createMission(username, CHAT_DEFAULT_NAME, "")   // goal rỗng để brief.md mẫu không chứa dấu; gắn dấu ngay sau
  m = await updateMission(m.id, { goal: CHAT_MARK })
  for (const to of ["plan", "run"] as const) {   // cuộc trò chuyện chạy ngay, không qua pha làm rõ/kế hoạch
    const r = await setPhase(m, to)
    if (r.mission) m = r.mission
  }
  return { id: m.id, title: m.name, daily: false, updated_at: m.updated_at }
}
