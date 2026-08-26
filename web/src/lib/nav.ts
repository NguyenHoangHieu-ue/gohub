import type { LucideIcon } from "lucide-react"
import {
  Users, Gift, Package, Truck, Globe, Sparkles, LayoutDashboard, PieChart, Globe2, Building2,
  ShoppingBag, BarChart3, Target, ClipboardList, HeartPulse, Zap, Terminal, Activity, TrendingUp,
  MessageSquare, Database, Clock, Settings, Crown, Cpu, BookOpen, BarChart2, MessageCircle,
} from "lucide-react"
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/analytics-roles"

// Registry nav cho Command Palette (components/command-palette.tsx).
// ⚠️ GIỮ ĐỒNG BỘ với components/sidebar.tsx (cùng label/href/nhóm) — khi thêm/sửa tab, cập nhật CẢ 2 nơi.

export interface NavDef { href: string; label: string; icon: LucideIcon; key?: string }
export interface NavGroup { label: string; items: NavDef[] }

// Note + Knowledge Base đã gộp vào Tổ Gấu (mỗi group có tab Tài liệu riêng) — hiển thị mọi role,
// chỉ ẩn qua creator config hiddenTabs (giống Note trước đây), không gate theo pmAllowed.
export const NAV_TO_GAU: NavDef = { href: "/analytics/to-gau", label: "Tổ Gấu", icon: MessageCircle, key: "to-gau" }

export const NAV_TOP: NavDef[] = [
  { href: "/chatbot",    label: "Bé Gấu",     icon: Sparkles, key: "chatbot"    },
  { href: "/promotions", label: "Promotions",  icon: Gift,     key: "promotions" },
]

export const NAV_PRODUCT: NavDef[] = [
  { href: "/skus",      label: "System SKUs",  icon: Package, key: "skus"      },
  { href: "/ncc",       label: "NCC Catalog",  icon: Truck,   key: "ncc"       },
  { href: "/countries", label: "Reference",    icon: Globe,   key: "countries" },
]

export const ANALYTICS_GROUPS: NavGroup[] = [
  { label: "Overview", items: [
    { href: "/analytics",           label: "Dashboard",       icon: LayoutDashboard },
    { href: "/analytics/quarterly", label: "Quarter Report",  icon: BarChart3       },
    { href: "/analytics/bod",       label: "BOD Report",      icon: PieChart        },
    { href: "/analytics/all-time",  label: "All-Time Report", icon: BarChart3       },
  ]},
  { label: "Sales Performance", items: [
    { href: "/analytics/channels",  label: "Channels",   icon: Globe2     },
    { href: "/analytics/b2b",       label: "B2B",        icon: Building2  },
    { href: "/analytics/b2c",       label: "B2C",        icon: ShoppingBag },
    { href: "/analytics/website",   label: "Website Analytics", icon: Globe   },
    { href: "/analytics/staff",     label: "Staff",     icon: Users     },
    { href: "/analytics/customers", label: "Customers", icon: Users     },
    { href: "/analytics/vendors",   label: "Vendors",    icon: TrendingUp },
  ]},
  { label: "Operations & Support", items: [
    { href: "/analytics/orders",          label: "Orders",          icon: ClipboardList },
    { href: "/analytics/fulfillment",     label: "Inventory",       icon: Zap           },
    { href: "/analytics/3hk-usage",       label: "3HK Data Usage",  icon: Activity      },
    { href: "/analytics/cs-troubleshoot", label: "CS Troubleshoot", icon: HeartPulse    },
    { href: "/analytics/feedback",        label: "Feedback",        icon: MessageSquare },
  ]},
  { label: "Analytics & Planning", items: [
    { href: "/analytics/products",   label: "Products (BI)",      icon: BarChart3 },
    { href: "/analytics/targets",    label: "KPI / Target",       icon: Target    },
    { href: "/analytics/sql",        label: "SQL Explorer",       icon: Terminal  },
    { href: "/analytics/scheduled",  label: "Scheduled Messages", icon: Clock     },
  ]},
]

