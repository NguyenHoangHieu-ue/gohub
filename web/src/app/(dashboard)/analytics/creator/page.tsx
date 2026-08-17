"use client"

import React, { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Crown, Save, RefreshCw, Eye, EyeOff, Shield, Cpu, Plus, Trash2, AlertTriangle, MessageSquare, CheckCircle, XCircle, Loader2 } from "lucide-react"
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

function CaThreadSection() {
  const [larkConnected, setLarkConnected] = useState<boolean | null>(null)
  const [editing, setEditing]       = useState(false)   // false = view mode, true = edit form
  const [configSaved, setConfigSaved] = useState(false) // true = có config đã lưu

  // form fields
  const [chatId, setChatId]         = useState("")
  const [emojiType, setEmojiType]   = useState("THUMBSUP")
  const [daysBack, setDaysBack]     = useState(7)
  const [myOpenId, setMyOpenId]     = useState("")

  // run state
  const [dryRun, setDryRun]         = useState(false)
  const [running, setRunning]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [result, setResult]         = useState<any>(null)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/lark/oauth/status").then(r => r.ok ? r.json() : null),
      fetch("/api/creator/ca-thread").then(r => r.ok ? r.json() : null),
    ]).then(([status, cfg]) => {
      setLarkConnected(status?.connected ?? false)
      if (cfg?.chat_id) {
        setChatId(cfg.chat_id)
        setEmojiType(cfg.emoji_type ?? "THUMBSUP")
        setDaysBack(cfg.days_back ?? 7)
        setMyOpenId(cfg.my_open_id ?? "")
        setConfigSaved(true)
      } else {
        setEditing(true) // chưa có config → mở form ngay
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

  const run = async () => {
    setRunning(true); setResult(null); setError(null)
    try {
      const r = await fetch("/api/creator/ca-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, emoji_type: emojiType || "THUMBSUP", days_back: daysBack, my_open_id: myOpenId || undefined, dry_run: dryRun, max_threads: 20 }),
      })
      const d = await r.json()
      if (!r.ok) setError(d.error || "Lỗi không xác định")
      else setResult(d)
    } catch (e: any) { setError(e.message) }
    finally { setRunning(false) }
  }

  const toDate = (ts: string) => new Date(parseInt(ts) * 1000).toLocaleDateString("vi-VN")

  return (
    <div className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-sky-50 bg-sky-50/50 flex items-center gap-3">
        <div className="w-8 h-8 bg-sky-600 rounded-xl flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="font-bold text-slate-800">Cà Thread Lark</h2>
          <p className="text-xs text-slate-400">Quét thread chưa có reaction YES, tag người liên quan hỏi update</p>
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

        {/* VIEW MODE: config đã lưu, chỉ cần bấm Cà */}
        {!editing && configSaved && (
          <div className="space-y-4">
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

            {/* Dry run toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => setDryRun(p => !p)}>
              <div className={cn("w-9 h-5 rounded-full transition-colors relative flex-shrink-0", dryRun ? "bg-amber-400" : "bg-sky-500")}>
                <div className={cn("w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all shadow-sm", dryRun ? "left-[3px]" : "left-[18px]")} />
              </div>
              <span className="text-sm text-slate-700">
                {dryRun ? <><strong className="text-amber-600">Dry run</strong> — xem trước, không gửi</> : <><strong className="text-sky-600">Live</strong> — gửi thật</>}
              </span>
            </label>

            <button onClick={run} disabled={running}
              className="w-full flex items-center justify-center gap-2 py-3 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              {running ? "Đang quét..." : "Cà Thread"}
            </button>
          </div>
        )}

        {/* EDIT MODE: form nhập config */}
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

        {/* Error + Results (hiện ở cả 2 mode) */}
        {error && (
          <div className="px-4 py-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{error}</div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Root messages", value: result.scanned_root },
                { label: "Thread có reply", value: result.threads_found },
                { label: result.dry_run ? "Sẽ nhắc" : "Đã nhắc", value: result.dry_run ? result.results?.filter((r: any) => r.reminded_users.length > 0).length : result.reminded },
              ].map(s => (
                <div key={s.label} className="bg-slate-50 rounded-xl px-4 py-3 text-center border border-slate-100">
                  <div className="text-2xl font-bold text-slate-800">{s.value ?? 0}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            {result.results?.length > 0 && (
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-600">Chi tiết</div>
                <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                  {result.results.map((r: any) => (
                    <div key={r.message_id} className="px-4 py-2.5 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {r.has_yes ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                          : r.sent ? <CheckCircle className="w-4 h-4 text-sky-500" />
                          : <XCircle className="w-4 h-4 text-amber-400" />}
                      </div>
                      <div className="flex-1 min-w-0 text-xs text-slate-500">
                        <span className="font-mono text-[10px] bg-slate-100 px-1 rounded">{r.message_id.slice(-8)}</span>
                        {" "}{toDate(r.create_time)} · {r.reply_count} reply
                        {r.has_yes && <span className="ml-2 text-emerald-600 font-medium">✓ YES</span>}
                        {r.sent && <span className="ml-2 text-sky-600 font-medium">Đã gửi</span>}
                        {r.error && <span className="ml-2 text-rose-500">{r.error}</span>}
                        {!r.has_yes && r.reminded_users.length > 0 && (
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">Tag: {r.reminded_users.join(", ")}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.dry_run && <p className="text-xs text-amber-600 text-center">Dry run — bật Live rồi bấm Cà Thread lần nữa để gửi thật</p>}
          </div>
        )}
      </div>
    </div>
  )
}
