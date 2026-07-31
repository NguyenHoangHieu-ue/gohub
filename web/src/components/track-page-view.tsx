"use client"
import { useEffect } from "react"
import { usePathname } from "next/navigation"

// Fire-and-forget page view tracking. Injected once in DashboardLayout.
export function TrackPageView() {
  const pathname = usePathname()

  useEffect(() => {
    const tabKey = pathname === "/analytics"
      ? "dashboard"
      : pathname.startsWith("/analytics/")
        ? pathname.replace("/analytics/", "").split("/")[0]
        : pathname.replace("/", "") || "home"

    fetch("/api/analytics/track", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ event_type: "page_view", page_path: pathname, tab_key: tabKey }),
    }).catch(() => {})
  }, [pathname])

  return null
}
