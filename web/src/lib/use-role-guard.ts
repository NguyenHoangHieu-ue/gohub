"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

// Guard trang client theo role — LẤY ROLE TƯƠI TỪ DB (/api/user/me), KHÔNG dựa role trong JWT.
// Lý do: session.user.role nằm trong JWT (hạn 7 ngày), nếu admin vừa ĐỔI role cho 1 tài khoản
// mà tài khoản đó chưa re-login → JWT vẫn role CŨ → các trang guard bằng session.user.role đẩy
// nhầm về /chatbot dù đã đủ quyền. Sidebar đã dùng dbRole (fresh) để hiện tab → phải KHỚP ở page.
// Trả { ready, role }: ready=false khi đang tải HOẶC không đủ quyền → component nên `return null`.
export function useRoleGuard(allowed: string[], redirectTo = "/chatbot") {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setRole(d?.role ?? session?.user?.role ?? "staff"))
      .catch(() => setRole(session?.user?.role ?? "staff"))
  }, [status, session])

  useEffect(() => {
    if (role && !allowed.includes(role)) router.push(redirectTo)
  }, [role, router]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ready: status === "authenticated" && !!role && allowed.includes(role), role: role ?? undefined }
}
