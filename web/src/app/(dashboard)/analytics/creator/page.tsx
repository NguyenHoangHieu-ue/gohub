"use client"

import React, { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Crown, Save, RefreshCw, Eye, EyeOff, Shield } from "lucide-react"
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
]

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
      setVisibility(vis || {})
      setSavedSnap(JSON.stringify(vis || {}))
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
          <p className="px-6 py-3 text-[11px] text-slate-400 border-t border-slate-100">
            <span className="inline-flex items-center gap-1 text-rose-500"><EyeOff className="w-3 h-3" />Đỏ = ẩn với role đó</span> · <span className="text-slate-400">Trắng = hiển thị bình thường</span>
          </p>
        </div>
      )}
    </div>
  )
}
