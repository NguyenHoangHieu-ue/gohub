"use client"

import { useEffect, useState } from "react"
import { useSession }          from "next-auth/react"
import { useRouter }           from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts"
import { Activity, MessageSquare, Users, TrendingUp, Clock, Bot } from "lucide-react"

const DAYS_OPTIONS = [7, 14, 30, 90]
const COLORS = ["#003B95","#2563eb","#7c3aed","#059669","#d97706","#dc2626","#0891b2","#6b7280"]

const AGENT_LABELS: Record<string, string> = {
  "tu-van":      "Tư Vấn",
  "tra-cuu":     "Tra Cứu",
  "giai-dap":    "Giải Đáp",
  "gap-analysis":"Gap Analysis",
  "bi-analyst":  "BI Analyst",
  "template":    "Template",
  "data-explorer":"Data Explorer",
  "guardian":    "Guardian (chặn)",
  "clarify":     "Làm Rõ",
  "multi":       "Multi-Agent",
}

type Event = {
  id: number
  event_type: string
  page_path: string | null
  tab_key: string | null
  user_email: string | null
  user_role: string | null
  agent_id: string | null
  user_message: string | null
  created_at: string
}

export default function UsagePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [days, setDays]         = useState(30)
  const [events, setEvents]     = useState<Event[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (status === "loading") return
    if (!session || session.user.role !== "creator") { router.push("/analytics"); return }
  }, [session, status, router])

  useEffect(() => {
    if (!session || session.user.role !== "creator") return
    setLoading(true)
    fetch(`/api/analytics/usage-stats?days=${days}`)
      .then(r => r.json())
      .then(d => { setEvents(d.events || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [days, session])

  if (status === "loading" || !session) return null
  if (session.user.role !== "creator") return null

  // ── Compute stats ────────────────────────────────────────────────────────────
  const pageViews = events.filter(e => e.event_type === "page_view")
  const chats     = events.filter(e => e.event_type === "chat")

  // Tab frequency
  const tabCount: Record<string, number> = {}
  for (const e of pageViews) {
    const k = e.tab_key || e.page_path || "unknown"
    tabCount[k] = (tabCount[k] || 0) + 1
  }
  const tabChartData = Object.entries(tabCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([tab, count]) => ({ tab, count }))

  // User activity
  const userCount: Record<string, number> = {}
  for (const e of pageViews) {
    const u = e.user_email || "unknown"
    userCount[u] = (userCount[u] || 0) + 1
  }
  const topUsers = Object.entries(userCount).sort((a, b) => b[1] - a[1]).slice(0, 10)

  // Agent distribution
  const agentCount: Record<string, number> = {}
  for (const e of chats) {
    const a = e.agent_id || "unknown"
    agentCount[a] = (agentCount[a] || 0) + 1
  }
  const agentChartData = Object.entries(agentCount)
    .sort((a, b) => b[1] - a[1])
    .map(([id, value]) => ({ name: AGENT_LABELS[id] || id, value }))

  // Top questions
  const topQuestions = chats
    .filter(e => e.user_message)
    .reduce<{ msg: string; user: string; agent: string; count: number }[]>((acc, e) => {
      const existing = acc.find(x => x.msg === e.user_message)
      if (existing) { existing.count++; return acc }
      acc.push({ msg: e.user_message!, user: e.user_email || "?", agent: e.agent_id || "?", count: 1 })
      return acc
    }, [])
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  // Role breakdown
  const roleCount: Record<string, number> = {}
  for (const e of events) {
    const r = e.user_role || "unknown"
    roleCount[r] = (roleCount[r] || 0) + 1
  }

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Usage Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Tab visits + Chatbot activity — chỉ creator thấy</p>
        </div>
        <div className="flex gap-2">
          {DAYS_OPTIONS.map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium border transition-colors ${
                days === d ? "bg-[#003B95] text-white border-[#003B95]" : "bg-white text-slate-600 border-slate-200 hover:border-[#003B95]"
              }`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Activity,      label: "Page Views",    value: pageViews.length, color: "text-blue-600"  },
          { icon: MessageSquare, label: "Chat Messages",  value: chats.length,     color: "text-purple-600"},
          { icon: Users,         label: "Unique Users",   value: Object.keys(userCount).length, color: "text-emerald-600"},
          { icon: Bot,           label: "Agents Used",    value: Object.keys(agentCount).length, color: "text-orange-600"},
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <Icon className={`w-8 h-8 ${color}`} />
            <div>
              <div className="text-2xl font-bold text-slate-900">{loading ? "…" : value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab Usage Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#003B95]" /> Top tabs được xem nhiều nhất
        </h2>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400">Đang tải...</div>
        ) : tabChartData.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Chưa có dữ liệu</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tabChartData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="tab" width={160} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v} lần`, "Lượt xem"]} />
              <Bar dataKey="count" fill="#003B95" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Users */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" /> User hoạt động nhiều nhất
          </h2>
          {loading ? <div className="text-slate-400 text-sm">Đang tải...</div> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">User</th>
                <th className="pb-2 font-medium text-right">Lượt xem</th>
              </tr></thead>
              <tbody>
                {topUsers.map(([email, count], i) => (
                  <tr key={email} className="border-b border-slate-50">
                    <td className="py-2 text-slate-400 w-6">{i + 1}</td>
                    <td className="py-2 font-medium text-slate-800 truncate max-w-[180px]">{email}</td>
                    <td className="py-2 text-right font-bold text-[#003B95]">{count}</td>
                  </tr>
                ))}
                {topUsers.length === 0 && <tr><td colSpan={3} className="py-4 text-slate-400 text-center">Chưa có dữ liệu</td></tr>}
              </tbody>
            </table>
          )}
        </div>

        {/* Agent Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-600" /> Phân bố Agent Bé Gấu
          </h2>
          {loading ? <div className="text-slate-400 text-sm">Đang tải...</div> : agentChartData.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Chưa có dữ liệu</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={agentChartData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {agentChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v} lần`, "Số lần gọi"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Questions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-purple-600" /> Top câu hỏi thường gặp
        </h2>
        {loading ? <div className="text-slate-400 text-sm">Đang tải...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="pb-2 font-medium pr-4">#</th>
                <th className="pb-2 font-medium">Câu hỏi</th>
                <th className="pb-2 font-medium px-3">Agent</th>
                <th className="pb-2 font-medium px-3">User</th>
                <th className="pb-2 font-medium text-right">Lần</th>
              </tr></thead>
              <tbody>
                {topQuestions.map((q, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 text-slate-400 pr-4 w-6">{i + 1}</td>
                    <td className="py-2 text-slate-800 max-w-md">
                      <div className="truncate">{q.msg}</div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {AGENT_LABELS[q.agent] || q.agent}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-500 text-xs truncate max-w-[120px]">{q.user}</td>
                    <td className="py-2 text-right font-bold text-purple-600">{q.count}</td>
                  </tr>
                ))}
                {topQuestions.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-slate-400 text-center">Chưa có dữ liệu chat</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role breakdown + recent events */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-600" /> Hoạt động theo Role
          </h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium text-right">Events</th>
            </tr></thead>
            <tbody>
              {Object.entries(roleCount).sort((a,b)=>b[1]-a[1]).map(([role, count]) => (
                <tr key={role} className="border-b border-slate-50">
                  <td className="py-2 font-medium text-slate-800 capitalize">{role}</td>
                  <td className="py-2 text-right font-bold text-orange-600">{count}</td>
                </tr>
              ))}
              {Object.keys(roleCount).length === 0 && <tr><td colSpan={2} className="py-4 text-slate-400 text-center">Chưa có dữ liệu</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-600" /> Hoạt động gần đây (20 events)
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {events.slice(0, 20).map(e => (
              <div key={e.id} className="flex items-start gap-2 text-xs">
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-white font-medium ${e.event_type === "chat" ? "bg-purple-500" : "bg-blue-500"}`}>
                  {e.event_type === "chat" ? "💬" : "👁"}
                </span>
                <div className="min-w-0">
                  <span className="text-slate-500">{new Date(e.created_at).toLocaleTimeString("vi-VN", {hour:"2-digit",minute:"2-digit"})} </span>
                  <span className="font-medium text-slate-700">{e.user_email?.split("@")[0] || "?"}</span>
                  {e.event_type === "page_view" && <span className="text-slate-500"> → {e.tab_key}</span>}
                  {e.event_type === "chat" && <span className="text-slate-500 truncate"> hỏi: {e.user_message?.slice(0, 60)}</span>}
                </div>
              </div>
            ))}
            {events.length === 0 && !loading && <div className="text-slate-400 text-sm text-center py-4">Chưa có dữ liệu</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
