"use client"
import { useEffect, useRef } from "react"
import { SessionProvider as NextAuthSessionProvider, signIn, useSession } from "next-auth/react"

const PING_MS = 5 * 60 * 1000
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const readSession = (): Promise<"ok" | "empty" | "error"> =>
  fetch("/api/auth/session", { cache: "no-store" }).then(r => r.json()).then(j => (j?.user ? "ok" : "empty") as "ok" | "empty").catch(() => "error" as const)

// Phiên trượt: có thao tác trong 5 phút gần nhất thì gia hạn; hết hạn thật thì về đăng nhập và quay lại đúng trang.
// QUAN TRỌNG: gia hạn bằng fetch thường tới /api/auth/session (trình duyệt tự nhận cookie mới) chứ KHÔNG dùng update() của next-auth — update() ghi đè trạng thái phiên của cả ứng dụng,
// nên một lần gọi lỗi thoáng qua làm status thành "unauthenticated". Và "unauthenticated" CHƯA phải hết phiên: phải kiểm lại nhiều lần trước khi chuyển trang,
// vì chuyển trang (signIn) là điều hướng cứng làm mất mọi nội dung đang gõ / câu trả lời đang chạy.
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
      void readSession()
    }, PING_MS)
    return () => {
      events.forEach(e => window.removeEventListener(e, mark))
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (status !== "unauthenticated" || window.location.pathname === "/login") return
    let cancelled = false
    void (async () => {
      let empty = 0
      for (let i = 0; i < 4 && !cancelled; i++) {
        await sleep(2500)
        if (cancelled) return
        const r = await readSession()
        if (r === "ok") { void update(); return }   // phiên vẫn còn: chỉ đồng bộ lại trạng thái, KHÔNG chuyển trang
        if (r === "empty") empty++
        if (empty >= 2) break
      }
      // Chỉ khi máy chủ trả "không có phiên" ít nhất 2 lần mới đăng nhập lại; lỗi mạng/máy chủ thì giữ nguyên trang.
      if (!cancelled && empty >= 2) void signIn(undefined, { callbackUrl: window.location.pathname + window.location.search })
    })()
    return () => { cancelled = true }
  }, [status, update])

  return null
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider refetchOnWindowFocus={false}>
      <SessionKeepAlive />
      {children}
    </NextAuthSessionProvider>
  )
}
