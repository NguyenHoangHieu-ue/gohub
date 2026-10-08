import { supabaseAdmin } from "@/lib/supabase"
import { createJob, triggerJobRun } from "./jobs"

// Việc theo lịch Gấu Pro (G4, bảng gp_scheduled_tasks migration v67). Người dùng đặt bằng chat (tool scheduleTask); cron
// `scheduled-messages` (cron-job.org, hiện MỖI GIỜ) gọi runDueSchedules → mỗi việc đến hạn thành 1 việc nền (gp_jobs) → DM Lark.
// Bài học từ ChatGPT Scheduled Tasks: prompt lưu phải TỰ ĐỦ (không dựa vào hội thoại/trí nhớ lúc chạy).
export const MAX_ACTIVE_PER_USER = 10
export const NO_ALERT = "NO_ALERT"
const ICT_MS = 7 * 3600_000                // Việt Nam UTC+7, không có giờ mùa hè
const MIGRATION_HINT = "Chưa có bảng gp_scheduled_tasks — Hiếu cần chạy migration web/db/migrations/v67_gp_scheduled_tasks.sql rồi Reload schema."
const missingTable = (msg?: string) => !!msg && /gp_scheduled_tasks/.test(msg) && /(does not exist|schema cache|Could not find)/i.test(msg)

export interface Schedule {
  kind: "daily" | "weekly" | "monthly" | "once"
  time: string            // "HH:mm" giờ VN
  weekdays?: number[]     // weekly: 1=Thứ 2 … 7=Chủ nhật
  day?: number            // monthly: ngày trong tháng (tháng thiếu ngày → ngày cuối tháng)
  date?: string           // once: "YYYY-MM-DD"
  agent?: "be-gau"        // U3: việc đặt từ Bé Gấu → chạy bằng Bé Gấu (theo vai trò người đặt), không phải Gấu Pro
  ownerName?: string      // tên hiển thị — hội thoại Bé Gấu lưu theo tên
}

export function validateSchedule(raw: any): { schedule?: Schedule; error?: string } {
  const kind = raw?.kind
  if (!["daily", "weekly", "monthly", "once"].includes(kind)) return { error: "kind phải là daily | weekly | monthly | once." }
  const time = String(raw?.time ?? "")
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: "time phải dạng HH:mm (giờ VN)." }
  const s: Schedule = { kind, time }
  if (kind === "weekly") {
    const w = (Array.isArray(raw.weekdays) ? raw.weekdays : []).map(Number).filter((d: number) => d >= 1 && d <= 7)
    if (!w.length) return { error: "weekly cần weekdays (1=Thứ 2 … 7=Chủ nhật)." }
    s.weekdays = [...new Set<number>(w)].sort()
  }
  if (kind === "monthly") {
    const d = Number(raw.day)
    if (!(d >= 1 && d <= 31)) return { error: "monthly cần day 1–31." }
    s.day = d
  }
  if (kind === "once") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date ?? ""))) return { error: "once cần date YYYY-MM-DD." }
    s.date = raw.date
  }
  return { schedule: s }
}

/** Lần chạy kế tiếp SAU thời điểm `after` (UTC), tính theo giờ VN. null = không còn lần nào (once đã qua). */
export function nextRunAt(s: Schedule, after: Date): Date | null {
  const [hh, mm] = s.time.split(":").map(Number)
  const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, hh, mm) - ICT_MS)
  if (s.kind === "once") {
    const [y, m, d] = s.date!.split("-").map(Number)
    const t = at(y, m - 1, d)
    return t > after ? t : null
  }
  const local = new Date(after.getTime() + ICT_MS)          // "giờ đồng hồ" VN biểu diễn bằng các trường UTC
  for (let i = 0; i <= 400; i++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i))
    const y = day.getUTCFullYear(), m = day.getUTCMonth(), d = day.getUTCDate()
    const t = at(y, m, d)
    if (t <= after) continue
    if (s.kind === "daily") return t
    if (s.kind === "weekly") {
      const wd = day.getUTCDay() === 0 ? 7 : day.getUTCDay()
      if (s.weekdays!.includes(wd)) return t
    }
    if (s.kind === "monthly") {
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
      if (d === Math.min(s.day!, last)) return t
    }
  }
  return null
}

export function describeSchedule(s: Schedule): string {
  const W = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"]
  if (s.kind === "daily") return `mỗi ngày ${s.time}`
  if (s.kind === "weekly") return `${s.weekdays!.map(d => W[d]).join(", ")} hằng tuần ${s.time}`
  if (s.kind === "monthly") return `ngày ${s.day} hằng tháng ${s.time}`
  return `1 lần ${s.date} ${s.time}`
}

