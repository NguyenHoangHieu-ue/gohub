"use client"

import Link                   from "next/link"
import { usePathname }        from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import { Users, LogOut, Gift, Package, Truck, Globe, Sparkles, ChevronLeft, ChevronRight, Radio, BookOpen, LayoutDashboard, PieChart, Globe2, Building2, ShoppingBag, BarChart3, Target, ClipboardList, HeartPulse, Zap, ChevronDown, ChevronUp, Terminal, Activity, TrendingUp } from "lucide-react"
import { useSidebar }         from "./sidebar-context"
import { NotificationBell }   from "./notification-bell"

// Tabs luôn hiển thị ở trên
const NAV_MAIN = [
  { href: "/chatbot",    label: "GoHub AI",    icon: Sparkles, key: "chatbot"    },
  { href: "/promotions", label: "Khuyến Mãi",  icon: Gift,     key: "promotions" },
  { href: "/kb",         label: "Kiến Thức",   icon: BookOpen, key: "kb"         },
]

// Tabs nhóm Sản Phẩm (collapsible)
const NAV_PRODUCTS = [
  { href: "/skus",      label: "SP Hệ Thống", icon: Package, key: "skus"      },
  { href: "/ncc",       label: "SP Vendor",    icon: Truck,   key: "ncc"       },
  { href: "/countries", label: "Thông tin",    icon: Globe,   key: "countries" },
]

// NAV_ALL giữ lại cho logic permission (admin/manager thấy tất cả)
const NAV_ALL = [...NAV_MAIN, ...NAV_PRODUCTS]

// Analytics section — chỉ admin / manager / bod / staff — phân nhóm theo chức năng
const ANALYTICS_GROUPS = [
  {
    label: "Tổng Quan",
    items: [
      { href: "/analytics",          label: "Dashboard",       icon: LayoutDashboard },
      { href: "/analytics/bod",      label: "BOD Report",      icon: PieChart        },
      { href: "/analytics/all-time", label: "All-Time Report", icon: BarChart3       },
    ],
  },
  {
    label: "Doanh Thu",
    items: [
      { href: "/analytics/channels", label: "Kênh bán",  icon: Globe2     },
      { href: "/analytics/b2b",      label: "B2B",        icon: Building2  },
      { href: "/analytics/b2c",      label: "B2C",        icon: ShoppingBag },
      { href: "/analytics/vendors",  label: "Vendors",    icon: TrendingUp },
    ],
  },
  {
    label: "Vận Hành",
    items: [
      { href: "/analytics/orders",          label: "Đơn hàng",       icon: ClipboardList },
      { href: "/analytics/staff",           label: "Nhân viên",      icon: Users         },
      { href: "/analytics/fulfillment",     label: "Fulfillment",    icon: Zap           },
      { href: "/analytics/cs-troubleshoot", label: "CS Troubleshoot",icon: HeartPulse    },
    ],
  },
  {
    label: "Phân Tích",
    items: [
      { href: "/analytics/products",  label: "Sản phẩm (BI)", icon: BarChart3 },
      { href: "/analytics/targets",   label: "KPI / Target",   icon: Target    },
      { href: "/analytics/customers", label: "Khách hàng",     icon: Users     },
      { href: "/analytics/3hk-usage", label: "3HK Data Usage", icon: Activity  },
      { href: "/analytics/sql",       label: "SQL Explorer",   icon: Terminal  },
    ],
  },
]

// Flat list for collapsed mode
const ANALYTICS_NAV_FLAT = ANALYTICS_GROUPS.flatMap(g => g.items)

const ANALYTICS_ROLES = new Set(["admin", "manager", "bod", "staff"])

// Tab mặc định standard user không cần department
const DEFAULT_STANDARD_TABS = new Set(["chatbot", "promotions", "countries"])

const SPECIFIC_DEPTS = ["sales", "product", "tech", "finance"]

// Fetch dept từ DB mỗi lần load → không cần re-login khi admin đổi dept
function useMyDept(username: string) {
  const [dept, setDept] = useState<string | null>(null)
  useEffect(() => {
    if (!username) return
    fetch("/api/user/me", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.department) setDept(d.department) })
      .catch(() => {})
  }, [username])
  return dept
}

