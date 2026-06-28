// Server-only: lấy role HIỆN TẠI từ DB. JWT (session.user.role) có thể CŨ nếu admin vừa đổi role mà
// user chưa đăng nhập lại → dùng role DB cho cổng quyền nhạy cảm (vd KB trang ẩn, tránh role cũ "admin").
// KHÔNG đặt trong lib/kb.ts: file đó được client component (kb/page.tsx) import → kéo supabaseAdmin
// (service key) vào client bundle → createClient ném "supabaseKey is required" → trang trắng.
import { supabaseAdmin } from "./supabase"

export async function getDbRole(username?: string | null, fallback?: string): Promise<string> {
  if (!username) return fallback ?? ""
  const { data } = await supabaseAdmin.from("users").select("role").eq("username", username).maybeSingle()
  return (data?.role as string) ?? fallback ?? ""
}
