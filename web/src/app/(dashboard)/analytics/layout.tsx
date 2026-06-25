import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { redirect }         from "next/navigation"
import { headers }          from "next/headers"
import { supabaseAdmin }    from "@/lib/supabase"
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/analytics-roles"

// /analytics → "dashboard"; /analytics/bod → "bod"
function pathToAnalyticsId(pathname: string): string {
  const sub = pathname.replace(/^\/analytics\/?/, "").split("/")[0]
  return sub === "" ? "dashboard" : sub
}

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const role     = (session.user as any).role     as string
  const username = (session.user as any).username as string

  // admin/creator: toàn quyền — không cần truy DB (kiểm JWT trước cho nhanh)
  if (role === "admin" || role === "creator") return <>{children}</>

  // Lấy hồ sơ mới nhất từ DB — không phụ thuộc JWT cũ (vd role vừa đổi chưa re-login)
  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role, allowed_analytics")
    .eq("username", username)
    .maybeSingle()
  const dbRole = profile?.role ?? role
  // dbRole có thể khác JWT nếu admin vừa đổi role → dùng DB làm nguồn sự thật
  if (dbRole === "admin" || dbRole === "creator") return <>{children}</>

  // Quyền nền theo role (ma trận role_permissions) ∪ trang cấp thêm per-user (allowed_analytics)
  const { data: rp } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", "role_permissions").maybeSingle()
  let roleMatrix: Record<string, string[]> = DEFAULT_ROLE_PERMISSIONS
  try { if (rp?.value) roleMatrix = JSON.parse(rp.value) } catch {}

  const baseline = roleMatrix[dbRole] ?? DEFAULT_ROLE_PERMISSIONS[dbRole] ?? []
  const extra    = profile?.allowed_analytics
    ? profile.allowed_analytics.split(",").map((s: string) => s.trim()).filter(Boolean)
    : []
  const granted = new Set<string>([...baseline, ...extra])

  // Không được cấp trang nào (gồm standard chưa cấp) → đẩy về chatbot
  if (granted.size === 0) redirect("/chatbot")

  // Chặn truy cập thẳng URL trang chưa được cấp
  const pathname = headers().get("x-pathname") || ""
  const id = pathToAnalyticsId(pathname)
  if (!granted.has(id)) redirect("/chatbot")

  return <>{children}</>
}