/** Tool scheduleTask: create | list | cancel. */
export async function runScheduleTask(args: any, username: string, isCreator: boolean, beGauOwnerName?: string): Promise<any> {
  const table = () => supabaseAdmin.from("gp_scheduled_tasks")
  const fail = (m: string) => ({ error: missingTable(m) ? MIGRATION_HINT : m })
  switch (args?.action) {
    case "create": {
      const prompt = String(args.prompt ?? "").trim()
      const title = String(args.title ?? prompt).replace(/\s+/g, " ").slice(0, 80)
      if (prompt.length < 15) return { error: "prompt phải mô tả ĐẦY ĐỦ việc cần làm (sẽ chạy độc lập, không thấy hội thoại này)." }
      const { schedule, error } = validateSchedule(args.schedule)
      if (!schedule) return { error }
      if (beGauOwnerName) Object.assign(schedule, { agent: "be-gau", ownerName: beGauOwnerName })
      const next = nextRunAt(schedule, new Date())
      if (!next) return { error: "Thời điểm đã qua." }
      const { count, error: cErr } = await table().select("id", { count: "exact", head: true }).eq("username", username).eq("active", true)
      if (cErr) return fail(cErr.message)
      if ((count ?? 0) >= MAX_ACTIVE_PER_USER) return { error: `Đã có ${count} việc theo lịch (tối đa ${MAX_ACTIVE_PER_USER}). Huỷ bớt trước.` }
      const { data, error: iErr } = await table().insert({
        username, is_creator: isCreator, title, prompt: prompt.slice(0, 4000), schedule,
        only_if_notable: args.only_if_notable === true, next_run_at: next.toISOString(),
      }).select("id").single()
      if (iErr) return fail(iErr.message)
      return { created: data.id, title, when: describeSchedule(schedule), next_run_vn: new Date(next.getTime() + ICT_MS).toISOString().slice(0, 16).replace("T", " "),
        note: "Cron chạy theo giờ — việc có thể chạy trễ tối đa ~1 giờ so với giờ hẹn. Kết quả gửi qua Lark DM." }
    }
    case "list": {
      const { data, error } = await table().select("id,title,schedule,only_if_notable,next_run_at,last_run_at,run_count")
        .eq("username", username).eq("active", true).order("created_at", { ascending: false })
      if (error) return fail(error.message)
      return { tasks: (data ?? []).map(t => ({ ...t, when: describeSchedule(t.schedule as Schedule) })) }
    }
    case "cancel": {
      if (!args.id) return { error: "cancel cần id (lấy từ action=list)." }
      const { data, error } = await table().update({ active: false }).eq("id", args.id).eq("username", username).select("id")
      if (error) return fail(error.message)
      return data?.length ? { cancelled: args.id } : { error: "Không thấy việc theo lịch này." }
    }
    default:
      return { error: "action phải là create | list | cancel." }
  }
}

/** Cron: việc đến hạn → chiếm nguyên tử (dời next_run_at) → tạo việc nền. Tối đa 5 việc/lần gọi. */
export async function runDueSchedules(origin: string): Promise<number> {
  const now = new Date()
  const { data, error } = await supabaseAdmin.from("gp_scheduled_tasks")
    .select("id,username,is_creator,title,prompt,schedule,only_if_notable,next_run_at,run_count")
    .eq("active", true).lte("next_run_at", now.toISOString()).order("next_run_at").limit(5)
  if (error || !data?.length) return 0
  let n = 0
  for (const t of data) {
    const next = nextRunAt(t.schedule as Schedule, now)
    const { data: claimed } = await supabaseAdmin.from("gp_scheduled_tasks")
      .update({ next_run_at: next?.toISOString() ?? null, active: !!next, last_run_at: now.toISOString(), run_count: (t.run_count as number) + 1 })
      .eq("id", t.id).eq("next_run_at", t.next_run_at).select("id")
    if (!claimed?.length) continue
    const prompt = `[Việc theo lịch: ${t.title}]\n${t.prompt}` + (t.only_if_notable
      ? `\n\nĐây là việc CANH CHỪNG: nếu điều kiện cần báo KHÔNG xảy ra, chỉ trả lời đúng một từ ${NO_ALERT} (không thêm gì). Nếu có → báo ngắn gọn, nêu số liệu.`
      : "")
    const sch = t.schedule as Schedule
    const { job } = await createJob({ username: t.username as string, isCreator: t.is_creator as boolean, prompt,
      beGauOwnerName: sch.agent === "be-gau" ? sch.ownerName || (t.username as string) : undefined })
    if (job) { await triggerJobRun(origin, job.id); n++ }
  }
  return n
}
