"use client"

import React, { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Crown, Save, RefreshCw, Eye, EyeOff, Shield, Cpu, Plus, Trash2, AlertTriangle, MessageSquare, CheckCircle, XCircle, Loader2, Send, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { ALL_ROLES, ROLE_LABELS } from "@/lib/agents/types"

// Tất cả tab/route có thể ẩn
const ALL_TABS = [
  { id: "chatbot",         label: "Bé Gấu (Chatbot)" },
  { id: "kb",              label: "Knowledge Base & Wiki" },
  { id: "promotions",      label: "Promotions" },
  { id: "skus",            label: "System SKUs" },
  { id: "ncc",             label: "NCC Catalog" },
  { id: "countries",       label: "Reference" },
  { id: "info",            label: "Note (Notes/Files)" },
  { id: "dashboard",       label: "Analytics Dashboard" },
  { id: "quarterly",       label: "Quarter Report" },
  { id: "bod",             label: "BOD Report" },
  { id: "all-time",        label: "All-Time" },
  { id: "channels",        label: "Channels" },
  { id: "b2b",             label: "B2B" },
  { id: "b2c",             label: "B2C" },
  { id: "website",         label: "Website Analytics" },
  { id: "staff",           label: "Staff" },
  { id: "customers",       label: "Customers" },
  { id: "vendors",         label: "Vendors" },
  { id: "orders",          label: "Orders" },
  { id: "fulfillment",     label: "Fulfillment" },
  { id: "3hk-usage",       label: "3HK Usage" },
  { id: "cs-troubleshoot", label: "CS Troubleshoot" },
  { id: "feedback",        label: "Feedback" },
  { id: "products",        label: "Products (BI)" },
  { id: "targets",         label: "KPI / Targets" },
  { id: "sql",             label: "SQL Explorer" },
  { id: "scheduled",       label: "Scheduled Messages" },
  { id: "admin",           label: "Admin (Product)" },
  { id: "api-database",    label: "API & Database (Devtools)" },
]

// Tab mặc định ẨN cho tất cả role (default-deny) — creator phải bật để cấp quyền
const DEFAULT_HIDDEN_TABS = ["api-database"]

const ROLES_TO_MANAGE = ALL_ROLES.filter(r => r !== "creator") // creator không bị ẩn tab của chính mình

export default function CreatorPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [freshRole, setFreshRole] = useState<string | null>(null)

  // Fetch role mới nhất từ DB — JWT có thể cũ nếu admin vừa đổi role
  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => {
      setFreshRole(d?.role ?? session?.user?.role ?? "staff")
    }).catch(() => setFreshRole(session?.user?.role ?? "staff"))
  }, [status, session])

  useEffect(() => {
    if (freshRole && !["creator", "admin"].includes(freshRole)) router.push("/chatbot")
  }, [freshRole, router])

  if (status !== "authenticated" || !freshRole || !["creator", "admin"].includes(freshRole)) return null
  return <CreatorSettings />
}

