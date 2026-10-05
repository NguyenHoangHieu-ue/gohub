"use client"
import { useEffect } from "react"
import { useSession } from "next-auth/react"

export function HeartbeatProvider() {
  const { data: session } = useSession()
  const loggedIn = !!session

  useEffect(() => {
    if (!loggedIn) return
    const ping = () => { fetch("/api/user/heartbeat", { method: "POST" }).catch(() => {}) }
    ping()
    // Mỗi ping = 2 round-trip Supabase; ONLINE_MS phía server = 5 phút nên 2 phút là đủ. Tab ẩn thì không ping, hiện lại ping bù.
    const id = setInterval(() => { if (document.visibilityState === "visible") ping() }, 120_000)
    const onVisible = () => { if (document.visibilityState === "visible") ping() }
    document.addEventListener("visibilitychange", onVisible)
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible) }
  }, [loggedIn])

  return null
}