function useDeptTabs(role: string, department: string) {
  const [extraTabs, setExtraTabs] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (role === "admin" || role === "manager") return
    if (!SPECIFIC_DEPTS.includes(department)) return
    fetch("/api/permissions", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.perms) return
        const key = `perm_dept_${department}_tabs`
        const tabs = (d.perms[key] ?? []) as string[]
        setExtraTabs(new Set(tabs))
      })
      .catch(() => {})
  }, [role, department])
  return extraTabs
}

function roleBadgeClass(role: string) {
  if (role === "admin")   return "bg-amber-100 text-amber-700"
  if (role === "manager") return "bg-purple-100 text-purple-700"
  if (role === "bod")     return "bg-blue-100 text-blue-700"
  if (role === "staff")   return "bg-teal-100 text-teal-700"
  return "bg-green-100 text-green-700"
}

function roleLabel(role: string) {
  if (role === "admin")   return "Admin"
  if (role === "manager") return "Manager"
  if (role === "bod")     return "BOD"
  if (role === "staff")   return "Staff"
  return "Standard"
}

export function Sidebar() {
  const pathname  = usePathname()
  const { data: session } = useSession()
  const { collapsed, toggle } = useSidebar()
  const [analyticsOpen, setAnalyticsOpen] = useState(true)
  const [productOpen,   setProductOpen]   = useState(false)

  const role       = session?.user?.role     || "standard"
  const username   = session?.user?.username || ""
  const name       = session?.user?.name     || ""
  const initials   = name.split(" ").map(w => w[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join("")

  const dbDept    = useMyDept(username)
  const department = dbDept ?? "none"

  const extraTabs = useDeptTabs(role, department)

  const showAnalytics = ANALYTICS_ROLES.has(role)

  const navItems = (() => {
    if (role === "bod" || role === "staff") {
      // BOD/Staff: chỉ thấy chatbot + analytics (không thấy PM tabs)
      return [{ href: "/chatbot", label: "GoHub AI", icon: Sparkles, key: "chatbot" }]
    }
    if (role === "admin") return [...NAV_ALL, { href: "/admin", label: "Admin", icon: Users, key: "admin" }]
    if (role === "manager") return NAV_ALL
    // standard: lọc tabs theo phòng ban
    const allowed = new Set([...DEFAULT_STANDARD_TABS, ...extraTabs])
    return NAV_ALL.filter(n => allowed.has(n.key))
  })()

  return (
    <aside className={`
      fixed left-0 top-0 h-full bg-white border-r border-gray-200
      flex flex-col z-40 select-none overflow-visible
      transition-all duration-200 ease-in-out
      ${collapsed ? "w-16" : "w-60"}
    `}>

      {/* Brand header */}
      <div className={`bg-brand-700 border-b border-brand-800/60 flex-shrink-0
        ${collapsed ? "px-2 py-4" : "px-4 py-4"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <div className="w-8 h-8 bg-brand-500/40 rounded-lg flex items-center justify-center border border-brand-400/30 flex-shrink-0">
            <Radio size={16} className="text-white" strokeWidth={2} />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-white font-semibold text-sm leading-tight tracking-tight whitespace-nowrap">Gohub Telco</div>
              <div className="text-brand-300/80 text-[11px] whitespace-nowrap tracking-wide uppercase">Product Manager</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto ${collapsed ? "px-1.5" : "px-2.5"}`}>

        {/* PM tabs */}
        {navItems.length > 0 && (
          <>
            {!collapsed && navItems.length > 1 && (
              <p className="px-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Quản Lý</p>
            )}
            {navItems.filter(n => NAV_MAIN.some(m => m.key === n.key) || n.key === "chatbot" || n.key === "admin").map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/")
              return (
                <Link
                  key={href}
                  href={href}
                  title={collapsed ? label : undefined}
                  className={`flex items-center rounded-lg text-sm font-medium transition-all duration-150
                    ${collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"}
                    ${active
                      ? "bg-brand-50 text-brand-700 shadow-sm border border-brand-100"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                    }`}
                >
                  <Icon size={16} className={`flex-shrink-0 transition-colors ${active ? "text-brand-500" : "text-gray-400"}`} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 whitespace-nowrap">{label}</span>
                      {active && <span className="w-1 h-1 rounded-full bg-brand-400 flex-shrink-0" />}
                    </>
                  )}
                </Link>
              )
            })}

            {/* ── Nhóm Sản Phẩm (collapsible) ── */}
            {navItems.some(n => NAV_PRODUCTS.some(p => p.key === n.key)) && (
              <div className="mt-0.5">
                {!collapsed ? (
                  <button
                    onClick={() => setProductOpen(o => !o)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Package size={16} className="text-gray-400 flex-shrink-0" />
                      <span>Sản Phẩm</span>
                    </div>
                    {productOpen ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
                  </button>
                ) : (
                  <button
                    onClick={() => setProductOpen(o => !o)}
                    title="Sản Phẩm"
                    className={`w-full flex justify-center items-center py-2.5 rounded-lg transition-colors ${
                      NAV_PRODUCTS.some(p => pathname.startsWith(p.href))
                        ? "bg-brand-50 text-brand-700 border border-brand-100"
                        : "text-gray-400 hover:bg-gray-50 hover:text-gray-800"
                    }`}
                  >
                    <Package size={16} />
                  </button>
                )}

                {productOpen && navItems
                  .filter(n => NAV_PRODUCTS.some(p => p.key === n.key))
                  .map(({ href, label, icon: Icon }) => {
                    const active = pathname === href || pathname.startsWith(href + "/")
                    return (
                      <Link
                        key={href}
                        href={href}
                        title={collapsed ? label : undefined}
                        className={`flex items-center rounded-lg text-sm font-medium transition-all duration-150
                          ${collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2 pl-8"}
                          ${active
                            ? "bg-brand-50 text-brand-700 shadow-sm border border-brand-100"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                          }`}
                      >
                        <Icon size={15} className={`flex-shrink-0 ${active ? "text-brand-500" : "text-gray-400"}`} />
                        {!collapsed && (
                          <>
                            <span className="flex-1 whitespace-nowrap">{label}</span>
                            {active && <span className="w-1 h-1 rounded-full bg-brand-400 flex-shrink-0" />}
                          </>
                        )}
                      </Link>
                    )
                  })
                }
              </div>
            )}
          </>
        )}

        {/* Analytics section — admin / manager / bod / staff */}
        {showAnalytics && (
          <div className={`${navItems.length > 1 ? "pt-2 mt-1 border-t border-gray-100" : ""}`}>
            {!collapsed && (
              <button
                onClick={() => setAnalyticsOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
              >
                <span>Báo Cáo &amp; BI</span>
                {analyticsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}

            {/* Collapsed mode: flat icon list */}
            {collapsed && ANALYTICS_NAV_FLAT.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/analytics" && pathname.startsWith(href + "/"))
                          || (href === "/analytics" && pathname === "/analytics")
              return (
                <Link key={href} href={href} title={label}
                  className={`flex justify-center items-center py-2.5 rounded-lg transition-all duration-150
                    ${active ? "bg-blue-50 text-blue-700 border border-blue-100 shadow-sm" : "text-gray-400 hover:bg-gray-50 hover:text-gray-800"}`}
                >
                  <Icon size={16} className={`flex-shrink-0 ${active ? "text-blue-500" : "text-gray-400"}`} />
                </Link>
              )
            })}

            {/* Expanded mode: grouped */}
            {!collapsed && analyticsOpen && ANALYTICS_GROUPS.map(group => (
              <div key={group.label} className="mt-1">
                <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-bold text-gray-300 uppercase tracking-widest">{group.label}</p>
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href !== "/analytics" && pathname.startsWith(href + "/"))
                              || (href === "/analytics" && pathname === "/analytics")
                  return (
                    <Link key={href} href={href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
                        ${active
                          ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100"
                          : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                        }`}
                    >
                      <Icon size={15} className={`flex-shrink-0 ${active ? "text-blue-500" : "text-gray-400"}`} />
                      <span className="flex-1 whitespace-nowrap">{label}</span>
                      {active && <span className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <div className={`pt-1 border-t border-gray-100 mt-1 ${collapsed ? "px-1.5" : "px-0"}`}>
          <NotificationBell collapsed={collapsed} />
        </div>
      </nav>

      {/* Toggle tab — dán vào cạnh phải sidebar */}
      <button
        onClick={toggle}
        title={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
        className="absolute -right-3 top-1/2 -translate-y-1/2 z-50
          w-6 h-12 bg-white border border-gray-200 rounded-r-lg shadow-sm
          flex items-center justify-center
          text-gray-400 hover:text-brand-600 hover:border-brand-300 hover:bg-brand-50
          transition-all duration-150 group"
      >
        {collapsed
          ? <ChevronRight size={14} className="group-hover:scale-110 transition-transform" />
          : <ChevronLeft  size={14} className="group-hover:scale-110 transition-transform" />
        }
      </button>

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
