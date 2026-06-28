"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useSession, signOut }                        from "next-auth/react"
import { Send, Bot, User, Sparkles, Plus, Trash2, MessageSquare, Menu, X, PanelLeftClose, PanelLeftOpen, FileSpreadsheet } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Message } from "@/lib/agents/types"
import ChatChart from "@/components/chat-chart"

// sessionStorage keys
const SS_CONV_ID      = "gohub_conv_id"
const SS_CONV_USER    = "gohub_conv_user"
const SS_MESSAGES     = "gohub_messages"
const LS_CHAT_SIDEBAR = "gohub_chat_sidebar"

interface Conversation {
  id:         string
  title:      string
  created_at: string
  updated_at: string
}

interface StoredMessage extends Message {
  agent?: { id: string; name: string }
}

const AGENT_COLORS: Record<string, string> = {
  "tu-van":        "bg-brand-100 text-brand-700",
  "tra-cuu":       "bg-blue-100 text-blue-700",
  "giai-dap":      "bg-amber-100 text-amber-700",
  "gia-cogs":      "bg-green-100 text-green-700",
  "gap-analysis":  "bg-purple-100 text-purple-700",
  "tao-template":  "bg-emerald-100 text-emerald-700",
  "bi-analyst":    "bg-indigo-100 text-indigo-700",
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

function extractChartData(text: string): { chart: any; before: string; after: string } | null {
  const m = text.match(/```chart\s*([\s\S]*?)\s*```/)
  if (!m) return null
  try {
    const chart = JSON.parse(m[1])
    if (!chart.chart_type || !chart.data) return null
    const idx = text.indexOf("```chart")
    const end = text.indexOf("```", idx + 7) + 3
    return { chart, before: text.slice(0, idx).trim(), after: text.slice(end).trim() }
  } catch { return null }
}

// ─── Template action helpers ──────────────────────────────────────────────────

function extractTemplateAction(text: string): Record<string, any> | null {
  const m = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1])
    if (parsed.action === "generate_template") return parsed
  } catch {}
  return null
}

