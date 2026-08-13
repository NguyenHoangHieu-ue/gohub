"use client"

import Link                   from "next/link"
import { usePathname }        from "next/navigation"
import { useSession }         from "next-auth/react"
import { useEffect, useState } from "react"
import { Users, Gift, Package, Truck, Globe, Sparkles, ChevronLeft, ChevronRight, Radio, LayoutDashboard, PieChart, Globe2, Building2, ShoppingBag, BarChart3, BarChart2, Target, ClipboardList, HeartPulse, Zap, ChevronDown, ChevronUp, Terminal, Activity, TrendingUp, MessageSquare, Database, Clock, Settings, StickyNote, Crown, Cpu, BookOpen, MessageCircle, Link2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useSidebar }         from "./sidebar-context"
import { NotificationBell }   from "./notification-bell"
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/analytics-roles"

// Note tab — nổi bật, hiển thị cho tất cả role (Knowledge Base đã gộp vào trong trang Note)
const NAV_INFO   = { href: "/info",              label: "Note",    icon: StickyNote,    key: "info"    }
// Tổ Gấu — chỉ creator
const NAV_TO_GAU = { href: "/analytics/to-gau", label: "Tổ Gấu", icon: MessageCircle, key: "to-gau"  }

// Tabs luôn hiển thị ở trên (KB đã chuyển vào trong Note → bỏ khỏi sidebar)
const NAV_MAIN = [
  { href: "/chatbot",    label: "Bé Gấu",     icon: Sparkles, key: "chatbot"    },
  { href: "/promotions", label: "Promotions",  icon: Gift,     key: "promotions" },
]

// Tabs nhóm Products (collapsible)
const NAV_PRODUCTS = [
  { href: "/skus",      label: "System SKUs",  icon: Package, key: "skus"      },
  { href: "/ncc",       label: "NCC Catalog",  icon: Truck,   key: "ncc"       },
  { href: "/countries", label: "Reference",    icon: Globe,   key: "countries" },
]

// NAV_ALL giữ lại cho logic permission (admin/manager thấy tất cả)
const NAV_ALL = [...NAV_MAIN, ...NAV_PRODUCTS]

// Tabs đứng riêng đầu sidebar (Bé Gấu, Promotion) — keys khớp NAV_ALL để dùng chung phân quyền
const NAV_TOP = [
  { href: "/chatbot",    label: "Bé Gấu",     icon: Sparkles, key: "chatbot"    },
  { href: "/promotions", label: "Promotions",  icon: Gift,     key: "promotions" },
]
const NAV_PRODUCT = NAV_PRODUCTS

// Analytics section — admin / manager / bod / staff — grouped per gohub-intel
const ANALYTICS_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/analytics",             label: "Dashboard",       icon: LayoutDashboard },
      { href: "/analytics/quarterly",   label: "Quarter Report",  icon: BarChart3       },
      { href: "/analytics/bod",         label: "BOD Report",      icon: PieChart        },
      { href: "/analytics/all-time",    label: "All-Time Report", icon: BarChart3       },
      { href: "/analytics/my-metrics",  label: "My Metrics",      icon: Target          },
    ],
  },
  {
    label: "Sales Performance",
    items: [
      { href: "/analytics/channels",  label: "Channels",   icon: Globe2     },
      { href: "/analytics/b2b",       label: "B2B",        icon: Building2  },
      { href: "/analytics/b2c",       label: "B2C",        icon: ShoppingBag },
      { href: "/analytics/website",   label: "Website Analytics", icon: Globe   },
      { href: "/analytics/staff",     label: "Staff",     icon: Users },
      { href: "/analytics/customers", label: "Customers", icon: Users },
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
      { href: "/analytics/products",   label: "Products (BI)",      icon: BarChart3 },
      { href: "/analytics/targets",    label: "Manage Costs",       icon: Target    },
      { href: "/analytics/sql",        label: "SQL Explorer",       icon: Terminal  },
      { href: "/analytics/scheduled",  label: "Scheduled Messages", icon: Clock     },
    ],
  },
]

