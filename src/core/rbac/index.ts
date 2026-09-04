import { NextRequest, NextResponse } from "next/server";
import { DBClientFactory } from "@/core/db";

/**
 * 7 role legacy v1 thật trong Supabase `users.role` — giữ nguyên theo yêu
 * cầu Hiếu (không co về model 4-role admin/creator/manager/staff của
 * blueprint gốc `ARCHITECTURE.md` §III).
 */
export type Role = "admin" | "creator" | "bod" | "staff" | "b2c" | "saleb2c" | "hr";

export interface SessionUser {
  username: string;
  role: Role;
}

/**
 * Bảng quyền tĩnh — nguồn sự thật duy nhất cho phân quyền v2.
 * Suy luận cho 2 quyền cụ thể (canWriteConfig/canSeeCogs) trên 7 role thật,
 * CHƯA được Hiếu xác nhận từng dòng — chỉ `admin`/`creator`/`staff` là chắc
 * chắn (tên khớp định nghĩa gốc trong blueprint). Phần còn lại suy theo
 * ý nghĩa vai trò, mặc định nghiêng về AN TOÀN (ẩn COGS) khi không chắc:
 *   - bod: Board of Directors — đúng đối tượng xem BOD Report (GP/CM1),
 *     không có quyền sửa cấu hình/tỷ giá.
 *   - b2c / saleb2c: vai trò sales, không có lý do cần thấy giá vốn.
 *   - hr: nhân sự, không liên quan số liệu tài chính bán hàng.
 */
export const ROLE_PERMISSIONS: Record<Role, { canWriteConfig: boolean; canSeeCogs: boolean }> = {
  admin: { canWriteConfig: true, canSeeCogs: true },
  creator: { canWriteConfig: true, canSeeCogs: true },
  bod: { canWriteConfig: false, canSeeCogs: true },
  staff: { canWriteConfig: false, canSeeCogs: false },
  b2c: { canWriteConfig: false, canSeeCogs: false },
  saleb2c: { canWriteConfig: false, canSeeCogs: false },
  hr: { canWriteConfig: false, canSeeCogs: false },
};

const DEFAULT_PERMISSIONS = { canWriteConfig: false, canSeeCogs: false };

/**
 * Tra bảng an toàn: role lạ (chưa từng thấy trong DB, hoặc role mới thêm
 * sau này chưa cập nhật vào bảng trên) = least-privilege thay vì crash
 * `ROLE_PERMISSIONS[role]` undefined.
 */
function permissionsFor(role: Role): { canWriteConfig: boolean; canSeeCogs: boolean } {
  return ROLE_PERMISSIONS[role] ?? DEFAULT_PERMISSIONS;
}

/**
 * Đọc role TƯƠI trực tiếp từ DB (không tin cookie/JWT cũ) — bake lesson v1
 * s165: role đổi giữa chừng phiên đăng nhập vẫn phải phản ánh ngay.
 */
export async function getFreshRole(username: string): Promise<Role | null> {
  const supabase = DBClientFactory.getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("username", username)
    .maybeSingle();

  if (error || !data) return null;
  return data.role as Role;
}

export function canWrite(role: Role): boolean {
  return permissionsFor(role).canWriteConfig;
}

export function canSeeCogs(role: Role): boolean {
  return permissionsFor(role).canSeeCogs;
}

/**
 * Guard chuẩn cho mọi API route nghiệp vụ nhạy cảm. Đọc role tươi từ DB,
 * không tin tuyệt đối JWT client-side. Trả về NextResponse lỗi nếu chặn,
 * trả về null nếu cho qua.
 */
export async function analyticsGuard(
  req: NextRequest,
  sessionUser: SessionUser | undefined,
  opts: { requireWrite?: boolean } = {}
): Promise<NextResponse | null> {
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const freshRole = await getFreshRole(sessionUser.username);
  if (!freshRole) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (opts.requireWrite && !canWrite(freshRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

/**
 * Lột sạch cột COGS/GP khỏi payload trả về cho role không có quyền xem
 * giá vốn (staff). Áp ngay tại lớp formulas/response trước khi trả JSON.
 */
export function stripCogsFields<T extends Record<string, unknown>>(row: T, role: Role): T {
  if (canSeeCogs(role)) return row;
  const clone = { ...row };
  for (const key of Object.keys(clone)) {
    if (/cogs|gross_profit|gpm/i.test(key)) {
      delete (clone as Record<string, unknown>)[key];
    }
  }
  return clone;
}
