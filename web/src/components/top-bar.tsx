"use client"

import { useSession, signOut } from "next-auth/react"
import { LogOut, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { ROLE_LABELS } from "@/lib/agents/types"
import { ThemeToggle } from "./theme-toggle"

function roleBadgeClass(role: string) {
  if (role === "creator") return "bg-violet-100 text-violet-700"
  if (role === "admin")   return "bg-amber-100 text-amber-700"
  if (role === "manager") return "bg-purple-100 text-purple-700"
  if (role === "bod")     return "bg-blue-100 text-blue-700"
  if (role === "staff")   return "bg-teal-100 text-teal-700"
  return "bg-green-100 text-green-700"
}

// Thanh trên cùng — tên người dùng + vai trò + Sign Out ở góc phải.
export function TopBar() {
  const { data: session } = useSession()
  const sessionRole = session?.user?.role || "staff"
  const name = session?.user?.name || ""
  const username = session?.user?.username || ""
  const initials = name.split(" ").map(w => w[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join("")

  // Role tươi từ DB (tránh JWT cũ) — fallback session role khi đang tải
  const [dbRole, setDbRole] = useState<string | null>(null)
  useEffect(() => {
    if (!username) return
    fetch("/api/user/me", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.role) setDbRole(d.role)
    }).catch(() => {})
  }, [username])
  const role = dbRole ?? sessionRole

  if (!session) return null

  return (
    <header className="sticky top-0 z-30 h-14 bg-white/85 dark:bg-slate-900/85 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 px-5">
      {/* Tìm nhanh — mở Command Palette (⌘K) */}
      <button
        onClick={() => window.dispatchEvent(new Event("gohub:open-palette"))}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-brand-300 hover:text-brand-600 dark:hover:text-brand-300 transition-colors min-w-[180px] md:min-w-[240px]"
      >
        <Search size={15} className="flex-shrink-0" />
        <span className="flex-1 text-left hidden sm:inline">Tìm nhanh…</span>
        <kbd className="text-[10px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 px-1.5 py-0.5 rounded hidden sm:inline">⌘K</kbd>
      </button>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials || "?"}
          </div>
          <div className="text-right leading-tight">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px]">{name}</div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${roleBadgeClass(role)}`}>
              {ROLE_LABELS[role] ?? role}
            </span>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
        >
          <LogOut size={15} />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>
  )
}