function CreatorSettings() {
  const [visibility, setVisibility] = useState<Record<string, string[]>>({})
  const [savedSnap, setSavedSnap] = useState("")   // snapshot đã lưu → nút Lưu chỉ sáng khi khác snapshot
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [creatorInfo, setCreatorInfo] = useState<{ creatorCount: number; canAssignCreator: boolean } | null>(null)

  const dirty = JSON.stringify(visibility) !== savedSnap

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  useEffect(() => {
    Promise.all([
      fetch("/api/config/tab-visibility").then(r => r.ok ? r.json() : {}),
      fetch("/api/config/creator-status").then(r => r.ok ? r.json() : null),
    ]).then(([vis, cs]) => {
      const raw = vis || {} as Record<string, string[]>
      // Nếu config chưa từng được save (trống hoàn toàn), khởi tạo DEFAULT_HIDDEN_TABS cho mọi role
      const isFirstTime = Object.keys(raw).length === 0
      const loaded: Record<string, string[]> = { ...raw }
      if (isFirstTime) {
        for (const role of ROLES_TO_MANAGE) {
          loaded[role] = [...DEFAULT_HIDDEN_TABS]
        }
      }
      setVisibility(loaded)
      setSavedSnap(JSON.stringify(loaded))
      setCreatorInfo(cs)
    }).finally(() => setLoading(false))
  }, [])

  const toggleTab = (role: string, tabId: string) => {
    setVisibility(prev => {
      const hidden = new Set(prev[role] || [])
      hidden.has(tabId) ? hidden.delete(tabId) : hidden.add(tabId)
      return { ...prev, [role]: Array.from(hidden) }
    })
  }

  const isHidden = (role: string, tabId: string) => (visibility[role] || []).includes(tabId)

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch("/api/config/tab-visibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(visibility) })
      if (r.ok) setSavedSnap(JSON.stringify(visibility))
      notify(r.ok, r.ok ? "Đã lưu cấu hình ẩn tab" : "Lưu thất bại")
    } finally { setSaving(false) }
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-sm">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Creator Settings</h1>
            <p className="text-slate-500 text-sm">Quyền hạn cao nhất — ẩn/hiện tab cho từng role</p>
          </div>
        </div>
        <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Lưu thay đổi
        </button>
      </div>

      {msg && <div className={cn("px-4 py-3 rounded-xl text-sm font-medium", msg.ok ? "bg-emerald-50 border border-emerald-100 text-emerald-700" : "bg-rose-50 border border-rose-100 text-rose-700")}>{msg.text}</div>}

      {creatorInfo && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4 flex items-center gap-3">
          <Shield className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="text-sm text-amber-800">
            <strong>Creator status:</strong> {creatorInfo.creatorCount}/2 tài khoản creator đang hoạt động.
            {creatorInfo.creatorCount >= 2 && " Đã đạt giới hạn tối đa."}
            {" "}Admin không thể gán role creator{creatorInfo.creatorCount > 0 ? " (đã có creator)" : " khi chưa có creator nào"}.
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div> : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="font-bold text-slate-800">Ma trận ẩn Tab</h2>
            <p className="text-xs text-slate-400 mt-0.5">Click ô để ẩn tab đó với role. Creator luôn thấy tất cả dù có ẩn hay không.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-48">Tab</th>
                  {ROLES_TO_MANAGE.map(r => (
                    <th key={r} className="px-3 py-2.5 text-center text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      {ROLE_LABELS[r] ?? r}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ALL_TABS.map(tab => (
                  <tr key={tab.id} className="hover:bg-slate-50/30">
                    <td className="px-4 py-2 text-xs font-medium text-slate-700">{tab.label}</td>
                    {ROLES_TO_MANAGE.map(role => {
                      const hidden = isHidden(role, tab.id)
                      return (
                        <td key={role} className="px-3 py-2 text-center">
                          <button onClick={() => toggleTab(role, tab.id)} className={cn("w-7 h-7 rounded-lg inline-flex items-center justify-center transition-all border", hidden ? "bg-rose-100 border-rose-200 text-rose-500 hover:bg-rose-200" : "bg-slate-50 border-slate-200 text-slate-300 hover:bg-slate-100")}>
                            {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-6 py-3 text-[11px] text-slate-400 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 text-rose-500"><EyeOff className="w-3 h-3" />Đỏ = ẩn với role đó</span>
            <span>Trắng = hiển thị bình thường</span>
            <span className="text-amber-600 font-medium">⚠️ "API & Database" ẩn theo mặc định — bật để cấp quyền cho role tương ứng</span>
          </p>
        </div>
      )}

      {/* Gấu Pro Access */}
      <GpAccessSection />

      {/* My Metrics Access */}
      <MyMetricsAccessSection />

      {/* Cà Thread */}
      <CaThreadSection />
    </div>
  )
}

function GpAccessSection() {
  const [allowedUsers, setAllowedUsers] = useState<{ username: string; name: string; role: string }[]>([])
  const [newUsername, setNewUsername]   = useState("")
  const [loading, setLoading]           = useState(true)
  const [adding, setAdding]             = useState(false)
  const [msg, setMsg]                   = useState<{ ok: boolean; text: string } | null>(null)

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  useEffect(() => {
    fetch("/api/creator-ai/gp-access").then(r => r.ok ? r.json() : null).then(d => {
      setAllowedUsers(d?.users ?? [])
    }).finally(() => setLoading(false))
  }, [])

  const add = async () => {
    if (!newUsername.trim()) return
    setAdding(true)
    try {
      const r = await fetch("/api/creator-ai/gp-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", username: newUsername.trim() }),
      })
      const d = await r.json()
      if (!r.ok) { notify(false, d.error || "Lỗi"); return }
      setNewUsername("")
      // Refresh list
      const res = await fetch("/api/creator-ai/gp-access")
      const data = await res.json()
      setAllowedUsers(data?.users ?? [])
      notify(true, `Đã cấp quyền cho "${newUsername.trim()}"`)
    } finally { setAdding(false) }
  }

  const remove = async (username: string) => {
    const r = await fetch("/api/creator-ai/gp-access", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", username }),
    })
    if (r.ok) {
      setAllowedUsers(prev => prev.filter(u => u.username !== username))
      notify(true, `Đã thu hồi quyền của "${username}"`)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-violet-50 bg-violet-50/50 flex items-center gap-3">
        <div className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center">
          <Cpu className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Gấu Pro — Phân quyền theo user</h2>
          <p className="text-xs text-slate-400">Chỉ những user được thêm ở đây mới thấy và dùng được Gấu Pro</p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Warning */}
        <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <strong>Lưu ý:</strong> Gấu Pro có quyền truy cập toàn bộ database và hệ thống.
            Các câu hỏi về <strong>code, cấu trúc hệ thống, credential</strong> tự động bị chặn với non-creator user.
            Chỉ cấp quyền cho người tin tưởng hoàn toàn.
          </p>
        </div>

        {msg && (
          <div className={cn("px-4 py-2.5 rounded-xl text-sm", msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100")}>
            {msg.text}
          </div>
        )}

        {/* Add user */}
        <div className="flex gap-2">
          <input
            value={newUsername} onChange={e => setNewUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="Username cần cấp quyền..."
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <button onClick={add} disabled={adding || !newUsername.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-violet-600 text-white rounded-xl hover:bg-violet-500 disabled:opacity-40 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            {adding ? "Đang thêm…" : "Thêm"}
          </button>
        </div>

        {/* Allowed users list */}
        {loading ? (
          <div className="text-xs text-slate-400 py-2">Đang tải...</div>
        ) : allowedUsers.length === 0 ? (
          <div className="text-xs text-slate-400 py-4 text-center">
            Chưa có user nào được cấp quyền (ngoài creator).
          </div>
        ) : (
          <div className="space-y-2">
            {allowedUsers.map(u => (
              <div key={u.username} className="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-sm font-medium text-slate-800">{u.name}</span>
                  <span className="ml-2 text-xs text-slate-400">@{u.username}</span>
                  <span className="ml-2 text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{u.role}</span>
                </div>
                <button onClick={() => remove(u.username)}
                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MyMetricsAccessSection() {
  const [users, setUsers]       = useState<{ username: string; name: string; role: string }[]>([])
  const [newUsername, setNew]   = useState("")
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null)

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  const reload = () => fetch("/api/creator/my-metrics-access").then(r => r.ok ? r.json() : null).then(d => setUsers(d?.users ?? [])).finally(() => setLoading(false))
  useEffect(() => { reload() }, [])

  const add = async () => {
    if (!newUsername.trim()) return
    setAdding(true)
    try {
      const r = await fetch("/api/creator/my-metrics-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", username: newUsername.trim() }),
      })
      const d = await r.json()
      if (!r.ok) { notify(false, d.error || "Lỗi"); return }
      setNew(""); await reload(); notify(true, `Đã cấp quyền "${newUsername.trim()}"`)
    } finally { setAdding(false) }
  }

  const remove = async (username: string) => {
    await fetch("/api/creator/my-metrics-access", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", username }),
    })
    setUsers(prev => prev.filter(u => u.username !== username))
    notify(true, `Đã thu hồi quyền "${username}"`)
  }

  return (
    <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-emerald-50 bg-emerald-50/50 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">My Metrics — Phân quyền xem</h2>
          <p className="text-xs text-slate-400">Những user được thêm vào đây mới thấy tab My Metrics</p>
        </div>
      </div>
      <div className="p-6 space-y-4">
        {msg && <div className={cn("px-4 py-2.5 rounded-xl text-sm", msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100")}>{msg.text}</div>}
        <div className="flex gap-2">
          <input value={newUsername} onChange={e => setNew(e.target.value)} onKeyDown={e => e.key === "Enter" && add()}
            placeholder="Username cần cấp quyền..."
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          <button onClick={add} disabled={adding || !newUsername.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 disabled:opacity-40 transition-colors">
            <Plus className="w-3.5 h-3.5" />{adding ? "Đang thêm…" : "Thêm"}
          </button>
        </div>
        {loading ? <div className="text-xs text-slate-400 py-2">Đang tải...</div>
          : users.length === 0 ? <div className="text-xs text-slate-400 py-4 text-center">Chưa có user nào (ngoài creator).</div>
          : <div className="space-y-2">{users.map(u => (
              <div key={u.username} className="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-sm font-medium text-slate-800">{u.name}</span>
                  <span className="ml-2 text-xs text-slate-400">@{u.username}</span>
                  <span className="ml-2 text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{u.role}</span>
                </div>
                <button onClick={() => remove(u.username)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}</div>}
      </div>
    </div>
  )
}

const DEFAULT_CA_TEXT = "Dạ thread này còn update thêm thông tin gì nữa không ạ a/c"

interface ThreadScan {
  message_id: string
  thread_id: string
  create_time: string
  days_ago: number
  content: string
  participants: { open_id: string; name: string }[]
  replies: { open_id: string; name: string; content: string; create_time: string }[]
  already_sent?: boolean
  sent_at?: string
  sent_by?: string
}

interface CaHistoryItem {
  id: string
  content_snip: string
  participants: string[]
  message_sent: string
  sent_by: string
  sent_at: string
}

function CaThreadSection() {
  // config
  const [larkConnected, setLarkConnected] = useState<boolean | null>(null)
  const [editing, setEditing]             = useState(false)
  const [configSaved, setConfigSaved]     = useState(false)
  const [chatId, setChatId]               = useState("")
  const [emojiType, setEmojiType]         = useState("THUMBSUP")
  const [daysBack, setDaysBack]           = useState(7)
  const [myOpenId, setMyOpenId]           = useState("")
  const [saving, setSaving]               = useState(false)

  // scan
  const [scanning, setScanning]   = useState(false)
  const [threads, setThreads]     = useState<ThreadScan[] | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // per-thread cà preview
  const [previewId, setPreviewId]         = useState<string | null>(null)
  const [editText, setEditText]           = useState(DEFAULT_CA_TEXT)
  const [checkedPIds, setCheckedPIds]     = useState<Set<string>>(new Set())
  const [sending, setSending]             = useState<string | null>(null)
  const [sentIds, setSentIds]             = useState<Set<string>>(new Set())
  const [sendError, setSendError]         = useState<string | null>(null)

  // history
  const [history, setHistory]     = useState<CaHistoryItem[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [loadingHist, setLoadingHist] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/lark/oauth/status").then(r => r.ok ? r.json() : null),
      fetch("/api/creator/ca-thread").then(r => r.ok ? r.json() : null),
    ]).then(([st, cfg]) => {
      setLarkConnected(st?.connected ?? false)
      if (cfg?.chat_id) {
        setChatId(cfg.chat_id)
        setEmojiType(cfg.emoji_type ?? "THUMBSUP")
        setDaysBack(cfg.days_back ?? 7)
        setMyOpenId(cfg.my_open_id ?? "")
        setConfigSaved(true)
      } else {
        setEditing(true)
      }
    }).catch(() => { setLarkConnected(false); setEditing(true) })
  }, [])

  const saveConfig = async () => {
    if (!chatId.trim()) return
    setSaving(true)
    try {
      await fetch("/api/creator/ca-thread", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId.trim(), emoji_type: emojiType || "THUMBSUP", days_back: daysBack, my_open_id: myOpenId.trim() }),
      })
      setConfigSaved(true)
      setEditing(false)
    } finally { setSaving(false) }
  }

  const scan = async () => {
    setScanning(true); setScanError(null); setThreads(null)
    setPreviewId(null); setSentIds(new Set())
    try {
      const r = await fetch("/api/creator/ca-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan", chat_id: chatId, emoji_type: emojiType || "THUMBSUP", days_back: daysBack, my_open_id: myOpenId || undefined, max_threads: 20 }),
      })
      const d = await r.json()
      if (!r.ok) setScanError(d.error || "Lỗi không xác định")
      else setThreads(d.threads ?? [])
    } catch (e: any) { setScanError(e.message) }
    finally { setScanning(false) }
  }

  const openPreview = (thread: ThreadScan) => {
    setPreviewId(thread.message_id)
    setEditText(DEFAULT_CA_TEXT)
    setCheckedPIds(new Set(thread.participants.map(p => p.open_id)))
    setSendError(null)
  }

  const closePreview = () => { setPreviewId(null); setSendError(null) }

  const toggleP = (id: string) => setCheckedPIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const sendCa = async (thread: ThreadScan) => {
    setSending(thread.message_id); setSendError(null)
    const chosen = thread.participants.filter(p => checkedPIds.has(p.open_id))
    try {
      const r = await fetch("/api/creator/ca-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          message_id: thread.message_id,
          thread_id: thread.thread_id,
          chat_id: chatId,
          content: thread.content,
          participants: chosen.map(p => p.open_id),
          participant_names: chosen.map(p => p.name),
          message_text: editText,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setSendError(d.error || "Lỗi khi gửi"); return }
      setSentIds(prev => new Set([...prev, thread.message_id]))
      setPreviewId(null)
      if (showHistory) loadHistory()  // refresh lịch sử nếu đang mở
    } catch (e: any) { setSendError(e.message) }
    finally { setSending(null) }
  }

  const loadHistory = async () => {
    setLoadingHist(true)
    try {
      const r = await fetch("/api/creator/ca-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "history", chat_id: chatId, limit: 30 }),
      })
      const d = await r.json()
      setHistory(d.history ?? [])
    } catch { setHistory([]) }
    finally { setLoadingHist(false) }
  }

  const toggleHistory = () => {
    const next = !showHistory
    setShowHistory(next)
    if (next && history === null) loadHistory()
  }

  const toDate = (ts: string) => new Date(parseInt(ts)).toLocaleDateString("vi-VN") // Lark create_time = ms
  const truncate = (s: string, n = 150) => s.length > n ? s.slice(0, n) + "…" : s

  return (
    <div className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-sky-50 bg-sky-50/50 flex items-center gap-3">
        <div className="w-8 h-8 bg-sky-600 rounded-xl flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Cà Thread Lark</h2>
          <p className="text-xs text-slate-400">Quét thread chưa có reaction YES — click Cà từng thread để nhắc</p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Lark connection */}
        {larkConnected === false && (
          <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700">Chưa kết nối tài khoản Lark cá nhân</p>
            </div>
            <a href="/api/lark/oauth/start"
              className="ml-3 shrink-0 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600">
              Kết nối Lark
            </a>
          </div>
        )}
        {larkConnected === true && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-700 font-medium">Đã kết nối — tin nhắn gửi bằng tài khoản Lark của bạn</p>
          </div>
        )}

        {/* Config view */}
        {!editing && configSaved && (
          <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cấu hình</span>
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium">
                <RefreshCw className="w-3 h-3" /> Sửa
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div><span className="text-slate-400">Chat ID: </span><span className="font-mono text-slate-700">{chatId}</span></div>
              <div><span className="text-slate-400">Emoji YES: </span><span className="text-slate-700">{emojiType}</span></div>
              <div><span className="text-slate-400">Quét: </span><span className="text-slate-700">{daysBack} ngày gần đây</span></div>
              {myOpenId && <div><span className="text-slate-400">Bỏ qua: </span><span className="font-mono text-slate-700">{myOpenId.slice(0, 12)}…</span></div>}
            </div>
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Chat ID của group Lark *</label>
                <input value={chatId} onChange={e => setChatId(e.target.value)}
                  placeholder="oc_xxxxxxxx"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Emoji type của YES reaction</label>
                <input value={emojiType} onChange={e => setEmojiType(e.target.value)}
                  placeholder="THUMBSUP"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400" />
                <p className="text-[11px] text-slate-400 mt-1">Hover vào emoji trong Lark để thấy tên</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Quét N ngày gần đây</label>
                <input type="number" min={1} max={30} value={daysBack} onChange={e => setDaysBack(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Open ID của bạn (bỏ qua, không tag)</label>
                <input value={myOpenId} onChange={e => setMyOpenId(e.target.value)}
                  placeholder="ou_xxxxxxxx"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={saveConfig} disabled={saving || !chatId.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-500 disabled:opacity-50 shadow-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Đang lưu..." : "Lưu & Đóng"}
              </button>
              {configSaved && (
                <button onClick={() => setEditing(false)}
                  className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl">
                  Huỷ
                </button>
              )}
            </div>
            <details>
              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">Hướng dẫn lấy Chat ID / Open ID</summary>
              <div className="mt-2 px-4 py-3 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-1.5 leading-relaxed">
                <p><strong>Chat ID</strong> — mở group Lark → nhấn tên group → Copy link → ID dạng <code className="bg-slate-100 px-1 rounded">oc_xxxxxxxx</code></p>
                <p><strong>Open ID của bạn</strong> — Lark Developer Console → tìm user → copy <code className="bg-slate-100 px-1 rounded">ou_xxxxxxxx</code></p>
                <p><strong>Emoji type</strong> — hover vào emoji reaction trong Lark → tooltip hiện tên (THUMBSUP, OK, YES...)</p>
              </div>
            </details>
          </div>
        )}

        {/* Scan button */}
        {!editing && configSaved && (
          <button onClick={scan} disabled={scanning}
            className="w-full flex items-center justify-center gap-2 py-3 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            {scanning ? `Đang quét ${daysBack} ngày gần đây…` : `Quét ${daysBack} ngày gần đây`}
          </button>
        )}

        {/* Scan error */}
        {scanError && (
          <div className="px-4 py-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{scanError}</div>
        )}

        {/* Thread list */}
        {threads !== null && (
          threads.length === 0
            ? <div className="text-center py-6 text-sm text-slate-400">Không có thread nào cần nhắc trong {daysBack} ngày qua 🎉</div>
            : <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    {threads.length} thread cần cà
                  </span>
                  {sentIds.size > 0 && (
                    <span className="text-xs text-emerald-600 font-medium">Đã cà {sentIds.size}/{threads.length}</span>
                  )}
                </div>
                {threads.map(t => (
                  <ThreadCard
                    key={t.message_id}
                    thread={t}
                    isSent={sentIds.has(t.message_id) || !!t.already_sent}
                    isPreviewing={previewId === t.message_id}
                    editText={editText}
                    checkedPIds={checkedPIds}
                    isSendingThis={sending === t.message_id}
                    sendError={previewId === t.message_id ? sendError : null}
                    onOpenPreview={() => openPreview(t)}
                    onClosePreview={closePreview}
                    onToggleP={toggleP}
                    onEditText={setEditText}
                    onSend={() => sendCa(t)}
                    toDate={toDate}
                    truncate={truncate}
                  />
                ))}
              </div>
        )}

        {/* Lịch sử cà */}
        {configSaved && !editing && (
          <div className="border-t border-slate-100 pt-3">
            <button onClick={toggleHistory}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
              {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Lịch sử cà {history !== null && `(${history.length})`}
            </button>
            {showHistory && (
              <div className="mt-3">
                {loadingHist ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />Đang tải…</div>
                ) : !history || history.length === 0 ? (
                  <div className="text-xs text-slate-400 py-2">Chưa có lịch sử cà nào.</div>
                ) : (
                  <div className="border border-slate-100 rounded-xl divide-y divide-slate-50 max-h-72 overflow-y-auto">
                    {history.map(h => (
                      <div key={h.id + h.sent_at} className="px-4 py-2.5 text-xs">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-emerald-600 font-medium">{new Date(h.sent_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                          <span className="text-slate-400">bởi @{h.sent_by}</span>
                          {h.participants.length > 0 && <span className="text-slate-400">· tag {h.participants.length} người</span>}
                        </div>
                        <p className="text-slate-500 break-words leading-relaxed">{h.content_snip || <span className="italic text-slate-300">(không có nội dung)</span>}</p>
                        {h.participants.length > 0 && (
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate">→ {h.participants.map((p: string) => `@${p}`).join(", ")}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ThreadCard({
  thread, isSent, isPreviewing, editText, checkedPIds, isSendingThis, sendError,
  onOpenPreview, onClosePreview, onToggleP, onEditText, onSend, toDate, truncate,
}: {
  thread: ThreadScan
  isSent: boolean
  isPreviewing: boolean
  editText: string
  checkedPIds: Set<string>
  isSendingThis: boolean
  sendError: string | null
  onOpenPreview: () => void
  onClosePreview: () => void
  onToggleP: (id: string) => void
  onEditText: (t: string) => void
  onSend: () => void
  toDate: (ts: string) => string
  truncate: (s: string, n?: number) => string
}) {
  const [showReplies, setShowReplies] = useState(false)
  const [showFull, setShowFull]       = useState(false)

  const previewMsg =
    thread.participants
      .filter(p => checkedPIds.has(p.open_id))
      .map(p => `@${p.name}`)
      .join(" ")
    + (thread.participants.some(p => checkedPIds.has(p.open_id)) ? " " : "")
    + editText

  return (
    <div className={cn("rounded-xl border overflow-hidden transition-all",
      isSent ? "border-emerald-100 bg-emerald-50/20 opacity-70" : "border-slate-200 bg-white"
    )}>
      {/* Thread info */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="text-[11px] text-slate-400">{toDate(thread.create_time)}</span>
              <span className="text-[11px] bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded font-medium">
                {thread.days_ago === 0 ? "hôm nay" : `${thread.days_ago} ngày trước`}
              </span>
              <span className="text-[11px] text-slate-400">{thread.replies.length} reply</span>
              {isSent && (
                <span className="text-[11px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-medium">
                  Đã cà ✓{thread.already_sent && thread.sent_at
                    ? ` ${new Date(thread.sent_at).toLocaleDateString("vi-VN")}${thread.sent_by ? ` · @${thread.sent_by}` : ""}`
                    : ""}
                </span>
              )}
            </div>

            {/* Content */}
            <p className="text-sm text-slate-700 leading-relaxed break-words">
              {showFull ? thread.content : truncate(thread.content)}
              {thread.content.length > 150 && (
                <button onClick={() => setShowFull(p => !p)}
                  className="ml-1.5 text-sky-500 text-xs hover:text-sky-700 font-medium">
                  {showFull ? "thu lại" : "xem thêm"}
                </button>
              )}
            </p>

            {/* Participants */}
            {thread.participants.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {thread.participants.map(p => (
                  <span key={p.open_id} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                    @{p.name.length > 15 ? p.name.slice(0, 15) + "…" : p.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-1.5 shrink-0 items-end">
            {!isSent && !isPreviewing && (
              <button onClick={onOpenPreview}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white text-xs font-bold rounded-lg hover:bg-sky-500 shadow-sm">
                <MessageSquare className="w-3.5 h-3.5" /> Cà
              </button>
            )}
            {isPreviewing && (
              <button onClick={onClosePreview}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                <XCircle className="w-4 h-4" />
              </button>
            )}
            {thread.replies.length > 0 && (
              <button onClick={() => setShowReplies(p => !p)}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 mt-1">
                {showReplies ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Replies
              </button>
            )}
          </div>
        </div>

        {/* Reply list */}
        {showReplies && thread.replies.length > 0 && (
          <div className="mt-3 pl-3 border-l-2 border-slate-100 space-y-2.5">
            {thread.replies.map((r, i) => (
              <div key={i} className="text-xs">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-semibold text-slate-700">{r.name}</span>
                  <span className="text-[10px] text-slate-400">{toDate(r.create_time)}</span>
                </div>
                <p className="text-slate-500 break-words leading-relaxed">{truncate(r.content, 100)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview & send panel */}
      {isPreviewing && (
        <div className="border-t border-sky-100 bg-sky-50/40 px-4 py-4 space-y-3">
          <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5 text-sky-500" />
            Preview tin nhắn sẽ gửi
          </div>

          {/* Participant toggles */}
          <div>
            <div className="text-[11px] text-slate-500 mb-1.5 font-medium">Người được tag (click để bật/tắt):</div>
            <div className="flex flex-wrap gap-1.5">
              {thread.participants.map(p => {
                const checked = checkedPIds.has(p.open_id)
                return (
                  <button key={p.open_id} onClick={() => onToggleP(p.open_id)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-lg border transition-all font-medium",
                      checked
                        ? "bg-sky-100 border-sky-300 text-sky-700"
                        : "bg-white border-slate-200 text-slate-400 line-through"
                    )}>
                    @{p.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Editable message text */}
          <div>
            <div className="text-[11px] text-slate-500 mb-1 font-medium">Nội dung tin nhắn (có thể sửa):</div>
            <textarea
              value={editText}
              onChange={e => onEditText(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none bg-white"
            />
          </div>

          {/* Preview box */}
          <div className="px-3 py-3 bg-white border border-sky-200 rounded-xl text-sm text-slate-800 break-words leading-relaxed">
            <div className="text-[10px] text-slate-400 font-medium mb-1.5">XEM TRƯỚC:</div>
            {previewMsg.trim()
              ? previewMsg
              : <span className="text-slate-300 italic text-xs">Chưa chọn người tag và chưa có nội dung</span>
            }
          </div>

          {sendError && (
            <div className="text-xs text-rose-600 px-1">{sendError}</div>
          )}

          <div className="flex gap-2">
            <button onClick={onSend} disabled={isSendingThis || !previewMsg.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-sky-600 text-white text-sm font-bold rounded-xl hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              {isSendingThis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSendingThis ? "Đang gửi…" : "Gửi ngay"}
            </button>
            <button onClick={onClosePreview}
              className="px-4 py-2 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50">
              Huỷ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
