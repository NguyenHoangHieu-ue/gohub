import { supabaseAdmin } from "@/lib/supabase"
import { setBg, triggerWorker } from "./bg"
import { missionById } from "./missions-db"
import { resolveModel } from "./models"
import { auditProposals, TAC_DONG_PATH, buildRepairPrompt } from "./context-pure"
import type { MissionPhase } from "./missions"
import { dueBlock, dueForecasts, getForecasts } from "./forecast-tool"

// "Tuần tra đêm": mỗi sứ mệnh đang CHẠY có thể có 1 yêu cầu cố định (vd kiểm toán chéo số liệu, đo lại thước đo theo brief). Cron argon-sync mỗi đêm giao worker chạy nền
// (model Nhanh, có sql/file/run_code), kết quả ghi vào notes/tuan-tra-<ngày>.md + tin Lark cho Hiếu (worker lo). Lưu ở app_settings `argon_patrol:<missionId>` (không migration).
export interface Patrol { enabled: boolean; prompt: string; lastRunDate?: string; lastRunId?: string }
export const MAX_PATROLS_PER_NIGHT = 5
const key = (missionId: string) => `argon_patrol:${missionId}`
export const vnDate = (d = new Date()) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)

export const PATROL_PRESETS: { id: string; label: string; prompt: string }[] = [
  { id: "audit", label: "Kiểm toán chéo số liệu", prompt: "So sánh tổng doanh thu, lợi nhuận gộp và số đơn của 7 ngày gần nhất (đến hôm qua) giữa ba nguồn: (a) layDuLieuHeThong period-overview, (b) layDuLieuHeThong channels, (c) sql trực tiếp trên fact_fulfillment_revenue. Nếu chênh quá 0,5% giữa bất kỳ cặp nào, nêu từng cặp lệch kèm số và nguyên nhân khả dĩ; nếu khớp thì nói khớp." },
  { id: "brief", label: "Đo lại thước đo theo brief", prompt: "Đọc brief.md và decisions.md. Đo lại thước đo của sứ mệnh bằng sql hoặc layDuLieuHeThong đến hôm qua, so với mục tiêu, nêu xu hướng 7 ngày gần nhất và điều gì cần anh quyết hoặc làm tiếp." },
]

/** Câu lệnh đầy đủ giao cho Argon đêm đó (người dùng không có mặt nên không hỏi lại; ghi báo cáo vào workspace). */
export function patrolPrompt(prompt: string, date: string): string {
  return `🌙 Tuần tra đêm ${date}: ${prompt.trim()}\n\nQuy tắc đêm nay: không có ai trả lời lúc này nên KHÔNG gọi hoiHieu; chỗ nào mơ hồ thì chọn cách hiểu hợp lý nhất và ghi rõ giả định. Ghi báo cáo đầy đủ vào notes/tuan-tra-${date}.md. Câu trả lời cuối chỉ 3-6 dòng: kết luận trước, rồi điều bất thường hoặc việc cần anh. Mỗi con số ghi [#N].`
}

/** Có nên chạy tuần tra đêm nay không (thuần). */
export function patrolDue(p: Patrol | null, phase: MissionPhase, today: string): boolean {
  return !!p && p.enabled && !!p.prompt.trim() && phase === "run" && p.lastRunDate !== today
}

