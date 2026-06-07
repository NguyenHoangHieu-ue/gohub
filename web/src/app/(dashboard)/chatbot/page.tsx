"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useSession, signOut }                        from "next-auth/react"
import { Send, Bot, User, Sparkles, Plus, Trash2, MessageSquare, Menu, X } from "lucide-react"
import ReactMarkdown from "react-markdown"
import type { Message } from "@/lib/agents/types"

// sessionStorage keys
const SS_CONV_ID   = "gohub_conv_id"
const SS_CONV_USER = "gohub_conv_user"
const SS_MESSAGES  = "gohub_messages"

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
  "tu-van":       "bg-brand-100 text-brand-700",
  "tra-cuu":      "bg-blue-100 text-blue-700",
  "giai-dap":     "bg-amber-100 text-amber-700",
  "gia-cogs":     "bg-green-100 text-green-700",
  "gap-analysis": "bg-purple-100 text-purple-700",
}

const QUICK = [
  "Tìm gói eSIM đi Nhật 7 ngày",
  "Có gói unlimited đi Thái Lan không?",
  "WM có sản phẩm nào chưa có trong hệ thống?",
  "Giải thích cấu trúc mã SKU",
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
  const userRole = (session?.user as any)?.role || "standard"

  const [conversations,  setConversations] = useState<Conversation[]>([])
  const [activeConvId,   setActiveConvId]  = useState<string | null>(null)
  const [messages,       setMessages]      = useState<StoredMessage[]>([])
  const [input,          setInput]         = useState("")
  const [loading,        setLoading]       = useState(false)
  const [streaming,      setStreaming]      = useState(false)
  const [agentName,      setAgentName]     = useState<string | null>(null)
  const [deletingId,     setDeletingId]    = useState<string | null>(null)
  const [mobileDrawer,   setMobileDrawer]  = useState(false)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const msgCountRef = useRef(0)  // track message count for isFirst detection

  const busy = loading || streaming

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
        w-64 md:w-56 bg-gray-50 border-r border-gray-200
        flex flex-col flex-shrink-0
        transform transition-transform duration-200 ease-in-out
        ${mobileDrawer ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
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
              className="md:hidden p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Menu size={18} />
            </button>
            <Sparkles size={20} className="text-brand-600" />
            <h1 className="text-lg md:text-xl font-bold text-gray-900">Telco Chat</h1>
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
        <div className="flex-1 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mb-4 border border-brand-100">
                  <Sparkles size={28} className="text-brand-600" />
                </div>
                <p className="font-semibold text-gray-800 mb-1">GoHub AI Agent 👋</p>
                <p className="text-sm text-gray-400 mb-6 max-w-xs">
                  Tư vấn sản phẩm · Tra cứu SKU · Giải đáp hệ thống · Phân tích giá · Gap Analysis
                </p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                  {QUICK.map(q => (
                    <button key={q} onClick={() => send(q)}
                      className="text-left px-4 py-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 border-l-[3px] border-l-brand-500 rounded-xl hover:bg-brand-50 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={15} className="text-brand-600" />
                  </div>
                )}
                <div className="flex flex-col gap-1 max-w-[85%] md:max-w-[72%]">
                  {msg.role === "assistant" && msg.agent && (
                    <span className={`text-xs px-2 py-0.5 rounded-full self-start font-medium ${AGENT_COLORS[msg.agent.id] ?? "bg-gray-100 text-gray-600"}`}>
                      {msg.agent.name}
                    </span>
                  )}
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-brand-600 text-white rounded-tr-sm"
                      : "bg-gray-100 text-gray-800 rounded-tl-sm"
                  }`}>
                    {msg.role === "user" ? (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    ) : (
                      <div className="markdown-body">
                        <ReactMarkdown components={{
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
                        }}>
                          {msg.content}
                        </ReactMarkdown>
                        {streaming && i === messages.length - 1 && (
                          <span className="inline-block w-0.5 h-3.5 bg-gray-500 ml-0.5 align-middle animate-pulse" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={15} className="text-gray-500" />
                  </div>
                )}
              </div>
            ))}

            {/* Loading */}
            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <Bot size={15} className="text-brand-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3 flex-shrink-0">
            <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex gap-2">
              <input
                type="text" value={input} onChange={e => setInput(e.target.value)}
                placeholder="Hỏi về sản phẩm, SKU, giá, gap analysis..."
                disabled={busy}
                className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-50 transition"
              />
              <button type="submit" disabled={!input.trim() || busy}
                className="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
