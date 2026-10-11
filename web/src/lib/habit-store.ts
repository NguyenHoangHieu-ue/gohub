// Học thói quen ngầm — H1: TỰ LƯU thói quen đã qua ngưỡng bằng chứng vào assistant_memory (plan personal-agent, đề xuất 2026-10-11).
// Không dùng model để viết nội dung (mẫu câu cố định từ số liệu) → không bịa. Mỗi thói quen = 1 dòng assistant_memory:
//   kind 'preference' (cột kind có CHECK, không thêm loại mới), source `auto-habit:<kind>:<key>` (khoá để cập nhật/hết hạn đúng dòng).
// Hiển thị: panel "Trí nhớ" gắn nhãn "Bé Gấu tự quan sát" (xem/sửa/xoá được); prompt: khối riêng "THÓI QUEN QUAN SÁT" (assistant-memory.ts).
import { supabaseAdmin } from "@/lib/supabase"
import type { HabitCandidate } from "@/lib/habit-learner"

export const HABIT_SOURCE_PREFIX = "auto-habit:"
export const MAX_HABITS_PER_USER = 15
export const MAX_NEW_PER_RUN = 3
export const HABIT_EXPIRE_DAYS = 60       // không còn quan sát được sau chừng này ngày → lưu trữ

export const isHabitSource = (s?: string | null) => !!s && s.startsWith(HABIT_SOURCE_PREFIX)
export const habitSource = (c: Pick<HabitCandidate, "kind" | "key">) => `${HABIT_SOURCE_PREFIX}${c.kind}:${c.key}`.slice(0, 120)

