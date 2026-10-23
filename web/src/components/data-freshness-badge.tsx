"use client"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Database } from "lucide-react"

// "Dữ liệu cập nhật lúc HH:mm" — mốc ETL/checksum gần nhất. Giúp người xem biết số đang hiện cũ tới đâu.
export function DataFreshnessBadge() {
  const pathname = usePathname()
  const [at, setAt] = useState<string | null>(null)
  const onAnalytics = pathname?.startsWith("/analytics")

  useEffect(() => {
    if (!onAnalytics) return
    let alive = true
    const load = () => fetch("/api/analytics/data-freshness").then(r => r.ok ? r.json() : null)
      .then(j => { if (alive && j?.at) setAt(j.at) }).catch(() => {})
    load()
    const id = setInterval(() => { if (document.visibilityState === "visible") load() }, 5 * 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [onAnalytics])

  if (!onAnalytics || !at) return null
  const d = new Date(at)
  const hhmm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })
  const sameDay = d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) === new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
  const day = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })
  return (
    <span title="Mốc cập nhật gần nhất của dữ liệu nguồn (ETL). Bấm 'Tải lại mới' trong tab nếu cần số tươi hơn."
      className="hidden md:inline-flex items-center gap-1 text-[11.5px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
      <Database size={12} className="flex-shrink-0" />
      Dữ liệu cập nhật {sameDay ? hhmm : `${day} ${hhmm}`}
    </span>
  )
}
