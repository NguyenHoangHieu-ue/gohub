"use client"

import React, { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Users, Shield, Check, Save, RefreshCw, ChevronDown, UserCog } from "lucide-react"
import { cn } from "@/lib/utils"

// Quản lý người dùng & phân quyền — UI theo gohub-intel UserManagement, backend web (Supabase users + app_settings).
// Mô hình phân quyền y hệt intel: role baseline (ma trận role×report) ∪ per-user allowedReports (cộng dồn, deny-by-default).

const REPORTS: { id: string; label: string }[] = [
  { id: "dashboard", label: "Dashboard" }, { id: "bod", label: "BOD Report" }, { id: "all-time", label: "All-Time" },
  { id: "channels", label: "Channels" }, { id: "b2b", label: "B2B" }, { id: "b2c", label: "B2C" },
  { id: "website", label: "Website" }, { id: "staff", label: "Staff" }, { id: "customers", label: "Customers" },
  { id: "vendors", label: "Vendors" }, { id: "orders", label: "Orders" }, { id: "fulfillment", label: "Fulfillment" },
  { id: "3hk-usage", label: "3HK Usage" }, { id: "cs-troubleshoot", label: "CS Troubleshoot" }, { id: "feedback", label: "Feedback" },
  { id: "products", label: "Products" }, { id: "targets", label: "Targets" }, { id: "sql", label: "SQL Explorer" },
]
const ROLES = ["admin", "bod", "staff"] as const
const MATRIX_ROLES = ["bod", "staff"] as const

interface User { username: string; name: string; email: string; role: string; department: string; allowed_analytics: string | null }

export default function UserManagementPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  useEffect(() => { if (status === "authenticated" && session?.user?.role !== "admin") router.push("/chatbot") }, [status, session, router])
  if (status !== "authenticated" || session?.user?.role !== "admin") return null
  return <UserManagement />
}

function roleBadge(role: string) {
  if (role === "admin") return "bg-amber-100 text-amber-700"
  if (role === "bod") return "bg-blue-100 text-blue-700"
  return "bg-teal-100 text-teal-700"
}

