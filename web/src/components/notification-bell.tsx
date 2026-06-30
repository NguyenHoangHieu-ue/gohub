"use client"

import { useState, useEffect, useCallback } from "react"
import { Bell, X, RefreshCw, FileText, PenLine, TrendingUp, ChevronDown, ChevronUp } from "lucide-react"

interface Notification {
  id: number
  type: "sync" | "kb_doc" | "wiki" | "price_change"
  title: string
  body: string | null
  data: any
  visibility: "all" | "admin_manager"
  created_at: string
}

const LAST_SEEN_KEY = "notif_last_seen"

const TYPE_CFG = {
  sync:         { icon: RefreshCw,  color: "text-blue-500",   bg: "bg-blue-50",   label: "Sync"    },
  kb_doc:       { icon: FileText,   color: "text-green-500",  bg: "bg-green-50",  label: "Tài liệu" },
  wiki:         { icon: PenLine,    color: "text-purple-500", bg: "bg-purple-50", label: "Wiki"     },
  price_change: { icon: TrendingUp, color: "text-amber-500",  bg: "bg-amber-50",  label: "Giá"      },
} as const

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  })
}

function NotifCard({ notif, isNew }: { notif: Notification; isNew: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = TYPE_CFG[notif.type] ?? TYPE_CFG.kb_doc
  const Icon = cfg.icon
  const changes: any[] = notif.data?.changes ?? []

  return (
    <div className={`px-4 py-3 border-b border-gray-100 last:border-0 transition-colors ${isNew ? "bg-blue-50/40" : "hover:bg-gray-50"}`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
          <Icon size={13} className={cfg.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-xs font-semibold leading-snug ${isNew ? "text-blue-800" : "text-gray-800"}`}>
              {notif.title}
            </p>
            {isNew && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-0.5" />}
          </div>
          {notif.body && (
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{notif.body}</p>
          )}
          <p className="text-[10px] text-gray-400 mt-1">{fmtDate(notif.created_at)}</p>

          {notif.type === "sync" && changes.length > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[10px] text-brand-600 mt-1.5 hover:underline"
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? "Thu gọn" : `Xem ${changes.length} thay đổi`}
            </button>
          )}

          {expanded && changes.length > 0 && (
            <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-400">
                    <th className="px-2 py-1 font-medium">Status</th>
                    <th className="px-2 py-1 font-medium">SKU</th>
                    <th className="px-2 py-1 font-medium">Product</th>
                    <th className="px-2 py-1 font-medium">Thay đổi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {changes.slice(0, 20).map((c, i) => (
                    <tr key={i} className="text-gray-600">
                      <td className="px-2 py-0.5">{c.status}</td>
                      <td className="px-2 py-0.5 font-mono text-[9px]">{c.sku_code}</td>
                      <td className="px-2 py-0.5 font-mono text-[9px]">{c.product_code}</td>
                      <td className="px-2 py-0.5">{c.changed}</td>
                    </tr>
                  ))}
                  {changes.length > 20 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-1 text-gray-400 italic text-center">
                        ...và {changes.length - 20} thay đổi khác
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const [open,          setOpen]          = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading,       setLoading]       = useState(false)
  const [lastSeen,      setLastSeen]      = useState("")

  useEffect(() => {
    setLastSeen(localStorage.getItem(LAST_SEEN_KEY) ?? "")
  }, [])

  const fetchNotifs = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/notifications?limit=30")
      if (r.ok) {
        const d = await r.json()
        setNotifications(d.data ?? [])
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchNotifs()
    const t = setInterval(fetchNotifs, 5 * 60 * 1000) // refresh every 5 min
    return () => clearInterval(t)
  }, [fetchNotifs])

  const unread = notifications.filter(n => n.created_at > lastSeen).length

  const handleOpen = () => {
    setOpen(true)
    const now = new Date().toISOString()
    setLastSeen(now)
    localStorage.setItem(LAST_SEEN_KEY, now)
  }

  return (
    <>
      {/* Bell trigger button — rendered inside sidebar nav */}
      <button
        onClick={handleOpen}
        title="Thông báo"
        className={`w-full flex items-center rounded-lg text-sm font-medium transition-all duration-150 text-slate-300 hover:bg-white/10 hover:text-white
          ${collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"}`}
      >
        <div className="relative flex-shrink-0">
          <Bell size={16} className="text-slate-400" />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 whitespace-nowrap text-left">Thông báo</span>
            {unread > 0 && (
              <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-semibold rounded-full">
                {unread}
              </span>
            )}
          </>
        )}
      </button>

      {/* Panel + backdrop */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/10 animate-overlay-in"
            onClick={() => setOpen(false)}
          />
          <div className="fixed right-0 top-0 h-full w-[380px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-brand-600" />
                <h2 className="text-sm font-semibold text-gray-900">Thông báo</h2>
                {unread === 0 && notifications.length > 0 && (
                  <span className="text-[10px] text-gray-400">Đã đọc hết</span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <div className="p-4 space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <Bell size={28} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">Chưa có thông báo nào</p>
                </div>
              ) : (
                notifications.map(n => (
                  <NotifCard
                    key={n.id}
                    notif={n}
                    isNew={n.created_at > lastSeen}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
