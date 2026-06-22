import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { redirect }         from "next/navigation"
import { headers }          from "next/headers"
import { supabaseAdmin }    from "@/lib/supabase"

// 18 trang analytics (khớp role-permissions API + ANALYTICS_GROUPS ở sidebar)
const ALL_ANALYTICS_IDS = [
  "dashboard", "bod", "all-time", "channels", "b2b", "b2c", "website",
  "staff", "customers", "vendors", "orders", "fulfillment", "3hk-usage",
  "cs-troubleshoot", "feedback", "products", "targets", "sql",
]

// Quyền nền mặc định khi chưa cấu hình (khớp DEFAULT_ROLE_PERMISSIONS ở /api/config/role-permissions)
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  bod:   ALL_ANALYTICS_IDS,
  staff: ["dashboard", "feedback", "products"],
}

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

  // admin: toàn quyền — không cần truy DB
  if (role === "admin") return <>{children}</>

  // Lấy hồ sơ mới nhất từ DB (role + trang cấp thêm) — không phụ thuộc session cũ
  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role, allowed_analytics")
    .eq("username", username)
    .maybeSingle()
  const dbRole = profile?.role ?? role
  if (dbRole === "admin") return <>{children}</>

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
