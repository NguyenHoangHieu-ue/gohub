import { getServerSession } from "next-auth"
import { authOptions }      from "@/lib/auth"
import { redirect }         from "next/navigation"
import { headers }          from "next/headers"
import { supabaseAdmin }    from "@/lib/supabase"
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/analytics-roles"
import { memo } from "@/lib/memo"

// /analytics → "dashboard"; /analytics/bod → "bod"
function pathToAnalyticsId(pathname: string): string {
  const sub = pathname.replace(/^\/analytics\/?/, "").split("/")[0]
  return sub === "" ? "dashboard" : sub
}

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")

  const role     = session.user.role     as string
  const username = session.user.username

  // admin/creator: toàn quyền — không cần truy DB (kiểm JWT trước cho nhanh)
  if (role === "admin" || role === "creator") return <>{children}</>

  // Hồ sơ + ma trận quyền: 2 lần đọc Supabase độc lập → chạy SONG SONG và memo 20s (mỗi lần ~0,4s từ iad1, đo s203;
  // trước đây nối tiếp mỗi lần chuyển trang). Vẫn lấy từ DB (không phụ thuộc JWT cũ), chỉ trễ tối đa 20s.
  const [profile, rpValue] = await Promise.all([
    memo(`layout-profile:${username}`, 20_000, async () => {
      const { data } = await supabaseAdmin.from("users").select("role, allowed_analytics").eq("username", username).maybeSingle()
      return data
    }),
    memo("layout-role-permissions", 20_000, async () => {
      const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "role_permissions").maybeSingle()
      return (data?.value as string | undefined) ?? null
    }),
  ])
  const dbRole = profile?.role ?? role
  // dbRole có thể khác JWT nếu admin vừa đổi role → dùng DB làm nguồn sự thật
  if (dbRole === "admin" || dbRole === "creator") return <>{children}</>

  // Quyền nền theo role (ma trận role_permissions) ∪ trang cấp thêm per-user (allowed_analytics)
  let roleMatrix: Record<string, string[]> = DEFAULT_ROLE_PERMISSIONS
  try { if (rpValue) roleMatrix = JSON.parse(rpValue) } catch {}

  // Union code defaults + DB: DB có thể thêm tab, nhưng code defaults luôn được giữ
  // (tránh tình trạng DB cũ không có tab mới → bị block dù code đã thêm vào defaults).
  const dbPerms = roleMatrix[dbRole] ?? []
  const baseline = [...new Set([...(DEFAULT_ROLE_PERMISSIONS[dbRole] ?? []), ...dbPerms])]
  const extra    = profile?.allowed_analytics
    ? profile.allowed_analytics.split(",").map((s: string) => s.trim()).filter(Boolean)
    : []
  const granted = new Set<string>([...baseline, ...extra])

  // Không được cấp trang nào (gồm standard chưa cấp) → đẩy về chatbot
  if (granted.size === 0) redirect("/chatbot")

  // Chặn truy cập thẳng URL trang chưa được cấp
  const pathname = headers().get("x-pathname") || ""
  const id = pathToAnalyticsId(pathname)

  // Tổ Gấu KHÔNG phải trang analytics — mở cho mọi role (chỉ gate theo group-membership ở API +
  // hiddenTabs của creator, xem sidebar.tsx/nav.ts), không nằm trong role_permissions/allowed_analytics
  // nên sẽ luôn bị granted.has() trả false → redirect nhầm về /chatbot cho MỌI role không phải
  // admin/creator dù đã là member group thật (bug phát hiện s194+8).
  if (id === "to-gau") return <>{children}</>

  if (!granted.has(id)) {
    // Ngoại lệ: /analytics/creator/* — user được cấp GP access trong gp_allowed_users
    if (id === "creator") {
      const { data: gpRow } = await supabaseAdmin
        .from("app_settings").select("value").eq("key", "gp_allowed_users").maybeSingle()
      if (gpRow?.value) {
        try {
          const gpAllowed = JSON.parse(gpRow.value) as string[]
          if (gpAllowed.includes(username)) return <>{children}</>
        } catch {}
      }
    }
    redirect("/chatbot")
  }

  return <>{children}</>
}
