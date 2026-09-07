"use client"

import React, { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Crown, Save, RefreshCw, Eye, EyeOff, Shield, Cpu, Plus, Trash2, AlertTriangle, MessageSquare, CheckCircle, XCircle, Loader2, Send, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { ALL_ROLES, ROLE_LABELS } from "@/lib/agents/types"
import KbDocsSection from "./kb-docs-section"

// Tất cả tab/route có thể ẩn
const ALL_TABS = [
  { id: "chatbot",         label: "Bé Gấu (Chatbot)" },
  { id: "to-gau",          label: "Tổ Gấu (Chat + Tài liệu)" },
  { id: "promotions",      label: "Promotions" },
  { id: "skus",            label: "System SKUs" },
  { id: "ncc",             label: "NCC Catalog" },
  { id: "countries",       label: "Reference" },
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
  { id: "fulfillment",     label: "Inventory" },
  { id: "3hk-usage",       label: "3HK Usage" },
  { id: "cs-troubleshoot", label: "CS Troubleshoot" },
  { id: "products",        label: "Products (BI)" },
  { id: "targets",         label: "KPI / Targets" },
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
  const [previewRole, setPreviewRole] = useState<string | null>(null)

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  const allHiddenForRole = (role: string) => ALL_TABS.every(tab => isHidden(role, tab.id))
  const toggleAllForRole = (role: string) => {
    setVisibility(prev => ({
      ...prev,
      [role]: allHiddenForRole(role) ? [] : ALL_TABS.map(t => t.id),
    }))
  }

  const allHiddenForTab = (tabId: string) => ROLES_TO_MANAGE.every(role => isHidden(role, tabId))
  const toggleAllForTab = (tabId: string) => {
    const shouldHide = !allHiddenForTab(tabId)
    setVisibility(prev => {
      const next = { ...prev }
      for (const role of ROLES_TO_MANAGE) {
        const hidden = new Set(next[role] || [])
        shouldHide ? hidden.add(tabId) : hidden.delete(tabId)
        next[role] = Array.from(hidden)
      }
      return next
    })
  }

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
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => setPreviewRole(r)} className="hover:text-sky-600 hover:underline transition-colors" title="Xem trước role này thấy gì">
                          {ROLE_LABELS[r] ?? r}
                        </button>
                        <button onClick={() => toggleAllForRole(r)}
                          className={cn("w-5 h-5 rounded inline-flex items-center justify-center transition-all border", allHiddenForRole(r) ? "bg-rose-100 border-rose-200 text-rose-500" : "bg-slate-50 border-slate-200 text-slate-300 hover:bg-slate-100")}
                          title={allHiddenForRole(r) ? "Hiện tất cả tab cho role này" : "Ẩn tất cả tab cho role này"}>
                          {allHiddenForRole(r) ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ALL_TABS.map(tab => (
                  <tr key={tab.id} className="hover:bg-slate-50/30">
                    <td className="px-4 py-2 text-xs font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleAllForTab(tab.id)}
                          className={cn("w-5 h-5 rounded inline-flex items-center justify-center shrink-0 transition-all border", allHiddenForTab(tab.id) ? "bg-rose-100 border-rose-200 text-rose-500" : "bg-slate-50 border-slate-200 text-slate-300 hover:bg-slate-100")}
                          title={allHiddenForTab(tab.id) ? "Hiện tab này cho tất cả role" : "Ẩn tab này cho tất cả role"}>
                          {allHiddenForTab(tab.id) ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                        </button>
                        {tab.label}
                      </div>
                    </td>
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

      {/* Audit Log */}
      <AuditLogSection />

      {/* Cà Thread */}
      <CaThreadSection />

      {/* Upload tài liệu → AI đề xuất Wiki chính thức (gán nhóm trong Tổ Gấu) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-bold text-slate-800 mb-4">Tài liệu chính thức — Upload & AI đề xuất Wiki</h2>
        <KbDocsSection />
      </div>

      {/* Preview modal — xem trước role này thấy gì */}
      {previewRole && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreviewRole(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-80 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">Xem trước: {ROLE_LABELS[previewRole] ?? previewRole}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Tab role này thấy được (creator thấy tất cả)</p>
              </div>
              <button onClick={() => setPreviewRole(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
              {(() => {
                const visible = ALL_TABS.filter(tab => !isHidden(previewRole, tab.id))
                return visible.length === 0
                  ? <div className="text-center py-6 text-sm text-slate-400">Role này không thấy tab nào</div>
                  : <div className="space-y-1">{visible.map(tab => (
                      <div key={tab.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-700 bg-slate-50">
                        <Eye className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        {tab.label}
                      </div>
                    ))}</div>
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UserSearchInput({ value, onChange, onSelect, placeholder, wrapperClass, inputClass }: {
  value: string
  onChange: (v: string) => void
  onSelect: (username: string) => void
  placeholder?: string
  wrapperClass?: string
  inputClass?: string
}) {
  const [suggestions, setSuggestions] = useState<{ username: string; name: string; role: string }[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (value.length < 2) { setSuggestions([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(value)}`)
        const d = await r.json()
        setSuggestions(d.users ?? [])
        setOpen((d.users ?? []).length > 0)
      } catch { setSuggestions([]); setOpen(false) }
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value])

  return (
    <div className={cn("relative", wrapperClass)}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => e.key === "Escape" && setOpen(false)}
        placeholder={placeholder}
        className={inputClass}
      />
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(u => (
            <button key={u.username} onMouseDown={() => { onChange(u.username); onSelect(u.username); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
              <span className="font-medium text-slate-800">{u.name}</span>
              <span className="text-slate-400 text-xs">@{u.username}</span>
              <span className="ml-auto text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{u.role}</span>
            </button>
          ))}
        </div>
      )}
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
          <UserSearchInput
            value={newUsername}
            onChange={setNewUsername}
            onSelect={setNewUsername}
            placeholder="Tìm username hoặc tên…"
            wrapperClass="flex-1"
            inputClass="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400"
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
          <UserSearchInput
            value={newUsername}
            onChange={setNew}
            onSelect={setNew}
            placeholder="Tìm username hoặc tên…"
            wrapperClass="flex-1"
            inputClass="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
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

const TARGET_LABEL: Record<string, string> = { gp_access: "Gấu Pro", my_metrics_access: "My Metrics" }

function AuditLogSection() {
  const [logs, setLogs]       = useState<any[] | null>(null)
  const [show, setShow]       = useState(false)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/creator/access-audit-log?limit=30")
      const d = await r.json()
      setLogs(d.logs ?? [])
    } catch { setLogs([]) }
    finally { setLoading(false) }
  }

  const toggle = () => { const next = !show; setShow(next); if (next && logs === null) load() }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={toggle} className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-500 rounded-xl flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <h2 className="font-bold text-slate-800 text-sm">Audit Log — Cấp / Thu hồi quyền</h2>
            <p className="text-xs text-slate-400">30 thao tác gần nhất (Gấu Pro + My Metrics)</p>
          </div>
        </div>
        {show ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {show && (
        <div className="border-t border-slate-100 p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />Đang tải…
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-xs text-slate-400 py-4 text-center">Chưa có thao tác nào được ghi lại (cần chạy migration v41).</div>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 text-xs flex-wrap">
                  <span className={cn("px-1.5 py-0.5 rounded font-medium shrink-0", log.action === "add" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600")}>
                    {log.action === "add" ? "Cấp" : "Thu hồi"}
                  </span>
                  <span className="text-slate-400 shrink-0">{TARGET_LABEL[log.target_type] ?? log.target_type}</span>
                  <span className="font-medium text-slate-800">@{log.target_username}</span>
                  <span className="text-slate-400">bởi @{log.performed_by}</span>
                  <span className="ml-auto text-slate-300 shrink-0">
                    {new Date(log.performed_at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const DEFAULT_CA_TEXT = "Dạ thread này còn update thêm thông tin gì nữa không ạ a/c"

interface GroupConfig {
  chat_id: string
  emoji_type: string
  days_back: number
  my_open_id: string
  name?: string
}
const DEFAULT_GROUP: GroupConfig = { chat_id: "", emoji_type: "THUMBSUP", days_back: 7, my_open_id: "" }

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
  const [larkConnected, setLarkConnected] = useState<boolean | null>(null)
  const [groups, setGroups]               = useState<GroupConfig[]>([])
  const [selectedIdx, setSelectedIdx]     = useState(0)
  // editIdx: null=đóng, -1=thêm mới, >=0=sửa group tại vị trí đó
  const [editIdx, setEditIdx]             = useState<number | null>(null)
  const [draft, setDraft]                 = useState<GroupConfig>(DEFAULT_GROUP)
  const [saving, setSaving]               = useState(false)

  // scan
  const [scanning, setScanning]   = useState(false)
  const [threads, setThreads]     = useState<ThreadScan[] | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // per-thread cà preview
  const [previewId, setPreviewId]     = useState<string | null>(null)
  const [editText, setEditText]       = useState(DEFAULT_CA_TEXT)
  const [checkedPIds, setCheckedPIds] = useState<Set<string>>(new Set())
  const [sending, setSending]         = useState<string | null>(null)
  const [sentIds, setSentIds]         = useState<Set<string>>(new Set())
  const [sendError, setSendError]     = useState<string | null>(null)

  // history
  const [history, setHistory]         = useState<CaHistoryItem[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [loadingHist, setLoadingHist] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/lark/oauth/status").then(r => r.ok ? r.json() : null),
      fetch("/api/creator/ca-thread").then(r => r.ok ? r.json() : null),
    ]).then(([st, cfg]) => {
      setLarkConnected(st?.connected ?? false)
      const loaded: GroupConfig[] = (cfg?.groups ?? []).map((g: any) => ({
        chat_id: g.chat_id ?? "",
        emoji_type: g.emoji_type ?? "THUMBSUP",
        days_back: g.days_back ?? 7,
        my_open_id: g.my_open_id ?? "",
        name: g.name,
      }))
      setGroups(loaded)
      if (loaded.length === 0) { setDraft(DEFAULT_GROUP); setEditIdx(-1) }
    }).catch(() => { setLarkConnected(false); setDraft(DEFAULT_GROUP); setEditIdx(-1) })
  }, [])

  const activeGroup = groups[selectedIdx] ?? null

  const saveConfig = async () => {
    if (!draft.chat_id.trim()) return
    setSaving(true)
    try {
      const cleaned: GroupConfig = { ...draft, chat_id: draft.chat_id.trim(), my_open_id: draft.my_open_id.trim() }
      let newGroups: GroupConfig[]
      let newIdx = selectedIdx
      if (editIdx === -1) {
        newGroups = [...groups, cleaned]
        newIdx = newGroups.length - 1
      } else {
        newGroups = groups.map((g, i) => i === editIdx ? cleaned : g)
      }
      await fetch("/api/creator/ca-thread", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: newGroups }),
      })
      setGroups(newGroups)
      setSelectedIdx(newIdx)
      setEditIdx(null)
      setThreads(null)
      setScanError(null)
    } finally { setSaving(false) }
  }

  const deleteGroup = async (idx: number) => {
    const newGroups = groups.filter((_, i) => i !== idx)
    await fetch("/api/creator/ca-thread", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups: newGroups }),
    })
    const newIdx = Math.min(selectedIdx, Math.max(0, newGroups.length - 1))
    setGroups(newGroups)
    setSelectedIdx(newIdx)
    setEditIdx(newGroups.length === 0 ? -1 : null)
    if (newGroups.length === 0) setDraft(DEFAULT_GROUP)
    setThreads(null); setScanError(null)
  }

  const selectGroup = (idx: number) => {
    setSelectedIdx(idx); setThreads(null); setScanError(null)
    setPreviewId(null); setSentIds(new Set()); setHistory(null); setShowHistory(false)
  }

  const scan = async () => {
    if (!activeGroup) return
    setScanning(true); setScanError(null); setThreads(null)
    setPreviewId(null); setSentIds(new Set())
    try {
      const r = await fetch("/api/creator/ca-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan", chat_id: activeGroup.chat_id, emoji_type: activeGroup.emoji_type || "THUMBSUP", days_back: activeGroup.days_back, my_open_id: activeGroup.my_open_id || undefined, max_threads: 20 }),
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
    if (!activeGroup) return
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
          chat_id: activeGroup.chat_id,
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
      if (showHistory) loadHistory()
    } catch (e: any) { setSendError(e.message) }
    finally { setSending(null) }
  }

  const loadHistory = async () => {
    setLoadingHist(true)
    try {
      const r = await fetch("/api/creator/ca-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "history", chat_id: activeGroup?.chat_id, limit: 30 }),
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

  const toDate = (ts: string) => new Date(parseInt(ts)).toLocaleDateString("vi-VN")
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

        {/* Group selector (chỉ hiện khi có ≥2 group và không đang edit) */}
        {editIdx === null && groups.length > 1 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {groups.map((g, i) => (
              <button key={i} onClick={() => selectGroup(i)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                  i === selectedIdx
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-600"
                )}>
                {g.name || `Group ${i + 1}`}
              </button>
            ))}
            <button onClick={() => { setDraft(DEFAULT_GROUP); setEditIdx(-1) }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-400 hover:border-sky-400 hover:text-sky-600 transition-all">
              <Plus className="w-3 h-3 inline-block mr-1" />Thêm group
            </button>
          </div>
        )}

        {/* Config view */}
        {editIdx === null && activeGroup && (
          <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cấu hình</span>
              <div className="flex gap-3">
                <button onClick={() => { setDraft({ ...activeGroup }); setEditIdx(selectedIdx) }}
                  className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium">
                  <RefreshCw className="w-3 h-3" /> Sửa
                </button>
                {groups.length === 1 && (
                  <button onClick={() => { setDraft(DEFAULT_GROUP); setEditIdx(-1) }}
                    className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium">
                    <Plus className="w-3 h-3" /> Thêm group
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {activeGroup.name && <div className="col-span-2"><span className="text-slate-400">Tên: </span><span className="font-medium text-slate-700">{activeGroup.name}</span></div>}
              <div><span className="text-slate-400">Chat ID: </span><span className="font-mono text-slate-700">{activeGroup.chat_id}</span></div>
              <div><span className="text-slate-400">Emoji YES: </span><span className="text-slate-700">{activeGroup.emoji_type}</span></div>
              <div><span className="text-slate-400">Quét: </span><span className="text-slate-700">{activeGroup.days_back} ngày gần đây</span></div>
              {activeGroup.my_open_id && <div><span className="text-slate-400">Bỏ qua: </span><span className="font-mono text-slate-700">{activeGroup.my_open_id.slice(0, 12)}…</span></div>}
            </div>
          </div>
        )}

        {/* Chưa có group nào */}
        {editIdx === null && groups.length === 0 && (
          <div className="text-center py-4 text-sm text-slate-400">
            Chưa có group nào.{" "}
            <button onClick={() => { setDraft(DEFAULT_GROUP); setEditIdx(-1) }}
              className="text-sky-600 hover:text-sky-800 font-medium">
              + Thêm group đầu tiên
            </button>
          </div>
        )}

        {/* Form thêm / sửa group */}
        {editIdx !== null && (
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              {editIdx === -1 ? "Thêm group mới" : `Sửa group ${groups[editIdx]?.name ? `"${groups[editIdx].name}"` : editIdx + 1}`}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Tên group (tuỳ chọn, để nhận dạng)</label>
                <input value={draft.name ?? ""} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="VD: Group Cà Thread chính"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Chat ID của group Lark *</label>
                <input value={draft.chat_id} onChange={e => setDraft(d => ({ ...d, chat_id: e.target.value }))}
                  placeholder="oc_xxxxxxxx"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Emoji type của YES reaction</label>
                <input value={draft.emoji_type} onChange={e => setDraft(d => ({ ...d, emoji_type: e.target.value }))}
                  placeholder="THUMBSUP"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400" />
                <p className="text-[11px] text-slate-400 mt-1">Hover vào emoji trong Lark để thấy tên</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Quét N ngày gần đây</label>
                <input type="number" min={1} max={30} value={draft.days_back} onChange={e => setDraft(d => ({ ...d, days_back: Number(e.target.value) }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-600 block mb-1">Open ID của bạn (bỏ qua, không tag)</label>
                <input value={draft.my_open_id} onChange={e => setDraft(d => ({ ...d, my_open_id: e.target.value }))}
                  placeholder="ou_xxxxxxxx"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400" />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={saveConfig} disabled={saving || !draft.chat_id.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-500 disabled:opacity-50 shadow-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Đang lưu..." : "Lưu & Đóng"}
              </button>
              {groups.length > 0 && (
                <button onClick={() => setEditIdx(null)}
                  className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl">
                  Huỷ
                </button>
              )}
              {editIdx !== null && editIdx >= 0 && groups.length > 1 && (
                <button onClick={() => deleteGroup(editIdx)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-rose-500 hover:text-rose-700 border border-rose-200 hover:bg-rose-50 rounded-xl ml-auto">
                  <Trash2 className="w-3.5 h-3.5" /> Xóa group này
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
        {editIdx === null && activeGroup && (
          <button onClick={scan} disabled={scanning}
            className="w-full flex items-center justify-center gap-2 py-3 bg-sky-600 text-white rounded-xl text-sm font-bold hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            {scanning ? `Đang quét ${activeGroup.days_back} ngày gần đây…` : `Quét ${activeGroup.days_back} ngày gần đây`}
          </button>
        )}

        {/* Scan error */}
        {scanError && (
          <div className="px-4 py-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">{scanError}</div>
        )}

        {/* Thread list */}
        {threads !== null && (
          threads.length === 0
            ? <div className="text-center py-6 text-sm text-slate-400">Không có thread nào cần nhắc trong {activeGroup?.days_back ?? 7} ngày qua 🎉</div>
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
        {editIdx === null && activeGroup && (
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
