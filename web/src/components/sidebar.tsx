"use client"

import Link                   from "next/link"
import { usePathname }        from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import { Users, LogOut, Gift, Package, Truck, Globe, Sparkles, ChevronLeft, ChevronRight, Radio, BookOpen, LayoutDashboard, PieChart, Globe2, Building2, ShoppingBag, BarChart3, Target, ClipboardList, HeartPulse, Zap, ChevronDown, ChevronUp, Terminal, Activity, TrendingUp, MessageSquare, Database, Clock, Settings } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useSidebar }         from "./sidebar-context"
import { NotificationBell }   from "./notification-bell"

// Tabs luôn hiển thị ở trên
const NAV_MAIN = [
  { href: "/chatbot",    label: "GoHub AI",    icon: Sparkles, key: "chatbot"    },
  { href: "/promotions", label: "Promotions",  icon: Gift,     key: "promotions" },
  { href: "/kb",         label: "Knowledge Base", icon: BookOpen, key: "kb"      },
]

// Tabs nhóm Products (collapsible)
const NAV_PRODUCTS = [
  { href: "/skus",      label: "System SKUs",  icon: Package, key: "skus"      },
  { href: "/ncc",       label: "NCC Catalog",  icon: Truck,   key: "ncc"       },
  { href: "/countries", label: "Reference",    icon: Globe,   key: "countries" },
]

// NAV_ALL giữ lại cho logic permission (admin/manager thấy tất cả)
const NAV_ALL = [...NAV_MAIN, ...NAV_PRODUCTS]

// 3 nhóm lớn của sidebar (keys khớp NAV_ALL để dùng chung logic phân quyền navItems)
const NAV_CHAT_KB = [
  { href: "/chatbot",    label: "GoHub AI",       icon: Sparkles, key: "chatbot"    },
  { href: "/kb",         label: "Knowledge Base", icon: BookOpen, key: "kb"         },
  { href: "/promotions", label: "Promotions",     icon: Gift,     key: "promotions" },
]
const NAV_PRODUCT = NAV_PRODUCTS

// Analytics section — admin / manager / bod / staff — grouped per gohub-intel
const ANALYTICS_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/analytics",          label: "Dashboard",       icon: LayoutDashboard },
      { href: "/analytics/bod",      label: "BOD Report",      icon: PieChart        },
      { href: "/analytics/all-time", label: "All-Time Report", icon: BarChart3       },
    ],
  },
  {
    label: "Sales Performance",
    items: [
      { href: "/analytics/channels",  label: "Channels",   icon: Globe2     },
      { href: "/analytics/b2b",       label: "B2B",        icon: Building2  },
      { href: "/analytics/b2c",       label: "B2C",        icon: ShoppingBag },
      { href: "/analytics/website",   label: "Website (GA4)", icon: Globe   },
      { href: "/analytics/staff",     label: "Staff",      icon: Users      },
      { href: "/analytics/customers", label: "Customers",  icon: Users      },
      { href: "/analytics/vendors",   label: "Vendors",    icon: TrendingUp },
    ],
  },
  {
    label: "Operations & Support",
    items: [
      { href: "/analytics/orders",          label: "Orders",          icon: ClipboardList },
      { href: "/analytics/fulfillment",     label: "Fulfillment",     icon: Zap           },
      { href: "/analytics/3hk-usage",       label: "3HK Data Usage",  icon: Activity      },
      { href: "/analytics/cs-troubleshoot", label: "CS Troubleshoot", icon: HeartPulse    },
      { href: "/analytics/feedback",        label: "Feedback",        icon: MessageSquare },
    ],
  },
  {
    label: "Analytics & Planning",
    items: [
      { href: "/analytics/products", label: "Products (BI)", icon: BarChart3 },
      { href: "/analytics/targets",  label: "KPI / Target",  icon: Target    },
      { href: "/analytics/sql",      label: "SQL Explorer",  icon: Terminal  },
    ],
  },
]

// Flat list for collapsed mode
const ANALYTICS_NAV_FLAT = ANALYTICS_GROUPS.flatMap(g => g.items)

// Nhóm Management — CHỈ admin (port intel: users/schema/scheduled/settings là admin-only).
// KHÔNG đưa vào role matrix / ANALYTICS_DEFAULTS (bod/staff không thấy). Layout vẫn cho admin bypass.
const MANAGEMENT_GROUP = {
  label: "Management",
  items: [
    { href: "/analytics/users",     label: "Users",              icon: Users },
    { href: "/analytics/schema",    label: "Schema Config",      icon: Database },
    { href: "/analytics/scheduled", label: "Scheduled Messages", icon: Clock },
    { href: "/admin?tab=settings",  label: "Settings",           icon: Settings },
  ],
}

// Tab mặc định standard user không cần department
const DEFAULT_STANDARD_TABS = new Set(["chatbot", "promotions", "countries"])

const SPECIFIC_DEPTS = ["sales", "product", "tech", "finance"]

// id trang analytics (khớp ANALYTICS_REPORTS ở admin + key trong role_permissions)
function analyticsId(item: { href: string }) {
  return item.href === "/analytics" ? "dashboard" : item.href.replace("/analytics/", "")
}