function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [matrix, setMatrix] = useState<Record<string, string[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [savingUser, setSavingUser] = useState<string | null>(null)
  const [savingMatrix, setSavingMatrix] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [uRes, mRes] = await Promise.all([fetch("/api/admin/users"), fetch("/api/config/role-permissions")])
      const uData = await uRes.json()
      setUsers((uData.users || []).map((u: any) => ({ ...u })))
      if (mRes.ok) setMatrix(await mRes.json())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchAll() }, [])

  const updateUser = (username: string, patch: Partial<User>) =>
    setUsers(prev => prev.map(u => u.username === username ? { ...u, ...patch } : u))

  const toggleUserReport = (u: User, id: string) => {
    const set = new Set((u.allowed_analytics || "").split(",").map(s => s.trim()).filter(Boolean))
    set.has(id) ? set.delete(id) : set.add(id)
    updateUser(u.username, { allowed_analytics: Array.from(set).join(",") })
  }

  const saveUser = async (u: User) => {
    setSavingUser(u.username)
    try {
      const res = await fetch(`/api/admin/users/${u.username}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: u.role, allowed_analytics: u.allowed_analytics || null }),
      })
      notify(res.ok, res.ok ? `Đã lưu ${u.name || u.username}` : "Lưu thất bại")
    } finally {
      setSavingUser(null)
    }
  }

  const toggleMatrix = (role: string, id: string) => {
    setMatrix(prev => {
      const cur = new Set(prev[role] || [])
      cur.has(id) ? cur.delete(id) : cur.add(id)
      return { ...prev, [role]: Array.from(cur) }
    })
  }
  const saveMatrix = async () => {
    setSavingMatrix(true)
    try {
      const res = await fetch("/api/config/role-permissions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(matrix),
      })
      notify(res.ok, res.ok ? "Đã lưu ma trận phân quyền" : "Lưu thất bại")
    } finally {
      setSavingMatrix(false)
    }
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#003B95] rounded-xl flex items-center justify-center"><Users className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
            <p className="text-slate-500 text-sm">Phân vai trò &amp; quyền truy cập báo cáo (deny-by-default · cộng dồn per-user)</p>
          </div>
        </div>
        <button onClick={fetchAll} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm">
          <RefreshCw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} />
        </button>
      </div>

      {msg && (
        <div className={cn("px-4 py-3 rounded-xl text-sm font-medium", msg.ok ? "bg-emerald-50 border border-emerald-100 text-emerald-700" : "bg-rose-50 border border-rose-100 text-rose-700")}>{msg.text}</div>
      )}

      {/* Role baseline matrix */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-[#003B95]" /><h2 className="font-bold text-slate-800">Quyền nền theo Role (Role × Report)</h2></div>
          <button onClick={saveMatrix} disabled={savingMatrix} className="flex items-center gap-2 px-4 py-2 bg-[#003B95] text-white rounded-xl text-xs font-bold hover:bg-[#002B70] transition-all disabled:opacity-50">
            {savingMatrix ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu ma trận
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-slate-500"><th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider">Report</th>{MATRIX_ROLES.map(r => <th key={r} className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider">{r}</th>)}<th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-amber-600">admin</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {REPORTS.map(rep => (
                <tr key={rep.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{rep.label}</td>
                  {MATRIX_ROLES.map(role => {
                    const on = (matrix[role] || []).includes(rep.id)
                    return (
                      <td key={role} className="px-4 py-2.5 text-center">
                        <button onClick={() => toggleMatrix(role, rep.id)} className={cn("w-6 h-6 rounded-md inline-flex items-center justify-center transition-all", on ? "bg-[#003B95] text-white" : "bg-slate-100 text-slate-300 hover:bg-slate-200")}>{on && <Check className="w-4 h-4" />}</button>
                      </td>
                    )
                  })}
                  <td className="px-4 py-2.5 text-center"><div className="w-6 h-6 rounded-md inline-flex items-center justify-center bg-amber-400 text-white"><Check className="w-4 h-4" /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2"><UserCog className="w-5 h-5 text-[#003B95]" /><h2 className="font-bold text-slate-800">Người dùng ({users.length})</h2></div>
        <div className="divide-y divide-slate-100">
          {loading ? <div className="p-12 flex justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div> : users.map(u => {
            const isExpanded = expanded === u.username
            const granted = new Set((u.allowed_analytics || "").split(",").map(s => s.trim()).filter(Boolean))
            return (
              <div key={u.username}>
                <div className={cn("px-6 py-4 flex flex-col md:flex-row md:items-center gap-3 hover:bg-slate-50/50 transition-colors", isExpanded && "bg-blue-50/20")}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm shrink-0">{(u.name || u.username).charAt(0).toUpperCase()}</div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{u.name || u.username}</p>
                      <p className="text-xs text-slate-400 truncate">{u.email || u.username}</p>
                    </div>
                  </div>
                  <span className={cn("px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider", roleBadge(u.role))}>{u.role}</span>
                  <select value={u.role} onChange={e => updateUser(u.username, { role: e.target.value })} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none">
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {u.role !== "admin" && (
                    <button onClick={() => setExpanded(isExpanded ? null : u.username)} className="flex items-center gap-1 text-xs font-bold text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50">
                      Report access ({granted.size})<ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-180")} />
                    </button>
                  )}
                  <button onClick={() => saveUser(u)} disabled={savingUser === u.username} className="flex items-center gap-1.5 px-4 py-1.5 bg-[#003B95] text-white rounded-lg text-xs font-bold hover:bg-[#002B70] transition-all disabled:opacity-50">
                    {savingUser === u.username ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu
                  </button>
                </div>
                {isExpanded && u.role !== "admin" && (
                  <div className="px-6 pb-5 pt-1 bg-blue-50/10">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Trang cấp THÊM cho user này (ngoài quyền nền role)</p>
                    <div className="flex flex-wrap gap-2">
                      {REPORTS.map(rep => {
                        const on = granted.has(rep.id)
                        const baseOn = (matrix[u.role] || []).includes(rep.id)
                        return (
                          <button key={rep.id} onClick={() => toggleUserReport(u, rep.id)} className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1", on ? "bg-[#003B95] text-white border-[#003B95]" : baseOn ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-white text-slate-500 border-slate-200 hover:border-blue-300")} title={baseOn ? "Đã có sẵn theo role" : ""}>
                            {on && <Check className="w-3 h-3" />}{rep.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
