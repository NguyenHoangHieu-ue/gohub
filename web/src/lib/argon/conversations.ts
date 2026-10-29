import { supabaseAdmin } from "@/lib/supabase"
import { DAILY_MISSION_NAME } from "./context-pure"
import { BRIEF_PATH, CHAT_DEFAULT_NAME, CHAT_PREFIX, DECISIONS_PATH, briefTemplate, chotLine, decisionsTemplate } from "./missions"
import type { ArgonMission } from "./missions-db"

// Cuộc trò chuyện của Trợ lý (Gấu Prime) = một sứ mệnh có tên bắt đầu bằng CHAT_PREFIX (usesKhoScope nhận ra nên vẫn đọc toàn Kho): mỗi cuộc có dự án nền + lượt chạy + ngữ cảnh riêng,
// nên "cuộc mới" thật sự tách ngữ cảnh. Cuộc mặc định là sứ mệnh "Tham mưu hằng ngày" (không xoá được: đêm tuần tra và bản tin dùng nó).
export { CHAT_DEFAULT_NAME, CHAT_PREFIX }

export interface ArgonConv { id: string; title: string; updated_at: string; daily: boolean }

export const isChatMission = (m: Pick<ArgonMission, "name">) => m.name.startsWith(CHAT_PREFIX)
export const chatTitle = (name: string) => (name.startsWith(CHAT_PREFIX) ? name.slice(CHAT_PREFIX.length) : name)
export const isDailyMission = (m: Pick<ArgonMission, "name">) => m.name === DAILY_MISSION_NAME

export async function listConversations(username: string): Promise<ArgonConv[]> {
  const { data } = await supabaseAdmin.from("argon_missions").select("id,name,project_id,updated_at")
    .eq("username", username).eq("archived", false).or(`name.eq.${DAILY_MISSION_NAME},name.like.${CHAT_PREFIX}*`).order("updated_at", { ascending: false }).limit(100)
  const ms = (data ?? []) as Pick<ArgonMission, "id" | "name" | "project_id" | "updated_at">[]
  if (!ms.length) return []
  // Mới nhất theo lượt chạy cuối (một truy vấn cho cả danh sách, không lặp từng cuộc).
  const { data: runs } = await supabaseAdmin.from("argon_runs").select("project_id,created_at").in("project_id", ms.map(m => m.project_id)).order("created_at", { ascending: false }).limit(1000)
  const last = new Map<string, string>()
  for (const r of runs ?? []) if (!last.has(r.project_id as string)) last.set(r.project_id as string, r.created_at as string)
  return ms
    .map(m => {
      const lr = last.get(m.project_id)
      return { id: m.id, title: chatTitle(m.name), daily: isDailyMission(m), updated_at: lr && lr > m.updated_at ? lr : m.updated_at }
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

/** Tạo cuộc mới nhanh: 3 lượt ghi DB (dự án → sứ mệnh đã ở pha chạy → file brief/decisions), thay vì createMission + 2 lần đổi pha (~9 lượt tuần tự). Nội dung ghi y như đường cũ (decisions.md có dòng Chốt). */
export async function createConversation(username: string): Promise<ArgonConv & { mission: ArgonMission }> {
  const name = CHAT_PREFIX + CHAT_DEFAULT_NAME, now = new Date().toISOString()
  const { data: proj, error: pe } = await supabaseAdmin.from("argon_projects").insert({ username, name, kind: "mission" }).select("id").single()
  if (pe || !proj) throw new Error(pe?.message ?? "Không tạo được dự án nền")
  const { data: m, error: me } = await supabaseAdmin.from("argon_missions").insert({ username, project_id: proj.id, name, goal: "", phase: "run", committed_at: now }).select("*").single()
  if (me || !m) { await supabaseAdmin.from("argon_projects").delete().eq("id", proj.id); throw new Error(me?.message ?? "Không tạo được sứ mệnh") }
  const brief = briefTemplate(name, ""), dec = decisionsTemplate().split("\n").filter(l => !l.startsWith("(chưa có mục nào")).join("\n").replace(/\s+$/, "")
  const decisions = [dec, chotLine(new Date(now), null), ""].join("\n")
  const { error: fe } = await supabaseAdmin.from("argon_workspace_files").insert([
    { mission_id: m.id, path: BRIEF_PATH, mime: "text/markdown", content: brief, size_bytes: Buffer.byteLength(brief), author: "user" },
    { mission_id: m.id, path: DECISIONS_PATH, mime: "text/markdown", content: decisions, size_bytes: Buffer.byteLength(decisions), author: "user" },
  ])
  if (fe) { await supabaseAdmin.from("argon_projects").delete().eq("id", proj.id); throw new Error(fe.message) }
  return { id: m.id, title: CHAT_DEFAULT_NAME, daily: false, updated_at: m.updated_at, mission: m as ArgonMission }
}
