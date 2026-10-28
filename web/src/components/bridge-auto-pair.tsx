"use client"
import { useEffect, useState } from "react"

// TỰ GHÉP NỐI Bridge (extension ≥ 1.4.0): khi người dùng đã cài extension và đang đăng nhập, trang tự lấy token CỦA CHÍNH họ rồi trao cho extension — khỏi mở popup, khỏi dán token.
// Không có extension (không có phản hồi bridge-pong) hoặc người dùng không có quyền Bridge (token API 401/403) → im lặng. Chỉ thử vài lần mỗi lần mở trang, không hiện gì khi đã ghép nối.
const PING_TIMEOUT_MS = 1500
type Pong = { version?: string; paired?: boolean; enabled?: boolean; tokenTail?: string | null }

function ping(): Promise<Pong | null> {
  return new Promise(resolve => {
    const done = (v: Pong | null) => { window.removeEventListener("message", on); clearTimeout(t); resolve(v) }
    const on = (e: MessageEvent) => { if (e.source === window && e.data?.source === "gau-ext" && e.data?.type === "bridge-pong") done(e.data as Pong) }
    const t = setTimeout(() => done(null), PING_TIMEOUT_MS)
    window.addEventListener("message", on)
    window.postMessage({ source: "gau-web", type: "bridge-ping" }, window.location.origin)
  })
}

export function BridgeAutoPair() {
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    ;(async () => {
      const pong = await ping()
      if (!pong || !on) return   // chưa cài extension (hoặc bản cũ không hiểu ping nâng cao)
      const [maj, min] = (pong.version ?? "0.0").split(".").map(Number)
      if (maj < 1 || (maj === 1 && min < 4)) return   // extension cũ (<1.4.0) không có bridge-pair: người dùng cập nhật ở trang Bridge
      const r = await fetch("/api/creator-ai/bridge/token", { cache: "no-store" })
      if (!r.ok) return   // không có quyền Bridge: bỏ qua
      let { token } = (await r.json()) as { token: string | null }
      if (!token) {
        const c = await fetch("/api/creator-ai/bridge/token", { method: "POST" })
        if (!c.ok) return
        token = ((await c.json()) as { token?: string }).token ?? null
      }
      if (!token || !on) return
      if (pong.paired && pong.enabled && pong.tokenTail === token.slice(-6)) return   // đã ghép đúng token hiện tại
      window.postMessage({ source: "gau-web", type: "bridge-pair", token }, window.location.origin)
      const ok = await new Promise<boolean>(res => {
        const h = (e: MessageEvent) => { if (e.source === window && e.data?.source === "gau-ext" && e.data?.type === "bridge-paired") { window.removeEventListener("message", h); res(true) } }
        window.addEventListener("message", h)
        setTimeout(() => { window.removeEventListener("message", h); res(false) }, 3000)
      })
      if (ok && on) { setNote("Đã tự kết nối Bridge với trình duyệt này."); setTimeout(() => on && setNote(null), 6000) }
    })().catch(() => undefined)
    return () => { on = false }
  }, [])
  if (!note) return null
  return <div role="status" className="fixed bottom-4 right-4 z-50 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-900 shadow-lg dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-100">{note}</div>
}
