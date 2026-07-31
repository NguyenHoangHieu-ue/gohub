"use client"

import { useEffect, useState, useMemo } from "react"
import { useSession }                    from "next-auth/react"
import { useRouter }                     from "next/navigation"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts"
import { Activity, MessageSquare, Users, Bot, Clock, Info } from "lucide-react"

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = ["#003B95","#2563eb","#7c3aed","#059669","#d97706","#dc2626","#0891b2","#6b7280"]

const AGENT_LABELS: Record<string, string> = {
  "tu-van":       "Tư Vấn",
  "tra-cuu":      "Tra Cứu",
  "giai-dap":     "Giải Đáp",
  "gap-analysis": "Gap Analysis",
  "bi-analyst":   "BI Analyst",
  "template":     "Template",
  "data-explorer":"Data Explorer",
  "guardian":     "Guardian (chặn)",
  "clarify":      "Làm Rõ",
  "multi":        "Multi-Agent",
}

const TAB_LABELS: Record<string, string> = {
  dashboard: "Dashboard", quarterly: "Quarter Report", bod: "BOD", "all-time": "All-Time",
  channels: "Channels", b2b: "B2B", b2c: "B2C", website: "Website", staff: "Staff",
  customers: "Customers", vendors: "Vendors", orders: "Orders", fulfillment: "Fulfillment",
  "3hk-usage": "3HK Usage", "cs-troubleshoot": "CS Troubleshoot", feedback: "Feedback",
  products: "Products BI", targets: "KPI/Target", sql: "SQL Explorer", scheduled: "Scheduled",
  chatbot: "Bé Gấu", kb: "Knowledge Base", skus: "System SKUs", ncc: "NCC Catalog",
  countries: "Reference", promotions: "Promotions", info: "Note",
  "creator": "Creator Settings", "creator/ai": "Gấu Pro",
  "creator/knowledge": "Own Info", "creator/devtools": "DevTools", "creator/usage": "Usage Analytics",
}

function toLabel(key: string) { return TAB_LABELS[key] || key }

function fmt(dt: string) {
  return new Date(dt).toLocaleString("vi-VN", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })
}

function today()    { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10)
}

// ── Types ────────────────────────────────────────────────────────────────────

type Event = {
  id: number
  event_type: string
  page_path:  string | null
  tab_key:    string | null
  user_email: string | null
  user_name:  string | null
  user_role:  string | null
  agent_id:   string | null
  user_message: string | null
  created_at: string
}

type TabMode = "overview" | "users" | "chatbot"

