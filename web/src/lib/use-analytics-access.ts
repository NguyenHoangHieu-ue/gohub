"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { fetchMe } from "@/lib/me-client"

// Client-side mirror của kiểm tra quyền ở app/(dashboard)/analytics/layout.tsx: admin/creator toàn quyền;
// còn lại = ma trận role_permissions ∪ allowed_analytics của người dùng. Chỉ để ẩn/hiện UI; server vẫn chặn thật.
export function useAnalyticsAccess(id: string): boolean {
  const { data: session } = useSession()
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const role = session?.user?.role
    if (!role) return
    if (role === "admin" || role === "creator") { setOk(true); return }
    let alive = true
    Promise.all([
      fetchMe(),
      fetch("/api/config/role-permissions", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([me, perms]) => {
      if (!alive) return
      const r = me?.role ?? role
      const extra = me?.allowed_analytics ? String(me.allowed_analytics).split(",").map((x: string) => x.trim()) : []
      setOk(r === "admin" || r === "creator" || extra.includes(id) || (perms?.[r] ?? []).includes(id))
    })
    return () => { alive = false }
  }, [session?.user?.role, id])
  return ok
}
