"use client"
import { useEffect } from "react"
import { usePathname } from "next/navigation"

// Chẩn đoán "trang tự tải lại / mất nội dung": ghi nhật ký (app_settings.reload_log, xem /api/diag/reload) khi
//  - trang nạp do tải lại (reload) hoặc Chrome loại tab rồi nạp lại (wasDiscarded);
//  - trang nạp lại CÙNG phiên trình duyệt trong vòng 10 phút (kể cả điều hướng cứng của Next/đăng nhập lại — loại "navigate" không phải reload nên trước đây không thấy);
//  - có lỗi tải mã (ChunkLoadError — Next tự tải lại trang khi gặp lỗi này, thường sau khi có bản triển khai mới).
// Chỉ ghi các trường chẩn đoán, mọi lỗi bị nuốt, không ảnh hưởng ứng dụng.
const ALIVE_KEY = "gh_probe_alive"
const LAST_KEY = "gh_probe_last_load"
let sent = false   // loại điều hướng của trang không đổi khi chuyển route trong app → chỉ ghi một lần cho mỗi lần nạp trang

const post = (body: Record<string, unknown>) => {
  try { void fetch("/api/diag/reload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined) } catch { /* bỏ qua */ }
}

export function ReloadProbe() {
  const pathname = usePathname()
  useEffect(() => {
    try {
      if (!sent) {
        sent = true
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
        const discarded = (document as unknown as { wasDiscarded?: boolean }).wasDiscarded === true
        const now = Date.now()
        let prev: { path?: string; ts?: number } | null = null
        try { prev = JSON.parse(sessionStorage.getItem(LAST_KEY) || "null") } catch { /* bỏ qua */ }
        const gap = prev?.ts ? Math.round((now - prev.ts) / 1000) : null
        const repeat = gap != null && gap < 600
        if (nav?.type === "reload" || discarded || repeat) {
          const chunk = Array.from(document.scripts).map(s => s.src).find(s => s.includes("/_next/static/"))?.split("/_next/static/")[1]?.slice(0, 60) ?? null
          post({ kind: discarded ? "discarded" : nav?.type === "reload" ? "reload" : "repeat-load", type: nav?.type, discarded, gapSec: gap, path: location.pathname, prevPath: prev?.path ?? null, ref: document.referrer ? new URL(document.referrer).pathname : null, chunk, vis: document.visibilityState })
        }
        try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ path: location.pathname, ts: now })) } catch { /* bỏ qua */ }
        const onErr = (e: ErrorEvent | PromiseRejectionEvent) => {
          const msg = String((e as ErrorEvent).message ?? (e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason ?? "")
          if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported/i.test(msg)) post({ kind: "chunk-error", path: location.pathname, msg })
        }
        window.addEventListener("error", onErr)
        window.addEventListener("unhandledrejection", onErr)
      }
      const beat = () => { try { sessionStorage.setItem(ALIVE_KEY, String(Date.now())) } catch { /* bỏ qua */ } }
      beat()
      const id = setInterval(beat, 15_000)
      return () => clearInterval(id)
    } catch { /* trình duyệt chặn Performance/Storage: bỏ qua */ }
  }, [pathname])
  return null
}
