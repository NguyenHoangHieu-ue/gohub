"use client"

// Wave 0.5 — Nút bật/tắt dark mode. Ghi localStorage 'theme' + toggle class 'dark' trên <html>.
// Trạng thái ban đầu do inline script ở root layout đặt (tránh FOUC).

import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"

export function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")) }, [])

  function toggle() {
    const el = document.documentElement
    const next = !el.classList.contains("dark")
    el.classList.toggle("dark", next)
    try { localStorage.setItem("theme", next ? "dark" : "light") } catch {}
    setDark(next)
  }

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
