"use client"
import { useEffect, useRef } from "react"
import { SessionProvider as NextAuthSessionProvider, signIn, useSession } from "next-auth/react"

const PING_MS = 5 * 60 * 1000

// Phiên trượt: có thao tác trong 5 phút gần nhất thì gia hạn; hết hạn thì về đăng nhập và quay lại đúng trang.
function SessionKeepAlive() {
  const { status, update } = useSession()
  const active = useRef(false)

  useEffect(() => {
    const mark = () => { active.current = true }
    const events = ["pointerdown", "keydown", "scroll"] as const
    events.forEach(e => window.addEventListener(e, mark, { passive: true }))
    const timer = setInterval(() => {
      if (!active.current || document.hidden) return
      active.current = false
      void update()
    }, PING_MS)
    return () => {
      events.forEach(e => window.removeEventListener(e, mark))
      clearInterval(timer)
    }
  }, [update])

  useEffect(() => {
    if (status === "unauthenticated" && window.location.pathname !== "/login") {
      void signIn(undefined, { callbackUrl: window.location.pathname + window.location.search })
    }
  }, [status])

  return null
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <SessionKeepAlive />
      {children}
    </NextAuthSessionProvider>
  )
}