// Fallback quyền nền theo role khi chưa tải được /api/config/role-permissions (khớp default API)
const ANALYTICS_DEFAULTS: Record<string, string[]> = {
  bod:   ANALYTICS_NAV_FLAT.map(analyticsId),
  staff: ["dashboard", "feedback", "products"],
}

// Ma trận Role × Báo cáo (y hệt gohub-intel) — quyền nền analytics theo role
function useRolePermissions() {
  const [perms, setPerms] = useState<Record<string, string[]> | null>(null)
  useEffect(() => {
    fetch("/api/config/role-permissions", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPerms(d) })
      .catch(() => {})
  }, [])
  return perms
}

// Fetch profile từ DB mỗi lần load → không cần re-login khi admin đổi dept/quyền
function useMyProfile(username: string) {
  const [dbRole,          setDbRole]          = useState<string | null>(null)
  const [dept,            setDept]            = useState<string | null>(null)
  const [allowedAnalytics, setAllowedAnalytics] = useState<string[] | null>(null)
  const [allowedTabs,     setAllowedTabs]     = useState<string[] | null>(null)
  useEffect(() => {
    if (!username) return
    fetch("/api/user/me", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.role)       setDbRole(d.role)
        if (d?.department) setDept(d.department)
        setAllowedAnalytics(
          d?.allowed_analytics != null
            ? d.allowed_analytics.split(",").filter(Boolean)
            : null
        )
        setAllowedTabs(
          d?.allowed_tabs != null
            ? d.allowed_tabs.split(",").filter(Boolean)
            : null
        )
      })
      .catch(() => {})
  }, [username])
  return { dbRole, dept, allowedAnalytics, allowedTabs }
}

function useDeptTabs(role: string, department: string) {
  const [extraTabs, setExtraTabs] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (role === "admin") return
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

// Một hàng link trong sidebar (dùng chung cho cả 3 nhóm). accent: brand (PM) / blue (Analyst).
function NavRow({ href, label, Icon, active, collapsed, indent = false, accent = "brand" }: {
  href:      string
  label:     string
  Icon:      LucideIcon
  active:    boolean
  collapsed: boolean
  indent?:   boolean
  accent?:   "brand" | "blue"
}) {
  const activeCls     = accent === "blue"
    ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100"
    : "bg-brand-50 text-brand-700 shadow-sm border border-brand-100"
  const iconActiveCls = accent === "blue" ? "text-blue-500" : "text-brand-500"
  const dotCls        = accent === "blue" ? "bg-blue-400" : "bg-brand-400"
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center rounded-lg text-[13px] font-medium transition-all duration-150
        ${collapsed ? "justify-center px-0 py-2.5" : `gap-3 px-3 py-2 ${indent ? "pl-8" : ""}`}
        ${active ? activeCls : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}
    >
      <Icon size={15} className={`flex-shrink-0 ${active ? iconActiveCls : "text-gray-400"}`} />
      {!collapsed && (
        <>
          <span className="flex-1 whitespace-nowrap">{label}</span>
          {active && <span className={`w-1 h-1 rounded-full ${dotCls} flex-shrink-0`} />}
        </>
      )}
    </Link>
  )
}

