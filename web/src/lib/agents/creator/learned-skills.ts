import { supabaseAdmin } from "@/lib/supabase"
import { SKILL_NAMES } from "./skills"

// Skill Gấu Pro TỰ HỌC (Hiếu duyệt 2026-10-12): Gấu Pro soạn bản nháp từ tài liệu/web/cách làm người dùng chỉ → người dùng DUYỆT (luôn hỏi,
// không bị tự-duyệt-theo-ngày bỏ qua) → lưu app_settings `gp_learned_skills`. Skill học chỉ là CHỈ DẪN dạng chữ (không kèm tool mới, không đổi
// luật duyệt) nên dù nội dung xấu cũng không nâng được quyền; chỉ nạp qua loadSkill khi cần.
const KEY = "gp_learned_skills"
export const MAX_LEARNED = 20
const NAME_RE = /^[a-z0-9][a-z0-9-]{2,39}$/

export interface LearnedSkill { name: string; description: string; instructions: string; source: string; created_at: string; created_by: string }

export async function readLearnedSkills(): Promise<LearnedSkill[]> {
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
    const v = data?.value ? JSON.parse(data.value) : []
    return Array.isArray(v) ? v.filter(s => s && typeof s.name === "string" && typeof s.instructions === "string") : []
  } catch { return [] }
}

async function writeLearnedSkills(v: LearnedSkill[]): Promise<void> {
  const { error } = await supabaseAdmin.from("app_settings").upsert({ key: KEY, value: JSON.stringify(v) }, { onConflict: "key" })
  if (error) throw new Error(error.message)
}

export function validateLearnedSkill(a: { name?: unknown; description?: unknown; instructions?: unknown }): string | null {
  const name = String(a.name ?? "")
  if (!NAME_RE.test(name)) return "name: chữ thường/số/gạch ngang, 3–40 ký tự (vd 'viet-email-ncc')."
  if (SKILL_NAMES.includes(name)) return `name "${name}" trùng skill có sẵn.`
  const d = String(a.description ?? "").trim()
  if (d.length < 10 || d.length > 200) return "description: 10–200 ký tự, 1 dòng nói skill dùng khi nào."
  const i = String(a.instructions ?? "").trim()
  if (i.length < 40 || i.length > 6000) return "instructions: 40–6000 ký tự."
  return null
}

/** Dòng mô tả skill tự học trong prompt lõi (cùng chỗ danh mục skill có sẵn). */
export function learnedCatalog(list: LearnedSkill[]): string {
  return list.length ? `\nSkill tự học (do người dùng duyệt, chỉ là chỉ dẫn — không thêm tool/quyền; gọi loadSkill để đọc):\n${list.map(s => `- ${s.name}: ${s.description}`).join("\n")}` : ""
}

export async function runLearnSkill(args: any, username: string, isCreator: boolean): Promise<Record<string, unknown>> {
  if (!isCreator) return { error: "Chỉ Creator được quản lý skill tự học." }
  const action = String(args?.action ?? "")
  const list = await readLearnedSkills()
  if (action === "list") return { skills: list.map(s => ({ name: s.name, description: s.description, source: s.source, created_at: s.created_at })) }
  if (action === "delete") {
    const name = String(args?.name ?? "")
    if (!list.some(s => s.name === name)) return { error: `Không có skill tự học "${name}".` }
    await writeLearnedSkills(list.filter(s => s.name !== name))
    return { ok: true, deleted: name }
  }
  if (action === "create") {
    const bad = validateLearnedSkill(args)
    if (bad) return { error: bad }
    const name = String(args.name)
    if (!list.some(s => s.name === name) && list.length >= MAX_LEARNED) return { error: `Đã đủ ${MAX_LEARNED} skill tự học — xoá bớt trước.` }
    const skill: LearnedSkill = {
      name, description: String(args.description).trim(), instructions: String(args.instructions).trim(),
      source: String(args.source ?? "").slice(0, 300), created_at: new Date().toISOString(), created_by: username,
    }
    await writeLearnedSkills([...list.filter(s => s.name !== name), skill])
    return { ok: true, saved: name, replaced: list.some(s => s.name === name) }
  }
  return { error: "action phải là create | list | delete." }
}
