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

/** Công cụ member KHÔNG được dùng. Nguyên tắc: member dùng được đúng những gì thành viên dùng được ở Gấu Pro (CREATOR_ONLY_TOOLS trong creator-ai.ts: tệp máy, Google, Lark Doc, gửi tin Lark, portal, ghi KB chung, kỹ năng chỉ Creator) — còn lại (số liệu, web, trang, ảnh, video, Bridge trình duyệt của chính họ, task/lịch qua thẻ duyệt) mở. Thêm các công cụ riêng của Argon chạy mã / đề xuất sửa code / dự đoán. */
export const MEMBER_BLOCKED_TOOLS: readonly string[] = ["run_code", "deXuatSuaCode", "deXuatKyNang", "ghiDuDoan", "chamDuDoan", "docGoogle", "docTepMay", "docPortal"]

/** Dặn model khi người hỏi là THÀNH VIÊN (không phải Creator): nói rõ giới hạn thay vì tự tìm đường vòng (đã thấy ở eval: bị chặn kỹ năng thì tự lưu ghi chú "đóng gói kỹ năng"). */
export const MEMBER_NOTE = "NGƯỜI HỎI LÀ THÀNH VIÊN ĐƯỢC CẤP QUYỀN (không phải Creator); họ dùng được đúng những gì thành viên dùng được ở Gấu Pro. KHO chỉ chứa tài liệu cá nhân của chính họ: đọc Kho khi họ hỏi về tài liệu/ghi chú/thư của họ. Số liệu công ty (doanh thu, đơn, khách, kênh, KPI, GA4/GSC…) thì KHÔNG tra Kho mà dùng công cụ dữ liệu (layDuLieuHeThong, sql chỉ đọc, đọc bảng hệ thống, GA4/GSC, tìm web); cần biểu đồ/báo cáo thì lấy số rồi dựng report HTML. Bạn CÓ: đọc trang web, tạo ảnh/video, điều khiển trình duyệt của chính họ qua Bridge, và đề xuất (deXuatThaoTac, họ bấm Đồng ý mới chạy) tạo/sửa task Lark của họ, đặt lịch/nhắc, tạo phiếu sửa code. Bạn KHÔNG có: chạy mã, gửi tin Lark, tạo/sửa Lark Doc/Google, đọc Google, tệp trên máy, portal vendor, đề xuất sửa code/kỹ năng toàn hệ thống (đọc Lark chỉ được phần của chính họ, và chỉ khi họ đã bấm Cho phép): nếu họ nhờ việc đó thì KHÔNG làm, KHÔNG giả vờ đã làm; nói NGẮN GỌN rằng việc này chỉ Creator làm được. KHÔNG bịa nút/tuỳ chọn/tính năng của giao diện, KHÔNG bịa số liệu, không tự tìm cách làm vòng (không lưu ghi chú/tệp để thay thế). Việc trong Kho của họ (đọc, tìm, so sánh, ghi sự việc, đề xuất ghi nhớ) thì làm bình thường."

/** Việc cần duyệt member được thấy: chỉ loại dữ liệu CỦA CHÍNH HỌ (không có hành động Gấu Pro, đề xuất sửa code, phiếu dev, kỹ năng toàn hệ thống, KPI công ty). */
export const MEMBER_INBOX_KINDS: readonly string[] = ["gp_action", "fact_review", "mail", "memory_proposal", "security_notice", "argon_ask"]