// Header bấm để mở/đóng 1 nhóm lớn (chỉ hiện ở chế độ mở rộng)
function GroupToggle({ label, Icon, open, onToggle }: {
  label:    string
  Icon:     LucideIcon
  open:     boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-gray-400" />
        <span>{label}</span>
      </div>
      {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  )
}

export function Sidebar() {
  const pathname  = usePathname()
  const { data: session } = useSession()
  const { collapsed, toggle } = useSidebar()
  const [chatKbOpen,  setChatKbOpen]  = useState(true)
  const [productOpen, setProductOpen] = useState(false)
  const [analystOpen, setAnalystOpen] = useState(true)

  // Auto-mở nhóm Products khi đang ở 1 trang sản phẩm — tránh giấu mục đang active
  // (giảm tải nhận thức: user luôn thấy mình đang ở đâu, không phải tự mở để định vị)
  useEffect(() => {
    if (NAV_PRODUCTS.some(p => pathname === p.href || pathname.startsWith(p.href + "/"))) {
      setProductOpen(true)
    }
  }, [pathname])

  const role       = session?.user?.role     || "staff"
  const username   = session?.user?.username || ""
  const name       = session?.user?.name     || ""
  const initials   = name.split(" ").map(w => w[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join("")

  const { dbRole, dept: dbDept, allowedAnalytics, allowedTabs } = useMyProfile(username)
  const department = dbDept ?? "none"
  // Dùng dbRole (fresh từ DB) để tránh cần logout/login khi admin đổi role
  const effectiveRole = dbRole ?? role

  const extraTabs = useDeptTabs(effectiveRole, department)
  const rolePerms = useRolePermissions()

  // Mô hình phân quyền analytics y hệt gohub-intel:
  //  - admin/manager: toàn quyền
  //  - còn lại: quyền NỀN theo role (ma trận role_permissions) ∪ trang cấp THÊM per-user (allowed_analytics)
  const analyticsGroups = (() => {
    if (effectiveRole === "admin") return ANALYTICS_GROUPS
    const baseline = rolePerms?.[effectiveRole] ?? ANALYTICS_DEFAULTS[effectiveRole] ?? []
    const granted = new Set([...baseline, ...(allowedAnalytics ?? [])])
    return ANALYTICS_GROUPS
      .map(group => ({
        ...group,
        items: group.items.filter(item => granted.has(analyticsId(item))),
      }))
      .filter(group => group.items.length > 0)
  })()

  // Hiện mục Analytics cho admin/manager, hoặc bất kỳ role nào (gồm standard) có ít nhất 1 trang được cấp.
  // Enforce truy cập thật ở server (analytics/layout.tsx); đây chỉ là hiển thị link.
  const showAnalytics = effectiveRole === "admin" || analyticsGroups.length > 0

  const navItems = (() => {
    // bod: chỉ chatbot (thuần analytics). admin: full + Admin.
    if (effectiveRole === "bod") {
      return [{ href: "/chatbot", label: "GoHub AI", icon: Sparkles, key: "chatbot" }]
    }
    if (effectiveRole === "admin") return [...NAV_ALL, { href: "/admin", label: "Admin", icon: Users, key: "admin" }]
    // staff (gồm user PM, role intel): tab PM theo phòng ban (per-user allowed_tabs override dept matrix)
    const pmTabs = allowedTabs ?? Array.from(extraTabs)
    const allowed = new Set([...DEFAULT_STANDARD_TABS, ...pmTabs])
    return NAV_ALL.filter(n => allowed.has(n.key))
  })()

  // Phân các tab được phép vào 3 nhóm lớn
  const allowedKeys  = new Set(navItems.map(n => n.key))
  const chatKbItems  = NAV_CHAT_KB.filter(n => allowedKeys.has(n.key))
  const productItems = NAV_PRODUCT.filter(n => allowedKeys.has(n.key))
  const isAdminUser  = effectiveRole === "admin"
  const isActive = (href: string) =>
    href === "/analytics"
      ? pathname === "/analytics"
      : pathname === href || pathname.startsWith(href + "/")

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
              <div className="text-white font-semibold text-sm leading-tight tracking-tight whitespace-nowrap">Gohub Intel</div>
              <div className="text-brand-300/80 text-[11px] whitespace-nowrap tracking-wide uppercase">Intelligence Hub</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto ${collapsed ? "px-1.5" : "px-2.5"}`}>

        {collapsed ? (
          /* Chế độ thu gọn: icon rail phẳng (tất cả mục được phép) */
          <>
            {chatKbItems.map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed accent="brand" />
            ))}
            {productItems.map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed accent="brand" />
            ))}
            {showAnalytics && analyticsGroups.flatMap(g => g.items).map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed accent="blue" />
            ))}
            {isAdminUser && MANAGEMENT_GROUP.items.map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed accent="blue" />
            ))}
          </>
        ) : (
          /* Chế độ mở rộng: 3 nhóm lớn */
          <>
            {/* 1 ─ Chat & Knowledge */}
            {chatKbItems.length > 0 && (
              <div>
                <GroupToggle label="Chat & Knowledge" Icon={Sparkles} open={chatKbOpen} onToggle={() => setChatKbOpen(o => !o)} />
                {chatKbOpen && chatKbItems.map(it => (
                  <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed={false} accent="brand" />
                ))}
              </div>
            )}

            {/* 2 ─ Product (mặc định thu gọn) */}
            {productItems.length > 0 && (
              <div className="mt-1">
                <GroupToggle label="Product" Icon={Package} open={productOpen} onToggle={() => setProductOpen(o => !o)} />
                {productOpen && productItems.map(it => (
                  <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed={false} accent="brand" />
                ))}
              </div>
            )}

            {/* 3 ─ Analyst */}
            {showAnalytics && (
              <div className="mt-1 pt-1 border-t border-gray-100">
                <GroupToggle label="Analyst" Icon={BarChart3} open={analystOpen} onToggle={() => setAnalystOpen(o => !o)} />
                {analystOpen && analyticsGroups.map(group => (
                  <div key={group.label} className="mt-0.5">
                    <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{group.label}</p>
                    {group.items.map(it => (
                      <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed={false} accent="blue" />
                    ))}
                  </div>
                ))}
                {analystOpen && isAdminUser && (
                  <div className="mt-0.5">
                    <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{MANAGEMENT_GROUP.label}</p>
                    {MANAGEMENT_GROUP.items.map(it => (
                      <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed={false} accent="blue" />
                    ))}
                  </div>
                )}
              </div>
            )}

          </>
        )}

        <div className={`pt-1 border-t border-gray-100 mt-1 ${collapsed ? "px-1.5" : "px-0"}`}>
          <NotificationBell collapsed={collapsed} />
        </div>
      </nav>

      {/* Toggle tab — dán vào cạnh phải sidebar */}
      <button
        onClick={toggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${roleBadgeClass(effectiveRole)}`}>
                  {roleLabel(effectiveRole)}
                </span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Sign Out" : undefined}
          className={`w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors
            ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut size={15} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