// Nhóm Management — CHỈ admin + creator
const MANAGEMENT_GROUP = {
  label: "Management",
  items: [
    { href: "/analytics/users",      label: "Users",              icon: Users     },
    { href: "/analytics/schema",     label: "Schema Config",      icon: Database  },
    { href: "/analytics/settings",   label: "Settings",           icon: Settings  },
    { href: "/admin",                label: "Admin (Product)",    icon: Package   },
  ],
}

// Portal — creator + whitelisted users (portal_access_users)
const PORTAL_GROUP = {
  label: "Portal",
  items: [
    { href: "/analytics/portal", label: "Portal Access", icon: Link2 },
  ],
}

// Creator-only management
const CREATOR_GROUP = {
  label: "Creator",
  items: [
    { href: "/analytics/creator",           label: "Creator Settings", icon: Crown    },
    { href: "/analytics/creator/ai",        label: "Gấu Pro",          icon: Cpu      },
    { href: "/analytics/creator/knowledge", label: "Own Info",         icon: BookOpen },
    { href: "/analytics/creator/devtools",  label: "API & Database",   icon: Terminal },
    { href: "/analytics/creator/usage",     label: "Usage Analytics",  icon: BarChart2},
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
const ANALYTICS_DEFAULTS = DEFAULT_ROLE_PERMISSIONS

// Gộp 3 fetch độc lập thành 1 Promise.all để giảm 3 round trips → 1
function useSidebarData(username: string, sessionRole: string) {
  const [state, setState] = useState<{
    dbRole:          string | null
    dept:            string | null
    allowedAnalytics: string[] | null
    allowedTabs:     string[] | null
    rolePerms:       Record<string, string[]> | null
    hiddenTabs:      Set<string>
    gpEnabled:       boolean
    portalEnabled:   boolean
  }>({ dbRole: null, dept: null, allowedAnalytics: null, allowedTabs: null, rolePerms: null, hiddenTabs: new Set(), gpEnabled: false, portalEnabled: false })

  useEffect(() => {
    if (!username) return
    const isCreator = sessionRole === "creator"
    Promise.all([
      fetch("/api/user/me",                  { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/config/role-permissions",  { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
      isCreator ? Promise.resolve({}) : fetch("/api/config/tab-visibility", { cache: "no-store" }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([me, perms, vis]) => {
      const role = me?.role ?? sessionRole
      setState({
        dbRole:           me?.role ?? null,
        dept:             me?.department ?? null,
        allowedAnalytics: me?.allowed_analytics != null ? (me.allowed_analytics as string).split(",").filter(Boolean) : null,
        allowedTabs:      me?.allowed_tabs       != null ? (me.allowed_tabs       as string).split(",").filter(Boolean) : null,
        rolePerms:        perms ?? null,
        hiddenTabs:       new Set<string>((vis as Record<string, string[]>)?.[role] ?? []),
        gpEnabled:        me?.gp_enabled === true,
        portalEnabled:    me?.portal_enabled === true,
      })
    })
  }, [username, sessionRole])

  return state
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

// Nhận diện viewport mobile (< md = 768px) để off-canvas + luôn hiện dạng mở rộng.
function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const on = () => setMobile(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return mobile
}

type Accent = "brand" | "blue" | "violet" | "emerald"

// ── Dark sidebar: nền tối, chữ trắng. Active = xanh brand sáng nổi trên nền tối, hover = trắng mờ ──
const ACTIVE_ITEM = "bg-brand-600 text-white shadow-sm"
const ACTIVE_BG: Record<Accent, string> = {
  brand: ACTIVE_ITEM, blue: ACTIVE_ITEM, violet: ACTIVE_ITEM, emerald: ACTIVE_ITEM,
}
const INACTIVE_HOVER: Record<Accent, string> = {
  brand: "text-slate-300 hover:bg-white/10 hover:text-white",
  blue:  "text-slate-300 hover:bg-white/10 hover:text-white",
  violet:"text-slate-300 hover:bg-white/10 hover:text-white",
  emerald:"text-slate-300 hover:bg-white/10 hover:text-white",
}
const INACTIVE_ICON: Record<Accent, string> = {
  brand: "text-slate-400", blue: "text-slate-400", violet: "text-slate-400", emerald: "text-slate-400",
}

// Một hàng link trong sidebar (dùng chung cho cả 3 nhóm).
function NavRow({ href, label, Icon, active, collapsed, indent = false, accent = "brand" }: {
  href:      string
  label:     string
  Icon:      LucideIcon
  active:    boolean
  collapsed: boolean
  indent?:   boolean
  accent?:   Accent
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center rounded-lg text-[13px] font-medium transition-all duration-150
        ${collapsed ? "justify-center px-0 py-2.5" : `gap-2.5 px-3 py-[7px] ${indent ? "pl-7" : ""}`}
        ${active ? ACTIVE_BG[accent] : INACTIVE_HOVER[accent]}`}
    >
      <Icon size={15} className={`flex-shrink-0 ${active ? "text-white" : INACTIVE_ICON[accent]}`} />
      {!collapsed && (
        <>
          <span className="flex-1 whitespace-nowrap">{label}</span>
          {active && <span className="w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />}
        </>
      )}
    </Link>
  )
}

// Group header trên nền tối: nền trắng mờ, chữ sáng nhẹ — đủ phân cấp với items bên dưới.
const GROUP_BG: Record<Accent, string> = {
  brand:   "bg-white/5 text-slate-300 hover:bg-white/10",
  blue:    "bg-white/5 text-slate-300 hover:bg-white/10",
  violet:  "bg-white/5 text-slate-300 hover:bg-white/10",
  emerald: "bg-white/5 text-slate-300 hover:bg-white/10",
}
const GROUP_ICON: Record<Accent, string> = {
  brand: "text-slate-400", blue: "text-slate-400", violet: "text-slate-400", emerald: "text-slate-400",
}

// Header bấm để mở/đóng 1 nhóm lớn (chỉ hiện ở chế độ mở rộng)
function GroupToggle({ label, Icon, open, onToggle, accent = "brand" }: {
  label:    string
  Icon:     LucideIcon
  open:     boolean
  onToggle: () => void
  accent?:  Accent
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wide transition-colors ${GROUP_BG[accent]}`}
    >
      <div className="flex items-center gap-2">
        <Icon size={15} className={GROUP_ICON[accent]} strokeWidth={2.4} />
        <span>{label}</span>
      </div>
      {open ? <ChevronUp size={13} className="opacity-60" /> : <ChevronDown size={13} className="opacity-60" />}
    </button>
  )
}

export function Sidebar() {
  const pathname  = usePathname()
  const { data: session } = useSession()
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar()
  const isMobile = useIsMobile()
  // Trên mobile luôn render dạng MỞ RỘNG (off-canvas), bỏ qua trạng thái thu gọn của desktop.
  const effCollapsed = isMobile ? false : collapsed
  const [productOpen, setProductOpen] = useState(false)
  const [analystOpen, setAnalystOpen] = useState(true)

  // Auto-mở nhóm Products khi đang ở 1 trang sản phẩm — tránh giấu mục đang active
  // (giảm tải nhận thức: user luôn thấy mình đang ở đâu, không phải tự mở để định vị)
  useEffect(() => {
    if (NAV_PRODUCTS.some(p => pathname === p.href || pathname.startsWith(p.href + "/"))) {
      setProductOpen(true)
    }
  }, [pathname])

  // Đóng off-canvas sau khi điều hướng sang trang khác trên mobile.
  useEffect(() => { closeMobile() }, [pathname, closeMobile])

  const role       = session?.user?.role     || "staff"
  const username   = session?.user?.username || ""

  const { dbRole, dept: dbDept, allowedAnalytics, allowedTabs, rolePerms, hiddenTabs, gpEnabled: gpEnabledFlag, portalEnabled } = useSidebarData(username, role)
  const department = dbDept ?? "none"
  // Dùng dbRole (fresh từ DB) để tránh cần logout/login khi admin đổi role
  const effectiveRole = dbRole ?? role

  const extraTabs  = useDeptTabs(effectiveRole, department)

  // Mô hình phân quyền analytics y hệt gohub-intel:
  //  - admin/manager: toàn quyền
  //  - còn lại: quyền NỀN theo role (ma trận role_permissions) ∪ trang cấp THÊM per-user (allowed_analytics)
  const isCreatorUser = effectiveRole === "creator"
  // gpEnabled: non-creator user được creator cấp quyền dùng Gấu Pro
  const gpEnabled = !isCreatorUser && gpEnabledFlag

  const analyticsGroups = (() => {
    let groups = ANALYTICS_GROUPS
    if (effectiveRole !== "admin" && effectiveRole !== "creator") {
      // Union code defaults + DB: DB có thể thêm tab, nhưng code defaults luôn được giữ
      const dbPerms = rolePerms?.[effectiveRole] ?? []
      const baseline = [...new Set([...(ANALYTICS_DEFAULTS[effectiveRole] ?? []), ...dbPerms])]
      const granted = new Set([...baseline, ...(allowedAnalytics ?? [])])
      groups = ANALYTICS_GROUPS
        .map(group => ({
          ...group,
          items: group.items.filter(item => granted.has(analyticsId(item))),
        }))
        .filter(group => group.items.length > 0)
    }
    // Ẩn tab theo creator config (hiddenTabs cho role này)
    if (hiddenTabs.size > 0) {
      groups = groups
        .map(group => ({
          ...group,
          items: group.items.filter(item => !hiddenTabs.has(analyticsId(item))),
        }))
        .filter(group => group.items.length > 0)
    }
    return groups
  })()

  // Hiện mục Analytics cho admin/creator/manager, hoặc bất kỳ role nào có ít nhất 1 trang được cấp.
  const showAnalytics = effectiveRole === "admin" || effectiveRole === "creator" || analyticsGroups.length > 0

  const navItems = (() => {
    // bod: chatbot + product catalog (xem được SP/NCC) + full analytics
    if (effectiveRole === "bod") {
      return [{ href: "/chatbot", label: "Bé Gấu", icon: Sparkles, key: "chatbot" }, ...NAV_PRODUCTS]
    }
    if (effectiveRole === "admin" || effectiveRole === "creator") return [...NAV_ALL, { href: "/admin", label: "Admin", icon: Users, key: "admin" }]
    // staff (gồm user PM, role intel): tab PM theo phòng ban (per-user allowed_tabs override dept matrix)
    const pmTabs = allowedTabs ?? Array.from(extraTabs)
    const allowed = new Set([...DEFAULT_STANDARD_TABS, ...pmTabs])
    return NAV_ALL.filter(n => allowed.has(n.key))
  })()

  // Phân các tab được phép vào 3 nhóm lớn — ẩn theo hiddenTabs (creator config)
  const allowedKeys  = new Set(navItems.map(n => n.key))
  const topItems     = NAV_TOP.filter(n => allowedKeys.has(n.key) && !hiddenTabs.has(n.key))
  const productItems = NAV_PRODUCT.filter(n => allowedKeys.has(n.key) && !hiddenTabs.has(n.key))
  const showInfoTab  = !hiddenTabs.has("info")   // creator có thể ẩn Information tab
  const isAdminUser  = effectiveRole === "admin"
  // "/analytics" và "/analytics/creator" là parent có route con → match chính xác để không sáng cùng lúc với route con
  const isActive = (href: string) =>
    href === "/analytics" || href === "/analytics/creator"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/")

  return (
    <>
    {/* Backdrop mobile: chạm ra ngoài để đóng off-canvas */}
    {isMobile && mobileOpen && (
      <div
        onClick={closeMobile}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
        aria-hidden
      />
    )}
    <aside className={`
      fixed left-0 top-0 h-full bg-slate-900 border-r border-slate-800
      flex flex-col z-50 select-none overflow-visible
      transition-all duration-200 ease-in-out
      ${isMobile
        ? `w-60 ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`
        : `translate-x-0 ${collapsed ? "w-16" : "w-60"}`}
    `}>

      {/* Brand header */}
      <div className={`bg-slate-950 border-b border-slate-800 flex-shrink-0
        ${effCollapsed ? "px-2 py-4" : "px-4 py-4"}`}>
        <div className={`flex items-center ${effCollapsed ? "justify-center" : "gap-3"}`}>
          <div className="w-8 h-8 bg-brand-500/40 rounded-lg flex items-center justify-center border border-brand-400/30 flex-shrink-0">
            <Radio size={16} className="text-white" strokeWidth={2} />
          </div>
          {!effCollapsed && (
            <div className="overflow-hidden">
              <div className="text-white font-semibold text-sm leading-tight tracking-tight whitespace-nowrap">Gohub Intel</div>
              <div className="text-brand-300/80 text-[11px] whitespace-nowrap tracking-wide uppercase">Intelligence Hub</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto ${effCollapsed ? "px-1.5" : "px-2.5"}`}>

        {effCollapsed ? (
          /* Chế độ thu gọn: icon rail phẳng (tất cả mục được phép) */
          <>
            {showInfoTab && <NavRow href={NAV_INFO.href} label={NAV_INFO.label} Icon={NAV_INFO.icon} active={isActive(NAV_INFO.href)} collapsed accent="violet" />}
            {isCreatorUser && <NavRow href={NAV_TO_GAU.href} label={NAV_TO_GAU.label} Icon={NAV_TO_GAU.icon} active={isActive(NAV_TO_GAU.href)} collapsed accent="brand" />}
            {topItems.map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed accent="violet" />
            ))}
            {showAnalytics && analyticsGroups.flatMap(g => g.items).map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed accent="blue" />
            ))}
            {productItems.map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed accent="emerald" />
            ))}
            {(isAdminUser || isCreatorUser) && MANAGEMENT_GROUP.items.map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed accent="brand" />
            ))}
            {isAdminUser && !hiddenTabs.has("api-database") && (
              <NavRow href="/analytics/creator/devtools" label="API & Database" Icon={Terminal} active={isActive("/analytics/creator/devtools")} collapsed accent="brand" />
            )}
            {isCreatorUser && CREATOR_GROUP.items.map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed accent="violet" />
            ))}
            {gpEnabled && (
              <NavRow href="/analytics/creator/ai" label="Gấu Pro" Icon={Cpu} active={isActive("/analytics/creator/ai")} collapsed accent="violet" />
            )}
            {portalEnabled && PORTAL_GROUP.items.map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed accent="brand" />
            ))}
          </>
        ) : (
          /* Chế độ mở rộng: Note → Bé Gấu/Promotion → Analytics → Product */
          <>
            {/* Note — NỔI BẬT, ẩn nếu creator config ẩn cho role này */}
            {showInfoTab && (
              <Link
                href={NAV_INFO.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-2 text-[13px] font-semibold transition-all
                  ${isActive(NAV_INFO.href)
                    ? "bg-violet-600 text-white shadow-md ring-1 ring-violet-400/50"
                    : "bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30 hover:bg-violet-500/25 hover:text-white"}`}
              >
                <StickyNote size={16} className="flex-shrink-0" />
                <span className="flex-1">Note</span>
                <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">+ KB</span>
              </Link>
            )}

            {/* Tổ Gấu — chỉ creator */}
            {isCreatorUser && (
              <Link
                href={NAV_TO_GAU.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-2 text-[13px] font-semibold transition-all
                  ${isActive(NAV_TO_GAU.href)
                    ? "bg-amber-600 text-white shadow-md ring-1 ring-amber-400/50"
                    : "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30 hover:bg-amber-500/25 hover:text-white"}`}
              >
                <MessageCircle size={16} className="flex-shrink-0" />
                <span className="flex-1">{NAV_TO_GAU.label}</span>
                <span className="text-base leading-none">🐻</span>
              </Link>
            )}

            {/* Bé Gấu + Promotion — đứng riêng đầu sidebar */}
            {topItems.map(it => (
              <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed={false} accent="violet" />
            ))}

            {/* Analytics */}
            {showAnalytics && (
              <div className="mt-1 pt-1 border-t border-slate-800">
                <GroupToggle label="Analyst" Icon={BarChart3} open={analystOpen} onToggle={() => setAnalystOpen(o => !o)} accent="blue" />
                {analystOpen && analyticsGroups.map(group => (
                  <div key={group.label} className="mt-0.5">
                    <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{group.label}</p>
                    {group.items.map(it => (
                      <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed={false} accent="blue" />
                    ))}
                  </div>
                ))}
                {analystOpen && (isAdminUser || isCreatorUser) && (
                  <div className="mt-0.5">
                    <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{MANAGEMENT_GROUP.label}</p>
                    {MANAGEMENT_GROUP.items.map(it => (
                      <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed={false} accent="brand" />
                    ))}
                    {/* API & Database: chỉ hiện cho admin khi creator đã cấp quyền (không ẩn trong hiddenTabs) */}
                    {isAdminUser && !hiddenTabs.has("api-database") && (
                      <NavRow href="/analytics/creator/devtools" label="API & Database" Icon={Terminal} active={isActive("/analytics/creator/devtools")} collapsed={false} accent="brand" />
                    )}
                  </div>
                )}
                {analystOpen && isCreatorUser && (
                  <div className="mt-0.5">
                    <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold text-violet-600/80 uppercase tracking-wider">{CREATOR_GROUP.label}</p>
                    {CREATOR_GROUP.items.map(it => (
                      <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed={false} accent="violet" />
                    ))}
                  </div>
                )}
                {analystOpen && gpEnabled && (
                  <div className="mt-0.5">
                    <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold text-violet-600/80 uppercase tracking-wider">Private AI</p>
                    <NavRow href="/analytics/creator/ai" label="Gấu Pro" Icon={Cpu} active={isActive("/analytics/creator/ai")} collapsed={false} accent="violet" />
                  </div>
                )}
                {analystOpen && portalEnabled && (
                  <div className="mt-0.5">
                    <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold text-brand-400/80 uppercase tracking-wider">{PORTAL_GROUP.label}</p>
                    {PORTAL_GROUP.items.map(it => (
                      <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed={false} accent="brand" />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Product (sau Analytics, mặc định thu gọn) */}
            {productItems.length > 0 && (
              <div className="mt-1 pt-1 border-t border-slate-800">
                <GroupToggle label="Product" Icon={Package} open={productOpen} onToggle={() => setProductOpen(o => !o)} accent="emerald" />
                {productOpen && productItems.map(it => (
                  <NavRow key={it.href} href={it.href} label={it.label} Icon={it.icon} active={isActive(it.href)} collapsed={false} accent="emerald" />
                ))}
              </div>
            )}

          </>
        )}

        <div className={`pt-1 border-t border-slate-800 mt-1 ${effCollapsed ? "px-1.5" : "px-0"}`}>
          <NotificationBell collapsed={effCollapsed} />
        </div>
      </nav>

      {/* Toggle tab — dán vào cạnh phải sidebar (chỉ desktop; mobile dùng nút hamburger ở TopBar) */}
      <button
        onClick={toggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-1/2 -translate-y-1/2 z-50
          w-6 h-12 bg-white border border-gray-200 rounded-r-lg shadow-sm
          hidden md:flex items-center justify-center
          text-gray-400 hover:text-brand-600 hover:border-brand-300 hover:bg-brand-50
          transition-all duration-150 group"
      >
        {collapsed
          ? <ChevronRight size={14} className="group-hover:scale-110 transition-transform" />
          : <ChevronLeft  size={14} className="group-hover:scale-110 transition-transform" />
        }
      </button>
    </aside>
    </>
  )
}
