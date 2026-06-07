"use client"

import Link                   from "next/link"
import { usePathname }        from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { Users, LogOut, Gift, Package, Truck, Globe, Sparkles, ChevronLeft, ChevronRight } from "lucide-react"
import { useSidebar }         from "./sidebar-context"

const NAV = [
  { href: "/chatbot",    label: "Telco Chat",  icon: Sparkles },
  { href: "/promotions", label: "Khuyến Mãi",  icon: Gift     },
  { href: "/skus",       label: "SP Hệ Thống", icon: Package  },
  { href: "/ncc",        label: "SP Vendor",    icon: Truck    },
  { href: "/countries",  label: "Thông tin",    icon: Globe    },
]

function roleBadgeClass(role: string) {
  if (role === "admin")   return "bg-amber-100 text-amber-700"
  if (role === "manager") return "bg-purple-100 text-purple-700"
  return "bg-green-100 text-green-700"
}

function roleLabel(role: string) {
  if (role === "admin")   return "Admin"
  if (role === "manager") return "Manager"
  return "Standard"
}

export function Sidebar() {
  const pathname  = usePathname()
  const { data: session } = useSession()
  const { collapsed, toggle } = useSidebar()

  const role     = session?.user?.role     || "standard"
  const name     = session?.user?.name     || ""
  const initials = name.split(" ").map(w => w[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join("")

  const navItems = role === "admin"
    ? [...NAV, { href: "/admin", label: "Admin", icon: Users }]
    : NAV

  return (
    <aside className={`
      fixed left-0 top-0 h-full bg-white border-r border-gray-200
      flex flex-col z-40 select-none
      transition-all duration-200 ease-in-out
      ${collapsed ? "w-16" : "w-60"}
    `}>

      {/* Brand header */}
      <div className={`bg-gradient-to-r from-brand-600 to-blue-600 border-b border-brand-700/30 flex-shrink-0
        ${collapsed ? "px-2 py-3.5" : "px-4 py-3.5"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"}`}>
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-base border border-white/20 flex-shrink-0">
            📡
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-white font-bold text-[15px] leading-tight whitespace-nowrap">Gohub Telco</div>
              <div className="text-blue-100/70 text-[11px] whitespace-nowrap">Product Manager</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto ${collapsed ? "px-1.5" : "px-2.5"}`}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-all
                ${collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"}
                ${active
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
            >
              <Icon size={17} className={`flex-shrink-0 ${active ? "text-brand-600" : "text-gray-400"}`} />
              {!collapsed && (
                <>
                  <span className="flex-1 whitespace-nowrap">{label}</span>
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-brand-600 flex-shrink-0" />}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Toggle button */}
      <div className={`border-t border-gray-100 ${collapsed ? "px-1.5 py-2" : "px-2.5 py-2"}`}>
        <button
          onClick={toggle}
          title={collapsed ? "Mở rộng" : "Thu gọn"}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          {collapsed ? <ChevronRight size={15} /> : <><ChevronLeft size={15} /><span>Thu gọn</span></>}
        </button>
      </div>

      {/* User footer */}
      <div className={`border-t border-gray-100 p-3 space-y-1 flex-shrink-0 ${collapsed ? "px-1.5" : "p-3"}`}>
        {collapsed ? (
          <div className="flex justify-center py-1" title={name}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
              {initials || "?"}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
              <div className="mt-0.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${roleBadgeClass(role)}`}>
                  {roleLabel(role)}
                </span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Đăng xuất" : undefined}
          className={`w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors
            ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut size={15} />
          {!collapsed && <span>Đăng xuất</span>}
        </button>
      </div>
    </aside>
  )
}