const WEEKDAY_RE = /chủ yếu vào ([^()]+?) \(/

/** Mẫu câu cố định (không model). Tiếng Việt, trung tính, có số lần quan sát. */
export function habitLine(c: HabitCandidate): string {
  switch (c.kind) {
    case "format": {
      const n = c.count
      return c.key === "short" ? `Hay yêu cầu trả lời ngắn gọn/tóm tắt (quan sát ${n} lần).`
        : c.key === "excel" ? `Hay xin kết quả dạng file Excel (quan sát ${n} lần).`
        : c.key === "table" ? `Hay yêu cầu trình bày dạng bảng (quan sát ${n} lần).`
        : c.key === "chart" ? `Hay yêu cầu biểu đồ (quan sát ${n} lần).`
        : `Hay nhờ làm báo cáo (quan sát ${n} lần).`
    }
    case "style":
      return c.key === "short" ? `Hay nhắn ngắn gọn, ít chi tiết (quan sát ${c.count} tin).`
        : c.key === "long" ? `Hay nhắn dài, nhiều chi tiết (quan sát ${c.count} tin).`
        : `Hay gõ tiếng Việt không dấu (quan sát ${c.count} tin).`
    case "channel": return `Hay dùng Bé Gấu qua Lark (quan sát ${c.count} tin).`
    case "time_of_day": return `Thường nhắn vào buổi ${c.key} (quan sát ${c.count} tin).`
    case "feedback":
      return c.key === "table" ? `Hay 👍 câu trả lời có bảng (quan sát ${c.count} lần).` : `Hay 👍 câu trả lời ngắn gọn (quan sát ${c.count} lần).`
    case "weekday_topic": {
      const d = c.detail.match(WEEKDAY_RE)?.[1] ?? "một ngày cố định trong tuần"
      return `Hay hỏi về "${c.key}" vào ${d} (quan sát ${c.count} lần).`
    }
    case "topic": return `Hay nhắc tới "${c.key}" (quan sát ${c.count} lần).`
    default: return ""
  }
}

/** Chỉ nhóm an toàn: định dạng, văn phong, kênh, khung giờ, phản hồi tốt, + chủ đề là TÊN RIÊNG ASCII (1 token) hoặc chủ đề có nhịp theo thứ. Không lưu tool, không lưu 👎. */
export function selectSafeHabits(cands: HabitCandidate[]): HabitCandidate[] {
  return cands.filter(c => {
    if (c.kind === "tool") return false
    if (c.kind === "feedback") return c.key === "table" || c.key === "concise"
    if (c.kind === "topic") return /^[a-z0-9]{4,}$/.test(c.key)
    return true
  })
}

export interface HabitRow { id: number; username: string; content: string; source: string | null; updated_at: string; archived?: boolean }

export interface HabitPlan {
  insert: { username: string; kind: "preference"; content: string; source: string; pinned: false }[]
  update: { id: number; content: string }[]       // đổi nội dung (số lần quan sát mới)
  touch: number[]                                 // vẫn đúng → làm mới updated_at (= lần quan sát gần nhất)
  archive: number[]                               // hết hạn
}

/** Quyết định ghi gì cho 1 người — thuần tuý, không chạm DB (dễ test). `existing` = các dòng auto-habit còn hiệu lực của người đó. */
export function planHabitWrites(username: string, cands: HabitCandidate[], existing: HabitRow[], now = Date.now()): HabitPlan {
  const plan: HabitPlan = { insert: [], update: [], touch: [], archive: [] }
  const bySource = new Map(existing.map(r => [r.source ?? "", r]))
  const seen = new Set<string>()
  let active = existing.length
  for (const c of cands) {
    const src = habitSource(c), line = habitLine(c)
    if (!line || seen.has(src)) continue
    seen.add(src)
    const cur = bySource.get(src)
    if (cur) {
      if (cur.content.trim() !== line) plan.update.push({ id: cur.id, content: line })
      else plan.touch.push(cur.id)
    } else if (plan.insert.length < MAX_NEW_PER_RUN && active < MAX_HABITS_PER_USER) {
      plan.insert.push({ username, kind: "preference", content: line, source: src, pinned: false })
      active++
    }
  }
  // Hết hạn: dòng không còn trong ứng viên lần này và lần quan sát gần nhất (updated_at) quá HABIT_EXPIRE_DAYS.
  for (const r of existing) {
    if (seen.has(r.source ?? "")) continue
    if (now - new Date(r.updated_at).getTime() > HABIT_EXPIRE_DAYS * 86_400_000) plan.archive.push(r.id)
  }
  return plan
}

/** Ghi kế hoạch của NHIỀU người bằng ít truy vấn nhất (1 insert gộp; update/touch/archive gom theo id). */
export async function applyHabitPlans(plans: HabitPlan[]): Promise<{ inserted: number; updated: number; touched: number; archived: number; error?: string }> {
  const ins = plans.flatMap(p => p.insert)
  const touch = plans.flatMap(p => p.touch), arch = plans.flatMap(p => p.archive)
  const now = new Date().toISOString()
  let inserted = 0, updated = 0
  if (ins.length) {
    const { error, data } = await supabaseAdmin.from("assistant_memory").insert(ins).select("id")
    if (error) return { inserted, updated, touched: 0, archived: 0, error: error.message }
    inserted = data?.length ?? 0
  }
  for (const u of plans.flatMap(p => p.update)) {         // vài dòng/đêm — cần lưu giá trị cũ vào history nên đi qua từng dòng
    const { data: cur } = await supabaseAdmin.from("assistant_memory").select("content,history").eq("id", u.id).maybeSingle()
    const hist = [...((cur?.history as { c: string; at: string }[] | null) ?? []), { c: String(cur?.content ?? "").slice(0, 300), at: now }].slice(-5)
    const { error } = await supabaseAdmin.from("assistant_memory").update({ content: u.content, history: hist, updated_at: now }).eq("id", u.id)
    if (!error) updated++
  }
  if (touch.length) await supabaseAdmin.from("assistant_memory").update({ updated_at: now }).in("id", touch)
  if (arch.length) await supabaseAdmin.from("assistant_memory").update({ archived: true, updated_at: now }).in("id", arch)
  return { inserted, updated, touched: touch.length, archived: arch.length }
}

export async function loadHabitRows(usernames: string[]): Promise<HabitRow[]> {
  if (!usernames.length) return []
  const { data } = await supabaseAdmin.from("assistant_memory").select("id,username,content,source,updated_at")
    .in("username", usernames).eq("archived", false).like("source", `${HABIT_SOURCE_PREFIX}%`).limit(5000)
  return (data ?? []) as HabitRow[]
}
