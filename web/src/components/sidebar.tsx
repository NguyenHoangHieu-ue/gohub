"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { MessageSquare, Users, LogOut, Gift, Package, Truck, Globe } from "lucide-react"

const NAV = [
  { href: "/chatbot",    label: "Chatbot",       icon: MessageSquare },
  { href: "/promotions", label: "Khuyến Mãi",    icon: Gift },
  { href: "/skus",       label: "SP Hệ Thống",   icon: Package },
  { href: "/ncc",        label: "SP Nhà CC",      icon: Truck },
  { href: "/countries",  label: "Danh sách Nước", icon: Globe },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role      = session?.user?.role     || "sale"
  const name      = session?.user?.name     || ""
  const username  = session?.user?.username || ""
  const initials  = name.split(" ").map(w => w[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join("")

  const navItems = role === "admin"
    ? [...NAV, { href: "/admin", label: "Admin", icon: Users }]
    : NAV

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-gray-200 flex flex-col z-40 select-none">

      {/* Brand header */}
      <div className="px-4 py-3.5 bg-gradient-to-r from-brand-600 to-blue-600 border-b border-brand-700/30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-base border border-white/20">
            📡
          </div>
          <div>
            <div className="text-white font-bold text-[15px] leading-tight">GoHub PM</div>
            <div className="text-blue-100/70 text-[11px]">Product Manager</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Icon
                size={17}
                className={`flex-shrink-0 ${active ? "text-brand-600" : "text-gray-400"}`}
              />
              <span className="flex-1">{label}</span>
              {active && (
                <span className="w-1.5 h-1.5 rounded-full bg-brand-600 flex-shrink-0" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-100 p-3 space-y-1">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-gray-400 truncate">{username}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                role === "admin"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-green-100 text-green-700"
              }`}>
                {role === "admin" ? "Admin" : "Sale"}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut size={15} />
          Đăng xuất
        </button>
      </div>
    </aside>
  )
}