function TemplateDownloadButton({ action }: { action: Record<string, any> }) {
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)

  async function download() {
    setLoading(true)
    try {
      // Fetch FX settings
      const settingsRes = await fetch("/api/admin/settings")
      const settingsData = await settingsRes.json()
      const rows = settingsData.settings ?? []
      const get  = (key: string, def: number) => {
        const r = rows.find((s: any) => s.key === key)
        return r ? parseFloat(r.value) : def
      }
      const fxSettings = {
        fx_usd_vnd: get("fx.usd_vnd", 26394),
        fx_twd_usd: get("fx.twd_usd", 0.03165),
        fx_hkd_usd: get("fx.hkd_usd", 0.1282),
      }

      let body: Record<string, any>

      if (action.vendor === "3HK") {
        const { dailyGB = [], fixedGB = [], days = [3, 5, 7, 10, 15, 30], unlimitedEnabled = true, unlimThrottle = 5 } = action
        const sortedDays: number[] = [...days].sort((a, b) => a - b)
        const combos: any[] = []

        const getDP = (type: string, mb: number | null) =>
          type === "fixed" ? "F" : type === "daily" ? "P" : (mb === 10 ? "B" : "A")
        const calcCogs = (type: string, gb: number | null, d: number, mb: number | null) => {
          const price = action.zone_price ?? 5
          const hkd   = type === "fixed" ? (gb ?? 0) * price * 0.55
                      : type === "daily" ? (gb ?? 0) * d * price * 0.40
                      : (mb === 10 ? 1.8 : 1.6) * d * price * 0.40
          return Math.ceil(hkd * fxSettings.fx_hkd_usd * 100) / 100
        }

        for (const gb of [...dailyGB].sort((a: number, b: number) => a - b))
          for (const d of sortedDays)
            combos.push({ combo_type: "daily", data_gb: gb, days: d, throttle_mbps: null, data_policy_code: getDP("daily", null), vendor_sku: `3HK-D${gb}GB-${d}D`, cogs_usd: calcCogs("daily", gb, d, null), cogs_vnd: Math.ceil(calcCogs("daily", gb, d, null) * fxSettings.fx_usd_vnd) })
        for (const gb of [...fixedGB].sort((a: number, b: number) => a - b))
          for (const d of sortedDays)
            combos.push({ combo_type: "fixed", data_gb: gb, days: d, throttle_mbps: null, data_policy_code: getDP("fixed", null), vendor_sku: `3HK-F${gb}GB-${d}D`, cogs_usd: calcCogs("fixed", gb, d, null), cogs_vnd: Math.ceil(calcCogs("fixed", gb, d, null) * fxSettings.fx_usd_vnd) })
        if (unlimitedEnabled)
          for (const d of sortedDays)
            combos.push({ combo_type: "unlimited", data_gb: null, days: d, throttle_mbps: unlimThrottle, data_policy_code: getDP("unlimited", unlimThrottle), vendor_sku: `3HK-UNL${unlimThrottle}M-${d}D`, cogs_usd: calcCogs("unlimited", null, d, unlimThrottle), cogs_vnd: Math.ceil(calcCogs("unlimited", null, d, unlimThrottle) * fxSettings.fx_usd_vnd) })

        body = { vendor: "3HK", threeHKProducts: combos, config: action.config ?? {}, settings: fxSettings }
      } else {
        // WM: fetch products
        const { filters = {} } = action
        const sp = new URLSearchParams({ gap: "not_in_system", page: "1" })
        if (filters.country)  sp.set("search",    filters.country)
        if (filters.sim_type) sp.set("sim_type",  filters.sim_type)
        if (filters.data_type) sp.set("data_type", filters.data_type)
        const prodRes = await fetch(`/api/ncc/worldmove?${sp}`)
        const prodData = await prodRes.json()
        const products = prodData.data ?? []
        body = { vendor: "WM", products, config: action.config ?? {}, settings: fxSettings }
      }

      const res = await fetch("/api/admin/template", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) { alert("Hiếu đang fix, vui lòng đợi"); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `template_${action.vendor}_${action.config?.supportCountryCode ?? "XX"}_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setDone(true)
    } catch {
      alert("Hiếu đang fix, vui lòng đợi")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={download}
      disabled={loading || done}
      className={`mt-3 flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
        done ? "bg-green-100 text-green-700 border border-green-200"
             : "bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
      }`}
    >
      <FileSpreadsheet size={15} />
      {loading ? "Đang tạo file..." : done ? "Đã tải xuống" : "Tải file template Excel"}
    </button>
  )
}

// Nhóm theo năng lực (chunking — giúp user hiểu bot làm được những nhóm việc gì)
const QUICK_GROUPS = [
  { label: "Tìm sản phẩm GoHub", prompts: [
    "Tìm gói eSIM đi Nhật 7 ngày",
    "Có gói unlimited đi Thái Lan không?",
  ]},
  { label: "Catalog nhà cung cấp (NCC)", prompts: [
    "WM có gói gì cho Hàn Quốc?",
    "WM có sản phẩm nào chưa tạo trong hệ thống?",
  ]},
  { label: "Doanh thu & đơn hàng", prompts: [
    "Doanh thu tháng này bao nhiêu?",
    "Top 5 kênh bán doanh thu cao nhất tháng này",
  ]},
  { label: "Giải đáp hệ thống", prompts: [
    "Giải thích cấu trúc mã SKU",
  ]},
]

function groupConversations(convs: Conversation[]) {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yest  = today - 86400000
  const week  = today - 6 * 86400000

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Hôm nay",  items: [] },
    { label: "Hôm qua",  items: [] },
    { label: "Tuần này", items: [] },
    { label: "Cũ hơn",   items: [] },
  ]

  for (const c of convs) {
    const t = new Date(c.updated_at).getTime()
    if      (t >= today) groups[0].items.push(c)
    else if (t >= yest)  groups[1].items.push(c)
    else if (t >= week)  groups[2].items.push(c)
    else                 groups[3].items.push(c)
  }

  return groups.filter(g => g.items.length > 0)
}

export default function ChatbotPage() {
  const { data: session } = useSession()
  const userName = session?.user?.name || ""
  const userRole = (session?.user as any)?.role || "staff"

  const [conversations,  setConversations] = useState<Conversation[]>([])
  const [activeConvId,   setActiveConvId]  = useState<string | null>(null)
  const [messages,       setMessages]      = useState<StoredMessage[]>([])
  const [input,          setInput]         = useState("")
  const [loading,        setLoading]       = useState(false)
  const [streaming,      setStreaming]      = useState(false)
  const [agentName,      setAgentName]     = useState<string | null>(null)
  const [deletingId,     setDeletingId]    = useState<string | null>(null)
  const [mobileDrawer,   setMobileDrawer]  = useState(false)
  const [chatSidebar,    setChatSidebar]   = useState(true)   // desktop: show/hide conv list

  const bottomRef   = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const msgCountRef = useRef(0)  // track message count for isFirst detection

  const busy = loading || streaming

  const toggleChatSidebar = useCallback(() => {
    setChatSidebar(prev => {
      const next = !prev
      try { localStorage.setItem(LS_CHAT_SIDEBAR, next ? "1" : "0") } catch {}
      return next
    })
  }, [])

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const saveToSS = useCallback((convId: string, msgs: StoredMessage[]) => {
    try {
      sessionStorage.setItem(SS_CONV_ID,   convId)
      sessionStorage.setItem(SS_CONV_USER, userName)
      sessionStorage.setItem(SS_MESSAGES,  JSON.stringify(msgs))
    } catch {}
  }, [userName])

  const saveMessage = useCallback((convId: string, msg: StoredMessage, isFirst = false) => {
    fetch(`/api/chat/conversations/${convId}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        role:       msg.role,
        content:    msg.content,
        agent_id:   msg.agent?.id,
        agent_name: msg.agent?.name,
        isFirst,
      }),
    }).catch(() => {})
  }, [])

  const createConversation = useCallback(async (): Promise<string | null> => {
    try {
      const res  = await fetch("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const conv = await res.json()
      setConversations(prev => [conv, ...prev])
      return conv.id as string
    } catch { return null }
  }, [])

  const loadConversations = useCallback(async () => {
    try {
      const res  = await fetch("/api/chat/conversations")
      const data = await res.json()
      setConversations(Array.isArray(data) ? data : [])
    } catch {}
  }, [])

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res  = await fetch(`/api/chat/conversations/${convId}`)
      const data = await res.json()
      if (!Array.isArray(data)) return
      const msgs: StoredMessage[] = data.map((m: any) => ({
        role:    m.role,
        content: m.content,
        agent:   m.agent_id ? { id: m.agent_id, name: m.agent_name ?? m.agent_id } : undefined,
      }))
      setMessages(msgs)
      msgCountRef.current = msgs.length
      saveToSS(convId, msgs)
    } catch {}
  }, [saveToSS])

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userName || initialized.current) return
    initialized.current = true

    try {
      setChatSidebar(localStorage.getItem(LS_CHAT_SIDEBAR) !== "0")
    } catch {}

    loadConversations()

    // Restore session if same user
    try {
      const ssUser = sessionStorage.getItem(SS_CONV_USER)
      const ssId   = sessionStorage.getItem(SS_CONV_ID)
      const ssMsgs = sessionStorage.getItem(SS_MESSAGES)

      if (ssUser === userName && ssId && ssMsgs) {
        const msgs = JSON.parse(ssMsgs) as StoredMessage[]
        setMessages(msgs)
        setActiveConvId(ssId)
        msgCountRef.current = msgs.length
        return
      }
    } catch {}

    // No valid session — start fresh (don't auto-create until first message)
  }, [userName, loadConversations])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  // ─── Switch conversation ──────────────────────────────────────────────────

  const switchConversation = useCallback(async (conv: Conversation) => {
    if (conv.id === activeConvId) return
    setActiveConvId(conv.id)
    setMessages([])
    setInput("")
    await loadMessages(conv.id)
  }, [activeConvId, loadMessages])

  // ─── New conversation ─────────────────────────────────────────────────────

  const startNew = useCallback(() => {
    setActiveConvId(null)
    setMessages([])
    msgCountRef.current = 0
    try {
      sessionStorage.removeItem(SS_CONV_ID)
      sessionStorage.removeItem(SS_MESSAGES)
    } catch {}
  }, [])

  // ─── Delete conversation ──────────────────────────────────────────────────

  const deleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingId(convId)
    try {
      await fetch(`/api/chat/conversations/${convId}`, { method: "DELETE" })
      setConversations(prev => prev.filter(c => c.id !== convId))
      if (activeConvId === convId) startNew()
    } finally {
      setDeletingId(null)
    }
  }, [activeConvId, startNew])

  // ─── Send ─────────────────────────────────────────────────────────────────

  const send = async (content: string) => {
    if (!content.trim() || busy) return

    // Ensure conversation exists
    let convId = activeConvId
    if (!convId) {
      convId = await createConversation()
      if (!convId) return
      setActiveConvId(convId)
    }

    const isFirstMsg = msgCountRef.current === 0

    const userMsg: StoredMessage = { role: "user", content }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput("")
    setLoading(true)
    setAgentName(null)
    msgCountRef.current = next.length

    saveMessage(convId, userMsg, isFirstMsg)
    saveToSS(convId, next)

    let streamStarted   = false
    let currentAgent: { id: string; name: string } | undefined

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })), userName }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Lỗi không xác định" }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No stream")

      const decoder     = new TextDecoder()
      let assistantText = ""
      setLoading(false)
      setStreaming(true)
      streamStarted = true

      setMessages(prev => [...prev, { role: "assistant", content: "" }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })

        if (chunk.startsWith("__AGENT__:")) {
          const line  = chunk.split("\n")[0]
          const parts = line.replace("__AGENT__:", "").split(":")
          currentAgent = { id: parts[0], name: parts.slice(1).join(":") }
          setAgentName(currentAgent.name)
          const rest = chunk.slice(line.length + 1)
          if (rest) {
            assistantText += rest
            setMessages(prev => {
              const u = [...prev]
              u[u.length - 1] = { role: "assistant", content: assistantText, agent: currentAgent }
              return u
            })
          }
          continue
        }

        assistantText += chunk
        setMessages(prev => {
          const u = [...prev]
          u[u.length - 1] = { role: "assistant", content: assistantText, agent: currentAgent }
          return u
        })
      }

      // Save complete assistant message
      const assistantMsg: StoredMessage = { role: "assistant", content: assistantText, agent: currentAgent }
      saveMessage(convId, assistantMsg)

      const finalMsgs = [...next, assistantMsg]
      msgCountRef.current = finalMsgs.length
      saveToSS(convId, finalMsgs)

      // Update conversation title in list if first message
      if (isFirstMsg) {
        const title = content.slice(0, 50) + (content.length > 50 ? "…" : "")
        setConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, title, updated_at: new Date().toISOString() } : c
        ))
      } else {
        setConversations(prev => {
          const idx = prev.findIndex(c => c.id === convId)
          if (idx === -1) return prev
          const updated = { ...prev[idx], updated_at: new Date().toISOString() }
          return [updated, ...prev.filter(c => c.id !== convId)]
        })
      }

    } catch (e: any) {
      const errMsg = userRole === "admin" ? `Lỗi: ${e.message}` : "Hiếu đang fix, vui lòng đợi 🔧"
      if (streamStarted) {
        setMessages(prev => {
          const u = [...prev]
          u[u.length - 1] = { role: "assistant", content: errMsg }
          return u
        })
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: errMsg }])
      }
    } finally {
      setLoading(false)
      setStreaming(false)
      setAgentName(null)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const groups = groupConversations(conversations)

  const ConvList = ({ onSelect }: { onSelect?: () => void }) => (
    <>
      <div className="p-3 border-b border-gray-200">
        <button
          onClick={() => { startNew(); onSelect?.() }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors"
        >
          <Plus size={15} />
          Cuộc trò chuyện mới
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {conversations.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-6 px-3">Chưa có cuộc trò chuyện nào</p>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-2 mb-1">
                {group.label}
              </p>
              {group.items.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => { switchConversation(conv); onSelect?.() }}
                  className={`group flex items-start gap-1 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                    conv.id === activeConvId
                      ? "bg-brand-100 text-brand-800"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  <MessageSquare size={13} className="flex-shrink-0 mt-0.5 text-gray-400" />
                  <span className="flex-1 text-xs leading-snug line-clamp-2">{conv.title}</span>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    disabled={deletingId === conv.id}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 text-gray-400 hover:text-red-500 transition-all disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  )

  return (
    <div className="flex" style={{ height: "100vh" }}>

      {/* ── Mobile drawer overlay ── */}
      {mobileDrawer && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setMobileDrawer(false)}
        />
      )}

      {/* ── Conversation list — desktop sidebar / mobile drawer ── */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-40
        w-64 bg-gray-50 border-r border-gray-200
        flex flex-col flex-shrink-0
        transform transition-all duration-200 ease-in-out
        ${mobileDrawer ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        ${!chatSidebar ? "md:w-0 md:border-0 md:overflow-hidden" : "md:w-56"}
      `}>
        {/* Mobile drawer header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 md:hidden">
          <span className="text-sm font-semibold text-gray-700">Lịch sử trò chuyện</span>
          <button onClick={() => setMobileDrawer(false)} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <ConvList onSelect={() => setMobileDrawer(false)} />
      </div>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col min-w-0 p-3 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 md:mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileDrawer(true)}
              title="Lịch sử trò chuyện"
              className="md:hidden p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Menu size={18} />
            </button>
            {/* Desktop toggle */}
            <button
              onClick={toggleChatSidebar}
              title={chatSidebar ? "Thu gọn lịch sử" : "Mở lịch sử trò chuyện"}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5
                text-xs font-medium text-gray-500
                bg-white border border-gray-200 rounded-lg shadow-sm
                hover:text-brand-600 hover:border-brand-300 hover:bg-brand-50
                transition-all duration-150"
            >
              {chatSidebar
                ? <><PanelLeftClose size={15} /><span>Thu gọn</span></>
                : <><PanelLeftOpen  size={15} /><span>Lịch sử</span></>
              }
            </button>
            <Sparkles size={20} className="text-brand-600" />
            <h1 className="text-lg md:text-xl font-bold text-gray-900">Bé Gấu</h1>
          </div>
          <div className="flex items-center gap-2">
            {agentName && (
              <span className="text-xs text-gray-400 animate-pulse hidden sm:block">
                {agentName} đang xử lý...
              </span>
            )}
          </div>
        </div>

        {/* Chat container */}
        <div className="flex-1 bg-gray-50/80 border border-gray-200 rounded-2xl flex flex-col overflow-hidden min-h-0 shadow-sm">
          <div className="flex-1 overflow-y-auto p-3 md:p-5 space-y-4">

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center py-10">
                <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-brand-600/25">
                  <Sparkles size={22} className="text-white" />
                </div>
                <p className="font-semibold text-gray-900 text-base mb-1">Bé Gấu</p>
                <p className="text-sm text-gray-500 mb-7 max-w-sm leading-relaxed">
                  Tìm sản phẩm, tra cứu SKU & giá, xem catalog NCC, và phân tích doanh thu/đơn hàng.
                </p>
                <div className="w-full max-w-lg space-y-3 text-left">
                  {QUICK_GROUPS.map(group => (
                    <div key={group.label}>
                      <p className="px-1 pb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{group.label}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {group.prompts.map(q => (
                          <button key={q} onClick={() => send(q)}
                            className="text-left px-3.5 py-2.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50/50 transition-all shadow-sm">
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-brand-600/20">
                    <Bot size={14} className="text-white" />
                  </div>
                )}
                <div className="flex flex-col gap-1 max-w-[85%] md:max-w-[72%]">
                  {msg.role === "assistant" && msg.agent && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-md self-start font-medium tracking-wide ${AGENT_COLORS[msg.agent.id] ?? "bg-gray-100 text-gray-600"}`}>
                      {msg.agent.name}
                    </span>
                  )}
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-brand-600 text-white rounded-tr-sm shadow-sm"
                      : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm"
                  }`}>
                    {msg.role === "user" ? (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : (() => {
                      // Extract chart block from bi-analyst messages
                      const chartResult = msg.agent?.id === "bi-analyst"
                        ? extractChartData(msg.content) : null

                      const renderMarkdown = (text: string) => (
                        <div className="markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                            p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                            em:     ({ children }) => <em className="italic">{children}</em>,
                            ul:     ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2">{children}</ul>,
                            ol:     ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2">{children}</ol>,
                            li:     ({ children }) => <li className="text-gray-700">{children}</li>,
                            h1:     ({ children }) => <p className="font-bold text-base mb-1">{children}</p>,
                            h2:     ({ children }) => <p className="font-semibold mb-1">{children}</p>,
                            h3:     ({ children }) => <p className="font-semibold mb-1">{children}</p>,
                            hr:     () => <hr className="my-2 border-gray-300" />,
                            code:   ({ children }) => <code className="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                            table:  ({ children }) => <div className="overflow-x-auto mb-3 rounded-lg border border-gray-200 shadow-sm"><table className="text-xs border-collapse w-full">{children}</table></div>,
                            thead:  ({ children }) => <thead className="bg-gray-100 text-gray-600">{children}</thead>,
                            tbody:  ({ children }) => <tbody className="divide-y divide-gray-100">{children}</tbody>,
                            tr:     ({ children }) => <tr className="hover:bg-gray-50 transition-colors">{children}</tr>,
                            th:     ({ children }) => <th className="px-3 py-2 text-left font-semibold whitespace-nowrap text-gray-700">{children}</th>,
                            td:     ({ children }) => <td className="px-3 py-2 text-gray-600">{children}</td>,
                          }}>
                            {text}
                          </ReactMarkdown>
                        </div>
                      )

                      return (
                        <div>
                          {chartResult ? (
                            <>
                              {chartResult.before && renderMarkdown(chartResult.before)}
                              <ChatChart data={chartResult.chart} />
                              {chartResult.after && renderMarkdown(chartResult.after)}
                            </>
                          ) : renderMarkdown(msg.content)}
                          {streaming && i === messages.length - 1 && (
                            <span className="inline-block w-0.5 h-3.5 bg-gray-500 ml-0.5 align-middle animate-pulse" />
                          )}
                        </div>
                      )
                    })()}
                    {/* Template download button for tao-template agent */}
                    {msg.role === "assistant" && msg.agent?.id === "tao-template" && !streaming && (() => {
                      const action = extractTemplateAction(msg.content)
                      return action ? <TemplateDownloadButton key={i} action={action} /> : null
                    })()}
                  </div>
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={14} className="text-gray-500" />
                  </div>
                )}
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-600/20">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1.5 items-center">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 bg-brand-300 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 bg-white p-3 flex-shrink-0 rounded-b-2xl">
            <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex gap-2">
              <input
                type="text" value={input} onChange={e => setInput(e.target.value)}
                placeholder="Hỏi về sản phẩm, SKU, giá, catalog NCC, doanh thu/đơn..."
                disabled={busy}
                className="flex-1 px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-300 focus:bg-white disabled:opacity-60 transition"
              />
              <button type="submit" disabled={!input.trim() || busy}
                className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
