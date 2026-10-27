"use client"
import { useEffect } from "react"
import { usePathname } from "next/navigation"

// Chẩn đoán "tab chat tự tải lại": khi trang được nạp do tải lại (reload) hoặc do Chrome loại bỏ tab rồi nạp lại (wasDiscarded), ghi 1 sự kiện `page_reload`
// (app_usage_events) kèm loại điều hướng, thời gian trống kể từ lúc trang còn sống gần nhất, và bản build — để biết nguyên nhân thật (tab bị loại, deploy mới, hay lỗi trang).
// Chỉ ghi khi đúng tình huống đó; mọi lỗi bị nuốt, không ảnh hưởng ứng dụng.
const ALIVE_KEY = "gh_probe_alive"
let sent = false   // loại điều hướng của trang không đổi khi chuyển route trong app → chỉ ghi một lần cho mỗi lần nạp trang

export function ReloadProbe() {
  const pathname = usePathname()
  useEffect(() => {
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
      const discarded = (document as unknown as { wasDiscarded?: boolean }).wasDiscarded === true
      const last = Number(sessionStorage.getItem(ALIVE_KEY) || 0)
      if (!sent && (nav?.type === "reload" || discarded)) {
        sent = true
        const chunk = Array.from(document.scripts).map(s => s.src).find(s => s.includes("/_next/static/"))?.split("/_next/static/")[1]?.slice(0, 60) ?? null
        void fetch("/api/analytics/track", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_type: "page_reload", page_path: location.pathname, tab_key: "probe", user_message: JSON.stringify({ type: nav?.type, discarded, gapSec: last ? Math.round((Date.now() - last) / 1000) : null, chunk, vis: document.visibilityState }) }),
        }).catch(() => undefined)
      }
      const beat = () => { try { sessionStorage.setItem(ALIVE_KEY, String(Date.now())) } catch { /* bỏ qua */ } }
      beat()
      const id = setInterval(beat, 15_000)
      return () => clearInterval(id)
    } catch { /* trình duyệt chặn Performance/Storage: bỏ qua */ }
  }, [pathname])
  return null
}
