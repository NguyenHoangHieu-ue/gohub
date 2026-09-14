"use client"

// Wave 0.5 — Nút bật/tắt dark mode. Ghi localStorage 'theme' + toggle class 'dark' trên <html>.
// Trạng thái ban đầu do inline script ở root layout đặt (tránh FOUC).
// s196+21: khoá dark mode cho tab BI (quyết định Hiếu 2026-09-14 — xem lib/theme-lock.ts) — ẩn hẳn nút ở
// route bị khoá + tự gỡ class 'dark' nếu user điều hướng vào đây khi đang bật; tự bật lại đúng theme đã
// lưu khi rời khỏi route bị khoá.

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Sun, Moon } from "lucide-react"
import { isDarkModeLocked } from "@/lib/theme-lock"

export function ThemeToggle() {
  const pathname = usePathname()
  const locked = isDarkModeLocked(pathname || "")
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const el = document.documentElement
    if (locked) {
      el.classList.remove("dark")
      setDark(false)
    } else {
      let stored: string | null = null
      try { stored = localStorage.getItem("theme") } catch {}
      const shouldBeDark = stored === "dark"
      el.classList.toggle("dark", shouldBeDark)
      setDark(shouldBeDark)
    }
  }, [locked, pathname])

  function toggle() {
    const el = document.documentElement
    const next = !el.classList.contains("dark")
    el.classList.toggle("dark", next)
    try { localStorage.setItem("theme", next ? "dark" : "light") } catch {}
    setDark(next)
  }

  if (locked) return null

  return (
    <button
      onClick={toggle}
      title={dark ? "Chế độ sáng" : "Chế độ tối"}
      aria-label="Đổi giao diện sáng/tối"
      className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-slate-100
        dark:text-slate-400 dark:hover:text-brand-300 dark:hover:bg-slate-800 transition-colors"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}