export const MANAGEMENT_GROUP: NavGroup = { label: "Management", items: [
  { href: "/analytics/users",    label: "Users",           icon: Users    },
  { href: "/analytics/schema",   label: "Schema Config",   icon: Database },
  { href: "/analytics/settings", label: "Settings",        icon: Settings },
  { href: "/admin",              label: "Admin (Product)", icon: Package  },
]}

export const CREATOR_GROUP: NavGroup = { label: "Creator", items: [
  { href: "/analytics/creator",            label: "Creator Settings", icon: Crown    },
  { href: "/analytics/creator/ai",         label: "Gấu Pro",          icon: Cpu      },
  { href: "/analytics/creator/knowledge",  label: "Own Info",         icon: BookOpen },
  { href: "/analytics/creator/devtools",   label: "API & Database",   icon: Terminal },
  { href: "/analytics/creator/usage",      label: "Usage Analytics",  icon: BarChart2},
]}

export const DEFAULT_STANDARD_TABS = new Set(["chatbot", "promotions", "countries"])

// id trang analytics (khớp role_permissions): "/analytics" → "dashboard", "/analytics/b2b" → "b2b"
export function analyticsId(href: string): string {
  return href === "/analytics" ? "dashboard" : href.replace("/analytics/", "")
}

// ─── Command Palette: danh sách nav phẳng HIỂN THỊ theo quyền (mirror logic sidebar) ────────────
export interface PaletteCtx {
  role:             string
  allowedAnalytics: string[] | null
  allowedTabs:      string[] | null
  rolePerms:        Record<string, string[]> | null
  hiddenTabs:       Set<string>
}

export interface PaletteNavItem { href: string; label: string; icon: LucideIcon; group: string }

export function visibleNavForPalette(ctx: PaletteCtx): PaletteNavItem[] {
  const { role, allowedAnalytics, allowedTabs, rolePerms, hiddenTabs } = ctx
  const isPriv = role === "admin" || role === "creator"
  const out: PaletteNavItem[] = []

  // Tổ Gấu — hiển thị mọi role (chỉ ẩn qua hiddenTabs), mirror sidebar.tsx
  if (!hiddenTabs.has(NAV_TO_GAU.key ?? "")) {
    out.push({ href: NAV_TO_GAU.href, label: NAV_TO_GAU.label, icon: NAV_TO_GAU.icon, group: "Điều hướng" })
  }

  // Top-level tabs (Bé Gấu / Promotions / Product) — gate theo key
  const topLevel: NavDef[] = [...NAV_TOP, ...NAV_PRODUCT]
  const pmAllowed = new Set<string>([...DEFAULT_STANDARD_TABS, ...(allowedTabs ?? [])])
  for (const it of topLevel) {
    const key = it.key ?? ""
    if (hiddenTabs.has(key)) continue
    const ok = isPriv || role === "bod" && (key === "chatbot" || ["skus", "ncc", "countries"].includes(key)) || pmAllowed.has(key)
    if (ok) out.push({ href: it.href, label: it.label, icon: it.icon, group: "Điều hướng" })
  }

  // Analytics
  const showAllAnalytics = isPriv
  const dbPerms = rolePerms?.[role]
  const baseline = (dbPerms && dbPerms.length > 0) ? dbPerms : (DEFAULT_ROLE_PERMISSIONS[role] ?? [])
  const granted = new Set<string>([...baseline, ...(allowedAnalytics ?? [])])
  for (const g of ANALYTICS_GROUPS) {
    for (const it of g.items) {
      const id = analyticsId(it.href)
      if (hiddenTabs.has(id)) continue
      if (showAllAnalytics || role === "bod" || granted.has(id)) {
        out.push({ href: it.href, label: it.label, icon: it.icon, group: g.label })
      }
    }
  }

  // Management + Creator
  if (isPriv) for (const it of MANAGEMENT_GROUP.items) out.push({ href: it.href, label: it.label, icon: it.icon, group: MANAGEMENT_GROUP.label })
  if (role === "creator") for (const it of CREATOR_GROUP.items) out.push({ href: it.href, label: it.label, icon: it.icon, group: CREATOR_GROUP.label })

  return out
}
