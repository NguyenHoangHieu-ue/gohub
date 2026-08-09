"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useSession }    from "next-auth/react"
import { useRouter }     from "next/navigation"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
  RadialBarChart, RadialBar,
} from "recharts"
import {
  Activity, MessageSquare, Users, Bot, Clock, Download,
  TrendingUp, Target, Star, Loader2, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, Info,
} from "lucide-react"
import { exportRawRows } from "@/lib/export-excel"

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ["#003B95","#2563eb","#7c3aed","#059669","#d97706","#dc2626","#0891b2","#6b7280"]
const SCORE_COLORS: Record<string, string> = {
  "5": "#059669", "4": "#2563eb", "3": "#d97706", "2": "#f97316", "1": "#dc2626",
}

const AGENT_LABELS: Record<string, string> = {
  "tu-van":"Tư Vấn","tra-cuu":"Tra Cứu","giai-dap":"Giải Đáp",
  "gap-analysis":"Gap Analysis","bi-analyst":"BI Analyst","template":"Template",
  "data-explorer":"Data Explorer","guardian":"Guardian (chặn)","clarify":"Làm Rõ",
  "multi":"Multi-Agent","be-gau":"Bé Gấu",
}

const TAB_LABELS: Record<string, string> = {
  dashboard:"Dashboard",quarterly:"Quarter Report",bod:"BOD","all-time":"All-Time",
  channels:"Channels",b2b:"B2B",b2c:"B2C",website:"Website",staff:"Staff",
  customers:"Customers",vendors:"Vendors",orders:"Orders",fulfillment:"Fulfillment",
  "3hk-usage":"3HK Usage","cs-troubleshoot":"CS Troubleshoot",feedback:"Feedback",
  products:"Products BI",targets:"KPI/Target",sql:"SQL Explorer",scheduled:"Scheduled",
  chatbot:"Bé Gấu",kb:"Knowledge Base",skus:"System SKUs",ncc:"NCC Catalog",
  countries:"Reference",promotions:"Promotions",info:"Note",
  "creator":"Creator","creator/ai":"Gấu Pro","creator/knowledge":"Own Info",
  "creator/devtools":"DevTools","creator/usage":"Usage Analytics",
}

function toLabel(key: string) { return TAB_LABELS[key] || key }
function fmt(dt: string) {
  return new Date(dt).toLocaleString("vi-VN", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })
}
function today()       { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10)
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Event = {
  id: number; event_type: string; page_path: string | null; tab_key: string | null
  user_email: string | null; user_name: string | null; user_role: string | null
  agent_id: string | null; user_message: string | null; ai_response: string | null
  created_at: string
}
type DailyStat    = { date: string; views: number; chats: number; total: number }
type WeeklyTasks  = { current: number; previous: number; target: number }
type QAPair       = { id: number; user_message: string; ai_response: string; user_name?: string; user_role?: string; created_at: string }
type Category     = { name: string; description: string; icon: string; count: number; questions: string[] }
type EvalScore    = { index: number; id: number; score: number; comment: string; category: string; user_message: string; ai_response: string; user_name?: string }
type EvalSummary  = { avg_score: number; strengths: string[]; improvements: string[]; overall: string }

