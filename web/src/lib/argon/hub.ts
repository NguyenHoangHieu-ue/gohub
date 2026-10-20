import type { ArgonProject, ArgonRun, ArgonSource } from "./server"

// Dự án "Tổng hợp": một dự án đặc biệt của mỗi Creator, tự đọc MỌI dự án khác (sổ dự án + nguồn đang bật + vài kết quả gần đây) để hỏi chéo.
// Không đụng dữ liệu của dự án con: chỉ ghép vào ngữ cảnh lúc chạy. Dự án thường vẫn tách biệt nhau. Id hub lưu ở app_settings (không cần migration).
export const HUB_NAME = "🌐 Tổng hợp tất cả dự án"
export const HUB_TOKEN_BUDGET = 700_000       // chừa chỗ cho lịch sử + câu trả lời trong cửa sổ 1M
const NOTES_CAP = 120_000
const RUNS_PER_PROJECT = 3
const RUN_CHARS = 2_500
const db = async () => (await import("@/lib/supabase")).supabaseAdmin   // nạp muộn: hàm thuần của hub test được không cần env Supabase
const hubKey = (username: string) => `argon_hub:${username}`

export async function getHubId(username: string): Promise<string | null> {
  const supabaseAdmin = await db()
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", hubKey(username)).maybeSingle()
  const id = data?.value ? String(data.value).replace(/^"|"$/g, "") : null
  if (!id) return null
  const { data: p } = await supabaseAdmin.from("argon_projects").select("id").eq("id", id).eq("username", username).maybeSingle()
  return p?.id ?? null
}

/** Dự án Tổng hợp của người dùng; tạo lần đầu nếu chưa có (hoặc đã bị xoá). */
export async function ensureHub(username: string): Promise<string> {
  const supabaseAdmin = await db()
  const cur = await getHubId(username)
  if (cur) return cur
  const { data, error } = await supabaseAdmin.from("argon_projects").insert({
    username, name: HUB_NAME,
    notes: "Dự án này tự đọc tất cả dự án khác (sổ dự án, nguồn đang bật, vài kết quả gần đây). Hỏi chéo / tổng hợp ở đây; thêm nguồn riêng nếu cần.",
  }).select("id").single()
  if (error || !data) throw new Error(error?.message ?? "Không tạo được dự án Tổng hợp")
  await supabaseAdmin.from("app_settings").upsert({ key: hubKey(username), value: JSON.stringify(data.id), category: "argon", label: "Dự án Tổng hợp Phòng Argon", updated_at: new Date().toISOString() }, { onConflict: "key" })
  return data.id
}

export interface HubPick { sources: ArgonSource[]; dropped: string[] }

/** Chọn nguồn đưa vào ngữ cảnh hub trong ngân sách token: ghim trước, rồi mới cập nhật gần nhất. Thuần (có test). */
export function pickHubSources(all: (ArgonSource & { projectName: string })[], budget = HUB_TOKEN_BUDGET): HubPick {
  const sorted = [...all].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
  const keep: ArgonSource[] = []
  const dropCount = new Map<string, number>()
  let used = 0
  for (const { projectName, ...s } of sorted) {
    if (used + s.tokens > budget) { dropCount.set(projectName, (dropCount.get(projectName) ?? 0) + 1); continue }
    used += s.tokens
    keep.push({ ...s, name: `[Dự án: ${projectName}] ${s.name}` })
  }
  return { sources: keep, dropped: Array.from(dropCount, ([n, c]) => `${n}: ${c} nguồn`) }
}

/** Ghi chú ghép của hub: sổ + chỉ dẫn từng dự án + vài kết quả gần đây (cắt ngắn). Thuần (có test). */
export function hubNotes(hub: Pick<ArgonProject, "notes">, projects: ArgonProject[], runsByProject: Map<string, ArgonRun[]>): string {
  const parts = [hub.notes.trim()].filter(Boolean)
  for (const p of projects) {
    const runs = (runsByProject.get(p.id) ?? []).filter(r => r.status === "done" && r.answer.trim()).slice(-RUNS_PER_PROJECT)
    const lines = [`### Dự án: ${p.name} (cập nhật ${p.updated_at.slice(0, 10)})`]
    if (p.notes.trim()) lines.push(`Sổ dự án:\n${p.notes.trim()}`)
    if (p.instructions.trim()) lines.push(`Chỉ dẫn riêng:\n${p.instructions.trim()}`)
    for (const r of runs) lines.push(`Hỏi: ${r.prompt.replace(/\s+/g, " ").slice(0, 300)}\nArgon đáp: ${r.answer.slice(0, RUN_CHARS)}${r.answer.length > RUN_CHARS ? "…" : ""}`)
    parts.push(lines.join("\n"))
  }
  const text = parts.join("\n\n")
  return text.length > NOTES_CAP ? `${text.slice(0, NOTES_CAP)}\n…(đã cắt bớt — ghi chú các dự án quá dài)` : text
}

/** Nguyên liệu chạy cho dự án Tổng hợp: id các dự án cần đọc nguồn (kèm hub) + dự án với sổ ghép. */
export async function loadHubMaterial(hub: ArgonProject): Promise<{ projectIds: string[]; project: ArgonProject }> {
  const supabaseAdmin = await db()
  const { data: ps } = await supabaseAdmin.from("argon_projects").select("*").eq("username", hub.username).eq("kind", "project").neq("id", hub.id).order("updated_at", { ascending: false })
  const projects = (ps ?? []) as ArgonProject[]
  const ids = projects.map(p => p.id)
  const { data: rs } = ids.length ? await supabaseAdmin.from("argon_runs").select("*").in("project_id", ids).order("created_at") : { data: [] }
  const byProject = new Map<string, ArgonRun[]>()
  for (const r of (rs ?? []) as ArgonRun[]) byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r])
  return { projectIds: [hub.id, ...ids], project: { ...hub, notes: hubNotes(hub, projects, byProject) } }
}
