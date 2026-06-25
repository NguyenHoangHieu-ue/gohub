"use client"
import { useEffect } from "react"
import { useSession } from "next-auth/react"

export function HeartbeatProvider() {
  const { data: session } = useSession()

  useEffect(() => {
    if (!session) return
    // Ping ngay khi load
    fetch("/api/user/heartbeat", { method: "POST" }).catch(() => {})
    // Ping mỗi 30s
    const id = setInterval(() => {
      fetch("/api/user/heartbeat", { method: "POST" }).catch(() => {})
    }, 30_000)
    return () => clearInterval(id)
  }, [session])

  return null
}
