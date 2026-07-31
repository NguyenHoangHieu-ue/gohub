"use client"
import { useEffect, useRef } from "react"
import { usePathname }       from "next/navigation"
import { useSession }        from "next-auth/react"

// Minimum seconds on a page before counting as a real visit.
const DWELL_THRESHOLD_MS = 15_000 // 15 seconds

export function TrackPageView() {
  const pathname          = usePathname()
  const { data: session } = useSession()
  const timerRef          = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Cancel any pending timer from the previous page
    if (timerRef.current) clearTimeout(timerRef.current)

    const tabKey = pathname === "/analytics"
      ? "dashboard"
      : pathname.startsWith("/analytics/")
        ? pathname.replace("/analytics/", "").split("/")[0]
        : pathname.replace("/", "") || "home"

    // Only fire after DWELL_THRESHOLD_MS — ensures user actually read the page
    timerRef.current = setTimeout(() => {
      fetch("/api/analytics/track", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          event_type: "page_view",
          page_path:  pathname,
          tab_key:    tabKey,
          user_name:  session?.user?.name ?? null,
        }),
      }).catch(() => {})
    }, DWELL_THRESHOLD_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [pathname, session])

  return null
}