// ── Component ────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [fromDate, setFromDate] = useState(daysAgo(30))
  const [toDate,   setToDate]   = useState(today())
  const [events,   setEvents]   = useState<Event[]>([])
  const [loading,  setLoading]  = useState(true)
  const [mode,     setMode]     = useState<TabMode>("overview")

  // Auth guard
  useEffect(() => {
    if (status === "loading") return
    if (!session || session.user.role !== "creator") router.push("/analytics")
  }, [session, status, router])

  // Fetch
  useEffect(() => {
    if (!session || session.user.role !== "creator") return
    setLoading(true)
    fetch(`/api/analytics/usage-stats?from=${fromDate}&to=${toDate}`)
      .then(r => r.json())
      .then(d => { setEvents(d.events || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [fromDate, toDate, session])

  // ── Computed ───────────────────────────────────────────────────────────────

  const pageViews = useMemo(() => events.filter(e => e.event_type === "page_view"), [events])
  const chats     = useMemo(() => events.filter(e => e.event_type === "chat"),      [events])

  // Tab frequency
  const tabChartData = useMemo(() => {
    const cnt: Record<string, number> = {}
    for (const e of pageViews) { const k = e.tab_key || "?"; cnt[k] = (cnt[k] || 0) + 1 }
    return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,15)
      .map(([tab, count]) => ({ tab: toLabel(tab), raw: tab, count }))
  }, [pageViews])

  // Per-user stats: name, email, role, tabs visited, total views, chat count, last seen
  const userStats = useMemo(() => {
    const map: Record<string, { name: string; email: string; role: string; tabs: Set<string>; views: number; chats: number; lastSeen: string }> = {}
    for (const e of events) {
      const key = e.user_email || "unknown"
      if (!map[key]) map[key] = { name: e.user_name || key.split("@")[0], email: key, role: e.user_role || "?", tabs: new Set(), views: 0, chats: 0, lastSeen: e.created_at }
      else if (e.created_at > map[key].lastSeen) map[key].lastSeen = e.created_at
      if (e.event_type === "page_view") { map[key].views++; if (e.tab_key) map[key].tabs.add(e.tab_key) }
      if (e.event_type === "chat") map[key].chats++
    }
    return Object.values(map).sort((a,b) => (b.views + b.chats) - (a.views + a.chats))
  }, [events])

  // Per-user per-tab breakdown (for detail view)
  const userTabDetail = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const e of pageViews) {
      const u = e.user_email || "?"; const t = e.tab_key || "?"
      if (!map[u]) map[u] = {}
      map[u][t] = (map[u][t] || 0) + 1
    }
    return map
  }, [pageViews])

  // Agent distribution
  const agentData = useMemo(() => {
    const cnt: Record<string, number> = {}
    for (const e of chats) { const a = e.agent_id || "?"; cnt[a] = (cnt[a] || 0) + 1 }
    return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).map(([id, value]) => ({ name: AGENT_LABELS[id]||id, value }))
  }, [chats])

  // Top questions grouped by message content
  const topQuestions = useMemo(() => {
    const map: Record<string, { msg: string; users: Set<string>; agents: Set<string>; count: number; last: string }> = {}
    for (const e of chats) {
      if (!e.user_message) continue
      const k = e.user_message
      if (!map[k]) map[k] = { msg: k, users: new Set(), agents: new Set(), count: 0, last: e.created_at }
      map[k].count++
      map[k].users.add(e.user_email || "?")
      map[k].agents.add(e.agent_id || "?")
      if (e.created_at > map[k].last) map[k].last = e.created_at
    }
    return Object.values(map).sort((a,b)=>b.count-a.count).slice(0,25)
  }, [chats])

  // Recent chat log
  const recentChats = useMemo(() => chats.slice(0, 50), [chats])

  if (status === "loading" || !session) return null
  if (session.user.role !== "creator") return null

  // ── UI ─────────────────────────────────────────────────────────────────────

  const uniqueUsers = userStats.length

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">

      {/* ── Header + date range ── */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Usage Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ai vào tab nào · Bé Gấu hỏi gì · Chỉ creator thấy
          </p>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Mỗi lần xem tab được tính sau ≥15 giây ở lại trang, dedup 30 phút/user/tab
          </p>
        </div>

        {/* Date range picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-500 font-medium">Từ</label>
          <input type="date" value={fromDate} max={toDate}
            onChange={e => setFromDate(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#003B95]" />
          <label className="text-xs text-slate-500 font-medium">đến</label>
          <input type="date" value={toDate} min={fromDate} max={today()}
            onChange={e => setToDate(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#003B95]" />
          {/* Preset shortcuts */}
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => { setFromDate(daysAgo(d)); setToDate(today()) }}
              className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg hover:border-[#003B95] hover:text-[#003B95] transition-colors">
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Activity,      label: "Tab Views",     value: pageViews.length, sub: "đã dedup", color: "text-blue-600"   },
          { icon: MessageSquare, label: "Chat Messages", value: chats.length,     sub: "câu hỏi",  color: "text-purple-600" },
          { icon: Users,         label: "Unique Users",  value: uniqueUsers,      sub: "người dùng",color: "text-emerald-600"},
          { icon: Bot,           label: "Agents Used",   value: agentData.length, sub: "loại agent",color: "text-orange-600" },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <Icon className={`w-8 h-8 ${color} shrink-0`} />
            <div>
              <div className="text-2xl font-bold text-slate-900">{loading ? "…" : value}</div>
              <div className="text-xs text-slate-500">{label}</div>
              <div className="text-[10px] text-slate-400">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Mode tabs ── */}
      <div className="flex gap-1 border-b border-slate-200">
        {([["overview","Tổng quan"],["users","Theo User"],["chatbot","Chatbot"]] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              mode === m ? "border-[#003B95] text-[#003B95]" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW mode ── */}
      {mode === "overview" && (
        <div className="space-y-6">

          {/* Tab heatmap */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Tab được xem nhiều nhất</h2>
            <p className="text-xs text-slate-400 mb-4">Mỗi lần = 1 user ở lại trang ≥15s, không tính lại trong 30 phút tiếp theo</p>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
            ) : tabChartData.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Chưa có dữ liệu trong khoảng thời gian này</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, tabChartData.length * 28)}>
                <BarChart data={tabChartData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="tab" width={170} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v} lần xem`, "Lượt thực"]} />
                  <Bar dataKey="count" fill="#003B95" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Agent distribution + top users side by side */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Phân bố Agent Bé Gấu</h2>
              {loading ? <div className="text-slate-400 text-sm">Đang tải...</div>
              : agentData.length === 0 ? <div className="h-20 flex items-center justify-center text-slate-400 text-sm">Chưa có chat</div>
              : (
                <div className="flex gap-4 items-center">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={agentData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={false}>
                        {agentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v} lần`, "Gọi"]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1">
                    {agentData.map((a, i) => (
                      <div key={a.name} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="flex-1 truncate text-slate-700">{a.name}</span>
                        <span className="font-bold text-slate-900">{a.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-lg font-bold text-slate-900 mb-3">User hoạt động nhiều nhất</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100 text-xs">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Tên</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium text-right">Views</th>
                    <th className="pb-2 font-medium text-right">Chats</th>
                  </tr>
                </thead>
                <tbody>
                  {userStats.slice(0,8).map((u, i) => (
                    <tr key={u.email} className="border-b border-slate-50">
                      <td className="py-1.5 text-slate-400 text-xs w-5">{i+1}</td>
                      <td className="py-1.5">
                        <div className="font-medium text-slate-800 text-xs truncate max-w-[120px]">{u.name}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{u.email}</div>
                      </td>
                      <td className="py-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          u.role==="creator"?"bg-violet-50 text-violet-700":u.role==="admin"?"bg-blue-50 text-blue-700":"bg-slate-50 text-slate-600"
                        }`}>{u.role}</span>
                      </td>
                      <td className="py-1.5 text-right font-bold text-blue-600 text-sm">{u.views}</td>
                      <td className="py-1.5 text-right font-bold text-purple-600 text-sm">{u.chats}</td>
                    </tr>
                  ))}
                  {userStats.length === 0 && !loading && (
                    <tr><td colSpan={5} className="py-4 text-slate-400 text-center text-sm">Chưa có dữ liệu</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent activity feed */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-500" /> Hoạt động gần đây
            </h2>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {events.slice(0, 30).map(e => (
                <div key={e.id} className="flex items-center gap-2 text-xs py-1 border-b border-slate-50">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium text-white text-[10px] ${
                    e.event_type==="chat"?"bg-purple-500":"bg-blue-500"
                  }`}>
                    {e.event_type==="chat"?"💬":"👁"}
                  </span>
                  <span className="text-slate-400 shrink-0 w-20">{fmt(e.created_at)}</span>
                  <span className="font-semibold text-slate-800 shrink-0 max-w-[100px] truncate">
                    {e.user_name || e.user_email?.split("@")[0] || "?"}
                  </span>
                  {e.event_type==="page_view"
                    ? <span className="text-slate-500">→ <span className="font-medium">{toLabel(e.tab_key||"?")}</span></span>
                    : <span className="text-slate-500 truncate max-w-[300px]">hỏi: {e.user_message?.slice(0,80)}</span>
                  }
                </div>
              ))}
              {events.length===0 && !loading && (
                <div className="py-6 text-slate-400 text-center text-sm">Chưa có dữ liệu trong khoảng thời gian này</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── USERS mode ── */}
      {mode === "users" && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-slate-400 text-sm p-8 text-center">Đang tải...</div>
          ) : userStats.length === 0 ? (
            <div className="text-slate-400 text-sm p-8 text-center">Chưa có dữ liệu</div>
          ) : (
            userStats.map(u => (
              <div key={u.email} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* User header */}
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#003B95] to-blue-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    u.role==="creator"?"bg-violet-50 text-violet-700":u.role==="admin"?"bg-blue-50 text-blue-700":"bg-slate-50 text-slate-600"
                  }`}>{u.role}</span>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-blue-600">{u.views} views</div>
                    <div className="text-xs text-purple-500">{u.chats} chats</div>
                  </div>
                  <div className="text-right text-xs text-slate-400 shrink-0 hidden sm:block">
                    <div>Lần cuối</div>
                    <div className="font-medium">{fmt(u.lastSeen)}</div>
                  </div>
                </div>

                {/* Tab breakdown for this user */}
                <div className="px-5 py-3">
                  <div className="text-xs text-slate-500 mb-2 font-medium">Tab đã xem ({u.tabs.size} tab khác nhau):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(userTabDetail[u.email] || {})
                      .sort((a,b)=>b[1]-a[1])
                      .map(([tab, count]) => (
                        <span key={tab} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          {toLabel(tab)} <span className="font-bold">×{count}</span>
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── CHATBOT mode ── */}
      {mode === "chatbot" && (
        <div className="space-y-6">

          {/* Top questions */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Top câu hỏi thường gặp</h2>
            <p className="text-xs text-slate-400 mb-4">Gộp câu hỏi giống nhau — cho thấy nhu cầu phổ biến nhất</p>
            {loading ? <div className="text-slate-400 text-sm">Đang tải...</div>
            : topQuestions.length===0 ? <div className="py-6 text-slate-400 text-center text-sm">Chưa có chat</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100 text-xs">
                      <th className="pb-2 font-medium pr-3 w-8">#</th>
                      <th className="pb-2 font-medium">Câu hỏi</th>
                      <th className="pb-2 font-medium px-3">Agent</th>
                      <th className="pb-2 font-medium px-3">Ai hỏi</th>
                      <th className="pb-2 font-medium text-right">Số lần</th>
                      <th className="pb-2 font-medium text-right pl-3">Gần nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topQuestions.map((q, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 text-slate-400 pr-3">{i+1}</td>
                        <td className="py-2 max-w-sm">
                          <div className="text-slate-800">{q.msg.slice(0,120)}{q.msg.length>120?"…":""}</div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {[...q.agents].map(a => (
                              <span key={a} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                {AGENT_LABELS[a]||a}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {[...q.users].slice(0,3).map(u => (
                              <span key={u} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                {u.split("@")[0]}
                              </span>
                            ))}
                            {q.users.size>3 && <span className="text-[10px] text-slate-400">+{q.users.size-3}</span>}
                          </div>
                        </td>
                        <td className="py-2 text-right font-bold text-purple-600">{q.count}</td>
                        <td className="py-2 text-right text-xs text-slate-400 pl-3 whitespace-nowrap">{fmt(q.last)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent chat log full */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Log chat gần đây (50 tin nhắn)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100 text-xs">
                    <th className="pb-2 font-medium pr-3">Thời gian</th>
                    <th className="pb-2 font-medium pr-3">User</th>
                    <th className="pb-2 font-medium pr-3">Agent</th>
                    <th className="pb-2 font-medium">Câu hỏi</th>
                  </tr>
                </thead>
                <tbody>
                  {recentChats.map(e => (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">{fmt(e.created_at)}</td>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-slate-800 text-xs whitespace-nowrap">{e.user_name || e.user_email?.split("@")[0] || "?"}</div>
                        <div className="text-[10px] text-slate-400">{e.user_role}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          {AGENT_LABELS[e.agent_id||""]||e.agent_id||"?"}
                        </span>
                      </td>
                      <td className="py-2 text-slate-700 max-w-md">
                        <div className="truncate">{e.user_message || "—"}</div>
                      </td>
                    </tr>
                  ))}
                  {recentChats.length===0 && !loading && (
                    <tr><td colSpan={4} className="py-6 text-slate-400 text-center text-sm">Chưa có chat trong khoảng thời gian này</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