type TabMode = "overview" | "users" | "chatbot" | "quality"

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color, badge, progress,
}: {
  icon: any; label: string; value: string | number; sub: string
  color: string; badge?: string; progress?: { value: number; max: number; color: string }
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start gap-3">
        <Icon className={`w-8 h-8 ${color} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold text-slate-900">{value}</div>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">{badge}</span>
            )}
          </div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-[10px] text-slate-400">{sub}</div>
        </div>
      </div>
      {progress && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>0</span><span>Target: {progress.max}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, (progress.value / progress.max) * 100)}%`, background: progress.color }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Score Badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const s = Math.round(score)
  const labels: Record<number, string> = { 5:"Xuất sắc", 4:"Tốt", 3:"Được", 2:"Yếu", 1:"Tệ" }
  const bg = SCORE_COLORS[String(s)] || "#6b7280"
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: bg }}>
      <Star className="w-3 h-3" /> {score.toFixed(1)} {labels[s] || ""}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [fromDate, setFromDate] = useState(daysAgo(30))
  const [toDate,   setToDate]   = useState(today())
  const [events,   setEvents]   = useState<Event[]>([])
  const [dailyStats,    setDailyStats]   = useState<DailyStat[]>([])
  const [weeklyTasks,   setWeeklyTasks]  = useState<WeeklyTasks | null>(null)
  const [qaPairs,       setQaPairs]      = useState<QAPair[]>([])
  const [qaPairsCount,  setQaPairsCount] = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [mode,     setMode]     = useState<TabMode>("overview")

  // Classify state
  const [classifying,      setClassifying]      = useState(false)
  const [categories,       setCategories]       = useState<Category[]>([])
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  // Evaluate state
  const [evaluating,  setEvaluating]  = useState(false)
  const [evalScores,  setEvalScores]  = useState<EvalScore[]>([])
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null)
  const [evalDist,    setEvalDist]    = useState<Record<string, number>>({})
  const [expandedScore, setExpandedScore] = useState<number | null>(null)

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
      .then(d => {
        setEvents(d.events || [])
        setDailyStats(d.dailyStats || [])
        setWeeklyTasks(d.weeklyTasks || null)
        setQaPairs(d.qaPairs || [])
        setQaPairsCount(d.qaPairsCount || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [fromDate, toDate, session])

  // Computed
  const pageViews = useMemo(() => events.filter(e => e.event_type === "page_view"), [events])
  const chats     = useMemo(() => events.filter(e => e.event_type === "chat"),      [events])

  const tabChartData = useMemo(() => {
    const cnt: Record<string, number> = {}
    for (const e of pageViews) { const k = e.tab_key || "?"; cnt[k] = (cnt[k] || 0) + 1 }
    return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,15)
      .map(([tab, count]) => ({ tab: toLabel(tab), count }))
  }, [pageViews])

  const agentData = useMemo(() => {
    const cnt: Record<string, number> = {}
    for (const e of chats) { const a = e.agent_id || "?"; cnt[a] = (cnt[a] || 0) + 1 }
    return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).map(([id, value]) => ({ name: AGENT_LABELS[id]||id, value }))
  }, [chats])

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

  const userTabDetail = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const e of pageViews) {
      const u = e.user_email || "?"; const t = e.tab_key || "?"
      if (!map[u]) map[u] = {}
      map[u][t] = (map[u][t] || 0) + 1
    }
    return map
  }, [pageViews])

  const topQuestions = useMemo(() => {
    const map: Record<string, { msg: string; users: Set<string>; agents: Set<string>; count: number; last: string }> = {}
    for (const e of chats) {
      if (!e.user_message) continue
      const k = e.user_message
      if (!map[k]) map[k] = { msg: k, users: new Set(), agents: new Set(), count: 0, last: e.created_at }
      map[k].count++; map[k].users.add(e.user_email || "?"); map[k].agents.add(e.agent_id || "?")
      if (e.created_at > map[k].last) map[k].last = e.created_at
    }
    return Object.values(map).sort((a,b)=>b.count-a.count).slice(0,50)
  }, [chats])

  // Score distribution chart data
  const distChartData = useMemo(() =>
    [5,4,3,2,1].map(s => ({
      score: `${s}★`,
      count: evalDist[String(s)] || 0,
      fill: SCORE_COLORS[String(s)],
    }))
  , [evalDist])

  // Classify handler
  const handleClassify = useCallback(async () => {
    if (topQuestions.length === 0) return
    setClassifying(true)
    try {
      const questions = topQuestions.map(q => q.msg)
      const r = await fetch("/api/analytics/usage-stats/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      })
      const d = await r.json()
      if (d.categories) setCategories(d.categories)
    } catch {}
    setClassifying(false)
  }, [topQuestions])

  // Evaluate handler
  const handleEvaluate = useCallback(async () => {
    if (qaPairs.length === 0) return
    setEvaluating(true)
    try {
      const r = await fetch("/api/analytics/usage-stats/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: qaPairs.slice(0, 30) }),
      })
      const d = await r.json()
      if (d.scores)      setEvalScores(d.scores)
      if (d.summary)     setEvalSummary(d.summary)
      if (d.distribution) setEvalDist(d.distribution)
    } catch {}
    setEvaluating(false)
  }, [qaPairs])

  // Export
  const handleExport = () => {
    if (!events.length) return
    exportRawRows(events.map(e => ({
      "Thời gian": fmt(e.created_at), "Loại": e.event_type === "chat" ? "Chat" : "Xem tab",
      "User": e.user_name || e.user_email || "?", "Định danh": e.user_email || "",
      "Role": e.user_role || "", "Tab": e.tab_key ? toLabel(e.tab_key) : "",
      "Agent": e.agent_id ? (AGENT_LABELS[e.agent_id] || e.agent_id) : "",
      "Câu hỏi": e.user_message || "",
    })), `usage_${fromDate}_to_${toDate}`, "Usage Events")
  }

  if (status === "loading" || !session) return null
  if (session.user.role !== "creator") return null

  const weekPct = weeklyTasks ? Math.round((weeklyTasks.current / weeklyTasks.target) * 100) : 0
  const weekDiff = weeklyTasks ? weeklyTasks.current - weeklyTasks.previous : 0
  const avgScore = evalSummary?.avg_score ?? 0

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Usage Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Ai vào tab nào · Bé Gấu hỏi gì · Đánh giá chất lượng AI · Chỉ creator thấy</p>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Tab view: dedup ≥15s/30 phút · Chat: lưu cả câu hỏi + câu trả lời Bé Gấu
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-500 font-medium">Từ</label>
          <input type="date" value={fromDate} max={toDate}
            onChange={e => setFromDate(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#003B95]" />
          <label className="text-xs text-slate-500 font-medium">đến</label>
          <input type="date" value={toDate} min={fromDate} max={today()}
            onChange={e => setToDate(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#003B95]" />
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => { setFromDate(daysAgo(d)); setToDate(today()) }}
              className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg hover:border-[#003B95] hover:text-[#003B95] transition-colors">
              {d}d
            </button>
          ))}
          <button onClick={handleExport} disabled={loading || events.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#003B95] text-white rounded-lg hover:bg-[#002B70] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Activity}      label="Tab Views"      value={loading?"…":pageViews.length} sub="đã dedup"      color="text-blue-600" />
        <KpiCard icon={MessageSquare} label="Chat Messages"  value={loading?"…":chats.length}     sub="câu hỏi Bé Gấu" color="text-purple-600" />
        <KpiCard icon={Users}         label="Unique Users"   value={loading?"…":userStats.length} sub="người dùng"    color="text-emerald-600" />
        <KpiCard icon={Bot}           label="Agents Used"    value={loading?"…":agentData.length} sub="loại agent"    color="text-orange-600" />
        <KpiCard
          icon={Target}
          label="Tasks/Tuần này"
          value={loading ? "…" : weeklyTasks?.current ?? 0}
          sub={`Target: ${weeklyTasks?.target ?? 50}/tuần (Q3 KPI)`}
          color={weekPct >= 100 ? "text-emerald-600" : weekPct >= 60 ? "text-amber-600" : "text-red-500"}
          badge={weekDiff >= 0 ? `+${weekDiff} vs tuần trước` : `${weekDiff} vs tuần trước`}
          progress={{ value: weeklyTasks?.current ?? 0, max: weeklyTasks?.target ?? 50, color: weekPct >= 100 ? "#059669" : weekPct >= 60 ? "#d97706" : "#dc2626" }}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          ["overview","Tổng quan"],
          ["users","Theo User"],
          ["chatbot","Chatbot"],
          ["quality","Chất lượng AI"],
        ] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              mode === m ? "border-[#003B95] text-[#003B95]" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {label}
            {m === "quality" && qaPairsCount > 0 && (
              <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-medium">
                {qaPairsCount} cặp
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {mode === "overview" && (
        <div className="space-y-6">

          {/* Weekly trend chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Hoạt động theo ngày</h2>
            <p className="text-xs text-slate-400 mb-4">Tab views + Chat messages mỗi ngày trong kỳ</p>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
            ) : dailyStats.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-slate-400 text-sm">Chưa có dữ liệu</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={d => `Ngày ${d}`} />
                  <Legend />
                  <Line type="monotone" dataKey="views" name="Tab Views" stroke="#003B95" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="chats" name="Chats" stroke="#7c3aed" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Tab heatmap */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Tab được xem nhiều nhất</h2>
            <p className="text-xs text-slate-400 mb-4">Mỗi lần = 1 user ở lại trang ≥15s, không tính lại trong 30 phút</p>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Đang tải...</div>
            ) : tabChartData.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-slate-400 text-sm">Chưa có dữ liệu</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, tabChartData.length * 28)}>
                <BarChart data={tabChartData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="tab" width={170} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v} lần`, "Lượt xem"]} />
                  <Bar dataKey="count" fill="#003B95" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Agent + Top users */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Phân bố Agent Bé Gấu</h2>
              {agentData.length === 0 ? (
                <div className="h-20 flex items-center justify-center text-slate-400 text-sm">Chưa có chat</div>
              ) : (
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
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${u.role==="creator"?"bg-violet-50 text-violet-700":u.role==="admin"?"bg-blue-50 text-blue-700":"bg-slate-50 text-slate-600"}`}>
                          {u.role}
                        </span>
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

          {/* Recent feed */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-500" /> Hoạt động gần đây
            </h2>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {events.slice(0, 30).map(e => (
                <div key={e.id} className="flex items-center gap-2 text-xs py-1 border-b border-slate-50">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium text-white text-[10px] ${e.event_type==="chat"?"bg-purple-500":"bg-blue-500"}`}>
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
                <div className="py-6 text-slate-400 text-center text-sm">Chưa có dữ liệu</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── USERS ── */}
      {mode === "users" && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-slate-400 text-sm p-8 text-center">Đang tải...</div>
          ) : userStats.length === 0 ? (
            <div className="text-slate-400 text-sm p-8 text-center">Chưa có dữ liệu</div>
          ) : (
            userStats.map(u => (
              <div key={u.email} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#003B95] to-blue-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role==="creator"?"bg-violet-50 text-violet-700":u.role==="admin"?"bg-blue-50 text-blue-700":"bg-slate-50 text-slate-600"}`}>
                    {u.role}
                  </span>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-blue-600">{u.views} views</div>
                    <div className="text-xs text-purple-500">{u.chats} chats</div>
                  </div>
                  <div className="text-right text-xs text-slate-400 shrink-0 hidden sm:block">
                    <div>Lần cuối</div><div className="font-medium">{fmt(u.lastSeen)}</div>
                  </div>
                </div>
                <div className="px-5 py-3">
                  <div className="text-xs text-slate-500 mb-2 font-medium">Tab đã xem ({u.tabs.size} tab):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(userTabDetail[u.email] || {}).sort((a,b)=>b[1]-a[1]).map(([tab, count]) => (
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

      {/* ── CHATBOT ── */}
      {mode === "chatbot" && (
        <div className="space-y-6">

          {/* Classify button + categories */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-slate-900">Top câu hỏi thường gặp</h2>
              <button
                onClick={handleClassify}
                disabled={classifying || topQuestions.length === 0}
                className="flex items-center gap-2 text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-40"
              >
                {classifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {classifying ? "Gấu Pro đang phân loại…" : "Phân loại với Gấu Pro"}
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">{topQuestions.length} câu hỏi · Bấm "Phân loại" để Gấu Pro gom thành nhóm chủ đề</p>

            {/* Categories (after classify) */}
            {categories.length > 0 && (
              <div className="mb-5 space-y-2">
                <div className="text-xs font-semibold text-slate-600 mb-2">Phân loại bởi Gấu Pro ({categories.length} nhóm):</div>
                {categories.map(cat => (
                  <div key={cat.name} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedCategory(expandedCategory === cat.name ? null : cat.name)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-xl">{cat.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 text-sm">{cat.name}</div>
                        <div className="text-xs text-slate-400">{cat.description}</div>
                      </div>
                      <span className="text-xs bg-[#003B95] text-white px-2 py-0.5 rounded-full font-bold">{cat.count}</span>
                      {expandedCategory === cat.name
                        ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    </button>
                    {expandedCategory === cat.name && (
                      <div className="border-t border-slate-100 px-4 py-3 space-y-1.5 bg-slate-50">
                        {cat.questions.map((q, i) => (
                          <div key={i} className="text-xs text-slate-700 flex items-start gap-2">
                            <span className="text-slate-400 shrink-0">{i+1}.</span>
                            <span className="truncate">{q.slice(0, 120)}{q.length > 120 ? "…" : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Raw top questions table */}
            {!classifying && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100 text-xs">
                      <th className="pb-2 font-medium pr-3 w-8">#</th>
                      <th className="pb-2 font-medium">Câu hỏi</th>
                      <th className="pb-2 font-medium px-3">Agent</th>
                      <th className="pb-2 font-medium text-right">Số lần</th>
                      <th className="pb-2 font-medium text-right pl-3">Gần nhất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topQuestions.slice(0, 25).map((q, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 text-slate-400 pr-3">{i+1}</td>
                        <td className="py-2 max-w-sm text-slate-800">{q.msg.slice(0,120)}{q.msg.length>120?"…":""}</td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {[...q.agents].map(a => (
                              <span key={a} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                {AGENT_LABELS[a]||a}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 text-right font-bold text-purple-600">{q.count}</td>
                        <td className="py-2 text-right text-xs text-slate-400 pl-3 whitespace-nowrap">{fmt(q.last)}</td>
                      </tr>
                    ))}
                    {topQuestions.length === 0 && !loading && (
                      <tr><td colSpan={5} className="py-6 text-slate-400 text-center text-sm">Chưa có chat</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Chat log */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Log chat gần đây</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100 text-xs">
                    <th className="pb-2 font-medium pr-3">Thời gian</th>
                    <th className="pb-2 font-medium pr-3">User</th>
                    <th className="pb-2 font-medium pr-3">Agent</th>
                    <th className="pb-2 font-medium">Câu hỏi</th>
                    <th className="pb-2 font-medium pl-2">Đã có trả lời</th>
                  </tr>
                </thead>
                <tbody>
                  {chats.slice(0, 50).map(e => (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">{fmt(e.created_at)}</td>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-slate-800 text-xs">{e.user_name || e.user_email?.split("@")[0] || "?"}</div>
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
                      <td className="py-2 pl-2">
                        {e.ai_response
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          : <AlertCircle className="w-4 h-4 text-slate-300" />}
                      </td>
                    </tr>
                  ))}
                  {chats.length === 0 && !loading && (
                    <tr><td colSpan={5} className="py-6 text-slate-400 text-center text-sm">Chưa có chat</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── QUALITY AI ── */}
      {mode === "quality" && (
        <div className="space-y-6">

          {/* Header + action */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Đánh giá chất lượng Bé Gấu</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Gấu Pro chấm điểm từng cặp Q&A của Bé Gấu · Thang điểm 1-5 · Kèm nhận xét
                </p>
                {qaPairsCount === 0 ? (
                  <div className="mt-3 flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Chưa có câu trả lời nào được ghi nhận trong kỳ này</div>
                      <div className="mt-1">Migration v32 ✅ đã chạy. Câu trả lời của Bé Gấu sẽ tự lưu kể từ lần chat tiếp theo.</div>
                      <div className="mt-1 font-medium">→ Chat vài tin với Bé Gấu tại <span className="underline">/chatbot</span>, rồi quay lại đây và bấm "Chấm điểm".</div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-emerald-600 font-medium">
                    ✅ {qaPairsCount} cặp Q&A có sẵn trong kỳ (sẽ đánh giá tối đa 30 cặp)
                  </div>
                )}
              </div>
              <button
                onClick={handleEvaluate}
                disabled={evaluating || qaPairsCount === 0}
                className="flex items-center gap-2 text-sm px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-40 shrink-0"
              >
                {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                {evaluating ? "Gấu Pro đang chấm…" : "Chấm điểm với Gấu Pro"}
              </button>
            </div>
          </div>

          {/* Results */}
          {evalScores.length > 0 && evalSummary && (
            <>
              {/* Summary cards + chart */}
              <div className="grid lg:grid-cols-3 gap-5">
                <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col items-center justify-center">
                  <div className="text-5xl font-black" style={{ color: SCORE_COLORS[String(Math.round(avgScore))] || "#6b7280" }}>
                    {avgScore.toFixed(1)}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Điểm trung bình</div>
                  <div className="flex gap-0.5 mt-2">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`w-5 h-5 ${s <= Math.round(avgScore) ? "text-amber-400 fill-amber-400" : "text-slate-200"}`} />
                    ))}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">{evalScores.length} câu đã chấm</div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-bold text-slate-900 mb-3">Phân bố điểm</h3>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={distChartData} margin={{ top: 4, bottom: 0 }}>
                      <XAxis dataKey="score" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => [`${v} câu`, "Số lượng"]} />
                      <Bar dataKey="count" radius={[4,4,0,0]}>
                        {distChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-emerald-600 mb-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Điểm mạnh
                    </div>
                    <ul className="space-y-1">
                      {evalSummary.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-slate-700">• {s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-amber-600 mb-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Cần cải thiện
                    </div>
                    <ul className="space-y-1">
                      {evalSummary.improvements.map((s, i) => (
                        <li key={i} className="text-xs text-slate-700">• {s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Overall */}
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-900">
                <div className="font-semibold mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Nhận xét tổng quan</div>
                <p>{evalSummary.overall}</p>
              </div>

              {/* Q&A scored table */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-base font-bold text-slate-900 mb-4">Chi tiết từng câu ({evalScores.length} cặp)</h3>
                <div className="space-y-3">
                  {evalScores.map((s, i) => (
                    <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedScore(expandedScore === i ? null : i)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        <ScoreBadge score={s.score} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-800 truncate">{s.user_message?.slice(0,100)}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{s.comment}</div>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{s.user_name || "?"}</span>
                        {expandedScore === i
                          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                      </button>
                      {expandedScore === i && (
                        <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-3">
                          <div>
                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Câu hỏi</div>
                            <div className="text-sm text-slate-800 bg-white border border-slate-200 rounded-lg p-3">{s.user_message}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Câu trả lời Bé Gấu</div>
                            <div className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap">{s.ai_response}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <ScoreBadge score={s.score} />
                            <span className="text-xs text-slate-600">{s.comment}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
