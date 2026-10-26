// Phần THUẦN của quyền truy cập ARGON-X (không nạp next-auth/supabase): mức truy cập, hạn mức mỗi ngày, danh sách công cụ member bị chặn. I/O ở access.ts.
export const ARGON_USERS_KEY = "argon_users"
export type ArgonLevel = "owner" | "member"

/** Mức truy cập từ vai trò trong DB + danh sách được cấp. */
export function levelFor(dbRole: string | undefined | null, username: string | undefined | null, granted: readonly string[]): ArgonLevel | null {
  if (dbRole === "creator") return "owner"
  return username && granted.includes(username) ? "member" : null
}

export interface MemberLimits { runs: number; usd: number }
export const DEFAULT_LIMITS: MemberLimits = { runs: 40, usd: 3 }

/** Còn được chạy không? used = số lượt + chi phí đã dùng HÔM NAY (giờ VN). */
export function limitCheck(used: { runs: number; usd: number }, lim: MemberLimits): { ok: true } | { ok: false; reason: string } {
  if (used.runs >= lim.runs) return { ok: false, reason: `Hôm nay anh/chị đã dùng ${used.runs}/${lim.runs} lượt Trợ lý. Mai dùng tiếp, hoặc nhờ Creator tăng hạn mức.` }
  if (used.usd >= lim.usd) return { ok: false, reason: "Hôm nay Trợ lý đã dùng hết hạn mức chi phí mỗi ngày. Mai dùng tiếp, hoặc nhờ Creator tăng hạn mức." }
  return { ok: true }
}

/** Mốc 00:00 hôm nay theo giờ Việt Nam, dạng ISO UTC. */
export function vnDayStartIso(now = new Date()): string {
  const vn = new Date(now.getTime() + 7 * 3600_000)
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600_000).toISOString()
}

/** Công cụ member KHÔNG được dùng (chạm dữ liệu công ty/hệ thống hoặc có tác dụng toàn hệ thống). */
export const MEMBER_BLOCKED_TOOLS: readonly string[] = ["sql", "run_code", "layDuLieuHeThong", "deXuatSuaCode", "deXuatKyNang", "ghiDuDoan", "chamDuDoan"]

/** Việc cần duyệt member được thấy: chỉ loại dữ liệu CỦA CHÍNH HỌ (không có hành động Gấu Pro, đề xuất sửa code, phiếu dev, kỹ năng toàn hệ thống, KPI công ty). */
export const MEMBER_INBOX_KINDS: readonly string[] = ["fact_review", "mail", "memory_proposal", "security_notice", "argon_ask"]
