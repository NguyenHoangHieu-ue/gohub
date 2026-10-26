import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getDbRole } from "@/lib/db-role"
import { memo } from "@/lib/memo"
import { supabaseAdmin } from "@/lib/supabase"
import { ARGON_USERS_KEY, DEFAULT_LIMITS, levelFor, limitCheck, vnDayStartIso, type ArgonLevel, type MemberLimits } from "./access-pure"

// ARGON-X P5 — MỞ CHO VÀI NGƯỜI NỘI BỘ. Hai mức:
//   owner  = Creator (toàn quyền như cũ: số liệu hệ thống/SQL/code, kỹ năng, cuộc gọi, nguồn tự động Lark/mail, việc nền, cron đêm cho KPI…)
//   member = người Creator cấp ở Creator Settings (app_settings "argon_users"): Hỏi + Kho + Việc cần duyệt CỦA CHÍNH HỌ.
// Mọi dữ liệu Argon đã khoá theo username (dự án, nguồn, sự việc, sổ mail, trí nhớ, đề xuất) nên member không thấy gì của người khác; ngoài ra member bị bỏ các công cụ
// chạm dữ liệu công ty/hệ thống (MEMBER_BLOCKED_TOOLS), không chạy việc nền, và có HẠN MỨC mỗi ngày. Route nào KHÔNG dùng requireArgonMember* thì vẫn chỉ Creator.
export { ARGON_USERS_KEY } from "./access-pure"
export type { ArgonLevel } from "./access-pure"

async function loadGranted(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", ARGON_USERS_KEY).maybeSingle()
  try { const v = typeof data?.value === "string" ? JSON.parse(data.value) : data?.value; return Array.isArray(v) ? v.map(String) : [] } catch { return [] }
}

/** Quyền vừa đổi có hiệu lực sau tối đa 20 giây (memo, như các quyền Creator khác). */
export async function argonLevel(username: string | undefined | null, sessionRole?: string): Promise<ArgonLevel | null> {
  if (!username) return null
  const role = await getDbRole(username, sessionRole)
  if (role === "creator") return "owner"
  return levelFor(role, username, await memo(`grant:${ARGON_USERS_KEY}`, 20_000, loadGranted))
}

/** Route dành cho CẢ owner lẫn member (dữ liệu của chính họ). Trả { username, level } hoặc null. */
export async function requireArgonMember(): Promise<{ username: string; level: ArgonLevel } | null> {
  const session = await getServerSession(authOptions)
  const username = session?.user?.username
  const level = await argonLevel(username, session?.user?.role)
  return username && level ? { username, level } : null
}

/** Như requireArgonMember nhưng chỉ trả username (thay trực tiếp cho requireArgonUser ở các route đã rà soát: dữ liệu khoá theo username). */
export async function requireArgonMemberName(): Promise<string | null> { return (await requireArgonMember())?.username ?? null }

const LIMITS_KEY = "argon_member_limits"
export async function loadLimits(): Promise<MemberLimits> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", LIMITS_KEY).maybeSingle()
  try {
    const v = typeof data?.value === "string" ? JSON.parse(data.value) : data?.value
    return { runs: Number(v?.runs) > 0 ? Number(v.runs) : DEFAULT_LIMITS.runs, usd: Number(v?.usd) > 0 ? Number(v.usd) : DEFAULT_LIMITS.usd }
  } catch { return DEFAULT_LIMITS }
}

/** Kiểm hạn mức của một member trước khi chạy một lượt. Owner luôn được. Lỗi đọc → cho chạy (không chặn nhầm). */
export async function checkMemberLimit(username: string, level: ArgonLevel): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (level === "owner") return { ok: true }
  try {
    const [lim, { data }] = await Promise.all([loadLimits(), supabaseAdmin.from("argon_runs").select("cost_usd").eq("username", username).gte("created_at", vnDayStartIso()).limit(1000)])
    const rows = data ?? []
    return limitCheck({ runs: rows.length, usd: rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0) }, lim)
  } catch { return { ok: true } }
}

/** Danh sách username là owner (cron đêm: KPI công ty, đề xuất kỹ năng toàn hệ thống chỉ chạy cho owner). */
export async function ownerUsernames(all: string[]): Promise<string[]> {
  const out: string[] = []
  for (const u of all) if ((await argonLevel(u)) === "owner") out.push(u)
  return out
}