export async function getPatrol(missionId: string): Promise<Patrol | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key(missionId)).maybeSingle()
  try { return data?.value ? (JSON.parse(data.value) as Patrol) : null } catch { return null }
}
export async function savePatrol(missionId: string, p: Patrol): Promise<Patrol> {
  const clean: Patrol = { enabled: !!p.enabled, prompt: String(p.prompt ?? "").trim().slice(0, 2000), lastRunDate: p.lastRunDate, lastRunId: p.lastRunId }
  const { error } = await supabaseAdmin.from("app_settings").upsert({ key: key(missionId), value: JSON.stringify(clean), category: "argon", label: "Tuần tra đêm sứ mệnh Argon", updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (error) throw new Error(error.message)
  return clean
}
export const deletePatrol = async (missionId: string) => { await supabaseAdmin.from("app_settings").delete().eq("key", key(missionId)) }
export async function missionIdsWithPatrol(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("key,value").like("key", "argon_patrol:%")
  return (data ?? []).filter(r => { try { return JSON.parse(r.value ?? "{}").enabled } catch { return false } }).map(r => String(r.key).slice("argon_patrol:".length))
}

/** Tạo lượt chạy nền tuần tra và giao worker. `force` (nút "Chạy thử ngay") bỏ qua giới hạn 1 lần/ngày nhưng VẪN cần pha chạy. Trả runId hoặc lý do không chạy. */
export async function startPatrol(missionId: string, origin: string, force = false): Promise<{ runId?: string; skipped?: string }> {
  const p = await getPatrol(missionId)
  const m = await missionById(missionId)
  if (!m) return { skipped: "Sứ mệnh không còn tồn tại" }
  if (m.phase !== "run") return { skipped: `Sứ mệnh đang ở pha "${m.phase}" — tuần tra chỉ chạy khi đã Chốt và đang chạy` }
  const today = vnDate()
  const due = dueForecasts(await getForecasts(missionId), today)   // dự đoán đến hạn được chấm trong cùng lượt tuần tra (kể cả khi chưa bật tuần tra)
  const wantPatrol = force ? !!p?.prompt.trim() : patrolDue(p, m.phase, today)
  if (!wantPatrol && !due.length) return { skipped: !p?.prompt.trim() ? "Chưa có yêu cầu tuần tra" : p.lastRunDate === today ? "Hôm nay đã tuần tra" : "Chưa bật tuần tra" }
  const { data, error } = await supabaseAdmin.from("argon_runs").insert({
    project_id: m.project_id, username: m.username, prompt: patrolPrompt(wantPatrol && p ? p.prompt : "Chỉ chấm các dự đoán đến hạn trong sổ (không cần việc khác).", today) + dueBlock(due), status: "queued", model: resolveModel("fast"), thinking: "medium", source_ids: [],
  }).select("id").single()
  if (error || !data) throw new Error(error?.message ?? "Không tạo được lượt tuần tra")
  const now = new Date().toISOString()
  await setBg(data.id, { username: m.username, projectId: m.project_id, allowTools: true, thinking: "medium", startedAt: now, heartbeat: now })
  if (p && wantPatrol) await savePatrol(missionId, { ...p, lastRunDate: today, lastRunId: data.id })
  await triggerWorker(origin, data.id)
  return { runId: data.id }
}

/** Sau lượt tuần tra đêm: hai file notes/boi-canh.md và notes/tac-dong.md có được ghi lại từ lúc bắt đầu lượt không? (model từng chỉ trả lời bằng chữ mà không ghi file) */
export async function patrolWroteNotes(projectId: string, sinceIso: string): Promise<boolean> {
  const { data: m } = await supabaseAdmin.from("argon_missions").select("id").eq("project_id", projectId).maybeSingle()
  if (!m) return true   // không phải sứ mệnh → không kiểm
  const { data: files } = await supabaseAdmin.from("argon_workspace_files").select("path,updated_at").eq("mission_id", m.id).in("path", ["notes/boi-canh.md", "notes/tac-dong.md"])
  const since = Date.parse(sinceIso)
  const fresh = new Set((files ?? []).filter(f => Date.parse(String(f.updated_at)) >= since).map(f => String(f.path)))
  return fresh.has("notes/boi-canh.md") && fresh.has("notes/tac-dong.md")
}

export { REPAIR_PREFIX, isRepairPrompt, buildRepairPrompt } from "./context-pure"

/** Lỗi của mục "Đề xuất hôm nay" trong notes/tac-dong.md hiện tại (rỗng nếu đạt hoặc không phải sứ mệnh). */
export async function proposalIssuesFor(projectId: string): Promise<string[]> {
  const { data: m } = await supabaseAdmin.from("argon_missions").select("id").eq("project_id", projectId).maybeSingle()
  if (!m) return []
  const { data: f } = await supabaseAdmin.from("argon_workspace_files").select("content").eq("mission_id", m.id).eq("path", TAC_DONG_PATH).maybeSingle()
  const a = auditProposals(String(f?.content ?? ""))
  if (a.missingSection) return ["Thiếu hẳn mục \"## Đề xuất hôm nay\" — ghi tối đa 3 đề xuất đúng khuôn (hoặc đúng một dòng \"Chưa có đề xuất đủ căn cứ hôm nay.\" dưới tiêu đề đó)"]
  return a.empty ? [] : a.issues
}

/** Lượt sửa ngắn: model hay bỏ qua luật mới (dòng Ảnh hưởng, nhãn Chắc, thứ tự) nên sau lượt đêm, nếu bộ kiểm báo lỗi thì giao đúng danh sách lỗi cho Argon sửa MỘT lần. */
export async function startProposalRepair(projectId: string, username: string, issues: string[], origin: string): Promise<string | null> {
  const prompt = buildRepairPrompt(issues, vnDate())
  const { data: m } = await supabaseAdmin.from("argon_missions").select("id").eq("project_id", projectId).maybeSingle()
  if (!m) return null
  const { data, error } = await supabaseAdmin.from("argon_runs").insert({
    project_id: projectId, username, prompt, status: "queued", model: resolveModel("fast"), thinking: "medium", source_ids: [],
  }).select("id").single()
  if (error || !data) return null
  const now = new Date().toISOString()
  await setBg(data.id, { username, projectId, allowTools: true, thinking: "medium", startedAt: now, heartbeat: now })
  await triggerWorker(origin, data.id)
  return data.id
}

